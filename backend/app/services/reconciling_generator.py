"""
Reconciling Synthetic Data Generator for UBL Cash Optimization Engine.

Reads existing branch data from SQLite and generates daily GL and
transaction-level detail that EXACTLY reconciles back to branch totals.

Date range: 2024-01-01 .. 2027-12-31 (1,461 market days).

Vault ledger identity (per branch-day, PKR M):
    closing = opening + cash_in - cash_out + cit_in - cit_out
    opening[t+1] = closing[t]          # continuous chain, no unexplained jumps
    closing is bounded [floor, cap] and never negative
    CIT replenishment fires within-day and is logged as cit_in/cit_out ledger rows
fact_gl_daily carries cit_in_m / cit_out_m for the CIT legs.

All 8 reconciliation checks must tie (see verify_sql):
    1. per-branch deposit total  == branches.avg_daily_deposits * n_days
    2. sum(cash_in)  per branch-day == fact_gl_daily.total_deposit_flow_m
    3. sum(cash_out) per branch-day == fact_gl_daily.total_withdrawal_flow_m
    4. sum(cit_in)   per branch-day == fact_gl_daily.cit_in_m
    5. sum(cit_out)  per branch-day == fact_gl_daily.cit_out_m
    6. ledger identity (open + flows + CIT = close)
    7. vault continuity (opening[t+1] == closing[t])
    8. closing balance non-negative

Uses Dirichlet distribution to split parent totals into exactly-summing
children (np.random.dirichlet produces N weights summing to 1.0; multiply
by the parent total to get N child amounts summing exactly to the parent).

All amounts in the branches table are raw PKR.
All amounts in CDM tables (dim_market, fact_gl_daily, fact_transactions)
are in PKR Millions (the _m suffix).
"""

import sqlite3
import time
import uuid
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.core import pk_calendar
from app.core.constants import VAULT_INSURANCE_RATE

# ---------------------------------------------------------------------------
# SBP rate loader — graceful fallback
# ---------------------------------------------------------------------------
_FALLBACK_RATES = {
    "kibor_overnight": 11.80,
    "kibor_3m": 11.50,
    "kibor_6m": 11.64,
    "sbp_policy_rate": 10.50,
    "tbill_3m_yield": 11.20,
    "usd_pkr": 279.67,
    "eur_pkr": 305.00,
    "gbp_pkr": 355.00,
    "aed_pkr": 75.85,
    "sar_pkr": 74.20,
    "cpi_yoy": 10.0,
}


def _load_sbp_rates() -> dict:
    """Try live SBP rates via sbp_data service, fall back to defaults."""
    try:
        from app.core.sbp_data import get_sbp_service
        svc = get_sbp_service()
        summary = svc.get_all_rates_summary()
        curve = summary.get("kibor_curve", {})
        return {
            "kibor_overnight": curve.get("1W", _FALLBACK_RATES["kibor_overnight"]),
            "kibor_3m": curve.get("3M", _FALLBACK_RATES["kibor_3m"]),
            "kibor_6m": summary.get("kibor_6m", _FALLBACK_RATES["kibor_6m"]),
            "sbp_policy_rate": summary.get("policy_rate", _FALLBACK_RATES["sbp_policy_rate"]),
            "tbill_3m_yield": _FALLBACK_RATES["tbill_3m_yield"],
            "usd_pkr": summary.get("fx", {}).get("USD", _FALLBACK_RATES["usd_pkr"]),
            "eur_pkr": summary.get("fx", {}).get("EUR", _FALLBACK_RATES["eur_pkr"]),
            "gbp_pkr": summary.get("fx", {}).get("GBP", _FALLBACK_RATES["gbp_pkr"]),
            "aed_pkr": summary.get("fx", {}).get("AED", _FALLBACK_RATES["aed_pkr"]),
            "sar_pkr": summary.get("fx", {}).get("SAR", _FALLBACK_RATES["sar_pkr"]),
            "cpi_yoy": summary.get("cpi_yoy", _FALLBACK_RATES["cpi_yoy"]),
        }
    except Exception:
        return dict(_FALLBACK_RATES)


# ---------------------------------------------------------------------------
# CALIBRATION CONSTANTS — deterministic event LEVELS (mean multiplier vs a
# normal day). These set the CENTRAL level of demand; stochastic noise
# (NOISE_SIGMA) adds only low-variance jitter on top. The realized per-flag
# MEAN tracks these levels (not a fat-tail artifact).
#
# TODO(Phase 5): CALIBRATE these against SBP Currency-in-Circulation. For now
# they are explicit DESIGN TARGETS, not fitted values.
# ---------------------------------------------------------------------------
TARGET_LEVEL = {            # withdrawal cash-out level vs normal day
    "pre_eid_fitr": 3.0,    # central level, NOT a peak
    "pre_eid_adha": 2.2,
    "salary_window": 2.0,
    "ramadan": 1.5,
    "normal": 1.0,
}
DEPOSIT_LEVEL = {           # deposit cash-in level vs normal day (milder drivers)
    "post_eid": 1.5,
    "month_end": 1.4,
    "ramadan": 1.3,
    "salary_window": 1.2,
    "normal": 1.0,
}
COMPOSED_LEVEL_CAP = 3.5    # cap on the composed LEVEL when flags co-occur (withdrawals)
DEPOSIT_LEVEL_CAP = 2.5     # cap on the composed deposit level
NOISE_SIGMA = 0.15          # lognormal sigma for per-day jitter (chosen via dry_run_levels:
                            # thinnest tail with normal-baseline pre-Eid ~3.0-3.2, p99 ~4.0, 0% clamp)
