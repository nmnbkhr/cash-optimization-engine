"""
UC-07: Denomination Mix Optimization
=====================================
Optimizes PKR denomination allocation across UBL branches to minimize
mismatch cost, SBP penalty risk, and note-sorting time.

Classes:
    DenominationOptimizer  - NSGA-II multi-objective (pymoo)
    DenominationAnalyzer   - Demand profiling, seasonal adjustments, penalty risk
Functions:
    get_denomination_summary, get_branch_denomination, get_penalty_heatmap
"""
import logging
import datetime
from typing import Any, Dict, List, Optional

import numpy as np
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import Problem
from pymoo.optimize import minimize as pymoo_minimize
from pymoo.operators.crossover.sbx import SBX
from pymoo.operators.mutation.pm import PM
from pymoo.operators.sampling.rnd import FloatRandomSampling
from pymoo.termination import get_termination

from app.core.constants import DENOMINATIONS, DENOMINATION_NAMES, PENALTY_UNPROCESSED_NOTES
from app.models.denomination import DenominationInventory
from app.models.branch import Branch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_N_DENOM = len(DENOMINATIONS)  # 7
_POP_SIZE, _N_GEN, _SEED = 100, 50, 42
_SORT_WEIGHTS = {5000: 1.0, 1000: 2.0, 500: 3.0, 100: 5.0, 50: 7.0, 20: 10.0, 10: 12.0}
_SOILED_THRESHOLD, _SOILED_CRITICAL = 0.15, 0.25

_SEASONAL_PROFILES = {
    "normal":  {5000: 1.0, 1000: 1.0, 500: 1.0, 100: 1.0, 50: 1.0, 20: 1.0, 10: 1.0},
    "eid":     {5000: 1.6, 1000: 1.4, 500: 1.1, 100: 0.9, 50: 0.8, 20: 0.7, 10: 0.7},
    "ramadan": {5000: 1.1, 1000: 1.2, 500: 1.4, 100: 1.3, 50: 1.1, 20: 1.0, 10: 0.9},
}
_DEFAULT_DEMAND = {5000: .30, 1000: .25, 500: .18, 100: .12, 50: .07, 20: .05, 10: .03}

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


def _norm(arr: np.ndarray) -> np.ndarray:
    s = arr.sum()
    return arr / s if s > 0 else np.ones(len(arr)) / len(arr)


def _risk_level(soiled_ratio: float):
    """Return (risk_label, penalty_probability) from soiled ratio."""
    if soiled_ratio >= _SOILED_CRITICAL:  return "critical", 0.85
    if soiled_ratio >= _SOILED_THRESHOLD: return "high", 0.45
    if soiled_ratio >= 0.08:              return "medium", 0.15
    return "low", 0.03


def _latest_date(q):
    return q.with_entities(func.max(DenominationInventory.date)).scalar()


