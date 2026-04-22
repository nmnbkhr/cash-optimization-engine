"""
UC-10: Cash P&L Attribution
============================
ABC costing engine for UBL cash operations. 10 activity cost pools,
4 attribution dimensions (Branch, Region, Type, City). Transfer pricing
charges branches for capital tied up in vaults. Tournament ranking by
net cash cost efficiency.

Classes: CashPnLEngine, TransferPricingEngine, TournamentRanker
Functions: get_pnl_summary, get_pnl_waterfall, get_branch_ranking,
           get_cost_treemap, get_alco_report
"""
import logging
import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import (
    ATM_STOCKOUT_PENALTY, CIT_COST_PER_TRIP, OVERNIGHT_REPO_RATE,
    POLICY_RATE, VAULT_INSURANCE_RATE,
)
from app.models.branch import Branch, BranchType
from app.models.crr_position import CRRPosition
from app.models.vault_position import VaultPosition
from app.models.atm import ATM

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_DAYS = 365
_SORT_COST_TXN = 12.0            # PKR labour per cash transaction
_ATM_REPLENISH_MONTHLY = 8_000.0  # PKR avg monthly per ATM
_DENOM_MISMATCH_RATE = 0.002      # 0.2% of vault as mismatch penalty
_CIT_RISK_RATE = 0.0001           # 0.01% of value in transit
_DIGITAL_SAVE_TXN = 25.0          # PKR saved per digital txn
_DIGITAL_RATE = 0.15              # 15% of txns are digital
_CIT_PER_100_TXN = 0.8            # estimated CIT trips per 100 daily txn
_YOY_EST = -0.03                  # -3% YoY improvement estimate