CLAMP_FACTOR = 5.0          # safety-net clamp: per-day flow <= this x trailing median


# ---------------------------------------------------------------------------
# Main generator class
# ---------------------------------------------------------------------------

class ReconcilingDataGenerator:
    """
    Generates dim_market, fact_gl_daily, and fact_transactions tables that
    reconcile exactly to the branch-level totals stored in the branches table.
    """

    def __init__(
        self,
        db_path: str,
        start: str = "2024-01-01",
        end: str = "2027-12-31",
        n_customers: int = 10_000,
        seed: int = 42,
        txn_per_branch_day: int = 8,
    ):
        self.db_path = db_path
        self.n_customers = n_customers
        self.rng = np.random.default_rng(seed)
        # Cap on customer cash_in+cash_out transactions generated per branch-day
        # (keeps fact_transactions tractable over the full calendar; the tie to
        # opening/closing holds at any sampling rate).
        self.txn_per_branch_day = txn_per_branch_day
        self.noise_sigma = NOISE_SIGMA
        self.clamp_binds = {"withdrawal": 0, "deposit": 0, "branch_days": 0}

        # ------------------------------------------------------------------
        # Load branches from SQLite
        # ------------------------------------------------------------------
        conn = sqlite3.connect(db_path)
        self.branches = pd.read_sql_query(
            """
            SELECT branch_id,
                   branch_type,
                   avg_daily_deposits,
                   avg_daily_withdrawals,
                   current_vault_balance,
                   optimal_vault_balance,
                   idle_cash,
                   daily_transactions,
                   total_deposits,
                   deposits_current_account,
                   deposits_savings,
                   deposits_term,
                   monthly_interest_income,
                   monthly_interest_expense,
                   monthly_personnel_cost,
                   monthly_premises_cost,
                   monthly_direct_cost,
                   monthly_other_cost,
                   vault_capacity
            FROM branches
            ORDER BY branch_id
            """,
            conn,
        )
        conn.close()

        n = len(self.branches)
        print(f"Loaded {n} branches from {db_path}")

        # ------------------------------------------------------------------
        # Store anchor totals (raw PKR) for verification later
        # ------------------------------------------------------------------
        self.anchor_deposits_pkr = self.branches["avg_daily_deposits"].values.copy()
        self.anchor_withdrawals_pkr = self.branches["avg_daily_withdrawals"].values.copy()

        # Pre-generate customer IDs (numpy array for vectorized sampling)
        self.customer_ids = np.array(
            [f"CUST-{i:06d}" for i in range(1, n_customers + 1)]
        )

        # Date range (inclusive). Defaults to the full pk_calendar horizon.
        self.start_date = date.fromisoformat(start)
        self.end_date = date.fromisoformat(end)
        self.dates = pd.date_range(self.start_date, self.end_date, freq="D")
        self.n_days = len(self.dates)

        # Dates flagged as peak cash-out events (Eid surge etc.) for is_peak_event
        self._peak_dates = {
            dt.date().isoformat()
            for dt in self.dates
            if pk_calendar.withdrawal_demand_multiplier(dt.date()) >= 1.5
        }

    # ======================================================================
    # dim_market
    # ======================================================================

    def generate_dim_market(self) -> pd.DataFrame:
        """
        30 rows of daily market data.
        Uses live SBP rates if available, else defaults.
        Applies small cumulative normal drift to rates each day.
        """
        base = _load_sbp_rates()
        rows = []

        # Mean-reverting random walks for each rate/FX series. The previous
        # `drift * i` formulation exploded over long horizons (e.g. 1461 days);
        # an Ornstein-Uhlenbeck-style walk keeps the series in a sane band.
        walk_keys = [
            "kibor_overnight", "kibor_3m", "kibor_6m", "tbill_3m_yield",
            "usd_pkr", "eur_pkr", "gbp_pkr", "aed_pkr", "sar_pkr", "cpi_yoy",
        ]
        step_std = {
            "kibor_overnight": 0.015, "kibor_3m": 0.012, "kibor_6m": 0.010,
            "tbill_3m_yield": 0.010, "usd_pkr": 0.10, "eur_pkr": 0.14,
            "gbp_pkr": 0.16, "aed_pkr": 0.03, "sar_pkr": 0.03, "cpi_yoy": 0.03,
        }
        level = {k: base[k] for k in walk_keys}
        theta = 0.02  # reversion strength toward base level

        for dt in self.dates:
            d = dt.date()
            dow = dt.dayofweek  # Monday=0 ... Sunday=6

            for k in walk_keys:
                level[k] += theta * (base[k] - level[k]) + self.rng.normal(0, step_std[k])

            in_ram, _ = pk_calendar.is_ramadan(d)
            row = {
                "date": d.isoformat(),
                "kibor_overnight": round(level["kibor_overnight"], 4),
                "kibor_3m": round(level["kibor_3m"], 4),
                "kibor_6m": round(level["kibor_6m"], 4),
                "sbp_policy_rate": base["sbp_policy_rate"],  # policy rate is sticky
                "tbill_3m_yield": round(level["tbill_3m_yield"], 4),
                "usd_pkr": round(level["usd_pkr"], 2),
                "eur_pkr": round(level["eur_pkr"], 2),
                "gbp_pkr": round(level["gbp_pkr"], 2),
                "aed_pkr": round(level["aed_pkr"], 2),
                "sar_pkr": round(level["sar_pkr"], 2),
                "cpi_yoy": round(level["cpi_yoy"], 2),
                "holiday_flag": pk_calendar.is_bank_holiday(d),
                "is_friday": dow == 4,
                "is_salary_day": d.day in (1, 15),
                "is_eid_window": bool(pk_calendar.is_pre_eid_surge(d)),
                "is_ramadan": bool(in_ram),
            }
            rows.append(row)

        df = pd.DataFrame(rows)
        print(f"dim_market: {len(df)} rows")
        return df

    # ======================================================================
    # fact_gl_daily
    # ======================================================================

    # ------------------------------------------------------------------
    # Deterministic event-level builders (magnitude from TARGET_LEVEL).
    # pk_calendar provides the FLAGS/shape; magnitude lives here.
    # ------------------------------------------------------------------
    @staticmethod
    def _withdrawal_level_array(dates_py):
        """Deterministic withdrawal level per day: compose TARGET_LEVEL flags
        multiplicatively, capped at COMPOSED_LEVEL_CAP."""
        out = np.ones(len(dates_py), dtype=np.float64)
        for i, d in enumerate(dates_py):
            f = pk_calendar.calendar_features(d)
            lev = 1.0
            if 0 < f["days_to_eid_fitr"] <= pk_calendar.EID_FITR_SURGE_DAYS:
                lev *= TARGET_LEVEL["pre_eid_fitr"]
            if 0 < f["days_to_eid_adha"] <= pk_calendar.EID_ADHA_SURGE_DAYS:
                lev *= TARGET_LEVEL["pre_eid_adha"]
            if f["is_salary_window"]:
                lev *= TARGET_LEVEL["salary_window"]
            if f["is_ramadan"]:
                lev *= TARGET_LEVEL["ramadan"]
            out[i] = min(lev, COMPOSED_LEVEL_CAP)
        return out

    @staticmethod
    def _deposit_level_array(dates_py):
        """Deterministic deposit level per day (milder drivers), capped."""
        out = np.ones(len(dates_py), dtype=np.float64)
        for i, d in enumerate(dates_py):
            f = pk_calendar.calendar_features(d)
            lev = 1.0
            if f["is_post_holiday"]:
                lev *= DEPOSIT_LEVEL["post_eid"]
            if f["is_month_end"]:
                lev *= DEPOSIT_LEVEL["month_end"]
            if f["is_ramadan"]:
                lev *= DEPOSIT_LEVEL["ramadan"]
            if f["is_salary_window"]:
                lev *= DEPOSIT_LEVEL["salary_window"]
            out[i] = min(lev, DEPOSIT_LEVEL_CAP)
        return out

    @staticmethod
    def _dow_weights(dows):
        """Mild intra-week shape (mean 1.0 so it doesn't shift flag means)."""
        w = np.ones(len(dows), dtype=np.float64)
        w[dows == 4] = 1.20   # Friday
        w[dows == 5] = 0.95   # Saturday
        w[dows == 6] = 0.85   # Sunday
        return w

    def _daily_flow(self, total, level, dow, sigma):
        """flow = base * level(d) * noise, normalised so it sums EXACTLY to
        `total` (no drift). Low-variance lognormal noise (mean ~1)."""
        noise = self.rng.lognormal(0.0, sigma, len(level))
        w = level * dow * noise
        return w / w.sum() * total

    # Event flags that disqualify a day from the NORMAL-day baseline.
    _NORMAL_EXCLUDE_FLAGS = (
        "is_salary_window", "is_pre_eid_surge", "is_ramadan",
        "is_bridge_day", "is_pre_holiday", "is_post_holiday", "is_bank_holiday",
    )

    @classmethod
    def _normal_day_mask(cls, dates_py):
        """True for NORMAL days (no event flag) — used as the multiplier baseline."""
        out = np.ones(len(dates_py), dtype=bool)
        for i, d in enumerate(dates_py):
            f = pk_calendar.calendar_features(d)
            out[i] = not any(f[k] for k in cls._NORMAL_EXCLUDE_FLAGS)
        return out

    @staticmethod
    def _trailing_cap_normal(series, normal_mask, factor, window=90, warmup=14):
        """Cap array = factor * trailing median of NORMAL days only (prior `window`
        days, excluding the current day). Requires >=`warmup` normal observations in
        the window; otherwise no clamp (inf). This baseline is the 'normal day', not
        the (event-inflated) all-day median."""
        normal_series = np.where(normal_mask, series, np.nan)
        med = (pd.Series(normal_series)
               .shift(1).rolling(window, min_periods=warmup).median().to_numpy())
        cap = factor * med
        cap[np.isnan(cap)] = np.inf
        return cap

    @staticmethod
    def _waterfill_cap(values, cap, total, max_iter=25, tol=1e-9):
        """Cap `values` at `cap` and redistribute the clipped excess onto below-cap
        days (proportional to value) so the series still sums to `total`. Preserves
        the deposit anchor while removing the spike tail."""
        x = values.astype(np.float64).copy()
        for _ in range(max_iter):
            over = x > cap
            if not over.any():
                break
            excess = float((x[over] - cap[over]).sum())
            x[over] = cap[over]
            if excess <= tol:
                break
            under = x < cap
            base = x[under]
            denom = float(base.sum())
            if denom <= 0:
                break
            x[under] = base + excess * base / denom
        return x

    def generate_fact_gl_daily(self, dim_market: pd.DataFrame) -> pd.DataFrame:
        """
        For each branch and each day, produce one GL row.
        Dirichlet split ensures daily amounts sum exactly to the period total.
        """
        n_days = self.n_days
        dates_str = dim_market["date"].values  # array of date strings
        dates_dt = pd.to_datetime(dates_str)
        dows = dates_dt.dayofweek.values        # 0=Mon .. 6=Sun
        dates_py = [d.date() for d in dates_dt]

        # Deterministic per-day LEVEL (magnitude from TARGET_LEVEL) + mild intra-week
        # shape. pk_calendar supplies the flags; magnitude is the calibration block.
        # These are the same for every branch — branch identity enters only via the
        # low-variance noise draw inside _daily_flow (totals stay anchored).
        dow_weights = self._dow_weights(dows)
        level_w = self._withdrawal_level_array(dates_py)
        level_d = self._deposit_level_array(dates_py)
        normal_mask = self._normal_day_mask(dates_py)   # clamp baseline = normal days

        all_rows = []
        n_branches = len(self.branches)

        t0 = time.time()

        for idx, br in self.branches.iterrows():
            bid = br["branch_id"]

            # ---------------------------------------------------------------
            # 1. Period totals in PKR M
            # ---------------------------------------------------------------
            total_dep_m = (br["avg_daily_deposits"] / 1e6) * n_days
            total_wth_m = (br["avg_daily_withdrawals"] / 1e6) * n_days

            # ---------------------------------------------------------------
            # 2. Flow = base * level(d) * noise, normalised to the period total.
            #    LEVEL is deterministic (TARGET_LEVEL); NOISE is low-variance
            #    lognormal jitter (mean ~1). This gives a ~3x pre-Eid MEAN with a
            #    thin tail, instead of a fat-tail Dirichlet whose mean read 3.1.
            #    Normalisation keeps branch totals anchored exactly (no drift).
            # ---------------------------------------------------------------
            daily_dep = self._daily_flow(total_dep_m, level_d, dow_weights, self.noise_sigma)
            daily_wth = self._daily_flow(total_wth_m, level_w, dow_weights, self.noise_sigma)

            # ---------------------------------------------------------------
            # 2b. Safety-net clamp at CLAMP_FACTOR x trailing-90-day median (prior
            #     90 days, >=14-day warm-up). With low-variance noise this should
            #     rarely bind (reported in seed). Withdrawals capped directly;
            #     the deposit anchor (CHECK 1) preserved by water-filling the
            #     clipped excess. The vault chain's within-day CIT absorbs the rest.
            # ---------------------------------------------------------------
            cap_w = self._trailing_cap_normal(daily_wth, normal_mask, CLAMP_FACTOR)
            cap_d = self._trailing_cap_normal(daily_dep, normal_mask, CLAMP_FACTOR)
            self.clamp_binds["withdrawal"] += int(np.sum(daily_wth > cap_w))
            self.clamp_binds["deposit"] += int(np.sum(daily_dep > cap_d))
            self.clamp_binds["branch_days"] += n_days
            daily_wth = np.minimum(daily_wth, cap_w)
            daily_dep = self._waterfill_cap(daily_dep, cap_d, total_dep_m)

            # ---------------------------------------------------------------
            # 3. Vault chain with explicit, reconciled CIT replenishment.
            #    closing[t] = opening[t] + dep[t] - wth[t] + cit_in[t] - cit_out[t]
            #    opening[t+1] = closing[t]   (fully continuous)
            #    CIT fires WITHIN the day to keep the vault in [floor, cap], so
            #    the closing balance is never negative.
            # ---------------------------------------------------------------
            vault_cap_m = max(br["vault_capacity"] / 1e6, 1e-6)
            optimal_m = br["optimal_vault_balance"] / 1e6
            cap_m = vault_cap_m * 0.95                          # insurance ceiling
            floor_m = max(0.0, min(optimal_m * 0.15, 0.30 * cap_m))  # operational min
            # Single restock/drawdown target, kept strictly inside (floor, cap) so
            # CIT-in and CIT-out are always non-negative even when optimal > capacity.
            span = cap_m - floor_m
            target_m = min(max(optimal_m * 0.70, floor_m + 0.10 * span),
                           floor_m + 0.90 * span)

            opening = np.zeros(n_days, dtype=np.float64)
            closing = np.zeros(n_days, dtype=np.float64)
            cit_in = np.zeros(n_days, dtype=np.float64)
            cit_out = np.zeros(n_days, dtype=np.float64)

            opening[0] = min(max(br["current_vault_balance"] / 1e6, floor_m), cap_m)
            for t in range(n_days):
                pre = opening[t] + daily_dep[t] - daily_wth[t]
                if pre < floor_m:
                    cit_in[t] = target_m - pre         # restock to target (>0)
                elif pre > cap_m:
                    cit_out[t] = pre - target_m        # draw down to target (>0)
                closing[t] = pre + cit_in[t] - cit_out[t]
                if t < n_days - 1:
                    opening[t + 1] = closing[t]

            # ---------------------------------------------------------------
            # 4. Daily idle cash
            # ---------------------------------------------------------------
            idle = np.maximum(closing - optimal_m, 0.0)

            # ---------------------------------------------------------------
            # 5. CRR (simplified: 6% of total deposits base in PKR M)
            # ---------------------------------------------------------------
            total_dep_base_m = br["total_deposits"] / 1e6
            crr_required = np.full(n_days, total_dep_base_m * 0.06)
            crr_held = crr_required * (1.0 + self.rng.normal(0, 0.02, n_days))

            # ---------------------------------------------------------------
            # 6. Deposit composition (CASA + term) — same ratio each day
            # ---------------------------------------------------------------
            td = br["total_deposits"] if br["total_deposits"] > 0 else 1.0
            casa_ratio = (br["deposits_current_account"] + br["deposits_savings"]) / td
            term_ratio = br["deposits_term"] / td
            daily_total_dep_base = np.full(n_days, total_dep_base_m / n_days)
            daily_casa = daily_total_dep_base * casa_ratio
            daily_term = daily_total_dep_base * term_ratio

            # ---------------------------------------------------------------
            # 7. Revenue & cost: monthly figures / n_days (convert to PKR M)
            # ---------------------------------------------------------------
            int_income_daily = (br["monthly_interest_income"] / 1e6) / n_days
            int_expense_daily = (br["monthly_interest_expense"] / 1e6) / n_days
            personnel_daily = (br["monthly_personnel_cost"] / 1e6) / n_days
            premises_daily = (br["monthly_premises_cost"] / 1e6) / n_days
            direct_daily = (br["monthly_direct_cost"] / 1e6) / n_days
            other_daily = (br["monthly_other_cost"] / 1e6) / n_days
            # Derived costs
            fee_income_daily = int_income_daily * 0.08  # ~8% of interest income
            cash_handling_daily = direct_daily * 0.40
            cit_daily = direct_daily * 0.30
            # Vault insurance = documented daily rate (0.015%/day) on that day's held
            # cash. Do NOT divide by 365 or scale by n_days — `closing` is already the
            # per-day balance, so `/365 * n_days` (n_days~1461) inflated every day ~4x.
            insurance_daily = closing * VAULT_INSURANCE_RATE  # vault insurance, per day

            # ---------------------------------------------------------------
            # 8. Assemble rows (vectorized per branch)
            # ---------------------------------------------------------------
            branch_df = pd.DataFrame({
                "date": dates_str,
                "branch_id": bid,
                "opening_balance_m": np.round(opening, 6),
                "total_deposit_flow_m": np.round(daily_dep, 6),
                "total_withdrawal_flow_m": np.round(daily_wth, 6),
                "cit_in_m": np.round(cit_in, 6),
                "cit_out_m": np.round(cit_out, 6),
                "closing_balance_m": np.round(closing, 6),
                "idle_cash_m": np.round(idle, 6),
                "crr_required_m": np.round(crr_required, 6),
                "crr_held_m": np.round(crr_held, 6),
                "total_deposits_m": np.round(daily_total_dep_base, 6),
                "casa_deposits_m": np.round(daily_casa, 6),
                "term_deposits_m": np.round(daily_term, 6),
                "interest_income_m": np.round(np.full(n_days, int_income_daily), 6),
                "interest_expense_m": np.round(np.full(n_days, int_expense_daily), 6),
                "fee_income_m": np.round(np.full(n_days, fee_income_daily), 6),
                "personnel_cost_m": np.round(np.full(n_days, personnel_daily), 6),
                "premises_cost_m": np.round(np.full(n_days, premises_daily), 6),
                "direct_cost_m": np.round(np.full(n_days, direct_daily), 6),
                "other_cost_m": np.round(np.full(n_days, other_daily), 6),
                "cash_handling_cost_m": np.round(np.full(n_days, cash_handling_daily), 6),
                "cit_cost_m": np.round(np.full(n_days, cit_daily), 6),
                "insurance_cost_m": np.round(insurance_daily, 6),
            })
            all_rows.append(branch_df)

            # Progress
            if (idx + 1) % 200 == 0:
                elapsed = time.time() - t0
                print(f"  fact_gl_daily: {idx + 1}/{n_branches} branches ({elapsed:.1f}s)")

        fact_gl = pd.concat(all_rows, ignore_index=True)
        elapsed = time.time() - t0
        print(f"fact_gl_daily: {len(fact_gl):,} rows ({n_branches} branches x {n_days} days) in {elapsed:.1f}s")
        return fact_gl

    # ======================================================================
    # fact_transactions (vectorised, bounded per branch-day)
    # ======================================================================

    _DEP_CHANNELS = np.array(["counter", "cdm", "transfer"])
    _DEP_PROBS = [0.60, 0.15, 0.25]
    _WTH_CHANNELS = np.array(["counter", "atm", "cheque"])
    _WTH_PROBS = [0.50, 0.35, 0.15]

    @staticmethod
    def _ids(offset: int, n: int) -> np.ndarray:
        """Vectorised unique txn ids: T<offset>..T<offset+n-1>."""
        return np.char.add("T", (offset + np.arange(n)).astype("U12"))

    def _timestamps(self, date_arr: np.ndarray) -> np.ndarray:
        """Vectorised 'YYYY-MM-DDTHH:MM:SS' with a random banking-hours time."""
        n = len(date_arr)
        hh = np.char.zfill(self.rng.integers(8, 17, n).astype("U2"), 2)
        mm = np.char.zfill(self.rng.integers(0, 60, n).astype("U2"), 2)
        ts = np.char.add(date_arr.astype("U10"), "T")
        ts = np.char.add(ts, hh)
        ts = np.char.add(ts, ":")
        ts = np.char.add(ts, mm)
        return np.char.add(ts, ":00")

    @staticmethod
    def _split_to_flow(counts: np.ndarray, flow: np.ndarray, rng):
        """Explode each GL row into `counts` children whose amounts sum exactly
        to that row's `flow`. Returns (group_row_index, amounts)."""
        group_idx = np.repeat(np.arange(len(counts)), counts)
        w = rng.random(len(group_idx))
        starts = np.zeros(len(counts), dtype=np.int64)
        starts[1:] = np.cumsum(counts)[:-1]
        gsum = np.add.reduceat(w, starts)
        gsum[gsum == 0] = 1.0
        amounts = w / gsum[group_idx] * flow[group_idx]
        return group_idx, amounts

    def _build_transactions(self, gl: pd.DataFrame, id_offset: int):
        """Vectorised customer + CIT transactions for a slice of fact_gl_daily.

        cash_in / cash_out tie exactly to the deposit / withdrawal flows;
        cit_in / cit_out tie to the GL CIT columns. Returns (DataFrame, next_offset).
        """
        br_txn_map = dict(zip(self.branches["branch_id"], self.branches["daily_transactions"]))

        bid = gl["branch_id"].to_numpy()
        dts = gl["date"].to_numpy().astype("U10")
        dep_flow = gl["total_deposit_flow_m"].to_numpy()
        wth_flow = gl["total_withdrawal_flow_m"].to_numpy()
        cit_in_flow = gl["cit_in_m"].to_numpy()
        cit_out_flow = gl["cit_out_m"].to_numpy()

        base = np.array([br_txn_map.get(b, 100) for b in bid], dtype=float)
        n_total = np.clip((base * 0.10).astype(int), 4, self.txn_per_branch_day)
        n_dep = np.maximum((n_total * 0.45).astype(int), 1)
        n_wth = np.maximum(n_total - n_dep, 1)

        is_peak_row = np.array([d in self._peak_dates for d in dts])
        parts = []
        offset = id_offset

        # --- customer cash_in (ties to deposit flow) -----------------------
        gi, amt = self._split_to_flow(n_dep, dep_flow, self.rng)
        n = len(gi)
        parts.append(pd.DataFrame({
            "txn_id": self._ids(offset, n),
            "timestamp": self._timestamps(dts[gi]),
            "date": dts[gi],
            "branch_id": bid[gi],
            "cust_id": self.rng.choice(self.customer_ids, size=n),
            "txn_type": "cash_in",
            "amount_m": np.round(amt, 6),
            "channel": self.rng.choice(self._DEP_CHANNELS, size=n, p=self._DEP_PROBS),
            "is_peak_event": is_peak_row[gi],
            "denomination_hint": None,
        }))
        offset += n

        # --- customer cash_out (ties to withdrawal flow) -------------------
        gi, amt = self._split_to_flow(n_wth, wth_flow, self.rng)
        n = len(gi)
        parts.append(pd.DataFrame({
            "txn_id": self._ids(offset, n),
            "timestamp": self._timestamps(dts[gi]),
            "date": dts[gi],
            "branch_id": bid[gi],
            "cust_id": self.rng.choice(self.customer_ids, size=n),
            "txn_type": "cash_out",
            "amount_m": np.round(amt, 6),
            "channel": self.rng.choice(self._WTH_CHANNELS, size=n, p=self._WTH_PROBS),
            "is_peak_event": is_peak_row[gi],
            "denomination_hint": None,
        }))
        offset += n

        # --- CIT replenishment movements (tie to GL cit columns) -----------
        for typ, flow in (("cit_in", cit_in_flow), ("cit_out", cit_out_flow)):
            mask = flow > 0
            n = int(mask.sum())
            if n == 0:
                continue
            parts.append(pd.DataFrame({
                "txn_id": self._ids(offset, n),
                "timestamp": self._timestamps(dts[mask]),
                "date": dts[mask],
                "branch_id": bid[mask],
                "cust_id": "CIT-VENDOR",
                "txn_type": typ,
                "amount_m": np.round(flow[mask], 6),
                "channel": "cit",
                "is_peak_event": False,
                "denomination_hint": None,
            }))
            offset += n

        return pd.concat(parts, ignore_index=True), offset

    # ======================================================================
    # Reconciliation verification (SQL-based, runs against the written DB)
    # ======================================================================

    def verify_sql(self, conn) -> bool:
        """Run reconciliation checks directly against the seeded SQLite tables."""
        all_pass = True

        def _check(label, value, tol):
            nonlocal all_pass
            ok = value <= tol
            print(f"  {'✓' if ok else '✗'} {label}  (max |resid|: {value:.8f})")
            if not ok:
                all_pass = False

        cur = conn.cursor()

        # CHECK 1: per-branch deposit total vs anchor (avg_daily_deposits * n_days)
        gl_dep = dict(cur.execute(
            "SELECT branch_id, SUM(total_deposit_flow_m) FROM fact_gl_daily GROUP BY branch_id").fetchall())
        anchors = dict(zip(self.branches["branch_id"],
                           self.branches["avg_daily_deposits"] / 1e6 * self.n_days))
        d1 = max((abs(gl_dep.get(b, 0.0) - exp) for b, exp in anchors.items()), default=0.0)
        _check("CHECK 1: GL deposit totals vs branch anchors", d1, 1e-3)

        # CHECK 2-5: per branch-day txn-type sums == matching GL column
        for label, typ, col in (
            ("CHECK 2: cash_in sums vs GL deposit flow", "cash_in", "total_deposit_flow_m"),
            ("CHECK 3: cash_out sums vs GL withdrawal flow", "cash_out", "total_withdrawal_flow_m"),
            ("CHECK 4: cit_in sums vs GL cit_in_m", "cit_in", "cit_in_m"),
            ("CHECK 5: cit_out sums vs GL cit_out_m", "cit_out", "cit_out_m"),
        ):
            row = cur.execute(f"""
                SELECT MAX(ABS(t_sum - g_val)) FROM (
                    SELECT g.{col} AS g_val, COALESCE(t.s, 0.0) AS t_sum
                    FROM fact_gl_daily g
                    LEFT JOIN (
                        SELECT branch_id, date, SUM(amount_m) AS s
                        FROM fact_transactions WHERE txn_type = '{typ}'
                        GROUP BY branch_id, date
                    ) t ON t.branch_id = g.branch_id AND t.date = g.date
                )
            """).fetchone()
            _check(label, row[0] or 0.0, 1e-4)

        # CHECK 6: ledger identity closing == opening + dep - wth + cit_in - cit_out
        row = cur.execute("""
            SELECT MAX(ABS(closing_balance_m -
                (opening_balance_m + total_deposit_flow_m - total_withdrawal_flow_m
                 + cit_in_m - cit_out_m))) FROM fact_gl_daily
        """).fetchone()
        _check("CHECK 6: ledger identity (open+flows+CIT=close)", row[0] or 0.0, 1e-4)

        # CHECK 7: continuity opening[t+1] == closing[t] per branch
        row = cur.execute("""
            SELECT MAX(ABS(opening_balance_m - prev_close)) FROM (
                SELECT opening_balance_m,
                       LAG(closing_balance_m) OVER (PARTITION BY branch_id ORDER BY date) AS prev_close
                FROM fact_gl_daily
            ) WHERE prev_close IS NOT NULL
        """).fetchone()
        _check("CHECK 7: vault continuity (open[t+1]=close[t])", row[0] or 0.0, 1e-6)

        # CHECK 8: closing balance never negative
        min_close = cur.execute("SELECT MIN(closing_balance_m) FROM fact_gl_daily").fetchone()[0]
        ok8 = min_close >= -1e-6
        print(f"  {'✓' if ok8 else '✗'} CHECK 8: closing balance non-negative  (min: {min_close:.6f})")
        if not ok8:
            all_pass = False

        return all_pass