# ---------------------------------------------------------------------------
# DenominationAnalyzer
# ---------------------------------------------------------------------------
class DenominationAnalyzer:
    """Analyse current denomination inventories and derive demand profiles."""

    def get_current_mix(self, db: Session, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """Current denomination mix from the latest inventory snapshot."""
        try:
            q = db.query(DenominationInventory)
            if branch_id is not None:
                q = q.filter(DenominationInventory.branch_id == branch_id)
            latest = _latest_date(q)
            if latest is None:
                return {"branch_id": branch_id, "date": None, "total_quantity": 0,
                        "total_value": 0.0, "denominations": []}

            rows = q.filter(DenominationInventory.date == latest).all()
            agg = {d: {"qty": 0, "val": 0.0, "fit": 0, "soiled": 0} for d in DENOMINATIONS}
            for r in rows:
                if r.denomination not in agg:
                    continue
                a = agg[r.denomination]
                a["qty"] += r.quantity or 0
                a["val"] += r.value or 0.0
                a["fit"] += (r.quantity or 0) if r.is_fit else 0
                a["soiled"] += (r.quantity or 0) if r.is_soiled else 0

            t_qty = sum(v["qty"] for v in agg.values())
            t_val = sum(v["val"] for v in agg.values())
            mix = [{
                "denomination": d, "name": DENOMINATION_NAMES.get(d, str(d)),
                "quantity": a["qty"], "value": round(a["val"], 2),
                "pct_by_quantity": round(_div(a["qty"], t_qty) * 100, 2),
                "pct_by_value": round(_div(a["val"], t_val) * 100, 2),
                "fit_quantity": a["fit"], "soiled_quantity": a["soiled"],
                "soiled_ratio": round(_div(a["soiled"], a["qty"]), 4),
            } for d, a in ((d, agg[d]) for d in DENOMINATIONS)]

            return _py({"branch_id": branch_id, "date": latest.isoformat(),
                        "total_quantity": t_qty, "total_value": round(t_val, 2),
                        "denominations": mix})
        except Exception as exc:
            logger.error("get_current_mix error: %s", exc, exc_info=True)
            return {"error": str(exc), "branch_id": branch_id, "denominations": []}

    def get_demand_profile(self, db: Session, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """Estimate demand profile from inventory value distribution."""
        try:
            q = db.query(DenominationInventory.denomination,
                         func.sum(DenominationInventory.value).label("tv")
                         ).group_by(DenominationInventory.denomination)
            if branch_id is not None:
                q = q.filter(DenominationInventory.branch_id == branch_id)
            rows = q.all()
            val_map = {r.denomination: float(r.tv or 0) for r in rows} if rows else {}
            total = sum(val_map.values())
            if total <= 0:
                return self._default_profile(branch_id)
            profile = [{"denomination": d, "name": DENOMINATION_NAMES.get(d, str(d)),
                         "demand_pct": round(_div(val_map.get(d, 0), total) * 100, 2),
                         "demand_fraction": round(_div(val_map.get(d, 0), total), 6)}
                        for d in DENOMINATIONS]
            return _py({"branch_id": branch_id, "source": "inventory_data", "profile": profile})
        except Exception as exc:
            logger.error("get_demand_profile error: %s", exc, exc_info=True)
            return {"error": str(exc), "branch_id": branch_id, "profile": []}

    def get_seasonal_adjustment(self, scenario: str = "normal") -> Dict[str, Any]:
        sc = scenario.lower() if scenario.lower() in _SEASONAL_PROFILES else "normal"
        descs = {"normal": "Standard demand distribution",
                 "eid": "Eid season: elevated demand for high denominations (5000/1000)",
                 "ramadan": "Ramadan: elevated demand for mid denominations (500/100)"}
        return _py({"scenario": sc,
                     "multipliers": {d: _SEASONAL_PROFILES[sc][d] for d in DENOMINATIONS},
                     "description": descs.get(sc, "")})

    def get_penalty_risk(self, db: Session, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """SBP penalty risk based on soiled note ratios."""
        try:
            q = db.query(DenominationInventory)
            if branch_id is not None:
                q = q.filter(DenominationInventory.branch_id == branch_id)
            latest = _latest_date(q)
            if latest is None:
                return {"branch_id": branch_id, "risk_level": "unknown",
                        "soiled_ratio": 0.0, "estimated_annual_penalty": 0.0}
            rows = q.filter(DenominationInventory.date == latest).all()
            t_qty = sum(r.quantity or 0 for r in rows)
            s_qty = sum((r.quantity or 0) for r in rows if r.is_soiled)
            ratio = _div(s_qty, t_qty)
            risk, prob = _risk_level(ratio)
            annual = prob * PENALTY_UNPROCESSED_NOTES * 12
            return _py({"branch_id": branch_id, "date": latest.isoformat(),
                        "total_notes": t_qty, "soiled_notes": s_qty,
                        "soiled_ratio": round(ratio, 4), "risk_level": risk,
                        "penalty_probability": round(prob, 2),
                        "estimated_annual_penalty": round(annual, 2),
                        "penalty_per_violation": PENALTY_UNPROCESSED_NOTES})
        except Exception as exc:
            logger.error("get_penalty_risk error: %s", exc, exc_info=True)
            return {"error": str(exc), "branch_id": branch_id, "risk_level": "unknown"}

    def _default_profile(self, branch_id):
        profile = [{"denomination": d, "name": DENOMINATION_NAMES.get(d, str(d)),
                     "demand_pct": round(p * 100, 2), "demand_fraction": p}
                    for d, p in _DEFAULT_DEMAND.items()]
        return {"branch_id": branch_id, "source": "default_estimate", "profile": profile}


# ---------------------------------------------------------------------------
# pymoo Problem
# ---------------------------------------------------------------------------
class _DenomProblem(Problem):
    """3-objective denomination allocation problem for NSGA-II."""

    def __init__(self, demand_profiles: List[np.ndarray],
                 soiled_ratios: np.ndarray, denom_values: np.ndarray):
        super().__init__(n_var=_N_DENOM, n_obj=3, n_constr=0,
                         xl=np.full(_N_DENOM, 0.01), xu=np.full(_N_DENOM, 0.60))
        self.demand_profiles = demand_profiles
        self.soiled_ratios = soiled_ratios
        self.denom_values = denom_values
        self.sort_weights = np.array([_SORT_WEIGHTS[d] for d in DENOMINATIONS])

    def _evaluate(self, X, out, *args, **kwargs):
        n = X.shape[0]
        F = np.zeros((n, 3))
        for i in range(n):
            alloc = X[i] / X[i].sum()
            # f1: worst-case mismatch cost across scenarios
            F[i, 0] = max(np.sum(np.abs(alloc - dp) * self.denom_values)
                          for dp in self.demand_profiles)
            # f2: SBP penalty risk
            ws = np.sum(alloc * self.soiled_ratios)
            if ws >= _SOILED_CRITICAL:
                pr = 0.85
            elif ws >= _SOILED_THRESHOLD:
                pr = 0.15 + (ws - _SOILED_THRESHOLD) / (_SOILED_CRITICAL - _SOILED_THRESHOLD) * 0.70
            else:
                pr = ws / _SOILED_THRESHOLD * 0.15
            F[i, 1] = pr * PENALTY_UNPROCESSED_NOTES
            # f3: sorting time index
            F[i, 2] = np.sum((alloc / self.denom_values) * self.sort_weights) * 1e6
        out["F"] = F


# ---------------------------------------------------------------------------
# DenominationOptimizer (NSGA-II)
# ---------------------------------------------------------------------------
class DenominationOptimizer:
    """
    3 objectives: mismatch cost, SBP penalty risk, sorting time.
    Decision: % allocation across 7 denominations (must sum to 100%).
    Pareto frontier via pymoo NSGA-II. ALL LOCAL on CPU.
    Robust layer: worst-case Eid/Ramadan demand scenario.
    """

    def __init__(self):
        self.analyzer = DenominationAnalyzer()

    def optimize(self, db: Session, branch_id: Optional[int] = None,
                 scenario: str = "normal") -> Dict[str, Any]:
        """Run NSGA-II denomination mix optimization."""
        try:
            # Build demand profiles
            raw = self.analyzer.get_demand_profile(db, branch_id)
            base = np.array([
                next((p["demand_fraction"] for p in raw.get("profile", [])
                      if p["denomination"] == d), _DEFAULT_DEMAND[d])
                for d in DENOMINATIONS])
            base = _norm(base)

            scenarios_used = (list(_SEASONAL_PROFILES.keys()) if scenario.lower() == "robust"
                              else [scenario.lower() if scenario.lower() in _SEASONAL_PROFILES
                                    else "normal"])
            profiles = []
            for sc in scenarios_used:
                mult = np.array([_SEASONAL_PROFILES[sc][d] for d in DENOMINATIONS])
                profiles.append(_norm(base * mult))

            soiled = self._soiled_ratios(db, branch_id)
            dv = np.array(DENOMINATIONS, dtype=float)

            # Solve
            problem = _DenomProblem(profiles, soiled, dv)
            algo = NSGA2(pop_size=_POP_SIZE, sampling=FloatRandomSampling(),
                         crossover=SBX(prob=0.9, eta=15), mutation=PM(eta=20),
                         eliminate_duplicates=True)
            res = pymoo_minimize(problem, algo, get_termination("n_gen", _N_GEN),
                                 seed=_SEED, verbose=False)

            if res.F is None or len(res.F) == 0:
                return {"error": "Optimization did not converge",
                        "branch_id": branch_id, "scenario": scenario}

            # Extract Pareto frontier (up to 20 solutions)
            idx = np.argsort(res.F[:, 0])
            n_sol = min(len(idx), 20)
            pF, pX = res.F[idx][:n_sol], res.X[idx][:n_sol]
            knee = self._knee(pF)
            rec_alloc = pX[knee] / pX[knee].sum()

            solutions = []
            for j in range(n_sol):
                a = pX[j] / pX[j].sum()
                o = pF[j]
                solutions.append({
                    "rank": j + 1, "is_recommended": bool(j == knee),
                    "allocation": {DENOMINATION_NAMES[d]: round(float(a[i]) * 100, 2)
                                   for i, d in enumerate(DENOMINATIONS)},
                    "allocation_raw": {d: round(float(a[i]), 6)
                                       for i, d in enumerate(DENOMINATIONS)},
                    "objectives": {"mismatch_cost": round(float(o[0]), 2),
                                   "penalty_risk_pkr": round(float(o[1]), 2),
                                   "sorting_time_index": round(float(o[2]), 4)},
                })

            recommendation = self._build_rec(rec_alloc, pF[knee], profiles[0], soiled)

            return _py({
                "branch_id": branch_id, "scenario": scenario,
                "scenarios_evaluated": scenarios_used,
                "optimization": {"algorithm": "NSGA-II", "pop_size": _POP_SIZE,
                                 "generations": _N_GEN, "pareto_solutions": n_sol},
                "recommended": recommendation, "pareto_frontier": solutions,
                "demand_profile_used": {DENOMINATION_NAMES[d]: round(float(profiles[0][i]) * 100, 2)
                                        for i, d in enumerate(DENOMINATIONS)},
                "analysis_date": datetime.date.today().isoformat(),
            })
        except Exception as exc:
            logger.error("Optimization error: %s", exc, exc_info=True)
            return {"error": str(exc), "branch_id": branch_id, "scenario": scenario}

    def _soiled_ratios(self, db: Session, branch_id: Optional[int]) -> np.ndarray:
        ratios = np.full(_N_DENOM, 0.05)
        try:
            q = db.query(DenominationInventory)
            if branch_id is not None:
                q = q.filter(DenominationInventory.branch_id == branch_id)
            latest = _latest_date(q)
            if latest is None:
                return ratios
            rows = q.filter(DenominationInventory.date == latest).all()
            agg = {d: [0, 0] for d in DENOMINATIONS}  # [total, soiled]
            for r in rows:
                if r.denomination in agg:
                    agg[r.denomination][0] += r.quantity or 0
                    if r.is_soiled:
                        agg[r.denomination][1] += r.quantity or 0
            for i, d in enumerate(DENOMINATIONS):
                ratios[i] = _div(agg[d][1], agg[d][0], 0.05)
        except Exception as exc:
            logger.warning("Could not compute soiled ratios: %s", exc)
        return ratios

    def _knee(self, F: np.ndarray) -> int:
        if len(F) <= 1:
            return 0
        rng = F.max(axis=0) - F.min(axis=0)
        rng[rng == 0] = 1.0
        Fn = (F - F.min(axis=0)) / rng
        return int(np.argmin(np.sqrt(np.sum(Fn ** 2, axis=1))))

    def _build_rec(self, alloc, obj, demand, soiled):
        per_d = [{"denomination": d, "name": DENOMINATION_NAMES[d],
                  "recommended_pct": round(float(alloc[i]) * 100, 2),
                  "current_demand_pct": round(float(demand[i]) * 100, 2),
                  "gap_pct": round(float(alloc[i] - demand[i]) * 100, 2),
                  "soiled_ratio": round(float(soiled[i]), 4)}
                 for i, d in enumerate(DENOMINATIONS)]
        top = int(np.argmax(alloc))
        top_name = DENOMINATION_NAMES[DENOMINATIONS[top]]
        risk_msg = ("Elevated SBP penalty risk; prioritize soiled-note processing."
                    if obj[1] > PENALTY_UNPROCESSED_NOTES * 0.5
                    else "SBP penalty risk within acceptable range.")
        return {
            "allocation": per_d, "total_pct": round(float(alloc.sum()) * 100, 2),
            "objectives": {"mismatch_cost": round(float(obj[0]), 2),
                           "penalty_risk_pkr": round(float(obj[1]), 2),
                           "sorting_time_index": round(float(obj[2]), 4)},
            "summary": f"Recommended highest allocation to {top_name} "
                       f"({alloc[top]*100:.1f}%). {risk_msg}",
        }


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------

def get_denomination_summary(db: Session) -> Dict[str, Any]:
    """Network-wide denomination summary with optimization highlights."""
    try:
        analyzer = DenominationAnalyzer()
        mix = analyzer.get_current_mix(db)
        demand = analyzer.get_demand_profile(db)
        penalty = analyzer.get_penalty_risk(db)

        dd = mix.get("denominations", [])
        t_qty, t_val = mix.get("total_quantity", 0), mix.get("total_value", 0.0)
        t_fit = sum(d.get("fit_quantity", 0) for d in dd)
        t_soiled = sum(d.get("soiled_quantity", 0) for d in dd)

        breakdown = [{"denomination": d["denomination"], "name": d.get("name", ""),
                      "total_quantity": d.get("quantity", 0),
                      "fit_quantity": d.get("fit_quantity", 0),
                      "soiled_quantity": d.get("soiled_quantity", 0),
                      "soiled_ratio": d.get("soiled_ratio", 0.0),
                      "value": d.get("value", 0.0)} for d in dd]

        return _py({
            "date": mix.get("date"), "total_notes": t_qty,
            "total_value": round(t_val, 2),
            "fit_notes": t_fit, "soiled_notes": t_soiled,
            "overall_soiled_ratio": round(_div(t_soiled, t_qty), 4),
            "denomination_breakdown": breakdown,
            "demand_profile": demand.get("profile", []),
            "penalty_risk": {
                "network_risk_level": penalty.get("risk_level", "unknown"),
                "network_soiled_ratio": penalty.get("soiled_ratio", 0.0),
                "estimated_annual_penalty": round(penalty.get("estimated_annual_penalty", 0.0), 2),
                "penalty_per_violation": PENALTY_UNPROCESSED_NOTES,
            },
            "top_risk_branches": _top_penalty_branches(db),
            "analysis_date": datetime.date.today().isoformat(),
        })
    except Exception as exc:
        logger.error("get_denomination_summary error: %s", exc, exc_info=True)
        return {"error": str(exc), "denomination_breakdown": [],
                "demand_profile": [], "top_risk_branches": []}


def get_branch_denomination(db: Session, branch_id: int) -> Dict[str, Any]:
    """Single branch denomination breakdown with optimization recommendation."""
    try:
        branch = db.query(Branch).filter(Branch.id == branch_id).first()
        if not branch:
            return {"error": f"Branch {branch_id} not found"}

        analyzer = DenominationAnalyzer()
        opt = DenominationOptimizer().optimize(db, branch_id=branch_id, scenario="robust")
        rec = opt.get("recommended", {})

        return _py({
            "branch_id": branch_id, "branch_name": branch.name,
            "city": branch.city,
            "branch_type": branch.branch_type.value if branch.branch_type else None,
            "vault_capacity": branch.vault_capacity,
            "current_mix": analyzer.get_current_mix(db, branch_id),
            "demand_profile": analyzer.get_demand_profile(db, branch_id),
            "penalty_risk": analyzer.get_penalty_risk(db, branch_id),
            "optimization": {
                "recommended_allocation": rec.get("allocation", []),
                "objectives": rec.get("objectives", {}),
                "summary": rec.get("summary", ""),
                "pareto_solutions_count": opt.get("optimization", {}).get("pareto_solutions", 0),
                "scenario": "robust",
            },
            "analysis_date": datetime.date.today().isoformat(),
        })
    except Exception as exc:
        logger.error("get_branch_denomination error for %s: %s", branch_id, exc, exc_info=True)
        return {"error": str(exc), "branch_id": branch_id}


def get_penalty_heatmap(db: Session) -> Dict[str, Any]:
    """Per-city SBP penalty risk data for heatmap visualization."""
    try:
        branches = db.query(Branch).all()
        if not branches:
            return {"error": "No branches found", "cities": []}

        city_br: Dict[str, List[int]] = {}
        for b in branches:
            city_br.setdefault(b.city, []).append(b.id)

        latest = db.query(func.max(DenominationInventory.date)).scalar()
        if latest is None:
            return {"error": "No denomination data", "cities": []}

        rows = (
            db.query(Branch.city,
                     func.sum(DenominationInventory.quantity).label("tq"),
                     func.sum(case(
                         (DenominationInventory.is_soiled == True,  # noqa: E712
                          DenominationInventory.quantity), else_=0)).label("sq"))
            .join(Branch, Branch.id == DenominationInventory.branch_id)
            .filter(DenominationInventory.date == latest)
            .group_by(Branch.city).all())

        cities = []
        for r in rows:
            total, soiled = int(r.tq or 0), int(r.sq or 0)
            ratio = _div(soiled, total)
            risk, prob = _risk_level(ratio)
            bc = len(city_br.get(r.city, []))
            cities.append({
                "city": r.city, "branch_count": bc,
                "total_notes": total, "soiled_notes": soiled,
                "soiled_ratio": round(ratio, 4), "risk_level": risk,
                "penalty_probability": round(prob, 2),
                "estimated_annual_penalty": round(prob * PENALTY_UNPROCESSED_NOTES * 12 * bc, 2),
            })

        risk_ord = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        cities.sort(key=lambda c: (risk_ord.get(c["risk_level"], 4), -c["soiled_ratio"]))
        total_annual = sum(c["estimated_annual_penalty"] for c in cities)

        return _py({
            "date": latest.isoformat(), "cities": cities, "total_cities": len(cities),
            "network_estimated_annual_penalty": round(total_annual, 2),
            "risk_summary": {lv: sum(1 for c in cities if c["risk_level"] == lv)
                             for lv in ("critical", "high", "medium", "low")},
            "analysis_date": datetime.date.today().isoformat(),
        })
    except Exception as exc:
        logger.error("get_penalty_heatmap error: %s", exc, exc_info=True)
        return {"error": str(exc), "cities": []}


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------
def _top_penalty_branches(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
    """Top branches ranked by SBP penalty risk (soiled ratio)."""
    try:
        latest = db.query(func.max(DenominationInventory.date)).scalar()
        if latest is None:
            return []
        rows = (
            db.query(DenominationInventory.branch_id, Branch.name, Branch.city,
                     func.sum(DenominationInventory.quantity).label("tq"),
                     func.sum(case(
                         (DenominationInventory.is_soiled == True,  # noqa: E712
                          DenominationInventory.quantity), else_=0)).label("sq"))
            .join(Branch, Branch.id == DenominationInventory.branch_id)
            .filter(DenominationInventory.date == latest)
            .group_by(DenominationInventory.branch_id, Branch.name, Branch.city).all())

        results = []
        for r in rows:
            total, soiled = int(r.tq or 0), int(r.sq or 0)
            ratio = _div(soiled, total)
            risk, _ = _risk_level(ratio)
            results.append({"branch_id": r.branch_id, "branch_name": r.name,
                            "city": r.city, "total_notes": total, "soiled_notes": soiled,
                            "soiled_ratio": round(ratio, 4), "risk_level": risk})
        results.sort(key=lambda x: -x["soiled_ratio"])
        return _py(results[:limit])
    except Exception as exc:
        logger.warning("_top_penalty_branches error: %s", exc)
        return []
