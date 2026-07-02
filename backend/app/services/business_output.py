"""
Cash Optimization Engine — Prescriptive Business Output Layer
═══════════════════════════════════════════════════════════════
Transforms raw ML/optimization outputs into bankable decisions.
All amounts in PKR Millions. Rates referenced to KIBOR.

SBP Regulatory Context:
- CRR: 6% weekly average on demand + time liabilities (constants.py)
- CRR deposits at SBP are NON-REMUNERATIVE (earn 0%)
- SBP-BSC charges 0.12% service charge on currency chest ops
- CDM mandate: 25% of branches by CY2028
- Penalty: PKR 100K for unprocessed notes to public
- KIBOR overnight: ~10.50% (benchmark for opportunity cost)
"""

import math
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.core.cash_constitution import CONSTITUTION

from app.core.constants import (
    POLICY_RATE, OVERNIGHT_REPO_RATE,
    CIT_COST_PER_TRIP, CIT_EMERGENCY_COST, CIT_MAX_VALUE_PER_TRIP,
    PENALTY_UNPROCESSED_NOTES, DENOMINATIONS,
    UBL_DEPOSIT_BASE_TRILLIONS,
)
from app.core.regulatory_constants import (
    CRR_WEEKLY_AVG, CRR_DAILY_MIN, SBP_BSC_CHARGE,
    CIT_NORMAL_COST, CIT_EMERGENCY_COST as REG_CIT_EMERGENCY,
    CIT_VEHICLE_MAX, VAULT_INSURANCE_RATE, ATM_TARGET_DOC,
    CASH_TXN_COST, DIGITAL_TXN_COST, CDM_TARGET_PCT, CDM_DEADLINE,
    CMS_PENALTY_PER_VIOLATION, CMS_VIOLATIONS, CDM_REQUIREMENTS,
)
from app.models.branch import Branch
from app.models.vault_position import VaultPosition
from app.models.atm import ATM, ATMCassette
from app.models.nostro_account import NostroAccount
from app.models.vostro_account import VostroAccount
from app.models.crr_position import CRRPosition
from app.models.denomination import DenominationInventory
from app.models.forecast import Forecast


def M(val):
    """Convert raw PKR to PKR Millions."""
    if val is None:
        return 0.0
    return val / 1e6