# ---------------------------------------------------------------------------
# Dry-run: tune noise sigma WITHOUT writing the DB
# ---------------------------------------------------------------------------

def dry_run_levels(db_path: str | None = None, branch_type: str = "HUB",
                   sigmas=(0.15, 0.20, 0.25),
                   start: str = "2024-01-01", end: str = "2027-12-31"):
    """Simulate one representative branch's WITHDRAWAL flow over the full calendar
    for several noise sigmas and print realized per-flag means + p95/p99/max +
    clamp-bind %. No DB writes. Level/noise are branch-independent, so a single
    branch represents all (the realized MULTIPLIER is scale-invariant)."""
    if db_path is None:
        from pathlib import Path
        db_path = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")

    gen = ReconcilingDataGenerator(db_path=db_path, start=start, end=end)
    dates_dt = pd.to_datetime(gen.dates)
    dows = dates_dt.dayofweek.values
    dates_py = [d.date() for d in dates_dt]
    dow = gen._dow_weights(dows)
    level = gen._withdrawal_level_array(dates_py)
    normal_mask = gen._normal_day_mask(dates_py)

    feats = [pk_calendar.calendar_features(d) for d in dates_py]
    fl = {k: np.array([bool(f[k]) for f in feats])
          for k in ("is_pre_eid_surge", "is_salary_window", "is_ramadan", "is_bridge_day")}
    ram_ex_preeid = fl["is_ramadan"] & ~fl["is_pre_eid_surge"]

    print("=" * 104)
    print(f"DRY-RUN — withdrawal realized multiplier vs NORMAL-day baseline "
          f"(rep. {branch_type} branch, {start}..{end}, no DB write)")
    print(f"  TARGET_LEVEL={TARGET_LEVEL}  COMPOSED_LEVEL_CAP={COMPOSED_LEVEL_CAP}  "
          f"CLAMP_FACTOR={CLAMP_FACTOR}")
    print("=" * 104)
    print(f"  {'sigma':>6} | {'pre_eid':>7} {'salary':>7} {'ram(whole)':>10} "
          f"{'ram(exPE)':>9} {'normal':>7} | {'p95':>5} {'p99':>5} {'max':>6} | {'clamp%':>7}")
    print("  " + "-" * 98)

    for sigma in sigmas:
        daily = gen._daily_flow(1000.0, level, dow, sigma)   # total arbitrary (scale-invariant)
        # NORMAL-day trailing baseline (matches the audit + the clamp)
        cap = gen._trailing_cap_normal(daily, normal_mask, CLAMP_FACTOR)
        med = cap / CLAMP_FACTOR                              # = normal-day trailing median
        mult = daily / med
        valid = ~np.isnan(mult) & ~np.isinf(med)
        bind_pct = 100.0 * np.sum((daily > cap)[valid]) / valid.sum()

        def fmean(mask):
            m = mult[valid & mask]
            return m.mean() if len(m) else float("nan")

        mv = mult[valid]
        print(f"  {sigma:>6.2f} | {fmean(fl['is_pre_eid_surge']):>7.2f} "
              f"{fmean(fl['is_salary_window']):>7.2f} {fmean(fl['is_ramadan']):>10.2f} "
              f"{fmean(ram_ex_preeid):>9.2f} {fmean(normal_mask):>7.2f} | "
              f"{np.percentile(mv, 95):>5.2f} {np.percentile(mv, 99):>5.2f} "
              f"{mv.max():>6.2f} | {bind_pct:>6.2f}%")
    print("=" * 92)


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------

