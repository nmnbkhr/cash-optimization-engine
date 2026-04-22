"""
UC-09: Digital Channel Incentivization
=======================================
Thompson Sampling bandit for optimal digital-channel incentives across
five UBL customer segments. Subgame-perfect equilibrium determines the
rational incentive level (incentive = switching cost).

Classes:
    IncentiveOptimizer  - Thompson Sampling with Beta priors (numpy)
    ROICalculator       - Per-segment and total ROI analysis
    BudgetAllocator     - Optimal budget split across segments
Functions:
    get_incentive_summary, get_segment_dashboard, get_ab_simulator
"""
import logging, datetime, math
from typing import Any, Dict, List, Optional

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import (
    DIGITAL_INCENTIVE_BUDGET, POLICY_RATE, UBL_TOTAL_BRANCHES, CIT_COST_PER_TRIP,
)
from app.core.game_theory import find_nash_equilibria, compute_mixed_nash_2x2
from app.models.branch import Branch, BranchType

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SEGMENTS: List[str] = ["Mass Retail", "SME", "Corporate", "Premium", "Rural"]
ARMS: List[str] = [
    "Cashback 1%", "Cashback 2%", "Fee Waiver",
    "Loyalty Points", "Cash Voucher", "No Incentive",
]
_N_SEG, _N_ARMS, _SEED = len(SEGMENTS), len(ARMS), 42
_DAILY_BUDGET = DIGITAL_INCENTIVE_BUDGET / 365.0