class CashOptimizationEngine:
    """The prescriptive core. Each method returns an ACTION, not a report."""

    def __init__(self, db: Session):
        self.db = db

        # Live rates from SBP EasyData (cached CSV → API → fallback constant)
        try:
            from app.core.sbp_data import get_sbp_service
            sbp = get_sbp_service()
            self.kibor = sbp.get_overnight_kibor()
            self.policy_rate = sbp.get_policy_rate_current()
            self.rates_source = "SBP EasyData" if sbp.available else "Fallback"
        except Exception:
            self.kibor = OVERNIGHT_REPO_RATE
            self.policy_rate = OVERNIGHT_REPO_RATE
            self.rates_source = "Fallback"

        self.crr_rate = CRR_WEEKLY_AVG
        self.crr_daily_min = CRR_DAILY_MIN
        self.bsc_service_charge = SBP_BSC_CHARGE
        self.emergency_cit = CIT_EMERGENCY_COST / 1e6
        self.normal_cit = CIT_NORMAL_COST
        self.vault_insurance_rate = VAULT_INSURANCE_RATE
        self.max_vehicle_value = CIT_VEHICLE_MAX

    # ══════════════════════════════════════════════════════════
    # RECONCILED SPINE — current state from fact_gl_daily
    # ══════════════════════════════════════════════════════════
    _AS_OF_CACHE = None

    def _as_of_date(self) -> str | None:
        """The reconciled 'as-of' date: the latest ledger date ON OR BEFORE today, so
        'current' state reflects the present position rather than the end of the forecast
        horizon (fact_gl_daily runs to 2027). Cached per instance."""
        if self._AS_OF_CACHE is not None:
            return self._AS_OF_CACHE
        today = str(date.today())
        row = self.db.execute(
            text("SELECT MAX(date) FROM fact_gl_daily WHERE date <= :t"), {"t": today}
        ).fetchone()
        d = row[0] if row and row[0] else None
        if not d:  # today precedes all data (edge case) — fall back to earliest available
            row = self.db.execute(text("SELECT MIN(date) FROM fact_gl_daily")).fetchone()
            d = row[0] if row else None
        self._AS_OF_CACHE = d
        return d

    def _reconciled_branch_state(self, branch_id: str, lookback: int = 90) -> dict | None:
        """Current reconciled state for a branch from fact_gl_daily (the system of record
        the T3 forecast + oversight layer read), plus recent withdrawal statistics.

        Anchored to _as_of_date() (latest row on/before today), so it reflects the present
        position, not the forecast horizon. All amounts already in PKR Millions. Returns
        None if the branch has no reconciled rows (caller falls back to the ORM snapshot)."""
        as_of = self._as_of_date()
        if not as_of:
            return None
        rows = self.db.execute(
            text(
                "SELECT date, closing_balance_m, idle_cash_m, total_withdrawal_flow_m, "
                "       total_deposit_flow_m, crr_held_m, crr_required_m "
                "FROM fact_gl_daily WHERE branch_id = :bid AND date <= :asof "
                "ORDER BY date DESC LIMIT :n"
            ),
            {"bid": branch_id, "asof": as_of, "n": lookback},
        ).fetchall()
        if not rows:
            return None
        latest = rows[0]
        wds = [float(r.total_withdrawal_flow_m or 0.0) for r in rows]
        avg_wd = sum(wds) / len(wds)
        var = sum((w - avg_wd) ** 2 for w in wds) / len(wds)
        return {
            "as_of": latest.date,
            "closing_balance_m": float(latest.closing_balance_m or 0.0),
            "idle_cash_m": float(latest.idle_cash_m or 0.0),
            "avg_daily_withdrawal_m": avg_wd,
            "std_daily_withdrawal_m": var ** 0.5,
            "crr_held_m": float(latest.crr_held_m or 0.0),
            "crr_required_m": float(latest.crr_required_m or 0.0),
            "lookback_days": len(rows),
        }

    # ══════════════════════════════════════════════════════════
    # RECONCILED SPINE — network state (latest row per branch)
    # ══════════════════════════════════════════════════════════
    _NETWORK_CACHE_KEY = None
    _NETWORK_CACHE_VAL = None

    def _reconciled_network_state(self, lookback: int = 90) -> tuple[dict, str | None]:
        """Latest reconciled row per branch from fact_gl_daily, keyed by branch_id, plus
        the as-of date. Balances/idle/CRR/deposits/cost-pools come from the latest ledger
        date; withdrawal/deposit *flows* are averaged over the trailing `lookback` days so
        surplus/deficit and demand figures are stable, not single-day noise.

        This is the network-wide analogue of _reconciled_branch_state — one bulk pair of
        queries (~1,532 rows) instead of a per-branch scan. All amounts already in PKR M.
        Cached on the instance so the consolidated views don't re-query per sub-report."""
        as_of = self._as_of_date()
        if not as_of:
            return {}, None
        cache_key = (as_of, lookback)
        if self._NETWORK_CACHE_KEY == cache_key and self._NETWORK_CACHE_VAL is not None:
            return self._NETWORK_CACHE_VAL, as_of

        snap = self.db.execute(
            text(
                "SELECT branch_id, closing_balance_m, idle_cash_m, crr_held_m, crr_required_m, "
                "       total_deposits_m, casa_deposits_m, term_deposits_m, "
                "       personnel_cost_m, premises_cost_m, cash_handling_cost_m, cit_cost_m, "
                "       insurance_cost_m, direct_cost_m, other_cost_m, "
                "       interest_income_m, interest_expense_m, fee_income_m "
                "FROM fact_gl_daily WHERE date = :d"
            ),
            {"d": as_of},
        ).fetchall()

        flows = self.db.execute(
            text(
                "SELECT branch_id, AVG(total_withdrawal_flow_m) AS avg_wd, "
                "       AVG(total_deposit_flow_m) AS avg_dep "
                "FROM fact_gl_daily WHERE date > date(:d, :off) AND date <= :d GROUP BY branch_id"
            ),
            {"d": as_of, "off": f"-{lookback} days"},
        ).fetchall()
        flow_map = {r.branch_id: (float(r.avg_wd or 0.0), float(r.avg_dep or 0.0)) for r in flows}

        state = {}
        for r in snap:
            avg_wd, avg_dep = flow_map.get(r.branch_id, (0.0, 0.0))
            state[r.branch_id] = {
                "closing_balance_m": float(r.closing_balance_m or 0.0),
                "idle_cash_m": float(r.idle_cash_m or 0.0),
                "avg_daily_withdrawal_m": avg_wd,
                "avg_daily_deposit_m": avg_dep,
                "crr_held_m": float(r.crr_held_m or 0.0),
                "crr_required_m": float(r.crr_required_m or 0.0),
                "total_deposits_m": float(r.total_deposits_m or 0.0),
                "casa_deposits_m": float(r.casa_deposits_m or 0.0),
                "term_deposits_m": float(r.term_deposits_m or 0.0),
                "cost_personnel_m": float(r.personnel_cost_m or 0.0),
                "cost_premises_m": float(r.premises_cost_m or 0.0),
                "cost_cash_handling_m": float(r.cash_handling_cost_m or 0.0),
                "cost_cit_m": float(r.cit_cost_m or 0.0),
                "cost_insurance_m": float(r.insurance_cost_m or 0.0),
                "cost_direct_m": float(r.direct_cost_m or 0.0),
                "cost_other_m": float(r.other_cost_m or 0.0),
                "interest_income_m": float(r.interest_income_m or 0.0),
                "interest_expense_m": float(r.interest_expense_m or 0.0),
                "fee_income_m": float(r.fee_income_m or 0.0),
            }
        self._NETWORK_CACHE_KEY = cache_key
        self._NETWORK_CACHE_VAL = state
        return state, as_of

    def _reconciled_network_costs(self, days: int = 30) -> dict | None:
        """Trailing-`days` network cost pools from fact_gl_daily (real ABC costing), PKR M.
        Anchored to _as_of_date(). Returns None if the ledger is empty (caller falls back)."""
        as_of = self._as_of_date()
        if not as_of:
            return None
        r = self.db.execute(
            text(
                "SELECT SUM(personnel_cost_m) p, SUM(premises_cost_m) pr, "
                "       SUM(cash_handling_cost_m) ch, SUM(cit_cost_m) cit, "
                "       SUM(insurance_cost_m) ins, SUM(direct_cost_m) d, SUM(other_cost_m) o "
                "FROM fact_gl_daily WHERE date > date(:d, :off) AND date <= :d"
            ),
            {"d": as_of, "off": f"-{days} days"},
        ).fetchone()
        return {
            "as_of": as_of,
            "personnel_m": float(r.p or 0.0),
            "premises_m": float(r.pr or 0.0),
            "cash_handling_m": float(r.ch or 0.0),
            "cit_m": float(r.cit or 0.0),
            "insurance_m": float(r.ins or 0.0),
            "direct_m": float(r.d or 0.0),
            "other_m": float(r.o or 0.0),
        }

    def _branch_optimal(self, avg_wd_m: float, capacity_m: float) -> tuple[float, float, float]:
        """Consistent (optimal, sbp_minimum, insurance_limit) in PKR M from reconciled demand.
        Same formula as vault_recommendation so every UC agrees on surplus/deficit."""
        insurance_limit = capacity_m * 0.85
        sbp_minimum = max(avg_wd_m * 0.3, 2.0)
        optimal = min(max(avg_wd_m * 1.65, sbp_minimum), insurance_limit)
        return optimal, sbp_minimum, insurance_limit

    def _branch_states(self, city: str = None):
        """Unified per-branch state on the reconciled spine for the network-scanning UCs.

        Joins static Branch metadata (capacity, geo, type, CES) with the latest reconciled
        ledger row (balance, idle, flows, deposits, cost pools). `current`/`idle`/`avg_wd`/
        `avg_dep` and `optimal` come from fact_gl_daily when the branch is reconciled; falls
        back to the legacy ORM snapshot otherwise. Returns (states, as_of, data_source)."""
        q = self.db.query(Branch)
        if city:
            q = q.filter(Branch.city == city)
        branches = q.all()
        recon, as_of = self._reconciled_network_state()
        reconciled_hits = 0
        states = []
        for b in branches:
            r = recon.get(b.branch_id)
            capacity = M(b.vault_capacity)
            if r:
                reconciled_hits += 1
                current, idle = r["closing_balance_m"], r["idle_cash_m"]
                avg_wd, avg_dep = r["avg_daily_withdrawal_m"], r["avg_daily_deposit_m"]
                optimal, sbp_min, ins_limit = self._branch_optimal(avg_wd, capacity)
            else:
                current, idle = M(b.current_vault_balance), M(b.idle_cash)
                avg_wd, avg_dep = M(b.avg_daily_withdrawals), M(b.avg_daily_deposits)
                optimal = M(b.optimal_vault_balance)
                ins_limit = capacity * 0.85
                sbp_min = max(avg_wd * 0.3, 2.0)
                if optimal <= 0:
                    optimal = min(max(avg_wd * 1.65, sbp_min), ins_limit)
            states.append({
                "branch": b, "recon": r,
                "current": current, "idle": idle,
                "avg_wd": avg_wd, "avg_dep": avg_dep,
                "capacity": capacity, "optimal": optimal,
                "sbp_min": sbp_min, "insurance_limit": ins_limit,
            })
        data_source = "reconciled" if reconciled_hits else "snapshot"
        if reconciled_hits and reconciled_hits < len(states):
            data_source = "mixed"
        return states, as_of, data_source

    # ══════════════════════════════════════════════════════════
    # UC-01: VAULT RECOMMENDATION
    # ══════════════════════════════════════════════════════════

    def vault_recommendation(self, branch_id: str) -> dict:
        branch = self.db.query(Branch).filter(Branch.branch_id == branch_id).first()
        if not branch:
            return {"error": f"Branch {branch_id} not found"}

        # Reconciled state (system of record) with graceful fallback to the ORM snapshot.
        recon = self._reconciled_branch_state(branch_id)
        if recon:
            data_source = "reconciled"          # fact_gl_daily
            as_of = recon["as_of"]
            current = recon["closing_balance_m"]
            avg_wd = recon["avg_daily_withdrawal_m"]
        else:
            data_source = "snapshot"            # legacy ORM Branch snapshot
            as_of = str(date.today())
            current = M(branch.current_vault_balance)
            avg_wd = M(branch.avg_daily_withdrawals)

        # All in PKR Millions. Capacity/optimal-hint come from branch metadata (not in the
        # daily ledger); current level + demand come from the reconciled spine above.
        capacity = M(branch.vault_capacity)
        insurance_limit = capacity * 0.85
        sbp_minimum = max(avg_wd * 0.3, 2.0)

        optimal = M(branch.optimal_vault_balance)
        if optimal <= 0:
            optimal = avg_wd * 1.65
        optimal = max(optimal, sbp_minimum)
        optimal = min(optimal, insurance_limit)
        delta = round(current - optimal, 2)
        cit_threshold = 5.0

        if delta > cit_threshold:
            action = "RELEASE"
            action_detail = f"Release PKR {delta:.1f}M to CIT. Earning 0% in vault."
        elif delta < -cit_threshold:
            action = "REQUEST"
            action_detail = f"Request PKR {abs(delta):.1f}M from CPC/feeding branch."
        else:
            action = "HOLD"
            action_detail = f"Current level acceptable. Delta PKR {abs(delta):.1f}M below CIT threshold."

        idle = max(0, current - optimal)
        daily_kibor_loss = idle * (self.kibor / 365)
        daily_insurance_waste = idle * self.vault_insurance_rate
        total_daily = daily_kibor_loss + daily_insurance_waste
        annual_loss = idle * self.kibor

        # Recent forecast
        latest_forecast = (
            self.db.query(Forecast)
            .filter(Forecast.entity_type == "branch", Forecast.entity_id == branch_id)
            .order_by(Forecast.forecast_date.desc())
            .first()
        )
        if latest_forecast:
            forecast_info = {
                "predicted_demand": round(M(latest_forecast.predicted_value), 1),
                "confidence_lower": round(M(latest_forecast.confidence_lower), 1),
                "confidence_upper": round(M(latest_forecast.confidence_upper), 1),
                "mape": latest_forecast.mape,
                "model": latest_forecast.model_version or "LSTM",
            }
        else:
            forecast_info = {
                "predicted_demand": round(avg_wd, 1),
                "confidence_lower": round(avg_wd * 0.85, 1),
                "confidence_upper": round(avg_wd * 1.15, 1),
                "mape": None,
                "model": "Historical Average",
            }

        rec = {
            "branch_id": branch_id,
            "branch_name": branch.name,
            "city": branch.city,
            "branch_type": branch.branch_type.value if hasattr(branch.branch_type, 'value') else str(branch.branch_type),
            "date": as_of,
            "data_source": data_source,
            "decision": {
                "recommended_vault": round(optimal, 1),
                "current_vault": round(current, 1),
                "action": action,
                "action_amount": round(abs(delta), 1),
                "action_detail": action_detail,
            },
            "constraints": {
                "sbp_minimum": round(sbp_minimum, 1),
                "insurance_limit": round(insurance_limit, 1),
                "vault_capacity": round(capacity, 1),
                "binding_constraint": (
                    "insurance" if optimal >= insurance_limit - 0.1 else
                    "sbp_minimum" if optimal <= sbp_minimum + 0.1 else
                    "forecast"
                ),
            },
            "forecast": forecast_info,
            "cost_of_inaction": {
                "idle_cash": round(idle, 1),
                "daily_kibor_loss_pkr": round(daily_kibor_loss * 1e6, 0),
                "daily_insurance_waste_pkr": round(daily_insurance_waste * 1e6, 0),
                "total_daily_cost_pkr": round(total_daily * 1e6, 0),
                "annual_loss_m": round(annual_loss, 2),
                "kibor_reference": f"{self.kibor * 100:.2f}%",
                "narrative": (
                    f"PKR {idle:.1f}M sitting idle. At KIBOR {self.kibor * 100:.2f}%, "
                    f"you lose PKR {daily_kibor_loss * 1e6:,.0f}/day = PKR {annual_loss:.2f}M/year."
                ),
            },
            "scorecard": {
                "ces": round(branch.cash_efficiency_score, 3),
                "savings_potential_annual": round(annual_loss, 2),
            },
        }

        # Constitution gate: critique the CURRENT vault state (a branch already over its
        # insured limit or below operational minimum is a real, flaggable breach). HARD
        # violations set constitution_status=BLOCKED + auto_flag for the Exceptions queue.
        plan = {
            "vault_balance_m": current,
            "vault_capacity_m": capacity,
            "vault_min_m": sbp_minimum,
        }
        return CONSTITUTION.enforce(plan, rec)

    # ══════════════════════════════════════════════════════════
    # UC-02: ATM LOAD ORDERS
    # ══════════════════════════════════════════════════════════

    def atm_load_orders(self, branch_id: str = None, city: str = None) -> dict:
        query = self.db.query(ATM).filter(ATM.status == "active")
        if branch_id:
            branch = self.db.query(Branch).filter(Branch.branch_id == branch_id).first()
            if branch:
                query = query.filter(ATM.branch_id == branch.id)
        elif city:
            query = query.filter(ATM.city == city)

        atms = query.limit(500).all()

        orders = []
        total_idle = 0.0
        for atm in atms:
            # Compute current cash from cassettes, convert to millions
            cassette_value = sum(c.current_level for c in atm.cassettes) if atm.cassettes else 0
            current_cash = M(cassette_value)
            avg_dispense = M(atm.avg_daily_dispense)

            if avg_dispense <= 0:
                avg_dispense = 0.5

            doc = current_cash / avg_dispense
            target_doc = 2.2
            optimal_load = avg_dispense * target_doc
            idle = max(0, current_cash - optimal_load)
            daily_loss = idle * (self.kibor / 365)
            total_idle += idle

            if doc < 1.0:
                action, priority = "URGENT_LOAD", "HIGH"
                load_amount = round(optimal_load - current_cash, 2)
            elif doc < 1.5:
                action, priority = "SCHEDULE_LOAD", "MEDIUM"
                load_amount = round(optimal_load - current_cash, 2)
            elif doc > 3.5:
                action, priority = "SKIP_NEXT_CIT", "LOW"
                load_amount = 0
            else:
                action, priority = "OPTIMAL", "NONE"
                load_amount = 0

            loc = atm.location_type or "offsite"
            if loc == "lobby" and atm.city in ("Karachi", "Lahore", "Islamabad"):
                denom = {"rs5000": 55, "rs1000": 30, "rs500": 15}
            elif loc == "mall":
                denom = {"rs5000": 45, "rs1000": 35, "rs500": 20}
            else:
                denom = {"rs5000": 35, "rs1000": 40, "rs500": 25}

            orders.append({
                "atm_id": atm.atm_id,
                "branch_id": atm.branch_id,
                "location": atm.city,
                "location_type": loc,
                "current_cash": round(current_cash, 2),
                "days_of_cash": round(doc, 1),
                "optimal_load": round(optimal_load, 2),
                "action": action,
                "priority": priority,
                "load_amount": max(0, round(load_amount, 2)),
                "denomination_pct": denom,
                "daily_idle_loss_pkr": round(daily_loss * 1e6, 0),
                "uptime": round(atm.uptime_pct, 1),
            })

        priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "NONE": 3}
        orders.sort(key=lambda x: priority_order.get(x["priority"], 3))

        urgent = sum(1 for o in orders if o["action"] == "URGENT_LOAD")
        scheduled = sum(1 for o in orders if o["action"] == "SCHEDULE_LOAD")
        skip = sum(1 for o in orders if o["action"] == "SKIP_NEXT_CIT")
        avg_doc = sum(o["days_of_cash"] for o in orders) / max(len(orders), 1)

        return {
            "total_atms": len(atms),
            "summary": {
                "urgent_loads": urgent,
                "scheduled_loads": scheduled,
                "skip_next": skip,
                "optimal": len(atms) - urgent - scheduled - skip,
                "total_idle_cash": round(total_idle, 1),
                "daily_fleet_idle_loss": round(total_idle * self.kibor / 365 * 1e6, 0),
                "avg_days_of_cash": round(avg_doc, 1),
                "target_days_of_cash": 2.2,
            },
            "orders": orders[:50],
            "narrative": (
                f"{urgent} ATMs need URGENT loading. {scheduled} scheduled. "
                f"Fleet idle cash: PKR {total_idle:.1f}M losing "
                f"PKR {total_idle * self.kibor / 365 * 1e6:,.0f}/day at KIBOR."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # UC-03: NETTING OPPORTUNITIES
    # ══════════════════════════════════════════════════════════

    def netting_opportunities(self, city: str = None) -> dict:
        # Reconciled spine: surplus/deficit computed from ledger balances vs the same
        # optimal formula UC-01 uses, so netting agrees with the vault recommendations.
        states, as_of, data_source = self._branch_states(city)
        surplus = [st for st in states if st["optimal"] > 0 and st["current"] > st["optimal"] * 1.3]
        deficit = [st for st in states if st["optimal"] > 0 and st["current"] < st["optimal"] * 0.8]

        # Build all candidate pairs with distances (from branch metadata geo)
        candidates = []
        for s in surplus:
            sb = s["branch"]
            for d in deficit:
                db_ = d["branch"]
                if sb.latitude and db_.latitude and sb.longitude and db_.longitude:
                    dlat = abs(sb.latitude - db_.latitude)
                    dlng = abs(sb.longitude - db_.longitude)
                    dist_km = math.sqrt(dlat ** 2 + dlng ** 2) * 111
                else:
                    dist_km = 10.0 if sb.city == db_.city else 50.0

                if dist_km <= 15:
                    candidates.append((s, d, dist_km))

        # Greedy 1-to-1 matching: each branch's capacity used once.
        # Balances/optimal are already in PKR M (reconciled spine).
        remaining_excess = {s["branch"].branch_id: s["current"] - s["optimal"] for s in surplus}
        remaining_shortfall = {d["branch"].branch_id: d["optimal"] - d["current"] for d in deficit}

        candidates.sort(key=lambda x: min(remaining_excess.get(x[0]["branch"].branch_id, 0), remaining_shortfall.get(x[1]["branch"].branch_id, 0)), reverse=True)

        matches = []
        for s, d, dist_km in candidates:
            sb, db_ = s["branch"], d["branch"]
            avail_excess = remaining_excess.get(sb.branch_id, 0)
            avail_shortfall = remaining_shortfall.get(db_.branch_id, 0)
            transfer = min(avail_excess, avail_shortfall)

            if transfer < 3.0:
                continue

            remaining_excess[sb.branch_id] -= transfer
            remaining_shortfall[db_.branch_id] -= transfer

            bsc_avoided = transfer * self.bsc_service_charge
            net_saving = bsc_avoided + self.normal_cit

            matches.append({
                "from_branch": sb.branch_id,
                "from_name": sb.name,
                "to_branch": db_.branch_id,
                "to_name": db_.name,
                "city": sb.city,
                "transfer_amount": round(transfer, 1),
                "distance_km": round(dist_km, 1),
                "bsc_charge_avoided": round(bsc_avoided, 4),
                "cit_trip_saved": round(self.normal_cit, 3),
                "net_saving": round(net_saving, 4),
            })

        matches.sort(key=lambda x: x["net_saving"], reverse=True)
        total_nettable = sum(m["transfer_amount"] for m in matches)
        total_saving = sum(m["net_saving"] for m in matches)

        return {
            "date": as_of,
            "data_source": data_source,
            "surplus_branches": len(surplus),
            "deficit_branches": len(deficit),
            "matches_found": len(matches),
            "total_nettable_amount": round(total_nettable, 1),
            "total_daily_saving": round(total_saving, 3),
            "annual_saving": round(total_saving * 300, 1),
            "bsc_service_charge_rate": f"{self.bsc_service_charge * 100:.2f}%",
            "matches": matches[:20],
            "narrative": (
                f"{len(matches)} netting opportunities found. "
                f"PKR {total_nettable:.0f}M can bypass SBP-BSC "
                f"(saving {self.bsc_service_charge * 100:.2f}% service charge). "
                f"Annual saving: PKR {total_saving * 300:.1f}M."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # UC-04: CRR DEPLOYMENT RECOMMENDATION
    # ══════════════════════════════════════════════════════════

    def crr_deployment(self) -> dict:
        from datetime import datetime

        # Reconciled spine: network CRR is the sum of per-branch crr_held/crr_required in
        # fact_gl_daily. Deposit base is implied by required/crr_rate. Fallback to the legacy
        # (and now stale) crr_positions table only if the ledger is empty.
        _as_of = self._as_of_date()
        series = self.db.execute(
            text(
                "SELECT date, SUM(crr_held_m) held, SUM(crr_required_m) req "
                "FROM fact_gl_daily WHERE date <= :asof GROUP BY date ORDER BY date DESC LIMIT 7"
            ),
            {"asof": _as_of},
        ).fetchall() if _as_of else []

        if series:
            data_source = "reconciled"
            as_of = series[0].date
            latest_dt = datetime.strptime(as_of, "%Y-%m-%d").date()
            required_latest = float(series[0].req or 0.0)
            deposit_base = required_latest / self.crr_rate if self.crr_rate else 0.0
            dow = latest_dt.weekday()                 # Mon=0...Sun=6
            days_elapsed = ((dow - 4) % 7) + 1        # Fri=1
            recent_days = series[:days_elapsed]
            cumulative_held = sum(float(r.held or 0.0) for r in recent_days)
            week_income = sum(
                max(0.0, float(r.held or 0.0) - float(r.req or 0.0)) * (self.kibor / 365)
                for r in recent_days
            )
        else:
            latest = self.db.query(CRRPosition).order_by(CRRPosition.date.desc()).first()
            if not latest:
                return {"error": "No CRR data found"}
            data_source = "snapshot"
            as_of = str(latest.date)
            deposit_base = M(latest.deposit_base)
            dow = latest.date.weekday()
            days_elapsed = ((dow - 4) % 7) + 1
            recent = (
                self.db.query(CRRPosition)
                .order_by(CRRPosition.date.desc())
                .limit(days_elapsed)
                .all()
            )
            cumulative_held = sum(M(p.actual_crr) for p in recent)
            week_income = sum(
                max(0, M(p.freed_liquidity)) * (self.kibor / 365) for p in recent
            )

        required_weekly_avg = deposit_base * self.crr_rate
        daily_minimum = deposit_base * self.crr_daily_min
        days_remaining = 7 - days_elapsed

        required_total = required_weekly_avg * 7
        remaining_needed = required_total - cumulative_held

        if days_remaining > 0:
            daily_target = remaining_needed / days_remaining
        else:
            daily_target = required_weekly_avg

        buffer = deposit_base * 0.0015
        today_hold = max(daily_minimum, daily_target) + buffer
        free = max(0, deposit_base * self.crr_rate - today_hold + buffer)
        daily_income = free * (self.kibor / 365)

        avg_so_far = cumulative_held / max(days_elapsed, 1)
        compliance = "ON_TRACK" if avg_so_far >= required_weekly_avg * 0.95 else "MONITOR"

        return {
            "date": as_of,
            "data_source": data_source,
            "maintenance_period": {
                "day_number": days_elapsed,
                "days_remaining": days_remaining,
                "period": "Friday to Thursday",
            },
            "deposit_base": round(deposit_base, 0),
            "crr_rate": f"{self.crr_rate * 100:.1f}%",
            "position": {
                "required_weekly_avg": round(required_weekly_avg, 0),
                "cumulative_held": round(cumulative_held, 0),
                "daily_avg_so_far": round(avg_so_far, 0),
                "avg_pct_so_far": round(avg_so_far / deposit_base * 100, 2) if deposit_base else 0,
                "remaining_needed": round(remaining_needed, 0),
                "daily_target_remaining": round(daily_target, 0),
            },
            "recommendation": {
                "hold_at_sbp_today": round(today_hold, 0),
                "hold_pct": round(today_hold / deposit_base * 100, 2) if deposit_base else 0,
                "free_for_deployment": round(free, 0),
                "deploy_in": "Overnight KIBOR Repo",
                "kibor_rate": f"{self.kibor * 100:.2f}%",
                "expected_income_today": round(daily_income, 2),
                "intraday_buffer": round(buffer, 0),
            },
            "week_performance": {
                "income_earned_so_far": round(week_income, 2),
                "projected_week_income": round(week_income + daily_income * max(days_remaining, 1), 2),
                "annualized": round((week_income + daily_income * max(days_remaining, 1)) * 52, 1),
            },
            "risk": {
                "compliance_status": compliance,
                "breach_probability": "< 0.1%" if buffer > 0 else "ELEVATED",
            },
            "narrative": (
                f"Day {days_elapsed}/7 of maintenance period. "
                f"Hold PKR {today_hold:,.0f}M at SBP (earns 0%). "
                f"Deploy PKR {free:,.0f}M in overnight repo at KIBOR {self.kibor * 100:.2f}%. "
                f"Expected income today: PKR {daily_income:.2f}M."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # UC-05 & UC-06: NOSTRO & VOSTRO ACTIONS
    # ══════════════════════════════════════════════════════════

    def nostro_vostro_actions(self) -> dict:
        nostros = self.db.query(NostroAccount).all()
        vostros = self.db.query(VostroAccount).all()

        nostro_actions = []
        total_sweepable = 0.0
        total_fund_needed = 0.0

        for n in nostros:
            bal = M(n.balance)
            req_min = M(n.required_minimum)
            excess = M(n.excess_balance)
            available = bal - req_min

            if available > req_min * 0.2:
                action = "SWEEP"
                amount = round(available, 2)
                total_sweepable += amount

                local_rate = n.overnight_rate / 100 if n.overnight_rate > 1 else n.overnight_rate
                carry = self.kibor - local_rate
                if carry > 0.02:
                    destination = "REPATRIATE_TO_PKR"
                    expected_yield = f"{self.kibor * 100:.2f}% (KIBOR)"
                    rationale = f"PKR carry {carry * 100:.1f}% over {n.currency} rate"
                else:
                    destination = "OVERNIGHT_DEPOSIT"
                    expected_yield = f"{local_rate * 100:.2f}% ({n.currency} O/N)"
                    rationale = f"Carry insufficient for repatriation ({carry * 100:.1f}%)"
            elif available < -req_min * 0.1:
                action = "FUND"
                amount = round(abs(available), 2)
                total_fund_needed += amount
                destination = "TRANSFER_OR_PURCHASE"
                expected_yield = "N/A"
                rationale = f"Below minimum by PKR {amount:.1f}M"
            else:
                action = "HOLD"
                amount = 0
                destination = "N/A"
                expected_yield = "N/A"
                rationale = "Within acceptable range"

            nostro_actions.append({
                "bank": n.bank_name,
                "currency": n.currency,
                "country": n.country,
                "balance": round(bal, 1),
                "minimum": round(req_min, 1),
                "excess": round(excess, 1),
                "available": round(available, 1),
                "action": action,
                "amount": amount,
                "destination": destination,
                "expected_yield": expected_yield,
                "rationale": rationale,
            })

        action_order = {"FUND": 0, "SWEEP": 1, "HOLD": 2}
        nostro_actions.sort(key=lambda x: action_order.get(x["action"], 2))

        # Vostro analysis
        vostro_actions = []
        total_deployable = 0.0
        for v in vostros:
            stable = M(v.stable_portion)
            deployable = M(v.deployable_amount)
            total_deployable += deployable

            if deployable > 0:
                vostro_actions.append({
                    "bank": v.bank_name,
                    "currency": v.currency,
                    "balance": round(M(v.balance), 1),
                    "stable_portion": round(stable, 1),
                    "deployable": round(deployable, 1),
                    "volatility": round(v.volatility, 3),
                    "current_deployment": v.current_deployment or "Undeployed",
                    "yield_rate": round(v.yield_rate * 100, 2) if v.yield_rate < 1 else round(v.yield_rate, 2),
                    "action": "DEPLOY_TBILLS" if stable > v.balance * 0.5 else "OVERNIGHT_ONLY",
                })

        monthly_income = total_sweepable * (self.kibor / 12)

        return {
            "nostro": {
                "total_accounts": len(nostros),
                "total_sweepable": round(total_sweepable, 1),
                "total_fund_needed": round(total_fund_needed, 1),
                "monthly_income_if_swept": round(monthly_income, 2),
                "annual_income_if_swept": round(monthly_income * 12, 1),
                "actions": nostro_actions,
            },
            "vostro": {
                "total_accounts": len(vostros),
                "total_deployable": round(total_deployable, 1),
                "actions": vostro_actions,
            },
            "narrative": (
                f"{sum(1 for a in nostro_actions if a['action'] == 'SWEEP')} nostro accounts to sweep "
                f"(PKR {total_sweepable:.0f}M). "
                f"{sum(1 for a in nostro_actions if a['action'] == 'FUND')} need funding "
                f"(PKR {total_fund_needed:.0f}M). "
                f"Vostro deployable: PKR {total_deployable:.0f}M. "
                f"Potential KIBOR income: PKR {monthly_income:.2f}M/month."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # UC-07: DENOMINATION PLAN
    # ══════════════════════════════════════════════════════════

    def denomination_plan(self, branch_id: str) -> dict:
        branch = self.db.query(Branch).filter(Branch.branch_id == branch_id).first()
        if not branch:
            return {"error": f"Branch {branch_id} not found"}

        btype = branch.branch_type.value if hasattr(branch.branch_type, 'value') else str(branch.branch_type)

        type_plans = {
            "CASH_SURPLUS":  {"rs5000": 20, "rs1000": 40, "rs500": 25, "rs100": 10, "rs50_below": 5},
            "Cash-Surplus":  {"rs5000": 20, "rs1000": 40, "rs500": 25, "rs100": 10, "rs50_below": 5},
            "DEFICIT":       {"rs5000": 50, "rs1000": 30, "rs500": 15, "rs100": 3, "rs50_below": 2},
            "Deficit":       {"rs5000": 50, "rs1000": 30, "rs500": 15, "rs100": 3, "rs50_below": 2},
            "BALANCED":      {"rs5000": 35, "rs1000": 35, "rs500": 20, "rs100": 7, "rs50_below": 3},
            "Balanced":      {"rs5000": 35, "rs1000": 35, "rs500": 20, "rs100": 7, "rs50_below": 3},
            "SEASONAL":      {"rs5000": 15, "rs1000": 45, "rs500": 25, "rs100": 10, "rs50_below": 5},
            "Seasonal":      {"rs5000": 15, "rs1000": 45, "rs500": 25, "rs100": 10, "rs50_below": 5},
            "HUB":           {"rs5000": 30, "rs1000": 30, "rs500": 20, "rs100": 12, "rs50_below": 8},
            "Hub":           {"rs5000": 30, "rs1000": 30, "rs500": 20, "rs100": 12, "rs50_below": 8},
        }

        plan = dict(type_plans.get(btype, type_plans["Balanced"]))

        month = date.today().month
        near_eid = month in (3, 4, 6, 7)
        if near_eid:
            plan["rs50_below"] = plan.get("rs50_below", 5) + 10
            plan["rs100"] = plan.get("rs100", 7) + 5
            plan["rs5000"] = max(0, plan.get("rs5000", 35) - 10)
            plan["rs1000"] = max(0, plan.get("rs1000", 35) - 5)

        # Reconciled closing balance (system of record), fallback to ORM snapshot.
        recon = self._reconciled_branch_state(branch_id)
        total_vault = recon["closing_balance_m"] if recon else M(branch.current_vault_balance)
        data_source = "reconciled" if recon else "snapshot"
        amounts = {k: round(total_vault * v / 100, 1) for k, v in plan.items()}

        # Current inventory if available
        inventory = (
            self.db.query(DenominationInventory)
            .filter(DenominationInventory.branch_id == branch.id)
            .order_by(DenominationInventory.date.desc())
            .all()
        )
        current_inv = {}
        seen = set()
        for inv in inventory:
            if inv.denomination not in seen:
                current_inv[f"rs{inv.denomination}"] = round(M(inv.value), 1)
                seen.add(inv.denomination)

        rationale_map = {
            "CASH_SURPLUS": "High Rs.1000/500 for trader deposits",
            "Cash-Surplus": "High Rs.1000/500 for trader deposits",
            "DEFICIT": "High Rs.5000 for salary withdrawals",
            "Deficit": "High Rs.5000 for salary withdrawals",
            "BALANCED": "Balanced mix for residential area",
            "Balanced": "Balanced mix for residential area",
            "SEASONAL": "Rs.1000 dominant for crop payments",
            "Seasonal": "Rs.1000 dominant for crop payments",
            "HUB": "Buffer stock for redistribution",
            "Hub": "Buffer stock for redistribution",
        }

        return {
            "branch_id": branch_id,
            "branch_name": branch.name,
            "branch_type": btype,
            "data_source": data_source,
            "denomination_plan_pct": plan,
            "denomination_amounts": amounts,
            "current_inventory": current_inv,
            "eid_adjusted": near_eid,
            "fresh_note_requirement": "15% minimum (SBP Currency Mgmt Strategy)",
            "atm_fit_notes": "Rs.5000, Rs.1000, Rs.500 must be machine-authenticated",
            "sbp_penalty_risk": f"PKR {PENALTY_UNPROCESSED_NOTES:,} per instance if unsorted notes issued",
            "rationale": rationale_map.get(btype, "Standard denomination mix"),
        }

    # ══════════════════════════════════════════════════════════
    # UC-08: CIT ROUTE SHEET
    # ══════════════════════════════════════════════════════════

    def cit_route_sheet(self, city: str) -> dict:
        # Reconciled spine: pickup/delivery need computed from ledger balances vs optimal.
        states, as_of, data_source = self._branch_states(city)
        needs_pickup = [
            st for st in states
            if st["optimal"] > 0 and st["current"] > st["optimal"] * 1.3
        ]
        needs_delivery = [
            st for st in states
            if st["optimal"] > 0 and st["current"] < st["optimal"] * 0.8
        ]

        routes = []
        remaining = list(needs_pickup)
        route_num = 0
        high_risk = {"Karachi", "Peshawar", "Quetta"}

        while remaining:
            route_num += 1
            route_value = 0
            stops = []
            added_any = False

            for st in list(remaining):
                b = st["branch"]
                pickup = st["current"] - st["optimal"]   # already PKR M
                # Cap oversized pickups at vehicle limit (split across multiple trips)
                pickup = min(pickup, self.max_vehicle_value * 0.95)
                if route_value + pickup > self.max_vehicle_value:
                    continue
                stops.append({
                    "branch_id": b.branch_id,
                    "name": b.name,
                    "action": "PICKUP",
                    "amount": round(pickup, 1),
                    "time_window": f"{8 + len(stops)}:{'30' if len(stops) % 2 == 0 else '00'}",
                })
                route_value += pickup
                remaining.remove(st)
                added_any = True

            if not added_any:
                # Safety: break if no branch could be added (prevents infinite loop)
                break

            if stops:
                routes.append({
                    "route_id": f"CIT-{city[:3].upper()}-{route_num:02d}",
                    "vehicle": f"{city[:3].upper()}-{route_num:02d}",
                    "total_value": round(route_value, 1),
                    "insurance_ok": route_value <= self.max_vehicle_value,
                    "stops": stops,
                    "est_duration_hours": round(len(stops) * 0.5 + 0.5, 1),
                    "security_level": "ENHANCED" if city in high_risk else "STANDARD",
                    "guards_required": 3 if city in high_risk else 2,
                })

        total_cost = len(routes) * self.normal_cit

        return {
            "city": city,
            "date": as_of or str(date.today()),
            "data_source": data_source,
            "operating_window": "08:00 - 16:00",
            "routes": routes,
            "summary": {
                "total_vehicles": len(routes),
                "total_stops": sum(len(r["stops"]) for r in routes),
                "total_cash_moved": round(sum(r["total_value"] for r in routes), 1),
                "total_cost_pkr": round(total_cost * 1e6, 0),
                "max_vehicle_value_constraint": self.max_vehicle_value,
                "branches_needing_pickup": len(needs_pickup),
                "branches_needing_delivery": len(needs_delivery),
            },
            "security_note": (
                f"ENHANCED security in {city}: armed escorts required"
                if city in high_risk
                else "Standard security protocols"
            ),
        }

    # ══════════════════════════════════════════════════════════
    # UC-09: DIGITAL SHIFT REPORT
    # ══════════════════════════════════════════════════════════

    def digital_shift_report(self) -> dict:
        # Reconciled spine for cash-intensity (withdrawal vs deposit flow); transaction
        # counts are a static branch attribute (not carried in the daily ledger).
        states, as_of, data_source = self._branch_states()

        total_cash_txns = sum(st["branch"].daily_transactions * 0.65 for st in states)
        total_digital_txns = sum(st["branch"].daily_transactions * 0.35 for st in states)

        cash_cost = 0.000095
        digital_cost = 0.000008
        current_cash_cost_daily = total_cash_txns * cash_cost

        shift_pct = 0.05
        shifted = total_cash_txns * shift_pct
        daily_savings = shifted * (cash_cost - digital_cost)
        monthly_savings = daily_savings * 25
        annual_savings = monthly_savings * 12
        monthly_campaign = shifted * 25 * 0.000050

        branches_sorted = sorted(
            [st for st in states if st["avg_dep"] > 0],
            key=lambda st: st["avg_wd"] / max(st["avg_dep"], 0.001),
            reverse=True,
        )

        top_heavy = [
            {
                "branch_id": st["branch"].branch_id,
                "name": st["branch"].name,
                "city": st["branch"].city,
                "cash_intensity": round(st["avg_wd"] / max(st["avg_dep"], 0.001) * 100, 2),
                "daily_cash_txns": int(st["branch"].daily_transactions * 0.65),
                "potential_shift": int(st["branch"].daily_transactions * 0.65 * shift_pct),
            }
            for st in branches_sorted[:20]
        ]

        roi_pct = round((monthly_savings / max(monthly_campaign, 0.001) - 1) * 100, 0)

        return {
            "data_source": data_source,
            "as_of": as_of,
            "current_state": {
                "cash_transactions_pct": 65,
                "digital_transactions_pct": 35,
                "daily_cash_transactions": int(total_cash_txns),
                "daily_digital_transactions": int(total_digital_txns),
                "daily_cash_handling_cost": round(current_cash_cost_daily, 2),
            },
            "shift_target": {
                "shift_pct": shift_pct * 100,
                "transactions_to_shift": int(shifted),
                "channels": ["Raast P2P", "Mobile App", "Omni Channel", "Internet Banking"],
            },
            "financials": {
                "daily_savings": round(daily_savings, 3),
                "monthly_savings": round(monthly_savings, 2),
                "annual_savings": round(annual_savings, 1),
                "monthly_campaign_cost": round(monthly_campaign, 2),
                "net_monthly_benefit": round(monthly_savings - monthly_campaign, 2),
                "roi_pct": roi_pct,
            },
            "top_cash_heavy_branches": top_heavy,
            "narrative": (
                f"Shifting {shift_pct * 100:.0f}% of cash transactions to digital "
                f"saves PKR {annual_savings:.1f}M/year after campaign costs. ROI: {roi_pct:.0f}%."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # UC-10: P&L ATTRIBUTION ("VALUE REALIZED")
    # ══════════════════════════════════════════════════════════

    def value_realized_report(self) -> dict:
        branches = self.db.query(Branch).all()
        atms = self.db.query(ATM).all()
        nostros = self.db.query(NostroAccount).all()

        # Revenue: idle cash freed at KIBOR (all in PKR Millions).
        # Idle + CRR read from the reconciled ledger; graceful fallback to ORM snapshot.
        net_state, as_of = self._reconciled_network_state()
        if net_state:
            data_source = "reconciled"
            branch_idle = sum(s["idle_cash_m"] for s in net_state.values())
            crr_freed = sum(max(0.0, s["crr_held_m"] - s["crr_required_m"]) for s in net_state.values())
        else:
            data_source = "snapshot"
            as_of = str(date.today())
            branch_idle = sum(M(b.idle_cash) for b in branches)
            latest_crr = self.db.query(CRRPosition).order_by(CRRPosition.date.desc()).first()
            crr_freed = M(latest_crr.freed_liquidity) if latest_crr else 0
        vault_income = branch_idle * self.kibor / 12
        crr_income = crr_freed * self.kibor / 12

        atm_idle = 0.0
        for atm in atms:
            cash_m = M(sum(c.current_level for c in atm.cassettes)) if atm.cassettes else 0
            optimal = M(atm.avg_daily_dispense) * 2.2
            atm_idle += max(0, cash_m - optimal)
        atm_income = atm_idle * self.kibor / 12

        nostro_excess = sum(M(n.excess_balance) for n in nostros)
        nostro_income = nostro_excess * self.kibor / 12

        total_revenue = vault_income + atm_income + crr_income + nostro_income

        # Cost side: REAL ABC cost pools from the reconciled ledger (trailing 30 days).
        # Vault insurance is a carrying cost of held cash (reported as a memo line, not an
        # operational handling cost), so it doesn't distort ops P&L. Fallback = branch-count
        # estimate when the ledger is unavailable.
        costs = self._reconciled_network_costs(30)
        if costs:
            cash_personnel = costs["personnel_m"]
            cash_premises = costs["premises_m"]
            cit_handling = costs["cash_handling_m"] + costs["cit_m"]
            other_ops = costs["direct_m"] + costs["other_m"]
            insurance_carry = costs["insurance_m"]
        else:
            data_source = "snapshot"
            n_branches = len(branches)
            cash_personnel = n_branches * 0.12
            cash_premises = n_branches * 0.03
            cit_handling = n_branches * 0.08
            other_ops = n_branches * 0.02
            insurance_carry = 0.0
        total_cost = cash_personnel + cash_premises + cit_handling + other_ops

        bsc_avoided = branch_idle * self.bsc_service_charge
        net_value = total_revenue - total_cost + bsc_avoided

        avg_ces = sum(b.cash_efficiency_score for b in branches) / max(len(branches), 1)

        return {
            "period": "Monthly",
            "date": as_of,
            "data_source": data_source,
            "revenue": {
                "vault_cash_freed_income": round(vault_income, 2),
                "atm_cash_freed_income": round(atm_income, 2),
                "crr_float_income": round(crr_income, 2),
                "nostro_sweep_income": round(nostro_income, 2),
                "total_revenue": round(total_revenue, 2),
            },
            "costs": {
                "cash_personnel": round(cash_personnel, 2),
                "cash_premises": round(cash_premises, 2),
                "cit_and_handling": round(cit_handling, 2),
                "other_cash_ops": round(other_ops, 2),
                "total_cash_ops_cost": round(total_cost, 2),
                "vault_insurance_carry_memo": round(insurance_carry, 2),
            },
            "net_value_realized": {
                "monthly": round(net_value, 2),
                "annual": round(net_value * 12, 1),
                "formula": "(Idle Cash Freed x KIBOR) - Cash Ops Cost",
                "kibor_used": f"{self.kibor * 100:.2f}%",
            },
            "key_metrics": {
                "total_idle_freed_branches": round(branch_idle, 0),
                "total_idle_freed_atms": round(atm_idle, 1),
                "total_idle_freed": round(branch_idle + atm_idle, 0),
                "avg_ces": round(avg_ces, 3),
                "bsc_charges_avoided": round(bsc_avoided, 3),
            },
            "narrative": (
                f"Value Realized: PKR {net_value:.1f}M/month (PKR {net_value * 12:.0f}M annualized). "
                f"Freed PKR {branch_idle + atm_idle:,.0f}M idle cash earning KIBOR {self.kibor * 100:.2f}%. "
                f"Cash ops cost: PKR {total_cost:.1f}M/month."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # CONSOLIDATED EXECUTIVE VIEW
    # ══════════════════════════════════════════════════════════

    def consolidated_dashboard(self) -> dict:
        pnl = self.value_realized_report()
        crr = self.crr_deployment()
        nostro = self.nostro_vostro_actions()
        digital = self.digital_shift_report()
        netting = self.netting_opportunities()

        branches = self.db.query(Branch).all()
        atm_count = self.db.query(func.count(ATM.id)).scalar() or 0

        # Bank snapshot from the reconciled ledger (fallback to ORM snapshot).
        net_state, as_of = self._reconciled_network_state()
        if net_state:
            total_vault = sum(s["closing_balance_m"] for s in net_state.values())
            total_idle = sum(s["idle_cash_m"] for s in net_state.values())
            snapshot_source = "reconciled"
        else:
            total_vault = sum(M(b.current_vault_balance) for b in branches)
            total_idle = sum(M(b.idle_cash) for b in branches)
            snapshot_source = "snapshot"
        deposit_base = UBL_DEPOSIT_BASE_TRILLIONS * 1e6  # PKR trillions -> PKR millions

        crr_deploy = crr.get("recommendation", {}).get("free_for_deployment", 0) if "error" not in crr else 0
        crr_income = crr.get("recommendation", {}).get("expected_income_today", 0) if "error" not in crr else 0
        crr_status = crr.get("risk", {}).get("compliance_status", "N/A") if "error" not in crr else "N/A"

        top_actions = [
            f"Deploy PKR {crr_deploy:,.0f}M in overnight KIBOR repo" if crr_deploy else "CRR data unavailable",
            f"Sweep PKR {nostro['nostro']['total_sweepable']:.0f}M from idle nostro accounts",
            f"Execute {netting['matches_found']} branch netting transfers",
            f"Target PKR {digital['financials']['annual_savings']:.0f}M/yr from digital shift campaign",
        ]

        return {
            "bank_snapshot": {
                "total_branches": len(branches),
                "total_atms": atm_count,
                "deposit_base": round(deposit_base, 0),
                "total_vault_cash": round(total_vault, 0),
                "total_idle_cash": round(total_idle, 0),
                "data_source": snapshot_source,
                "as_of": as_of,
            },
            "optimization_impact": {
                "monthly_value_realized": pnl["net_value_realized"]["monthly"],
                "annual_value_realized": pnl["net_value_realized"]["annual"],
                "avg_ces": pnl["key_metrics"]["avg_ces"],
            },
            "today_actions": {
                "crr_deploy": crr_deploy,
                "crr_income_today": crr_income,
                "nostro_sweepable": nostro["nostro"]["total_sweepable"],
                "netting_matches": netting["matches_found"],
                "netting_annual_saving": netting["annual_saving"],
            },
            "revenue_breakdown": pnl["revenue"],
            "cost_breakdown": pnl["costs"],
            "digital_shift": {
                "cash_pct": digital["current_state"]["cash_transactions_pct"],
                "digital_pct": digital["current_state"]["digital_transactions_pct"],
                "annual_savings_potential": digital["financials"]["annual_savings"],
            },
            "compliance": {
                "crr_status": crr_status,
            },
            "top_actions_now": top_actions,
        }

    # ══════════════════════════════════════════════════════════
    # CDM RECYCLING RECOMMENDATION (Part B)
    # ══════════════════════════════════════════════════════════

    def cdm_recycling_recommendation(self, branch_id: str = None) -> dict:
        """
        CDM priority recommendation with recycling economics.
        Per PSP&OD Circular Letter No. 01 of 2025:
        - 25% of branches must have CDMs by CY2028
        - Prioritize high-cash branches
        """
        query = self.db.query(Branch)
        if branch_id:
            query = query.filter(Branch.branch_id == branch_id)
        branches = query.all()

        # Check CDM table
        from app.models.cdm import CDMDevice
        cdm_map = {}
        try:
            cdms = self.db.query(CDMDevice).all()
            cdm_map = {c.branch_id: c for c in cdms}
        except Exception:
            pass

        total = len(branches)
        target_count = int(total * CDM_TARGET_PCT)
        installed = sum(1 for b in branches if cdm_map.get(b.branch_id, None) and cdm_map[b.branch_id].status == "installed")

        # Reconciled flows (avg withdrawal/deposit) per branch; fallback to ORM snapshot.
        recon, _ = self._reconciled_network_state()

        def _flows(b):
            r = recon.get(b.branch_id)
            if r:
                return r["avg_daily_withdrawal_m"], r["avg_daily_deposit_m"]
            return M(b.avg_daily_withdrawals), M(b.avg_daily_deposits)

        recommendations = []
        for b in sorted(branches, key=lambda x: _flows(x)[0], reverse=True):
            avg_wth, avg_dep = _flows(b)
            daily_txn = b.daily_transactions

            cdm = cdm_map.get(b.branch_id)
            status = cdm.status if cdm else "none"

            # Economics
            install_cost = 4.0  # PKR 4M average
            recycling_ratio = 0.65 if status == "installed" else 0
            monthly_cit_savings = avg_dep * 0.3 * 30 * 0.000015 if recycling_ratio > 0 else 0
            monthly_cash_savings = daily_txn * 0.15 * 30 * (CASH_TXN_COST - DIGITAL_TXN_COST)
            monthly_total_savings = monthly_cit_savings + monthly_cash_savings
            payback_months = round(install_cost / max(monthly_total_savings, 0.001), 1) if status != "installed" else 0

            # Priority score
            priority = avg_wth * 10 + daily_txn * 0.01
            if status == "installed":
                priority = 0

            recommendations.append({
                "branch_id": b.branch_id,
                "name": b.name,
                "city": b.city,
                "branch_type": b.branch_type.value if hasattr(b.branch_type, 'value') else str(b.branch_type),
                "status": status,
                "avg_daily_deposits_m": round(avg_dep, 1),
                "avg_daily_withdrawals_m": round(avg_wth, 1),
                "daily_transactions": daily_txn,
                "install_cost_m": install_cost,
                "monthly_savings_m": round(monthly_total_savings, 3),
                "payback_months": payback_months,
                "recycling_ratio": recycling_ratio,
                "priority_score": round(priority, 1),
                "recommendation": (
                    "INSTALLED" if status == "installed" else
                    "HIGH PRIORITY" if priority > 50 else
                    "MEDIUM PRIORITY" if priority > 20 else
                    "LOW PRIORITY"
                ),
            })

        recommendations.sort(key=lambda x: x["priority_score"], reverse=True)

        return {
            "cdm_mandate": {
                "target_pct": CDM_TARGET_PCT * 100,
                "deadline": CDM_DEADLINE,
                "circular": "PSP&OD Circular Letter No. 01 of 2025",
                "requirements": CDM_REQUIREMENTS,
            },
            "current_state": {
                "total_branches": total,
                "target_count": target_count,
                "installed": installed,
                "gap": max(0, target_count - installed),
                "compliance_pct": round(installed / max(target_count, 1) * 100, 1),
            },
            "recommendations": recommendations[:30],
            "economics": {
                "avg_install_cost_m": 4.0,
                "avg_monthly_savings_m": round(sum(r["monthly_savings_m"] for r in recommendations[:target_count]) / max(target_count, 1), 3),
                "avg_payback_months": round(sum(r["payback_months"] for r in recommendations if r["payback_months"] > 0) / max(len([r for r in recommendations if r["payback_months"] > 0]), 1), 1),
            },
            "narrative": (
                f"CDM mandate: {CDM_TARGET_PCT*100:.0f}% of branches ({target_count}) by {CDM_DEADLINE}. "
                f"Currently {installed} installed ({installed/max(total,1)*100:.0f}%). "
                f"Gap: {max(0, target_count - installed)} branches need CDMs. "
                f"Top priority: high-cash branches with > PKR 50M daily withdrawals."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # IEC OPPORTUNITY FINDER (Part C)
    # ══════════════════════════════════════════════════════════

    def iec_opportunity_finder(self, city: str = None) -> dict:
        """
        Interbank Exchange Cash Swap Matching.
        IEC allows denomination swaps without going through SBP-BSC (0.12% charge avoided).
        Per CMS rules: IEC swaps must be reported to SBP Finance Department.
        """
        query = self.db.query(Branch)
        if city:
            query = query.filter(Branch.city == city)
        branches = query.all()

        # Load denomination inventory
        from app.models.denomination import DenominationInventory
        inv_query = self.db.query(DenominationInventory)
        if city:
            branch_ids = [b.id for b in branches]
            inv_query = inv_query.filter(DenominationInventory.branch_id.in_(branch_ids))
        inv_all = inv_query.all()

        # Build per-branch denomination profile (denomination table uses integer id)
        branch_denoms = {}
        for inv in inv_all:
            bid = inv.branch_id  # integer FK to branches.id
            if bid not in branch_denoms:
                branch_denoms[bid] = {}
            d = inv.denomination
            branch_denoms[bid][d] = branch_denoms[bid].get(d, 0) + M(inv.value)

        # Find swap opportunities: branch A has excess Rs.5000, branch B has excess Rs.100
        high_denoms = [5000, 1000]
        low_denoms = [100, 50, 20, 10]
        swaps = []

        branch_map = {b.id: b for b in branches}
        for bid_a, denoms_a in branch_denoms.items():
            if bid_a not in branch_map:
                continue
            ba = branch_map[bid_a]
            total_a = sum(denoms_a.values())
            if total_a <= 0:
                continue

            high_pct_a = sum(denoms_a.get(d, 0) for d in high_denoms) / total_a
            low_pct_a = sum(denoms_a.get(d, 0) for d in low_denoms) / total_a

            for bid_b, denoms_b in branch_denoms.items():
                if bid_b <= bid_a or bid_b not in branch_map:
                    continue
                bb = branch_map[bid_b]
                if ba.city != bb.city:
                    continue

                total_b = sum(denoms_b.values())
                if total_b <= 0:
                    continue

                high_pct_b = sum(denoms_b.get(d, 0) for d in high_denoms) / total_b
                low_pct_b = sum(denoms_b.get(d, 0) for d in low_denoms) / total_b

                # A has excess high, B has excess low (or vice versa)
                if high_pct_a > 0.7 and low_pct_b > 0.3:
                    swap_amount = min(total_a * 0.1, total_b * 0.1)
                    if swap_amount < 3.0:
                        continue
                    bsc_avoided = swap_amount * self.bsc_service_charge
                    swaps.append({
                        "branch_a": ba.branch_id, "name_a": ba.name,
                        "branch_b": bb.branch_id, "name_b": bb.name,
                        "city": ba.city,
                        "swap_amount_m": round(swap_amount, 1),
                        "a_gives": "High denomination (Rs.5000/1000)",
                        "b_gives": "Low denomination (Rs.100/50/20)",
                        "bsc_avoided_m": round(bsc_avoided, 4),
                        "cit_saved_m": self.normal_cit,
                        "total_saving_m": round(bsc_avoided + self.normal_cit, 4),
                    })

                if len(swaps) >= 30:
                    break
            if len(swaps) >= 30:
                break

        swaps.sort(key=lambda x: x["total_saving_m"], reverse=True)
        total_swap = sum(s["swap_amount_m"] for s in swaps)
        total_saving = sum(s["total_saving_m"] for s in swaps)

        return {
            "method": "Interbank Exchange (IEC) Denomination Swap",
            "regulation": "CMS rules — IEC swaps reported to SBP Finance Department",
            "bsc_rate_avoided": f"{self.bsc_service_charge * 100:.2f}%",
            "swaps_found": len(swaps),
            "total_swap_amount_m": round(total_swap, 1),
            "total_daily_saving_m": round(total_saving, 3),
            "annual_saving_m": round(total_saving * 300, 1),
            "swaps": swaps[:20],
            "narrative": (
                f"{len(swaps)} IEC swap opportunities found"
                f"{' in ' + city if city else ''}. "
                f"PKR {total_swap:.0f}M in denomination swaps bypass SBP-BSC "
                f"(avoiding {self.bsc_service_charge*100:.2f}% service charge). "
                f"Annual saving: PKR {total_saving * 300:.1f}M."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # COMPLIANCE RISK ASSESSMENT (Part D)
    # ══════════════════════════════════════════════════════════

    def compliance_risk_assessment(self) -> dict:
        """
        Branch-level SBP compliance scoring.
        Checks CMS rules, CDM mandate progress, CRR compliance, denomination fitness.
        """
        branches = self.db.query(Branch).all()

        # CDM status
        from app.models.cdm import CDMDevice
        cdm_map = {}
        try:
            for c in self.db.query(CDMDevice).all():
                cdm_map[c.branch_id] = c
        except Exception:
            pass

        # Denomination fitness
        from app.models.denomination import DenominationInventory
        soiled_map = {}
        try:
            inv = self.db.query(DenominationInventory).all()
            for i in inv:
                bid = i.branch_id
                if bid not in soiled_map:
                    soiled_map[bid] = {"fit": 0, "soiled": 0}
                if i.is_soiled:
                    soiled_map[bid]["soiled"] += i.quantity
                else:
                    soiled_map[bid]["fit"] += i.quantity
        except Exception:
            pass

        total = len(branches)
        cdm_target = int(total * CDM_TARGET_PCT)

        # Reconciled spine: idle/optimal/demand from fact_gl_daily where available.
        recon, _ = self._reconciled_network_state()

        assessments = []
        green = gold = red = 0

        for b in branches:
            issues = []
            fine_risk = 0

            r = recon.get(b.branch_id)
            if r:
                avg_wd_m = r["avg_daily_withdrawal_m"]
                idle_m = r["idle_cash_m"]
                optimal_m, _sbp, _ins = self._branch_optimal(avg_wd_m, M(b.vault_capacity))
            else:
                avg_wd_m = M(b.avg_daily_withdrawals)
                idle_m = M(b.idle_cash)
                optimal_m = M(b.optimal_vault_balance)

            # Check 1: CDM mandate
            cdm = cdm_map.get(b.branch_id)
            if not cdm or cdm.status != "installed":
                if avg_wd_m > 30:  # High-cash branch without CDM
                    issues.append("No CDM — high-cash branch should be prioritized")
                    fine_risk += 0.05

            # Check 2: Note fitness (soiled ratio)
            sid = soiled_map.get(b.id, {"fit": 1, "soiled": 0})
            total_notes = sid["fit"] + sid["soiled"]
            soiled_pct = sid["soiled"] / max(total_notes, 1)
            if soiled_pct > 0.20:
                issues.append(f"Soiled note ratio {soiled_pct*100:.0f}% > 20% threshold")
                fine_risk += CMS_PENALTY_PER_VIOLATION

            # Check 3: Idle cash (operational risk)
            if idle_m > optimal_m * 3 and optimal_m > 0:
                issues.append(f"Idle cash PKR {idle_m:.0f}M > 3x optimal — vault insurance risk")
                fine_risk += 0.05

            # Check 4: CES score (operational efficiency)
            if b.cash_efficiency_score < 0.4:
                issues.append(f"CES {b.cash_efficiency_score*100:.0f}% — critical efficiency")

            # Severity
            if len(issues) >= 3 or fine_risk >= 0.5:
                severity = "RED"
                red += 1
            elif len(issues) >= 1:
                severity = "YELLOW"
                gold += 1
            else:
                severity = "GREEN"
                green += 1

            assessments.append({
                "branch_id": b.branch_id,
                "name": b.name,
                "city": b.city,
                "severity": severity,
                "issues": issues,
                "issue_count": len(issues),
                "fine_risk_m": round(fine_risk, 3),
                "ces": round(b.cash_efficiency_score * 100, 1),
            })

        # Sort: RED first, then YELLOW, then GREEN
        order = {"RED": 0, "YELLOW": 1, "GREEN": 2}
        assessments.sort(key=lambda x: (order.get(x["severity"], 3), -x["fine_risk_m"]))

        total_fine_risk = sum(a["fine_risk_m"] for a in assessments)

        return {
            "summary": {
                "total_branches": total,
                "green": green,
                "yellow": gold,
                "red": red,
                "green_pct": round(green / max(total, 1) * 100, 1),
                "total_fine_risk_m": round(total_fine_risk, 2),
                "cdm_compliance_pct": round(sum(1 for b in branches if cdm_map.get(b.branch_id) and cdm_map[b.branch_id].status == "installed") / max(cdm_target, 1) * 100, 1),
            },
            "cms_violations_checked": CMS_VIOLATIONS,
            "assessments": assessments[:30],
            "narrative": (
                f"Compliance: {green} GREEN, {gold} YELLOW, {red} RED branches. "
                f"Total fine risk: PKR {total_fine_risk:.2f}M. "
                f"CDM mandate: {sum(1 for b in branches if cdm_map.get(b.branch_id) and cdm_map[b.branch_id].status=='installed')}/{cdm_target} target."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # SEASONAL PEAK PREPARATION (Eid / Ramadan / Payroll)
    # ══════════════════════════════════════════════════════════

    def seasonal_peak_preparation(self, event_name: str, start_date: str,
                                  duration_days: int = 7, uplift_factor: float = 1.15) -> dict:
        """
        Eid / Ramadan / Payroll cash surge preparation.

        Events and their effects on Pakistani banking:
        - Eid-ul-Fitr: +30-40% cash demand, +20% small denominations (Eidi)
        - Eid-ul-Adha: +20-25% cash demand, large withdrawals for cattle
        - Ramadan: +15-20% evenings, reduced mornings, Sehr/Iftar patterns
        - Month-end payroll: +35% on 1st and 15th
        - Independence Day (Aug 14): moderate spike
        - Muharram: slight reduction in commercial areas

        Returns per-branch preparation plan with extra cash needed,
        denomination adjustments, CIT schedule changes, and opportunity cost.
        """
        # Event profiles: uplift on demand, denomination shifts, CIT multiplier
        EVENT_PROFILES = {
            "Eid-ul-Fitr": {
                "demand_uplift": 1.35, "small_denom_boost": 0.20,
                "cit_extra_trips": 2, "label": "Eid-ul-Fitr (Eidi demand)",
                "denom_shift": {"Rs5000": -0.05, "Rs1000": 0.05, "Rs500": 0.08, "Rs100": 0.07},
            },
            "Eid-ul-Adha": {
                "demand_uplift": 1.25, "small_denom_boost": 0.05,
                "cit_extra_trips": 1, "label": "Eid-ul-Adha (cattle market)",
                "denom_shift": {"Rs5000": 0.10, "Rs1000": 0.05, "Rs500": -0.03, "Rs100": -0.02},
            },
            "Ramadan": {
                "demand_uplift": 1.18, "small_denom_boost": 0.10,
                "cit_extra_trips": 1, "label": "Ramadan (Sehr/Iftar patterns)",
                "denom_shift": {"Rs5000": -0.02, "Rs1000": 0.05, "Rs500": 0.05, "Rs100": 0.02},
            },
            "Payroll": {
                "demand_uplift": 1.35, "small_denom_boost": 0.0,
                "cit_extra_trips": 1, "label": "Month-end payroll cycle",
                "denom_shift": {"Rs5000": 0.15, "Rs1000": 0.05, "Rs500": -0.05, "Rs100": -0.05},
            },
            "Independence-Day": {
                "demand_uplift": 1.10, "small_denom_boost": 0.05,
                "cit_extra_trips": 0, "label": "Independence Day (Aug 14)",
                "denom_shift": {"Rs5000": 0.0, "Rs1000": 0.02, "Rs500": 0.02, "Rs100": 0.01},
            },
            "Muharram": {
                "demand_uplift": 0.95, "small_denom_boost": 0.0,
                "cit_extra_trips": 0, "label": "Muharram (commercial slowdown)",
                "denom_shift": {"Rs5000": 0.0, "Rs1000": 0.0, "Rs500": 0.0, "Rs100": 0.0},
            },
        }

        profile = EVENT_PROFILES.get(event_name, EVENT_PROFILES["Eid-ul-Fitr"])
        effective_uplift = max(profile["demand_uplift"], uplift_factor)

        # Reconciled spine: current vault + demand + optimal from fact_gl_daily.
        states, _as_of, _src = self._branch_states()
        total_extra_cash = 0.0
        total_kibor_cost = 0.0
        total_extra_cit_cost = 0.0
        branch_plans = []

        for st in states:
            b = st["branch"]
            avg_wd = st["avg_wd"]
            current_vault = st["current"]
            optimal = st["optimal"] or (avg_wd * 1.65)

            # Surge-adjusted optimal = normal optimal × uplift
            surge_optimal = optimal * effective_uplift
            insurance_limit = st["insurance_limit"]
            surge_optimal = min(surge_optimal, insurance_limit)

            extra_needed = max(0, surge_optimal - current_vault)
            total_extra_cash += extra_needed

            # KIBOR cost of holding the extra buffer
            kibor_cost = extra_needed * (self.kibor * duration_days / 365)
            total_kibor_cost += kibor_cost

            # Extra CIT trips cost
            cit_trips = profile["cit_extra_trips"] if extra_needed > 5.0 else 0
            cit_cost = cit_trips * self.normal_cit
            total_extra_cit_cost += cit_cost

            if extra_needed > 1.0:  # Only include branches needing >1M
                branch_plans.append({
                    "branch_id": b.branch_id,
                    "name": b.name,
                    "city": b.city,
                    "current_vault_m": round(current_vault, 1),
                    "normal_optimal_m": round(optimal, 1),
                    "surge_optimal_m": round(surge_optimal, 1),
                    "extra_needed_m": round(extra_needed, 1),
                    "kibor_cost_m": round(kibor_cost, 4),
                    "extra_cit_trips": cit_trips,
                    "denomination_shift": profile["denom_shift"],
                })

        # Sort by extra needed descending
        branch_plans.sort(key=lambda x: -x["extra_needed_m"])

        # ATM surge: increase DoC target
        atm_count = self.db.query(func.count(ATM.id)).scalar() or 0
        normal_doc = ATM_TARGET_DOC
        surge_doc = normal_doc * effective_uplift
        atm_extra_load = atm_count * 0.5 * (effective_uplift - 1.0)  # ~0.5M avg per ATM extra

        total_opportunity_cost = total_kibor_cost + total_extra_cit_cost

        return {
            "event": {
                "name": event_name,
                "label": profile["label"],
                "start_date": start_date,
                "duration_days": duration_days,
                "demand_uplift_pct": round((effective_uplift - 1) * 100, 1),
            },
            "network_impact": {
                "branches_affected": len(branch_plans),
                "total_extra_cash_m": round(total_extra_cash, 1),
                "total_kibor_cost_m": round(total_kibor_cost, 2),
                "total_extra_cit_cost_m": round(total_extra_cit_cost, 2),
                "total_opportunity_cost_m": round(total_opportunity_cost, 2),
                "atm_surge_doc": round(surge_doc, 2),
                "atm_extra_load_m": round(atm_extra_load, 1),
            },
            "actions": {
                "vault": f"Increase vault buffers by {(effective_uplift-1)*100:.0f}% across {len(branch_plans)} branches",
                "denomination": f"Shift mix: {', '.join(f'{k} {v:+.0%}' for k, v in profile['denom_shift'].items() if v != 0)}",
                "cit": f"Schedule {profile['cit_extra_trips']} extra CIT trips per active branch (days -2 to +2)",
                "atm": f"Raise ATM DoC target from {normal_doc:.1f} to {surge_doc:.1f} days",
                "cost_warning": (
                    f"Holding extra PKR {total_extra_cash:.0f}M for {duration_days} days "
                    f"costs PKR {total_opportunity_cost:.2f}M in KIBOR opportunity cost + CIT."
                ),
            },
            "branch_plans": branch_plans[:30],
            "narrative": (
                f"{profile['label']}: {len(branch_plans)} branches need PKR {total_extra_cash:,.0f}M extra cash. "
                f"Opportunity cost: PKR {total_opportunity_cost:.2f}M over {duration_days} days "
                f"(KIBOR {self.kibor*100:.2f}% + {profile['cit_extra_trips']} extra CIT trips). "
                f"ATM DoC target raised to {surge_doc:.1f} days."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # INTEGRATED CASH ACTION PLAN (Daily Decision Sheet)
    # ══════════════════════════════════════════════════════════

    def integrated_cash_action_plan(self, branch_id: str = None, city: str = None,
                                    plan_date: str = None) -> dict:
        """
        THE DAILY DECISION SHEET — merges all UCs into one actionable plan.
        What the Branch Manager prints every morning. One page. Every decision.
        """
        today = plan_date or str(date.today())

        # ── Single-branch plan ──
        if branch_id:
            branch = self.db.query(Branch).filter(Branch.branch_id == branch_id).first()
            if not branch:
                return {"error": f"Branch {branch_id} not found"}

            # Vault action (UC-01)
            vault = self.vault_recommendation(branch_id)

            # ATM orders for this branch (UC-02)
            atm_data = self.atm_load_orders(branch_id=branch_id)

            # Denomination plan (UC-07)
            denom = self.denomination_plan(branch_id)

            # Netting matches for this branch's city (UC-03)
            netting = self.netting_opportunities(branch.city)
            my_netting = [
                m for m in netting.get("matches", [])
                if m.get("surplus_branch") == branch_id or m.get("deficit_branch") == branch_id
            ]

            # CIT schedule for branch city (UC-08)
            cit = self.cit_route_sheet(branch.city)
            my_cit = []
            for route in cit.get("routes", []):
                for stop in route.get("stops", []):
                    if stop.get("branch_id") == branch_id:
                        my_cit.append({
                            "vehicle": route.get("vehicle_id"),
                            "type": stop.get("action", "pickup"),
                            "amount_m": stop.get("amount_m", 0),
                            "window": route.get("time_window", "08:00-16:00"),
                        })

            # CDM status
            from app.models.cdm import CDMDevice
            cdm = self.db.query(CDMDevice).filter(CDMDevice.branch_id == branch_id).first()
            cdm_status = {
                "has_cdm": cdm is not None and cdm.status == "installed",
                "type": cdm.cdm_type if cdm else None,
                "recycling_ratio": round(cdm.recycling_ratio * 100, 1) if cdm and cdm.recycling_ratio else 0,
            }

            # Compliance snapshot (reconciled spine, fallback to ORM snapshot)
            ces = branch.cash_efficiency_score
            _recon = self._reconciled_branch_state(branch_id)
            if _recon:
                idle_m = _recon["idle_cash_m"]
                optimal_m, _s, _i = self._branch_optimal(_recon["avg_daily_withdrawal_m"], M(branch.vault_capacity))
            else:
                idle_m = M(branch.idle_cash)
                optimal_m = M(branch.optimal_vault_balance) or M(branch.avg_daily_withdrawals) * 1.65
            compliance_color = "GREEN"
            compliance_issues = []
            if idle_m > optimal_m * 3 and optimal_m > 0:
                compliance_color = "RED"
                compliance_issues.append(f"Idle cash {idle_m:.0f}M > 3x optimal")
            elif idle_m > optimal_m * 2 and optimal_m > 0:
                compliance_color = "YELLOW"
                compliance_issues.append(f"Idle cash {idle_m:.0f}M > 2x optimal")
            if ces < 0.4:
                compliance_color = "RED"
                compliance_issues.append(f"CES {ces*100:.0f}% critical")
            elif ces < 0.6:
                if compliance_color == "GREEN":
                    compliance_color = "YELLOW"
                compliance_issues.append(f"CES {ces*100:.0f}% below target")

            # Forecast (if available)
            latest_fc = (
                self.db.query(Forecast)
                .filter(Forecast.entity_type == "branch", Forecast.entity_id == branch_id)
                .order_by(Forecast.target_date.desc())
                .first()
            )
            forecast_info = None
            if latest_fc:
                forecast_info = {
                    "target_date": latest_fc.target_date,
                    "predicted_demand_m": round(M(latest_fc.predicted_value), 1),
                    "confidence_lower_m": round(M(latest_fc.confidence_lower), 1),
                    "confidence_upper_m": round(M(latest_fc.confidence_upper), 1),
                    "model": latest_fc.model_version or "XGBoost+Conformal",
                }

            # KIBOR impact
            daily_loss = idle_m * (self.kibor / 365)
            annual_loss = idle_m * self.kibor

            return {
                "plan_type": "branch",
                "header": {
                    "branch_id": branch_id,
                    "branch_name": branch.name,
                    "city": branch.city,
                    "branch_type": branch.branch_type.value if hasattr(branch.branch_type, 'value') else str(branch.branch_type),
                    "date": today,
                    "generated_at": str(date.today()),
                },
                "vault_action": vault.get("decision", {}),
                "atm_orders": atm_data.get("orders", [])[:10],
                "netting_transfers": my_netting[:5],
                "denomination_plan": denom.get("recommended_mix", {}),
                "cit_schedule": my_cit,
                "cdm_status": cdm_status,
                "compliance_status": {
                    "color": compliance_color,
                    "issues": compliance_issues,
                    "ces_pct": round(ces * 100, 1),
                },
                "forecast_tomorrow": forecast_info,
                "scorecard": {
                    "ces": round(ces * 100, 1),
                    "savings_potential_annual_m": round(annual_loss, 2),
                },
                "kibor_impact": {
                    "idle_cash_m": round(idle_m, 1),
                    "daily_loss_pkr": round(daily_loss * 1e6, 0),
                    "annual_loss_m": round(annual_loss, 2),
                    "kibor_pct": round(self.kibor * 100, 2),
                },
            }

        # ── City-wide plan ── (reconciled spine: idle/vault per branch from fact_gl_daily)
        states, _as_of, _src = self._branch_states(city)
        if not city:
            states = states[:50]   # network preview cap (matches legacy limit(50))
        branches = [st["branch"] for st in states]

        city_label = city or "Network"
        total_idle = sum(st["idle"] for st in states)
        total_vault = sum(st["current"] for st in states)
        avg_ces = sum(b.cash_efficiency_score for b in branches) / max(len(branches), 1)

        # Top 5 branches needing action (highest idle cash)
        by_idle = sorted(states, key=lambda st: st["idle"], reverse=True)
        priority_branches = []
        for st in by_idle[:5]:
            b = st["branch"]
            vault = self.vault_recommendation(b.branch_id)
            priority_branches.append({
                "branch_id": b.branch_id,
                "name": b.name,
                "action": vault.get("decision", {}).get("action", "HOLD"),
                "amount_m": vault.get("decision", {}).get("action_amount", 0),
                "idle_m": round(st["idle"], 1),
            })

        # Netting summary
        netting = self.netting_opportunities(city)

        annual_kibor_loss = total_idle * self.kibor

        return {
            "plan_type": "city" if city else "network",
            "header": {
                "city": city_label,
                "date": today,
                "branches_count": len(branches),
                "generated_at": str(date.today()),
            },
            "snapshot": {
                "total_vault_cash_m": round(total_vault, 0),
                "total_idle_cash_m": round(total_idle, 0),
                "avg_ces_pct": round(avg_ces * 100, 1),
                "annual_kibor_loss_m": round(annual_kibor_loss, 1),
            },
            "priority_branches": priority_branches,
            "netting_summary": {
                "matches": netting.get("matches_found", 0),
                "volume_m": netting.get("total_matched_volume", 0),
                "annual_saving_m": netting.get("annual_saving", 0),
            },
            "narrative": (
                f"{city_label}: {len(branches)} branches, PKR {total_idle:,.0f}M idle. "
                f"Top action: {priority_branches[0]['action']} PKR {priority_branches[0]['amount_m']:.0f}M "
                f"at {priority_branches[0]['name']}. "
                f"KIBOR loss: PKR {annual_kibor_loss:,.0f}M/year."
                if priority_branches else f"{city_label}: {len(branches)} branches, PKR {total_idle:,.0f}M idle."
            ),
        }

    # ══════════════════════════════════════════════════════════
    # VALUE CALCULATOR (Stakeholder ROI Quantification)
    # ══════════════════════════════════════════════════════════

    def value_calculator(self, network_wide: bool = True) -> dict:
        """
        Total value quantification for board/investor reporting.
        Breaks down by UC contribution with total annual PKR impact.
        """
        branches = self.db.query(Branch).all()
        atms = self.db.query(ATM).all()
        nostros = self.db.query(NostroAccount).all()

        # ── UC-01: Vault idle cash freed (reconciled spine, fallback to ORM snapshot) ──
        net_state, _as_of = self._reconciled_network_state()
        if net_state:
            branch_idle = sum(s["idle_cash_m"] for s in net_state.values())
        else:
            branch_idle = sum(M(b.idle_cash) for b in branches)
        vault_annual = branch_idle * self.kibor

        # ── UC-02: ATM idle cash freed ──
        atm_idle = 0.0
        for atm in atms:
            cash_m = M(sum(c.current_level for c in atm.cassettes)) if atm.cassettes else 0
            optimal = M(atm.avg_daily_dispense) * ATM_TARGET_DOC
            atm_idle += max(0, cash_m - optimal)
        atm_annual = atm_idle * self.kibor

        # ── UC-03: CIT trips saved via netting ──
        netting = self.netting_opportunities()
        cit_trips_saved = netting.get("matches_found", 0)
        cit_saving_annual = cit_trips_saved * self.normal_cit * 12  # monthly matches × 12

        # ── UC-04: CRR float income (reconciled: held-required excess, fallback to table) ──
        if net_state:
            crr_freed = sum(max(0.0, s["crr_held_m"] - s["crr_required_m"]) for s in net_state.values())
        else:
            latest_crr = self.db.query(CRRPosition).order_by(CRRPosition.date.desc()).first()
            crr_freed = M(latest_crr.freed_liquidity) if latest_crr else 0
        crr_annual = crr_freed * self.kibor

        # ── UC-05: Nostro excess repatriation ──
        nostro_excess = sum(M(n.excess_balance) for n in nostros)
        nostro_annual = nostro_excess * self.kibor

        # ── UC-06: Vostro deployment ──
        vostros = self.db.query(VostroAccount).all()
        vostro_deployable = sum(M(v.deployable_amount) for v in vostros)
        vostro_annual = vostro_deployable * self.kibor * 0.85  # conservative 85% deployment

        # ── UC-07: SBP penalties avoided ──
        penalties_avoided = CMS_PENALTY_PER_VIOLATION * len(CMS_VIOLATIONS) * 0.3  # 30% of branches at risk
        penalties_avoided *= len(branches) / 100  # scale to network

        # ── UC-08: CIT route optimization ──
        n_branches = len(branches)
        baseline_cit_cost = n_branches * self.normal_cit * 12  # monthly trips
        cit_optimization_saving = baseline_cit_cost * 0.38  # 38% route cost reduction

        # ── UC-09: Digital shift savings ──
        digital = self.digital_shift_report()
        digital_annual = digital.get("financials", {}).get("annual_savings", 0)

        # ── Costs: CDM installation + incremental ops ──
        from app.models.cdm import CDMDevice
        cdm_installed = self.db.query(func.count(CDMDevice.id)).filter(
            CDMDevice.status == "installed"
        ).scalar() or 0
        cdm_target = max(1, int(len(branches) * CDM_TARGET_PCT))
        cdm_remaining = max(0, cdm_target - cdm_installed)
        cdm_install_cost_annual = cdm_remaining * 2.5 / 3  # ~PKR 2.5M per CDM, 3-year amortization

        incremental_ops = n_branches * 0.02 * 12  # PKR 20K/branch/month ops overhead

        # ── BSC charges avoided ──
        bsc_avoided = branch_idle * self.bsc_service_charge * 12

        # ── Totals ──
        total_revenue = (vault_annual + atm_annual + cit_saving_annual + crr_annual
                         + nostro_annual + vostro_annual + penalties_avoided
                         + cit_optimization_saving + digital_annual + bsc_avoided)
        total_cost = cdm_install_cost_annual + incremental_ops
        net_value = total_revenue - total_cost

        return {
            "period": "Annual",
            "currency": "PKR Millions",
            "kibor_used_pct": round(self.kibor * 100, 2),
            "rates_source": self.rates_source,
            "revenue_by_uc": {
                "uc01_vault_freed": {"label": "Vault Idle Cash → KIBOR", "annual_m": round(vault_annual, 1)},
                "uc02_atm_freed": {"label": "ATM Idle Cash → KIBOR", "annual_m": round(atm_annual, 1)},
                "uc03_netting_cit": {"label": "CIT Trips Saved (Netting)", "annual_m": round(cit_saving_annual, 2)},
                "uc04_crr_float": {"label": "CRR Float → Overnight Repo", "annual_m": round(crr_annual, 1)},
                "uc05_nostro_sweep": {"label": "Nostro Excess Repatriation", "annual_m": round(nostro_annual, 1)},
                "uc06_vostro_deploy": {"label": "Vostro Stable Deployment", "annual_m": round(vostro_annual, 1)},
                "uc07_penalties_avoided": {"label": "SBP Denomination Penalties Avoided", "annual_m": round(penalties_avoided, 2)},
                "uc08_cit_routes": {"label": "CIT Route Optimization (38%)", "annual_m": round(cit_optimization_saving, 1)},
                "uc09_digital_shift": {"label": "Digital Channel Migration", "annual_m": round(digital_annual, 1)},
                "bsc_charges_avoided": {"label": "SBP-BSC Charges Avoided", "annual_m": round(bsc_avoided, 2)},
            },
            "costs": {
                "cdm_installation": {"label": f"CDM Rollout ({cdm_remaining} units, 3-yr amortized)", "annual_m": round(cdm_install_cost_annual, 1)},
                "incremental_ops": {"label": "Incremental Operations Overhead", "annual_m": round(incremental_ops, 1)},
                "total_cost": round(total_cost, 1),
            },
            "total": {
                "gross_value_m": round(total_revenue, 1),
                "total_cost_m": round(total_cost, 1),
                "net_value_m": round(net_value, 1),
                "roi_pct": round((net_value / max(total_cost, 1)) * 100, 1),
            },
            "top_contributors": sorted(
                [
                    {"uc": "UC-01", "label": "Vault Optimization", "value_m": round(vault_annual, 1)},
                    {"uc": "UC-04", "label": "CRR Float", "value_m": round(crr_annual, 1)},
                    {"uc": "UC-05", "label": "Nostro Sweep", "value_m": round(nostro_annual, 1)},
                    {"uc": "UC-08", "label": "CIT Routes", "value_m": round(cit_optimization_saving, 1)},
                    {"uc": "UC-09", "label": "Digital Shift", "value_m": round(digital_annual, 1)},
                ],
                key=lambda x: -x["value_m"],
            ),
            "narrative": (
                f"Total Annual Value: PKR {net_value:,.0f}M "
                f"(Revenue PKR {total_revenue:,.0f}M - Cost PKR {total_cost:,.0f}M). "
                f"ROI: {(net_value / max(total_cost, 1)) * 100:.0f}%. "
                f"Top contributor: {'Vault Optimization' if vault_annual >= crr_annual else 'CRR Float'}. "
                f"KIBOR benchmark: {self.kibor*100:.2f}%."
            ),
        }