_POOL_LABELS = {
    "idle_cash_opportunity_cost": "Idle Cash Opportunity Cost",
    "vault_insurance": "Vault Insurance",
    "cit_logistics": "CIT Logistics",
    "cash_sorting_labor": "Cash Sorting & Labor",
    "atm_replenishment": "ATM Replenishment",
    "crr_excess_opportunity_cost": "CRR Excess Opp. Cost",
    "denomination_mismatch_penalty": "Denom. Mismatch Penalty",
    "cash_in_transit_risk_premium": "CIT Risk Premium",
    "digital_channel_savings": "Digital Channel Savings",
    "overnight_deployment_income": "Overnight Deployment Income",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _py(val):
    """Convert numpy/pandas types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):   return int(val)
    if isinstance(val, (np.floating,)):  return float(val)
    if isinstance(val, np.ndarray):      return val.tolist()
    if isinstance(val, pd.Timestamp):    return val.isoformat()
    if isinstance(val, dict):            return {k: _py(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):   return [_py(v) for v in val]
    return val


def _d(a, b, d=0.0):
    return a / b if b else d


def _load_branches(db: Session) -> pd.DataFrame:
    branches = db.query(Branch).all()
    if not branches:
        return pd.DataFrame()
    return pd.DataFrame([{
        "id": b.id, "branch_id": b.branch_id, "name": b.name,
        "city": b.city, "region": b.region,
        "branch_type": b.branch_type.value if b.branch_type else "Balanced",
        "vault_capacity": b.vault_capacity or 0.0,
        "current_vault_balance": b.current_vault_balance or 0.0,
        "optimal_vault_balance": b.optimal_vault_balance or 0.0,
        "idle_cash": b.idle_cash or 0.0,
        "cash_efficiency_score": b.cash_efficiency_score or 0.0,
        "daily_transactions": b.daily_transactions or 0,
        "avg_daily_deposits": b.avg_daily_deposits or 0.0,
        "avg_daily_withdrawals": b.avg_daily_withdrawals or 0.0,
        "is_cpc": b.is_cpc or False,
    } for b in branches])


def _atm_counts(db: Session) -> Dict[int, int]:
    rows = (db.query(ATM.branch_id, func.count(ATM.id).label("c"))
            .filter(ATM.status == "active").group_by(ATM.branch_id).all())
    return {r.branch_id: int(r.c) for r in rows}


def _latest_crr(db: Session) -> Optional[CRRPosition]:
    return db.query(CRRPosition).order_by(CRRPosition.date.desc()).first()


# ═══════════════════════════════════════════════════════════════════════════
# CashPnLEngine
# ═══════════════════════════════════════════════════════════════════════════
class CashPnLEngine:
    """
    10 activity cost pools, 4 attribution dimensions.
    Transfer pricing: branches charged policy_rate x avg_vault.
    Tournament ranking by net cash cost.
    ALL pandas/numpy computation. No API.
    """
    POOL_NAMES = list(_POOL_LABELS.keys())

    def _compute(self, df: pd.DataFrame, atms: Dict[int, int],
                 crr: Optional[CRRPosition]) -> pd.DataFrame:
        # All DB values (vault, idle_cash, deposits) are in PKR Millions.
        # Transaction-based costs compute raw PKR so we divide by 1e6 for consistency.
        p = "pool_"
        df[p+"idle_cash_opportunity_cost"] = df["idle_cash"] * POLICY_RATE
        df[p+"vault_insurance"] = df["current_vault_balance"] * VAULT_INSURANCE_RATE
        df[p+"cit_logistics"] = (df["daily_transactions"] / 100.0 *
                                  _CIT_PER_100_TXN * CIT_COST_PER_TRIP * _DAYS) / 1e6
        df[p+"cash_sorting_labor"] = (df["daily_transactions"] * _SORT_COST_TXN * _DAYS) / 1e6
        df["atm_count"] = df["id"].map(atms).fillna(0).astype(int)
        df[p+"atm_replenishment"] = (df["atm_count"] * _ATM_REPLENISH_MONTHLY * 12) / 1e6

        crr_tot = (crr.excess_crr * POLICY_RATE) if (crr and crr.excess_crr and crr.excess_crr > 0) else 0.0
        tv = df["current_vault_balance"].sum()
        df[p+"crr_excess_opportunity_cost"] = (
            (df["current_vault_balance"] / tv * crr_tot) if tv > 0 and crr_tot > 0 else 0.0)

        df[p+"denomination_mismatch_penalty"] = df["current_vault_balance"] * _DENOM_MISMATCH_RATE
        flow = df["avg_daily_deposits"] + df["avg_daily_withdrawals"]
        df[p+"cash_in_transit_risk_premium"] = flow * _CIT_RISK_RATE * _DAYS
        df[p+"digital_channel_savings"] = -(df["daily_transactions"] * _DIGITAL_RATE * _DIGITAL_SAVE_TXN * _DAYS) / 1e6
        df[p+"overnight_deployment_income"] = -(df["idle_cash"].clip(lower=0) * OVERNIGHT_REPO_RATE)

        pcols = [f"pool_{n}" for n in self.POOL_NAMES]
        cost_cols = [c for c in pcols if not c.endswith("_savings") and not c.endswith("_income")]
        df["gross_cost"] = df[cost_cols].sum(axis=1)
        df["total_benefits"] = df["pool_digital_channel_savings"].abs() + df["pool_overnight_deployment_income"].abs()
        df["net_cash_cost"] = df[pcols].sum(axis=1)
        return df

    def compute_branch_pnl(self, db: Session) -> List[Dict[str, Any]]:
        """Per-branch P&L with all 10 cost pools, ranked by net cash cost."""
        try:
            df = _load_branches(db)
            if df.empty:
                return []
            df = self._compute(df, _atm_counts(db), _latest_crr(db))
            df = df.sort_values("net_cash_cost", ascending=True)
            results = []
            for rank, (_, r) in enumerate(df.iterrows(), 1):
                results.append({
                    "rank": rank, "branch_id": r["branch_id"], "name": r["name"],
                    "city": r["city"], "region": r["region"], "branch_type": r["branch_type"],
                    "daily_transactions": int(r["daily_transactions"]),
                    "current_vault_balance": round(r["current_vault_balance"], 0),
                    "idle_cash": round(r["idle_cash"], 0),
                    "cost_pools": {n: round(float(r[f"pool_{n}"]), 2) for n in self.POOL_NAMES},
                    "gross_cost": round(float(r["gross_cost"]), 2),
                    "total_benefits": round(float(r["total_benefits"]), 2),
                    "net_cash_cost": round(float(r["net_cash_cost"]), 2),
                })
            return _py(results)
        except Exception as exc:
            logger.error("compute_branch_pnl error: %s", exc, exc_info=True)
            return [{"error": str(exc)}]

    def _agg(self, db: Session, col: str) -> List[Dict[str, Any]]:
        try:
            df = _load_branches(db)
            if df.empty:
                return []
            df = self._compute(df, _atm_counts(db), _latest_crr(db))
            pcols = [f"pool_{n}" for n in self.POOL_NAMES]
            agg_cols = pcols + ["gross_cost", "total_benefits", "net_cash_cost",
                                "daily_transactions", "current_vault_balance", "idle_cash"]
            g = df.groupby(col).agg(branch_count=("id", "count"),
                                    **{c: (c, "sum") for c in agg_cols}).reset_index()
            g = g.sort_values("net_cash_cost", ascending=True)
            return _py([{
                col: row[col], "branch_count": int(row["branch_count"]),
                "daily_transactions": int(row["daily_transactions"]),
                "current_vault_balance": round(float(row["current_vault_balance"]), 0),
                "idle_cash": round(float(row["idle_cash"]), 0),
                "cost_pools": {n: round(float(row[f"pool_{n}"]), 2) for n in self.POOL_NAMES},
                "gross_cost": round(float(row["gross_cost"]), 2),
                "total_benefits": round(float(row["total_benefits"]), 2),
                "net_cash_cost": round(float(row["net_cash_cost"]), 2),
                "cost_per_branch": round(_d(float(row["net_cash_cost"]), int(row["branch_count"])), 2),
            } for _, row in g.iterrows()])
        except Exception as exc:
            logger.error("_agg(%s) error: %s", col, exc, exc_info=True)
            return [{"error": str(exc)}]

    def compute_regional_pnl(self, db: Session) -> List[Dict[str, Any]]:
        return self._agg(db, "region")

    def compute_type_pnl(self, db: Session) -> List[Dict[str, Any]]:
        return self._agg(db, "branch_type")

    def compute_city_pnl(self, db: Session) -> List[Dict[str, Any]]:
        return self._agg(db, "city")


# ═══════════════════════════════════════════════════════════════════════════
# TransferPricingEngine
# ═══════════════════════════════════════════════════════════════════════════
class TransferPricingEngine:
    """Charge: avg_vault x policy_rate / 365 per day. Credit: overnight + digital."""

    def compute_transfer_prices(self, db: Session) -> List[Dict[str, Any]]:
        try:
            df = _load_branches(db)
            if df.empty:
                return []
            df["avg_vault"] = (df["current_vault_balance"] + df["optimal_vault_balance"]) / 2.0
            df["capital_charge"] = df["avg_vault"] * POLICY_RATE
            df["daily_charge"] = df["capital_charge"] / _DAYS
            df["overnight_credit"] = df["idle_cash"].clip(lower=0) * OVERNIGHT_REPO_RATE
            df["digital_credit"] = (df["daily_transactions"] * _DIGITAL_RATE * _DIGITAL_SAVE_TXN * _DAYS) / 1e6
            df["total_credits"] = df["overnight_credit"] + df["digital_credit"]
            df["tp_net"] = df["total_credits"] - df["capital_charge"]
            df = df.sort_values("tp_net", ascending=False)
            return _py([{
                "rank": i, "branch_id": r["branch_id"], "name": r["name"],
                "city": r["city"], "region": r["region"], "branch_type": r["branch_type"],
                "avg_vault_balance": round(float(r["avg_vault"]), 0),
                "capital_charge_annual": round(float(r["capital_charge"]), 2),
                "daily_capital_charge": round(float(r["daily_charge"]), 2),
                "overnight_credit": round(float(r["overnight_credit"]), 2),
                "digital_credit": round(float(r["digital_credit"]), 2),
                "total_credits": round(float(r["total_credits"]), 2),
                "tp_net_pnl": round(float(r["tp_net"]), 2),
                "status": "profit_centre" if r["tp_net"] >= 0 else "cost_centre",
            } for i, (_, r) in enumerate(df.iterrows(), 1)])
        except Exception as exc:
            logger.error("compute_transfer_prices error: %s", exc, exc_info=True)
            return [{"error": str(exc)}]


# ═══════════════════════════════════════════════════════════════════════════
# TournamentRanker
# ═══════════════════════════════════════════════════════════════════════════
class TournamentRanker:
    """Rank branches by cost per PKR of daily transaction volume. Quartile labels."""

    def rank_branches(self, db: Session) -> List[Dict[str, Any]]:
        try:
            pnl = CashPnLEngine().compute_branch_pnl(db)
            if not pnl or "error" in pnl[0]:
                return pnl
            for e in pnl:
                vol = e.get("daily_transactions", 0) * 25_000 * _DAYS  # raw PKR
                e["annual_txn_value"] = round(vol, 0)
                # net_cash_cost is in PKR millions; convert to raw for ratio
                cost_raw = e.get("net_cash_cost", 0) * 1e6
                e["cost_per_million_txn_value"] = round(_d(cost_raw, vol / 1e6), 2)

            pnl.sort(key=lambda x: x.get("cost_per_million_txn_value", float("inf")))
            n = len(pnl)
            qs = max(n // 4, 1)
            vals = [e["cost_per_million_txn_value"] for e in pnl if e["cost_per_million_txn_value"] > 0]
            med = float(np.median(vals)) if vals else 0.0

            for i, e in enumerate(pnl):
                e["efficiency_rank"] = i + 1
                e["quartile"] = "Q1" if i < qs else "Q2" if i < 2*qs else "Q3" if i < 3*qs else "Q4"
                e["vs_benchmark_pct"] = round(_d(e["cost_per_million_txn_value"] - med, med) * 100, 2)
            return _py(pnl)
        except Exception as exc:
            logger.error("rank_branches error: %s", exc, exc_info=True)
            return [{"error": str(exc)}]


# ═══════════════════════════════════════════════════════════════════════════
# Public functions
# ═══════════════════════════════════════════════════════════════════════════
def get_pnl_summary(db: Session) -> Dict[str, Any]:
    """Network-wide P&L: 10 pool totals, income, net cost, per-branch, per-txn, YoY."""
    try:
        pnl = CashPnLEngine().compute_branch_pnl(db)
        if not pnl or "error" in pnl[0]:
            return {"error": "No branch data", "cost_pools": {}}

        nb = len(pnl)
        pt = {n: 0.0 for n in CashPnLEngine.POOL_NAMES}
        tg, tb, tn, tt, tv, ti = 0.0, 0.0, 0.0, 0, 0.0, 0.0
        for e in pnl:
            for n in CashPnLEngine.POOL_NAMES:
                pt[n] += e.get("cost_pools", {}).get(n, 0.0)
            tg += e.get("gross_cost", 0.0)
            tb += e.get("total_benefits", 0.0)
            tn += e.get("net_cash_cost", 0.0)
            tt += e.get("daily_transactions", 0)
            tv += e.get("current_vault_balance", 0.0)
            ti += e.get("idle_cash", 0.0)

        at = tt * _DAYS
        prior = tn / (1 + _YOY_EST)
        return _py({
            "summary_date": datetime.date.today().isoformat(),
            "network_branches": nb, "total_daily_transactions": tt,
            "total_vault_balance": round(tv, 0), "total_idle_cash": round(ti, 0),
            "cost_pools": {k: round(v, 2) for k, v in pt.items()},
            "cost_items": {k: round(v, 2) for k, v in pt.items() if v >= 0},
            "income_items": {k: round(abs(v), 2) for k, v in pt.items() if v < 0},
            "gross_cost": round(tg, 2), "total_benefits": round(tb, 2),
            "net_cash_cost": round(tn, 2),
            "cost_per_branch": round(_d(tn, nb), 2),
            "cost_per_transaction": round(_d(tn * 1e6, at), 2),  # raw PKR per txn
            "annual_transactions": at,
            "yoy_trend": {
                "estimated_prior_year_cost": round(prior, 2),
                "current_year_cost": round(tn, 2),
                "change_pkr": round(tn - prior, 2),
                "change_pct": round(_YOY_EST * 100, 2),
                "direction": "improving" if _YOY_EST < 0 else "worsening",
            },
            "rates": {
                "policy_rate_pct": round(POLICY_RATE * 100, 2),
                "overnight_repo_rate_pct": round(OVERNIGHT_REPO_RATE * 100, 2),
                "vault_insurance_rate_pct": round(VAULT_INSURANCE_RATE * 100, 4),
            },
        })
    except Exception as exc:
        logger.error("get_pnl_summary error: %s", exc, exc_info=True)
        return {"error": str(exc), "cost_pools": {}}


def get_pnl_waterfall(db: Session) -> Dict[str, Any]:
    """Waterfall chart data: gross cost → each pool → net cost."""
    try:
        s = get_pnl_summary(db)
        if "error" in s and not s.get("cost_pools"):
            return {"error": s.get("error", "No data"), "steps": []}
        pools = s.get("cost_pools", {})
        steps, running = [], 0.0
        for name in CashPnLEngine.POOL_NAMES:
            v = pools.get(name, 0.0)
            running += v
            steps.append({"label": _POOL_LABELS.get(name, name), "pool_key": name,
                          "value": round(v, 2), "running_total": round(running, 2),
                          "type": "benefit" if v < 0 else "cost"})
        steps.append({"label": "Net Cash Cost", "pool_key": "net_cash_cost",
                       "value": round(running, 2), "running_total": round(running, 2),
                       "type": "total"})
        return _py({
            "chart_type": "waterfall", "title": "Cash Operations P&L Waterfall",
            "currency": "PKR", "period": "Annual (estimated)",
            "analysis_date": datetime.date.today().isoformat(),
            "gross_cost": round(s.get("gross_cost", 0), 2),
            "net_cash_cost": round(running, 2), "steps": steps,
        })
    except Exception as exc:
        logger.error("get_pnl_waterfall error: %s", exc, exc_info=True)
        return {"error": str(exc), "steps": []}


def get_branch_ranking(db: Session) -> Dict[str, Any]:
    """All branches ranked by net cash cost efficiency with quartile labels."""
    try:
        ranked = TournamentRanker().rank_branches(db)
        if not ranked or "error" in ranked[0]:
            return {"error": "No ranking data", "branches": [], "quartile_summary": {}}
        qs = {}
        for ql in ("Q1", "Q2", "Q3", "Q4"):
            qb = [b for b in ranked if b.get("quartile") == ql]
            if qb:
                costs = [b.get("cost_per_million_txn_value", 0) for b in qb]
                lbl = {"Q1": "Top Performers", "Q2": "Above Average",
                       "Q3": "Below Average", "Q4": "Needs Improvement"}
                qs[ql] = {"count": len(qb), "avg_cost_per_million": round(float(np.mean(costs)), 2),
                          "min_cost_per_million": round(float(np.min(costs)), 2),
                          "max_cost_per_million": round(float(np.max(costs)), 2), "label": lbl[ql]}
        return _py({"total_branches": len(ranked), "analysis_date": datetime.date.today().isoformat(),
                     "metric": "cost_per_million_txn_value (PKR)", "quartile_summary": qs,
                     "branches": ranked})
    except Exception as exc:
        logger.error("get_branch_ranking error: %s", exc, exc_info=True)
        return {"error": str(exc), "branches": [], "quartile_summary": {}}


def get_cost_treemap(db: Session) -> Dict[str, Any]:
    """Hierarchical cost data: Region -> City -> Branch for treemap visualization."""
    try:
        pnl = CashPnLEngine().compute_branch_pnl(db)
        if not pnl or "error" in pnl[0]:
            return {"error": "No branch data", "regions": []}
        hier: Dict[str, Dict[str, List]] = {}
        for e in pnl:
            hier.setdefault(e.get("region", "Unknown"), {}).setdefault(
                e.get("city", "Unknown"), []).append(e)

        regions = []
        for rn, cities in sorted(hier.items()):
            rc = 0.0
            cnodes = []
            for cn, branches in sorted(cities.items()):
                cc = sum(b.get("net_cash_cost", 0) for b in branches)
                bnodes = [{"name": b.get("name", ""), "branch_id": b.get("branch_id", ""),
                           "net_cash_cost": round(b.get("net_cash_cost", 0), 2),
                           "gross_cost": round(b.get("gross_cost", 0), 2),
                           "daily_transactions": b.get("daily_transactions", 0),
                           "branch_type": b.get("branch_type", "")}
                          for b in sorted(branches, key=lambda x: x.get("net_cash_cost", 0))]
                cnodes.append({"name": cn, "net_cash_cost": round(cc, 2),
                               "branch_count": len(branches), "branches": bnodes})
                rc += cc
            regions.append({"name": rn, "net_cash_cost": round(rc, 2), "city_count": len(cnodes),
                            "branch_count": sum(c["branch_count"] for c in cnodes),
                            "cities": sorted(cnodes, key=lambda c: c["net_cash_cost"])})

        tc = sum(r["net_cash_cost"] for r in regions)
        for r in regions:
            r["pct_of_total"] = round(_d(r["net_cash_cost"], tc) * 100, 2)
            for c in r["cities"]:
                c["pct_of_total"] = round(_d(c["net_cash_cost"], tc) * 100, 2)
        return _py({"chart_type": "treemap", "title": "Cash Cost Distribution",
                     "currency": "PKR", "total_net_cost": round(tc, 2),
                     "analysis_date": datetime.date.today().isoformat(),
                     "regions": sorted(regions, key=lambda r: r["net_cash_cost"])})
    except Exception as exc:
        logger.error("get_cost_treemap error: %s", exc, exc_info=True)
        return {"error": str(exc), "regions": []}


def get_alco_report(db: Session) -> Dict[str, Any]:
    """ALCO executive summary: metrics, risks, recommendations."""
    try:
        s = get_pnl_summary(db)
        if "error" in s and not s.get("cost_pools"):
            return {"error": s.get("error", "No data"), "sections": []}

        ranked = TournamentRanker().rank_branches(db)
        tp = TransferPricingEngine().compute_transfer_prices(db)
        pools = s.get("cost_pools", {})
        nb = s.get("network_branches", 0)
        net = s.get("net_cash_cost", 0.0)
        gross = s.get("gross_cost", 0.0)
        benefits = s.get("total_benefits", 0.0)
        idle = s.get("total_idle_cash", 0.0)
        vault = s.get("total_vault_balance", 0.0)
        ir = _d(idle, vault)

        top5 = ranked[:5] if ranked and "error" not in ranked[0] else []
        bot5 = ranked[-5:] if ranked and len(ranked) >= 5 else []
        prof = [t for t in tp if t.get("status") == "profit_centre"]
        cost_c = [t for t in tp if t.get("status") == "cost_centre"]

        # Risks
        risks = []
        if ir > 0.20:
            risks.append({"severity": "high", "category": "Idle Cash",
                          "description": f"Idle cash ratio {ir:.1%} exceeds 20%. "
                          f"PKR {idle:,.0f} in unproductive vault holdings."})
        elif ir > 0.10:
            risks.append({"severity": "medium", "category": "Idle Cash",
                          "description": f"Idle cash ratio {ir:.1%}. Consider rebalancing."})
        cit = pools.get("cit_logistics", 0)
        if cit > net * 0.3 and net > 0:
            risks.append({"severity": "medium", "category": "CIT Logistics",
                          "description": f"CIT at PKR {cit:,.0f} is {_d(cit,net)*100:.1f}% "
                          f"of net cost. Route optimization recommended."})
        if not risks:
            risks.append({"severity": "low", "category": "General",
                          "description": "No critical flags. Cash ops within normal parameters."})

        # Recommendations
        recs = []
        idle_opp = pools.get("idle_cash_opportunity_cost", 0)
        if idle_opp > 0:
            recs.append({"priority": 1, "action": "Reduce Idle Cash Holdings",
                         "potential_savings_pkr": round(idle_opp * 0.3, 0),
                         "description": f"Redeploy 30% idle cash via overnight repo. "
                         f"Est. savings: PKR {idle_opp*0.3:,.0f}/yr."})
        dsav = abs(pools.get("digital_channel_savings", 0))
        new_rate = min(_DIGITAL_RATE * 1.5, 0.40)
        recs.append({"priority": 2, "action": "Accelerate Digital Migration",
                     "potential_savings_pkr": round(dsav * 0.5, 0),
                     "description": f"Digital savings: PKR {dsav:,.0f}. Raising adoption "
                     f"from {_DIGITAL_RATE:.0%} to {new_rate:.0%} adds PKR {dsav*0.5:,.0f}/yr."})
        if bot5:
            wc = sum(b.get("net_cash_cost", 0) for b in bot5)
            recs.append({"priority": 3, "action": "Targeted Q4 Branch Intervention",
                         "potential_savings_pkr": round(wc * 0.15, 0),
                         "description": f"Bottom 5 branches cost PKR {wc:,.0f}. "
                         f"Review could reduce by 15%."})

        def _br(lst):
            return [{"branch_id": b.get("branch_id"), "name": b.get("name"),
                     "cost_per_million_txn": b.get("cost_per_million_txn_value", 0),
                     "quartile": b.get("quartile")} for b in lst]

        return _py({
            "report_title": "ALCO Cash Operations P&L Report",
            "bank": "Tier-1 Commercial Bank",
            "report_date": datetime.date.today().isoformat(),
            "prepared_for": "Asset-Liability Committee",
            "executive_summary": {
                "network_branches": nb,
                "gross_cash_cost_pkr": round(gross, 0),
                "total_benefits_pkr": round(benefits, 0),
                "net_cash_cost_pkr": round(net, 0),
                "cost_per_branch_pkr": round(_d(net, nb), 0),
                "cost_per_transaction_pkr": round(s.get("cost_per_transaction", 0), 2),
                "total_vault_balance_pkr": round(vault, 0),
                "total_idle_cash_pkr": round(idle, 0),
                "idle_cash_ratio_pct": round(ir * 100, 2),
                "yoy_trend": s.get("yoy_trend", {}),
            },
            "cost_breakdown": {
                n: {"amount_pkr": round(pools.get(n, 0), 0),
                    "pct_of_gross": round(_d(abs(pools.get(n, 0)), gross) * 100, 2) if gross else 0.0}
                for n in CashPnLEngine.POOL_NAMES
            },
            "transfer_pricing": {
                "profit_centres": len(prof), "cost_centres": len(cost_c),
                "total_capital_charge_pkr": round(sum(t.get("capital_charge_annual", 0) for t in tp), 0),
                "total_credits_pkr": round(sum(t.get("total_credits", 0) for t in tp), 0),
            },
            "tournament_ranking": {"top_5": _br(top5), "bottom_5": _br(bot5)},
            "risk_flags": risks,
            "recommendations": sorted(recs, key=lambda r: r["priority"]),
            "rates_applied": s.get("rates", {}),
        })
    except Exception as exc:
        logger.error("get_alco_report error: %s", exc, exc_info=True)
        return {"error": str(exc), "sections": []}