# (base_digital_pct, avg_txn_value, switching_cost_pct, weight, cash_handling_cost)
_SEG = {
    "Mass Retail": {"bdp": 0.18, "atv": 8_000,     "scp": 0.015, "w": 0.35, "chc": 45},
    "SME":         {"bdp": 0.25, "atv": 120_000,   "scp": 0.012, "w": 0.25, "chc": 85},
    "Corporate":   {"bdp": 0.55, "atv": 2_500_000, "scp": 0.005, "w": 0.10, "chc": 250},
    "Premium":     {"bdp": 0.40, "atv": 350_000,   "scp": 0.008, "w": 0.15, "chc": 120},
    "Rural":       {"bdp": 0.07, "atv": 5_000,     "scp": 0.025, "w": 0.15, "chc": 60},
}
_ARM_COST = {  # fraction of txn value
    "Cashback 1%": 0.010, "Cashback 2%": 0.020, "Fee Waiver": 0.005,
    "Loyalty Points": 0.007, "Cash Voucher": 0.012, "No Incentive": 0.000,
}
_ARM_EFF = {  # base adoption lift
    "Cashback 1%": 0.08, "Cashback 2%": 0.14, "Fee Waiver": 0.06,
    "Loyalty Points": 0.05, "Cash Voucher": 0.10, "No Incentive": 0.00,
}
_SEG_MOD = {
    "Mass Retail":  {"Cashback 1%": 1.3, "Cashback 2%": 1.5, "Fee Waiver": 0.8,
                     "Loyalty Points": 1.0, "Cash Voucher": 1.4, "No Incentive": 1.0},
    "SME":          {"Cashback 1%": 1.1, "Cashback 2%": 1.2, "Fee Waiver": 1.5,
                     "Loyalty Points": 0.9, "Cash Voucher": 1.0, "No Incentive": 1.0},
    "Corporate":    {"Cashback 1%": 0.7, "Cashback 2%": 0.8, "Fee Waiver": 1.6,
                     "Loyalty Points": 0.6, "Cash Voucher": 0.5, "No Incentive": 1.0},
    "Premium":      {"Cashback 1%": 1.0, "Cashback 2%": 1.1, "Fee Waiver": 1.2,
                     "Loyalty Points": 1.5, "Cash Voucher": 0.9, "No Incentive": 1.0},
    "Rural":        {"Cashback 1%": 1.4, "Cashback 2%": 1.6, "Fee Waiver": 0.6,
                     "Loyalty Points": 0.4, "Cash Voucher": 1.5, "No Incentive": 1.0},
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _py(val):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):   return int(val)
    if isinstance(val, (np.floating,)):  return float(val)
    if isinstance(val, np.ndarray):      return val.tolist()
    if isinstance(val, dict):            return {k: _py(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):   return [_py(v) for v in val]
    return val

def _div(a: float, b: float, d: float = 0.0) -> float:
    return a / b if b != 0 else d

def _normal_cdf(x: float) -> float:
    """Approximate standard normal CDF (Abramowitz & Stegun)."""
    sign = 1 if x >= 0 else -1
    x = abs(x) / math.sqrt(2)
    t = 1.0 / (1.0 + 0.3275911 * x)
    poly = t * (0.254829592 + t * (-0.284496736 + t * (
        1.421413741 + t * (-1.453152027 + t * 1.061405429))))
    return 0.5 * (1.0 + sign * (1.0 - poly * math.exp(-x * x)))

def _seg_eff(seg: str, arm: str) -> float:
    return _ARM_EFF[arm] * _SEG_MOD[seg][arm]

def _best_arm_for(seg: str):
    idx = int(np.argmax([_seg_eff(seg, a) for a in ARMS]))
    return idx, ARMS[idx], max(_seg_eff(seg, a) for a in ARMS)

def _get_city_sizes(db: Session) -> Dict[str, int]:
    try:
        rows = db.query(Branch.city, func.count(Branch.id)).group_by(Branch.city).all()
        return {r[0]: r[1] for r in rows}
    except Exception:
        return {}

def _total_daily_txn(db: Session) -> int:
    try:
        return int(db.query(func.sum(Branch.daily_transactions)).scalar() or 0)
    except Exception:
        return 0

def _estimate_digital_pct(db: Session) -> Dict[str, float]:
    """Estimate digital adoption % per segment from branch data."""
    fallback = {s: p["bdp"] for s, p in _SEG.items()}
    try:
        branches = db.query(Branch).all()
        if not branches:
            return fallback
        total_txn = sum(b.daily_transactions or 0 for b in branches)
        if total_txn == 0:
            return fallback
        type_txn: Dict[str, int] = {}
        for b in branches:
            bt = b.branch_type.value if b.branch_type else "Balanced"
            type_txn[bt] = type_txn.get(bt, 0) + (b.daily_transactions or 0)
        rural_cities = {c for c, n in _get_city_sizes(db).items() if n <= 10}
        rural_frac = _div(sum(b.daily_transactions or 0 for b in branches
                               if b.city in rural_cities), total_txn)
        hub_frac = _div(type_txn.get("Hub", 0), total_txn)
        result = {}
        for seg, p in _SEG.items():
            base = p["bdp"]
            if seg == "Rural":
                adj = base * (1.0 + 0.3 * (rural_frac - 0.15))
            elif seg == "Corporate":
                adj = base * (1.0 + 0.2 * (hub_frac - 0.05))
            else:
                adj = base
            result[seg] = max(0.01, min(0.95, adj))
        return result
    except Exception as exc:
        logger.warning("_estimate_digital_pct fallback: %s", exc)
        return fallback

# ---------------------------------------------------------------------------
# IncentiveOptimizer  (Thompson Sampling Bandit)
# ---------------------------------------------------------------------------
class IncentiveOptimizer:
    """
    5 customer segments x 6 incentive arms.
    Thompson Sampling with Beta priors. ALL LOCAL numpy.
    Budget constraint: PKR 500M/year total.
    Reward: change in digital transaction percentage.
    Subgame perfect equilibrium: incentive = switching cost.
    """

    def __init__(self, seed: int = _SEED):
        self.rng = np.random.default_rng(seed)
        self.alpha = np.ones((_N_SEG, _N_ARMS))
        self.beta_params = np.ones((_N_SEG, _N_ARMS))

    def run_simulation(self, n_rounds: int = 1000) -> Dict[str, Any]:
        """Run Thompson Sampling across segments and arms with budget constraint."""
        try:
            alpha = np.ones((_N_SEG, _N_ARMS))
            beta_p = np.ones((_N_SEG, _N_ARMS))
            true_rw = np.zeros((_N_SEG, _N_ARMS))
            arm_cost = np.zeros((_N_SEG, _N_ARMS))
            for s, seg in enumerate(SEGMENTS):
                p = _SEG[seg]
                for a, arm in enumerate(ARMS):
                    true_rw[s, a] = _seg_eff(seg, arm)
                    arm_cost[s, a] = _ARM_COST[arm] * p["atv"] * p["w"]

            cum_regret = np.zeros(n_rounds)
            arm_counts = np.zeros((_N_SEG, _N_ARMS), dtype=int)
            total_rewards = np.zeros((_N_SEG, _N_ARMS))
            best_per_seg = true_rw.max(axis=1)

            for t in range(n_rounds):
                theta = self.rng.beta(alpha, beta_p)
                chosen = np.argmax(theta, axis=1)
                rc = sum(arm_cost[s, chosen[s]] for s in range(_N_SEG))
                if rc > _DAILY_BUDGET and rc > 0:
                    chosen = self._budget_select(theta, arm_cost, _DAILY_BUDGET)
                rr = 0.0
                for s in range(_N_SEG):
                    a = chosen[s]
                    rv = true_rw[s, a] + self.rng.normal(0, 0.02)
                    if self.rng.random() < max(0, min(1, 0.5 + rv)):
                        alpha[s, a] += 1
                    else:
                        beta_p[s, a] += 1
                    arm_counts[s, a] += 1
                    total_rewards[s, a] += rv
                    rr += best_per_seg[s] - true_rw[s, a]
                cum_regret[t] = (cum_regret[t - 1] + rr) if t > 0 else rr

            best_arms, exp_adopt, budget_alloc, arm_freq = {}, {}, {}, {}
            for s, seg in enumerate(SEGMENTS):
                means = np.where(arm_counts[s] > 0, total_rewards[s] / arm_counts[s], 0.0)
                bi = int(np.argmax(means))
                best_arms[seg] = ARMS[bi]
                exp_adopt[seg] = round(min(0.95, _SEG[seg]["bdp"] + true_rw[s, bi]) * 100, 2)
                budget_alloc[seg] = round(arm_cost[s, bi] * 365, 2)
                arm_freq[seg] = {arm: int(arm_counts[s, a]) for a, arm in enumerate(ARMS)}

            self.alpha, self.beta_params = alpha, beta_p
            step = max(1, n_rounds // 100)
            regret_curve = [{"round": int(i), "cumulative_regret": round(float(cum_regret[i]), 4)}
                            for i in range(0, n_rounds, step)]
            return _py({
                "n_rounds": n_rounds, "n_segments": _N_SEG, "n_arms": _N_ARMS,
                "best_arm_per_segment": best_arms, "expected_adoption_pct": exp_adopt,
                "budget_allocation_pkr": budget_alloc,
                "total_allocated_pkr": round(sum(budget_alloc.values()), 2),
                "annual_budget_pkr": DIGITAL_INCENTIVE_BUDGET,
                "cumulative_regret_curve": regret_curve,
                "arm_selection_frequencies": arm_freq,
            })
        except Exception as exc:
            logger.error("run_simulation error: %s", exc, exc_info=True)
            return {"error": str(exc)}

    def _budget_select(self, theta, cost, budget):
        """Greedy knapsack: highest reward-per-cost within budget."""
        chosen = np.full(_N_SEG, _N_ARMS - 1, dtype=int)
        remaining = budget
        for s in sorted(range(_N_SEG), key=lambda i: _SEG[SEGMENTS[i]]["w"], reverse=True):
            best_a, best_v = _N_ARMS - 1, -1.0
            for a in range(_N_ARMS):
                c = cost[s, a]
                if c <= remaining or c == 0:
                    v = theta[s, a] / max(c, 1e-6)
                    if v > best_v:
                        best_v, best_a = v, a
            chosen[s] = best_a
            remaining = max(0, remaining - cost[s, best_a])
        return chosen

    def compute_equilibrium(self) -> Dict[str, Any]:
        """
        Subgame perfect equilibrium: Bank vs Customer per segment.
        Rational adoption when incentive >= switching cost.
        """
        try:
            equilibria = {}
            for seg in SEGMENTS:
                p = _SEG[seg]
                sc = p["scp"] * p["atv"]  # switching cost
                dv = p["chc"] * 30        # monthly digital saving
                inc = sc                   # equilibrium: incentive = switching cost
                bp = np.array([[dv - inc, -inc * 0.1], [0.0, 0.0]])
                cp = np.array([[inc - sc, 0.0], [-sc, 0.0]])
                pure_ne = find_nash_equilibria(bp, cp)
                mixed_ne = compute_mixed_nash_2x2(bp, cp)
                equilibria[seg] = {
                    "switching_cost_pkr": round(sc, 2),
                    "equilibrium_incentive_pkr": round(inc, 2),
                    "bank_net_value_pkr": round(dv - inc, 2),
                    "monthly_digital_saving_pkr": round(dv, 2),
                    "pure_nash_equilibria": [
                        {"bank_strategy": "Offer" if i == 0 else "Don't Offer",
                         "customer_strategy": "Adopt" if j == 0 else "Don't Adopt"}
                        for i, j in pure_ne],
                    "mixed_nash": mixed_ne,
                    "interpretation": (
                        f"Bank should offer PKR {inc:,.0f} incentive "
                        f"(= switching cost). Net gain: PKR {dv - inc:,.0f}/month."),
                }
            return _py({"segments": equilibria, "theory": "Subgame Perfect Equilibrium"})
        except Exception as exc:
            logger.error("compute_equilibrium error: %s", exc, exc_info=True)
            return {"error": str(exc)}

# ---------------------------------------------------------------------------
# ROICalculator
# ---------------------------------------------------------------------------
class ROICalculator:
    """Per-segment and total ROI for digital incentivization."""

    def calculate_roi(self, db: Session) -> Dict[str, Any]:
        try:
            cur = _estimate_digital_pct(db)
            daily_txn = _total_daily_txn(db) or 500_000
            seg_roi, t_cost, t_val = [], 0.0, 0.0

            for seg in SEGMENTS:
                p = _SEG[seg]
                cp = cur.get(seg, p["bdp"])
                seg_daily = daily_txn * p["w"]
                _, best_arm, best_lift = _best_arm_for(seg)
                tp = min(0.95, cp + best_lift)
                dp = tp - cp
                shifted = seg_daily * dp
                cash_sav = shifted * p["chc"] * 365
                cit_red = shifted * CIT_COST_PER_TRIP / 1000 * 365
                opp_val = shifted * p["atv"] * 0.5 * POLICY_RATE
                ann_val = cash_sav + cit_red + opp_val
                ann_cost = _ARM_COST[best_arm] * p["atv"] * p["w"] * 365
                roi = _div(ann_val - ann_cost, ann_cost) * 100
                t_cost += ann_cost
                t_val += ann_val
                seg_roi.append({
                    "segment": seg,
                    "current_digital_pct": round(cp * 100, 2),
                    "target_digital_pct": round(tp * 100, 2),
                    "digital_lift_pct": round(dp * 100, 2),
                    "best_incentive": best_arm,
                    "annual_incentive_cost_pkr": round(ann_cost, 2),
                    "annual_cash_handling_saving_pkr": round(cash_sav, 2),
                    "annual_cit_reduction_pkr": round(cit_red, 2),
                    "opportunity_value_pkr": round(opp_val, 2),
                    "total_annual_value_pkr": round(ann_val, 2),
                    "roi_pct": round(roi, 2),
                })
            return _py({
                "segment_roi": seg_roi,
                "total_annual_cost_pkr": round(t_cost, 2),
                "total_annual_value_pkr": round(t_val, 2),
                "overall_roi_pct": round(_div(t_val - t_cost, t_cost) * 100, 2),
                "budget_utilization_pct": round(_div(t_cost, DIGITAL_INCENTIVE_BUDGET) * 100, 2),
                "analysis_date": datetime.date.today().isoformat(),
            })
        except Exception as exc:
            logger.error("calculate_roi error: %s", exc, exc_info=True)
            return {"error": str(exc), "segment_roi": []}

# ---------------------------------------------------------------------------
# BudgetAllocator
# ---------------------------------------------------------------------------
class BudgetAllocator:
    """Allocate PKR 500M budget optimally across 5 segments."""

    def allocate_budget(self, sim: Dict[str, Any]) -> Dict[str, Any]:
        """Proportional allocation based on Thompson Sampling arm values."""
        try:
            budget = DIGITAL_INCENTIVE_BUDGET
            alloc = sim.get("budget_allocation_pkr", {})
            if not alloc or sum(alloc.values()) <= 0:
                return self._fallback(budget)
            raw_total = sum(alloc.values())
            scale = min(1.0, budget / raw_total) if raw_total > budget else 1.0
            items, tot = [], 0.0
            for seg in SEGMENTS:
                sc = alloc.get(seg, 0.0) * scale
                tot += sc
                items.append({
                    "segment": seg, "allocated_pkr": round(sc, 2),
                    "pct_of_budget": round(_div(sc, budget) * 100, 2),
                    "best_arm": sim.get("best_arm_per_segment", {}).get(seg, "Unknown"),
                    "expected_adoption_pct": sim.get("expected_adoption_pct", {}).get(seg, 0.0),
                })
            return _py({"total_budget_pkr": budget, "total_allocated_pkr": round(tot, 2),
                         "unallocated_pkr": round(max(0, budget - tot), 2),
                         "utilization_pct": round(_div(tot, budget) * 100, 2),
                         "allocations": items})
        except Exception as exc:
            logger.error("allocate_budget error: %s", exc, exc_info=True)
            return {"error": str(exc)}

    def _fallback(self, budget: float) -> Dict[str, Any]:
        items = [{"segment": s, "allocated_pkr": round(budget * _SEG[s]["w"], 2),
                  "pct_of_budget": round(_SEG[s]["w"] * 100, 2), "best_arm": "Unknown",
                  "expected_adoption_pct": round(_SEG[s]["bdp"] * 100, 2)} for s in SEGMENTS]
        return _py({"total_budget_pkr": budget, "total_allocated_pkr": budget,
                     "unallocated_pkr": 0.0, "utilization_pct": 100.0, "allocations": items})

# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------

def get_incentive_summary(db: Session) -> Dict[str, Any]:
    """Network-wide digital incentivization summary."""
    try:
        cur = _estimate_digital_pct(db)
        daily_txn = _total_daily_txn(db) or 500_000
        w_cur = sum(cur[s] * _SEG[s]["w"] for s in SEGMENTS)

        opt = IncentiveOptimizer()
        sim = opt.run_simulation(n_rounds=500)
        eq = opt.compute_equilibrium()
        roi = ROICalculator().calculate_roi(db)
        bgt = BudgetAllocator().allocate_budget(sim)

        exp = sim.get("expected_adoption_pct", {})
        w_tgt = sum(exp.get(s, cur[s] * 100) / 100.0 * _SEG[s]["w"] for s in SEGMENTS)
        bc = db.query(func.count(Branch.id)).scalar() or UBL_TOTAL_BRANCHES

        return _py({
            "network": {
                "total_branches": bc, "total_daily_transactions": daily_txn,
                "current_digital_adoption_pct": round(w_cur * 100, 2),
                "target_digital_adoption_pct": round(w_tgt * 100, 2),
                "adoption_lift_pct": round((w_tgt - w_cur) * 100, 2),
            },
            "budget": {
                "annual_budget_pkr": DIGITAL_INCENTIVE_BUDGET,
                "utilization_pct": bgt.get("utilization_pct", 0.0),
                "allocated_pkr": bgt.get("total_allocated_pkr", 0.0),
                "unallocated_pkr": bgt.get("unallocated_pkr", 0.0),
            },
            "roi": {
                "overall_roi_pct": roi.get("overall_roi_pct", 0.0),
                "total_annual_value_pkr": roi.get("total_annual_value_pkr", 0.0),
                "total_annual_cost_pkr": roi.get("total_annual_cost_pkr", 0.0),
            },
            "segment_summary": [{
                "segment": s,
                "current_digital_pct": round(cur[s] * 100, 2),
                "target_digital_pct": exp.get(s, 0.0),
                "best_incentive": sim.get("best_arm_per_segment", {}).get(s, "N/A"),
                "budget_share_pkr": next(
                    (a["allocated_pkr"] for a in bgt.get("allocations", [])
                     if a["segment"] == s), 0.0),
            } for s in SEGMENTS],
            "equilibrium_summary": {
                s: v.get("interpretation", "")
                for s, v in eq.get("segments", {}).items()},
            "analysis_date": datetime.date.today().isoformat(),
        })
    except Exception as exc:
        logger.error("get_incentive_summary error: %s", exc, exc_info=True)
        return {"error": str(exc), "segment_summary": []}


def get_segment_dashboard(db: Session) -> Dict[str, Any]:
    """Per-segment dashboard: adoption, best incentive, lift, budget, ROI."""
    try:
        cur = _estimate_digital_pct(db)
        opt = IncentiveOptimizer()
        sim = opt.run_simulation(n_rounds=500)
        eq = opt.compute_equilibrium()
        roi_d = ROICalculator().calculate_roi(db)
        bgt_d = BudgetAllocator().allocate_budget(sim)

        segs = []
        for seg in SEGMENTS:
            c = cur.get(seg, _SEG[seg]["bdp"])
            tp = sim.get("expected_adoption_pct", {}).get(seg, c * 100)
            sr = next((r for r in roi_d.get("segment_roi", []) if r["segment"] == seg), {})
            sb = next((a for a in bgt_d.get("allocations", []) if a["segment"] == seg), {})
            se = eq.get("segments", {}).get(seg, {})
            segs.append({
                "segment": seg, "segment_weight": _SEG[seg]["w"],
                "current_digital_adoption_pct": round(c * 100, 2),
                "target_digital_adoption_pct": tp,
                "adoption_lift_pct": round(tp - c * 100, 2),
                "best_incentive": sim.get("best_arm_per_segment", {}).get(seg, "N/A"),
                "budget_allocated_pkr": sb.get("allocated_pkr", 0.0),
                "budget_share_pct": sb.get("pct_of_budget", 0.0),
                "roi_pct": sr.get("roi_pct", 0.0),
                "annual_value_pkr": sr.get("total_annual_value_pkr", 0.0),
                "annual_cost_pkr": sr.get("annual_incentive_cost_pkr", 0.0),
                "equilibrium_incentive_pkr": se.get("equilibrium_incentive_pkr", 0.0),
                "switching_cost_pkr": se.get("switching_cost_pkr", 0.0),
                "arm_frequencies": sim.get("arm_selection_frequencies", {}).get(seg, {}),
            })
        return _py({"segments": segs, "overall_roi_pct": roi_d.get("overall_roi_pct", 0.0),
                     "total_budget_pkr": DIGITAL_INCENTIVE_BUDGET,
                     "analysis_date": datetime.date.today().isoformat()})
    except Exception as exc:
        logger.error("get_segment_dashboard error: %s", exc, exc_info=True)
        return {"error": str(exc), "segments": []}


def get_ab_simulator(
    db: Session, segment: str, arm_a: str, arm_b: str, n_trials: int = 500,
) -> Dict[str, Any]:
    """Simulate A/B test between two incentive arms for a segment."""
    try:
        if segment not in SEGMENTS:
            return {"error": f"Unknown segment '{segment}'. Valid: {SEGMENTS}"}
        if arm_a not in ARMS:
            return {"error": f"Unknown arm_a '{arm_a}'. Valid: {ARMS}"}
        if arm_b not in ARMS:
            return {"error": f"Unknown arm_b '{arm_b}'. Valid: {ARMS}"}
        n_trials = max(50, min(n_trials, 10_000))

        p = _SEG[segment]
        rng = np.random.default_rng(_SEED)
        ea, eb = _seg_eff(segment, arm_a), _seg_eff(segment, arm_b)
        ra = rng.normal(ea, 0.03, n_trials)
        rb = rng.normal(eb, 0.03, n_trials)
        ma, mb = float(np.mean(ra)), float(np.mean(rb))
        sa, sb = float(np.std(ra, ddof=1)), float(np.std(rb, ddof=1))

        se = np.sqrt(sa**2 / n_trials + sb**2 / n_trials)
        t_stat = _div(ma - mb, se)
        p_val = float(2 * (1 - _normal_cdf(abs(t_stat))))
        pooled = np.sqrt((sa**2 + sb**2) / 2)
        cd = _div(abs(ma - mb), pooled)
        conf = min(0.999, max(0.0, 1.0 - p_val))

        winner = arm_a if ma > mb else arm_b
        if p_val > 0.05:
            verdict = "No statistically significant difference"
        elif cd < 0.2:
            verdict = f"{winner} wins with small effect"
        elif cd < 0.8:
            verdict = f"{winner} wins with medium effect"
        else:
            verdict = f"{winner} wins with large effect"

        ca, cb = _ARM_COST[arm_a] * p["atv"], _ARM_COST[arm_b] * p["atv"]
        return _py({
            "segment": segment,
            "arm_a": {"name": arm_a, "mean_lift": round(ma * 100, 4),
                      "std": round(sa * 100, 4), "cost_per_txn_pkr": round(ca, 2)},
            "arm_b": {"name": arm_b, "mean_lift": round(mb * 100, 4),
                      "std": round(sb * 100, 4), "cost_per_txn_pkr": round(cb, 2)},
            "test_result": {
                "n_trials": n_trials, "winner": winner,
                "t_statistic": round(float(t_stat), 4),
                "p_value": round(p_val, 6), "confidence_pct": round(conf * 100, 2),
                "cohens_d": round(float(cd), 4), "verdict": verdict,
                "significant_at_005": p_val <= 0.05,
            },
            "cost_efficiency": {
                "arm_a_lift_per_pkr": round(_div(ma, ca) * 100, 4),
                "arm_b_lift_per_pkr": round(_div(mb, cb) * 100, 4),
                "more_cost_efficient": arm_a if _div(ma, max(ca, 1e-6)) > _div(mb, max(cb, 1e-6)) else arm_b,
            },
        })
    except Exception as exc:
        logger.error("get_ab_simulator error: %s", exc, exc_info=True)
        return {"error": str(exc)}
