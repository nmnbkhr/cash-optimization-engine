"""
Reconciling Synthetic Data Generator for UBL Cash Optimization Engine.

Reads existing branch data from SQLite and generates daily GL and
transaction-level detail that EXACTLY reconciles back to branch totals.

Reconciliation rule:
    branches.avg_daily_deposits * 30 days
        == sum(fact_gl_daily.total_deposit_flow_m)  per branch  (PKR M)
    fact_gl_daily.total_deposit_flow_m per branch-day
        == sum(fact_transactions.amount_m WHERE txn_type='cash_in')  per branch-day

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
        n_days: int = 30,
        n_customers: int = 10_000,
        seed: int = 42,
    ):
        self.db_path = db_path
        self.n_days = n_days
        self.n_customers = n_customers
        self.rng = np.random.default_rng(seed)

        # ------------------------------------------------------------------
        # Load branches from SQLite
        # ------------------------------------------------------------------
        conn = sqlite3.connect(db_path)
        self.branches = pd.read_sql_query(
            """
            SELECT branch_id,
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

        # Pre-generate customer IDs
        self.customer_ids = [f"CUST-{i:06d}" for i in range(1, n_customers + 1)]

        # Date range: most recent n_days ending yesterday
        self.end_date = date.today() - timedelta(days=1)
        self.start_date = self.end_date - timedelta(days=n_days - 1)
        self.dates = pd.date_range(self.start_date, self.end_date, freq="D")

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

        for i, dt in enumerate(self.dates):
            d = dt.date()
            dow = dt.dayofweek  # Monday=0 ... Sunday=6

            # Small cumulative drift (rates wander +/- a few bps)
            drift = self.rng.normal(0, 0.02)  # 2 bps daily std

            row = {
                "date": d.isoformat(),
                "kibor_overnight": round(base["kibor_overnight"] + drift * i, 4),
                "kibor_3m": round(base["kibor_3m"] + drift * i * 0.8, 4),
                "kibor_6m": round(base["kibor_6m"] + drift * i * 0.6, 4),
                "sbp_policy_rate": base["sbp_policy_rate"],  # policy rate is sticky
                "tbill_3m_yield": round(base["tbill_3m_yield"] + drift * i * 0.5, 4),
                "usd_pkr": round(base["usd_pkr"] + self.rng.normal(0, 0.15) * (i + 1) ** 0.3, 2),
                "eur_pkr": round(base["eur_pkr"] + self.rng.normal(0, 0.20) * (i + 1) ** 0.3, 2),
                "gbp_pkr": round(base["gbp_pkr"] + self.rng.normal(0, 0.20) * (i + 1) ** 0.3, 2),
                "aed_pkr": round(base["aed_pkr"] + self.rng.normal(0, 0.04) * (i + 1) ** 0.3, 2),
                "sar_pkr": round(base["sar_pkr"] + self.rng.normal(0, 0.04) * (i + 1) ** 0.3, 2),
                "cpi_yoy": round(base["cpi_yoy"] + self.rng.normal(0, 0.05), 2),
                "holiday_flag": dow == 6,            # Sunday
                "is_friday": dow == 4,
                "is_salary_day": d.day in (1, 15),
                "is_eid_window": False,
                "is_ramadan": False,
            }
            rows.append(row)

        df = pd.DataFrame(rows)
        print(f"dim_market: {len(df)} rows")
        return df

    # ======================================================================
    # fact_gl_daily
    # ======================================================================

    def generate_fact_gl_daily(self, dim_market: pd.DataFrame) -> pd.DataFrame:
        """
        For each branch and each day, produce one GL row.
        Dirichlet split ensures daily amounts sum exactly to the period total.
        """
        n_days = self.n_days
        dates_str = dim_market["date"].values  # array of date strings
        dates_dt = pd.to_datetime(dates_str)
        dows = dates_dt.dayofweek.values        # 0=Mon .. 6=Sun
        days_of_month = dates_dt.day.values

        # Pre-compute day-of-week and salary-day weight multipliers
        dow_weights = np.ones(n_days, dtype=np.float64)
        for i in range(n_days):
            if dows[i] == 4:       # Friday
                dow_weights[i] = 1.2
            elif dows[i] == 5:     # Saturday
                dow_weights[i] = 0.5
            elif dows[i] == 6:     # Sunday
                dow_weights[i] = 0.4

        salary_weights = np.ones(n_days, dtype=np.float64)
        for i in range(n_days):
            if days_of_month[i] in (1, 2, 15, 16):
                salary_weights[i] = 1.3

        combined_weights = dow_weights * salary_weights  # element-wise

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
            # 2. Dirichlet base weights + calendar effects
            # ---------------------------------------------------------------
            alpha_dep = np.ones(n_days)
            raw_dep = self.rng.dirichlet(alpha_dep)    # sums to 1.0
            adj_dep = raw_dep * combined_weights
            adj_dep /= adj_dep.sum()                   # re-normalize
            daily_dep = adj_dep * total_dep_m           # sums exactly to total_dep_m

            alpha_wth = np.ones(n_days)
            raw_wth = self.rng.dirichlet(alpha_wth)
            adj_wth = raw_wth * combined_weights
            adj_wth /= adj_wth.sum()
            daily_wth = adj_wth * total_wth_m

            # ---------------------------------------------------------------
            # 3. Vault chain: opening/closing balances
            # ---------------------------------------------------------------
            vault_cap_m = br["vault_capacity"] / 1e6
            optimal_m = br["optimal_vault_balance"] / 1e6
            opening = np.zeros(n_days, dtype=np.float64)
            closing = np.zeros(n_days, dtype=np.float64)

            opening[0] = br["current_vault_balance"] / 1e6
            for t in range(n_days):
                closing[t] = opening[t] + daily_dep[t] - daily_wth[t]
                if t < n_days - 1:
                    # CIT adjustment: if vault drifts too far, nudge towards optimal
                    next_open = closing[t]
                    if next_open < optimal_m * 0.3:
                        next_open = optimal_m * 0.6  # emergency CIT-in
                    elif next_open > vault_cap_m * 0.95:
                        next_open = optimal_m * 0.8  # CIT-out
                    opening[t + 1] = next_open

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
            insurance_daily = closing * 0.00015 / 365 * n_days  # vault insurance

            # ---------------------------------------------------------------
            # 8. Assemble rows (vectorized per branch)
            # ---------------------------------------------------------------
            branch_df = pd.DataFrame({
                "date": dates_str,
                "branch_id": bid,
                "opening_balance_m": np.round(opening, 6),
                "total_deposit_flow_m": np.round(daily_dep, 6),
                "total_withdrawal_flow_m": np.round(daily_wth, 6),
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
    # fact_transactions
    # ======================================================================

    def generate_fact_transactions(self, fact_gl: pd.DataFrame) -> pd.DataFrame:
        """
        For each (branch_id, date) in fact_gl, generate individual transactions
        that sum exactly to the GL deposit/withdrawal flows.
        Samples 10% of daily_transactions to keep row counts manageable.
        """
        # Build a lookup: branch_id -> daily_transactions
        br_txn_map = dict(
            zip(self.branches["branch_id"], self.branches["daily_transactions"])
        )

        # Channel distributions
        dep_channels = ["counter", "cdm", "transfer"]
        dep_channel_probs = [0.60, 0.15, 0.25]
        wth_channels = ["counter", "atm", "cheque"]
        wth_channel_probs = [0.50, 0.35, 0.15]

        all_txns = []
        total_gl_rows = len(fact_gl)
        t0 = time.time()
        batch_count = 0

        for _, row in fact_gl.iterrows():
            bid = row["branch_id"]
            dt = row["date"]
            dep_m = row["total_deposit_flow_m"]
            wth_m = row["total_withdrawal_flow_m"]

            # Number of transactions (10% sample)
            base_txns = br_txn_map.get(bid, 100)
            n_txns = max(int(base_txns * 0.10), 2)
            n_dep = max(int(n_txns * 0.45), 1)
            n_wth = max(n_txns - n_dep, 1)

            # ---------------------------------------------------------------
            # Cash-in transactions (Dirichlet split of deposit flow)
            # ---------------------------------------------------------------
            if dep_m > 0 and n_dep > 0:
                dep_weights = self.rng.dirichlet(np.ones(n_dep))
                dep_amounts = dep_weights * dep_m  # sums exactly to dep_m

                dep_ch = self.rng.choice(dep_channels, size=n_dep, p=dep_channel_probs)
                dep_custs = self.rng.choice(self.customer_ids, size=n_dep, replace=True)

                for j in range(n_dep):
                    all_txns.append({
                        "txn_id": str(uuid.uuid4()),
                        "timestamp": f"{dt}T{self.rng.integers(8, 17):02d}:{self.rng.integers(0, 60):02d}:00",
                        "date": dt,
                        "branch_id": bid,
                        "cust_id": dep_custs[j],
                        "txn_type": "cash_in",
                        "amount_m": round(dep_amounts[j], 6),
                        "channel": dep_ch[j],
                        "is_peak_event": False,
                        "denomination_hint": None,
                    })

            # ---------------------------------------------------------------
            # Cash-out transactions (Dirichlet split of withdrawal flow)
            # ---------------------------------------------------------------
            if wth_m > 0 and n_wth > 0:
                wth_weights = self.rng.dirichlet(np.ones(n_wth))
                wth_amounts = wth_weights * wth_m  # sums exactly to wth_m

                wth_ch = self.rng.choice(wth_channels, size=n_wth, p=wth_channel_probs)
                wth_custs = self.rng.choice(self.customer_ids, size=n_wth, replace=True)

                for j in range(n_wth):
                    all_txns.append({
                        "txn_id": str(uuid.uuid4()),
                        "timestamp": f"{dt}T{self.rng.integers(8, 17):02d}:{self.rng.integers(0, 60):02d}:00",
                        "date": dt,
                        "branch_id": bid,
                        "cust_id": wth_custs[j],
                        "txn_type": "cash_out",
                        "amount_m": round(wth_amounts[j], 6),
                        "channel": wth_ch[j],
                        "is_peak_event": False,
                        "denomination_hint": None,
                    })

            batch_count += 1
            if batch_count % 5000 == 0:
                elapsed = time.time() - t0
                print(f"  fact_transactions: {batch_count}/{total_gl_rows} GL rows processed ({elapsed:.1f}s)")

        fact_txn = pd.DataFrame(all_txns)
        elapsed = time.time() - t0
        print(f"fact_transactions: {len(fact_txn):,} rows in {elapsed:.1f}s")
        return fact_txn

    # ======================================================================
    # Reconciliation verification
    # ======================================================================

    def _verify_reconciliation(
        self,
        fact_gl: pd.DataFrame,
        fact_txn: pd.DataFrame,
    ) -> bool:
        """
        Run 5 reconciliation checks. Returns True if all pass.
        """
        all_pass = True
        n_days = self.n_days

        # ------------------------------------------------------------------
        # CHECK 1: GL avg deposits per branch ~ branch.avg_daily_deposits / 1e6
        # ------------------------------------------------------------------
        gl_branch_dep = fact_gl.groupby("branch_id")["total_deposit_flow_m"].sum()
        branch_expected = self.branches.set_index("branch_id")["avg_daily_deposits"] / 1e6 * n_days
        diff1 = (gl_branch_dep - branch_expected).abs()
        max_diff1 = diff1.max()
        tol1 = 1e-4  # PKR M tolerance (rounding)
        pass1 = max_diff1 < tol1
        sym1 = "\u2713" if pass1 else "\u2717"
        print(f"  {sym1} CHECK 1: GL deposit totals vs branch anchors  (max diff: {max_diff1:.8f} PKR M)")
        if not pass1:
            all_pass = False

        # ------------------------------------------------------------------
        # CHECK 2: Txn cash_in sum per branch-day == GL deposit flow
        # ------------------------------------------------------------------
        txn_dep = (
            fact_txn[fact_txn["txn_type"] == "cash_in"]
            .groupby(["branch_id", "date"])["amount_m"]
            .sum()
        )
        gl_dep = fact_gl.set_index(["branch_id", "date"])["total_deposit_flow_m"]
        # Align indices
        common_idx = txn_dep.index.intersection(gl_dep.index)
        diff2 = (txn_dep.loc[common_idx] - gl_dep.loc[common_idx]).abs()
        max_diff2 = diff2.max() if len(diff2) > 0 else 0.0
        tol2 = 1e-4
        pass2 = max_diff2 < tol2
        sym2 = "\u2713" if pass2 else "\u2717"
        print(f"  {sym2} CHECK 2: Txn cash_in sums vs GL deposits       (max diff: {max_diff2:.8f} PKR M)")
        if not pass2:
            all_pass = False

        # ------------------------------------------------------------------
        # CHECK 3: Txn cash_out sum per branch-day == GL withdrawal flow
        # ------------------------------------------------------------------
        txn_wth = (
            fact_txn[fact_txn["txn_type"] == "cash_out"]
            .groupby(["branch_id", "date"])["amount_m"]
            .sum()
        )
        gl_wth = fact_gl.set_index(["branch_id", "date"])["total_withdrawal_flow_m"]
        common_idx3 = txn_wth.index.intersection(gl_wth.index)
        diff3 = (txn_wth.loc[common_idx3] - gl_wth.loc[common_idx3]).abs()
        max_diff3 = diff3.max() if len(diff3) > 0 else 0.0
        tol3 = 1e-4
        pass3 = max_diff3 < tol3
        sym3 = "\u2713" if pass3 else "\u2717"
        print(f"  {sym3} CHECK 3: Txn cash_out sums vs GL withdrawals   (max diff: {max_diff3:.8f} PKR M)")
        if not pass3:
            all_pass = False

        # ------------------------------------------------------------------
        # CHECK 4: GL monthly interest sum per branch ~ branch anchor
        # ------------------------------------------------------------------
        gl_int = fact_gl.groupby("branch_id")["interest_income_m"].sum()
        br_int_expected = self.branches.set_index("branch_id")["monthly_interest_income"] / 1e6
        diff4 = (gl_int - br_int_expected).abs()
        max_diff4 = diff4.max()
        tol4 = 1e-3  # slightly looser for rounded daily figures
        pass4 = max_diff4 < tol4
        sym4 = "\u2713" if pass4 else "\u2717"
        print(f"  {sym4} CHECK 4: GL interest income vs branch anchors  (max diff: {max_diff4:.8f} PKR M)")
        if not pass4:
            all_pass = False

        # ------------------------------------------------------------------
        # CHECK 5: Bank-wide daily totals match
        # ------------------------------------------------------------------
        bank_gl_dep = fact_gl["total_deposit_flow_m"].sum()
        bank_expected_dep = (self.branches["avg_daily_deposits"] / 1e6 * n_days).sum()
        diff5 = abs(bank_gl_dep - bank_expected_dep)
        tol5 = 1e-2  # aggregate tolerance
        pass5 = diff5 < tol5
        sym5 = "\u2713" if pass5 else "\u2717"
        print(f"  {sym5} CHECK 5: Bank-wide deposit total               (diff: {diff5:.8f} PKR M)")
        if not pass5:
            all_pass = False

        return all_pass

    # ======================================================================
    # generate_all
    # ======================================================================

    def generate_all(self) -> dict:
        """
        Generate all 3 tables, run reconciliation, return results.
        """
        t_start = time.time()

        print("=" * 70)
        print("RECONCILING DATA GENERATOR")
        print(f"  Branches: {len(self.branches)}")
        print(f"  Days:     {self.n_days}")
        print(f"  Period:   {self.start_date} to {self.end_date}")
        print("=" * 70)

        # 1. Market dimension
        print("\n[1/3] Generating dim_market ...")
        dim_market = self.generate_dim_market()

        # 2. GL daily facts
        print("\n[2/3] Generating fact_gl_daily ...")
        fact_gl = self.generate_fact_gl_daily(dim_market)

        # 3. Transaction facts
        print("\n[3/3] Generating fact_transactions ...")
        fact_txn = self.generate_fact_transactions(fact_gl)

        # Reconciliation checks
        print("\n" + "-" * 70)
        print("RECONCILIATION CHECKS")
        print("-" * 70)
        recon_passed = self._verify_reconciliation(fact_gl, fact_txn)
        status = "ALL PASSED" if recon_passed else "SOME FAILED"
        print(f"\nReconciliation: {status}")

        elapsed = time.time() - t_start
        print(f"\nTotal generation time: {elapsed:.1f}s")
        print(f"  dim_market:        {len(dim_market):>10,} rows")
        print(f"  fact_gl_daily:     {len(fact_gl):>10,} rows")
        print(f"  fact_transactions: {len(fact_txn):>10,} rows")

        return {
            "dim_market": dim_market,
            "fact_gl_daily": fact_gl,
            "fact_transactions": fact_txn,
            "reconciliation_passed": recon_passed,
        }


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------

def seed_reconciled_data(db_path: str | None = None):
    """
    Generate and seed CDM tables into the SQLite database.
    Uses pandas to_sql with if_exists='replace' and chunksize=5000.
    """
    if db_path is None:
        # Resolve the default DB path (same as config.py uses)
        from pathlib import Path
        db_path = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")

    gen = ReconcilingDataGenerator(db_path=db_path)
    result = gen.generate_all()

    if not result["reconciliation_passed"]:
        print("\nWARNING: Reconciliation checks did not all pass!")
        print("Data will still be written, but review the failures above.")

    # Write to SQLite
    print("\nWriting to database ...")
    conn = sqlite3.connect(db_path)

    for table_name in ("dim_market", "fact_gl_daily", "fact_transactions"):
        df = result[table_name]
        # Drop the auto-increment 'id' column if present — SQLite will generate it
        if "id" in df.columns:
            df = df.drop(columns=["id"])
        df.to_sql(table_name, conn, if_exists="replace", index=False, chunksize=5000)
        print(f"  {table_name}: {len(df):,} rows written")

    conn.close()
    print("\nDone.")
    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    seed_reconciled_data()