def seed_reconciled_data(db_path: str | None = None):
    """
    Generate and seed the CDM tables (dim_market, fact_gl_daily, fact_transactions)
    over the full pk_calendar horizon. fact_transactions is built and written one
    calendar year at a time to bound memory; reconciliation runs via SQL afterward.
    """
    if db_path is None:
        from pathlib import Path
        db_path = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")

    t_start = time.time()
    gen = ReconcilingDataGenerator(db_path=db_path)

    print("=" * 70)
    print("RECONCILING DATA GENERATOR")
    print(f"  Branches: {len(gen.branches)}")
    print(f"  Days:     {gen.n_days}  ({gen.start_date} to {gen.end_date})")
    print("=" * 70)

    print("\n[1/3] Generating dim_market ...")
    dim_market = gen.generate_dim_market()

    print("\n[2/3] Generating fact_gl_daily ...")
    fact_gl = gen.generate_fact_gl_daily(dim_market)

    cb = gen.clamp_binds
    bd = max(cb["branch_days"], 1)
    print(f"  safety-net clamp bound: withdrawals {cb['withdrawal']:,} "
          f"({100.0 * cb['withdrawal'] / bd:.3f}% of branch-days), "
          f"deposits {cb['deposit']:,} ({100.0 * cb['deposit'] / bd:.3f}%)")

    conn = sqlite3.connect(db_path)
    print("\nWriting dim_market + fact_gl_daily ...")
    dim_market.to_sql("dim_market", conn, if_exists="replace", index=False, chunksize=5000)
    gl_to_write = fact_gl.drop(columns=["id"]) if "id" in fact_gl.columns else fact_gl
    gl_to_write.to_sql("fact_gl_daily", conn, if_exists="replace", index=False, chunksize=5000)
    print(f"  dim_market:    {len(dim_market):>10,} rows")
    print(f"  fact_gl_daily: {len(fact_gl):>10,} rows")

    print("\n[3/3] Generating fact_transactions (per calendar year) ...")
    years = sorted({d[:4] for d in fact_gl["date"]})
    offset = 0
    total_txn = 0
    t0 = time.time()
    for i, yr in enumerate(years):
        sub = fact_gl[fact_gl["date"].str.startswith(yr)]
        txn, offset = gen._build_transactions(sub, offset)
        txn.to_sql("fact_transactions", conn,
                   if_exists=("replace" if i == 0 else "append"),
                   index=False, chunksize=20000)
        total_txn += len(txn)
        print(f"  {yr}: {len(txn):>9,} txns written  ({time.time() - t0:.1f}s)")
        del txn

    print(f"  fact_transactions: {total_txn:>10,} rows total")

    print("\n" + "-" * 70)
    print("RECONCILIATION CHECKS (SQL)")
    print("-" * 70)
    recon_passed = gen.verify_sql(conn)
    print(f"\nReconciliation: {'ALL PASSED' if recon_passed else 'SOME FAILED'}")

    conn.close()
    print(f"\nTotal time: {time.time() - t_start:.1f}s")
    print("Done.")
    return {
        "dim_market_rows": len(dim_market),
        "fact_gl_rows": len(fact_gl),
        "fact_txn_rows": total_txn,
        "reconciliation_passed": recon_passed,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    seed_reconciled_data()
