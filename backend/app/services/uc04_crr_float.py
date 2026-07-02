"""
UC-04: CRR Float Engineering
==============================
Optimizes CRR (Cash Reserve Ratio) management for UBL to maximize freed
liquidity deployed at overnight repo rate while maintaining SBP compliance.

SBP requires: 6% weekly average CRR (Fri-Thu), 4% daily minimum,
shortfall penalty 3% above policy rate.

Classes:
    CRRFloatOptimizer  - 7-day rolling DP + Monte Carlo optimizer
    CRRStrategyGame    - Repeated game with SBP (Nash equilibrium analysis)
Functions:
    get_crr_summary, get_crr_weekly_timeline, get_optimal_schedule
"""
import logging
import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app.core.constants import (
    CRR_DAILY_MIN, CRR_WEEKLY_AVG, OVERNIGHT_REPO_RATE,
    PENALTY_CRR_SHORTFALL_RATE, POLICY_RATE, UBL_DEPOSIT_BASE_TRILLIONS,
)
from app.core.game_theory import find_nash_equilibria, compute_mixed_nash_2x2
from app.database import SessionLocal
from app.models.crr_position import CRRPosition

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_DEPOSIT_BASE = 851_038.0  # PKR Millions (UBL deposits from DB)
_SBP_WEEK_DAYS = 7
_DAILY_VOLATILITY = 0.02  # +/- 2% deposit base uncertainty
_MC_SCENARIOS = 100
_CRR_CEILING = 0.08
_CRR_STEP = 0.004  # DP granularity (0.4%)
_DAYS_PER_YEAR = 365
_PENALTY_RATE = POLICY_RATE + PENALTY_CRR_SHORTFALL_RATE  # 14%
_SBP_AUDIT_PROB = {"low": 0.05, "medium": 0.15, "high": 0.30}
_SBP_WEEK_DAYS_NAMES = [
    "Friday", "Saturday", "Sunday", "Monday",
    "Tuesday", "Wednesday", "Thursday",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_python(val):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    if isinstance(val, dict):
        return {k: _to_python(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_to_python(v) for v in val]
    return val


def _sbp_week_number(d: datetime.date) -> int:
    """SBP week number (Friday-to-Thursday), derived from ISO week."""
    adjusted = d - datetime.timedelta(days=(d.weekday() - 4) % 7)
    return adjusted.isocalendar()[1]


def _days_remaining_in_sbp_week(d: datetime.date) -> int:
    """Days remaining in current SBP week (Fri-Thu), including today."""
    days_since_friday = (d.weekday() - 4) % 7
    return max(1, _SBP_WEEK_DAYS - days_since_friday)


def _overnight_income(amount: float, days: int = 1) -> float:
    """Income from deploying amount at overnight repo rate."""
    return amount * OVERNIGHT_REPO_RATE / _DAYS_PER_YEAR * days


def _shortfall_penalty(shortfall_amount: float, days: int = 1) -> float:
    """Penalty for CRR shortfall: (policy_rate + 3%) on shortfall amount."""
    if shortfall_amount <= 0:
        return 0.0
    return shortfall_amount * _PENALTY_RATE / _DAYS_PER_YEAR * days


def _week_start(d: datetime.date) -> datetime.date:
    """Friday-anchored SBP maintenance-week start date (unique across years)."""
    return d - datetime.timedelta(days=(d.weekday() - 4) % 7)


def _ledger_crr_weeks(db: Session, weeks_back: int = 52) -> List[Dict[str, Any]]:
    """Aggregate network CRR from the reconciled ledger (fact_gl_daily) into
    SBP maintenance weeks, anchored to the latest date on/before today. All amounts
    PKR Millions. Empty list if the ledger is unavailable (caller falls back to the
    stale CRRPosition ORM table). Deposit base is implied as required/CRR_WEEKLY_AVG."""
    from sqlalchemy import text
    try:
        row = db.execute(
            text("SELECT MAX(date) FROM fact_gl_daily WHERE date <= :t"),
            {"t": str(datetime.date.today())},
        ).fetchone()
        as_of = row[0] if row and row[0] else None
        if not as_of:
            return []
        as_of_d = datetime.datetime.strptime(as_of, "%Y-%m-%d").date()
        start = _week_start(as_of_d - datetime.timedelta(weeks=weeks_back))
        rows = db.execute(
            text("SELECT date, SUM(crr_held_m) held, SUM(crr_required_m) req "
                 "FROM fact_gl_daily WHERE date >= :s AND date <= :e "
                 "GROUP BY date ORDER BY date"),
            {"s": str(start), "e": as_of},
        ).fetchall()
        buckets: Dict[datetime.date, List[Tuple[float, float]]] = {}
        for r in rows:
            d = datetime.datetime.strptime(r.date, "%Y-%m-%d").date()
            buckets.setdefault(_week_start(d), []).append(
                (float(r.held or 0.0), float(r.req or 0.0)))
        weeks = []
        for ws in sorted(buckets):
            days = buckets[ws]
            avg_held = float(np.mean([h for h, _ in days]))
            avg_req = float(np.mean([q for _, q in days]))
            deposit = avg_req / CRR_WEEKLY_AVG if CRR_WEEKLY_AVG else 0.0
            weeks.append({
                "week_start": ws,
                "days": len(days),
                "avg_held_m": avg_held,
                "avg_req_m": avg_req,
                "deposit_m": deposit,
                "avg_ratio": (avg_held / deposit) if deposit else 0.0,
                "excess_m": max(0.0, avg_held - avg_req),  # only over-holding is real float
            })
        return weeks
    except Exception:
        return []


# ---------------------------------------------------------------------------
# CRRFloatOptimizer
# ---------------------------------------------------------------------------
class CRRFloatOptimizer:
    """
    7-day rolling DP optimizer: Friday-to-Thursday SBP week.
    State: (day, cumulative_crr, deposit_base_forecast)
    Decision: CRR deposit today (4% floor to 8% ceiling)
    Freed liquidity deployed at overnight repo 10.5%.
    DP solved via backward induction + Monte Carlo for uncertainty.
    ALL LOCAL. No API calls.
    """

    def __init__(self, deposit_base: float = _DEPOSIT_BASE,
                 n_scenarios: int = _MC_SCENARIOS,
                 daily_volatility: float = _DAILY_VOLATILITY):
        self.deposit_base = deposit_base
        self.n_scenarios = n_scenarios
        self.daily_volatility = daily_volatility
        self.rng = np.random.default_rng(seed=42)

    def optimize(self, deposit_base: Optional[float] = None,
                 current_crr_deposits: float = 0.0,
                 days_remaining_in_week: int = _SBP_WEEK_DAYS,
                 days_elapsed_crr_sum: float = 0.0,
                 days_elapsed: int = 0) -> Dict[str, Any]:
        """Compute optimal daily CRR schedule for remaining days in the week."""
        if deposit_base is None:
            deposit_base = self.deposit_base
        days_remaining = max(1, min(days_remaining_in_week, _SBP_WEEK_DAYS))
        total_days = days_elapsed + days_remaining

        # Monte Carlo deposit base scenarios
        deposit_scenarios = self._generate_deposit_scenarios(deposit_base, days_remaining)

        all_schedules, all_incomes, all_freed, all_compliant = [], [], [], []
        for s in range(self.n_scenarios):
            schedule, freed, income, compliant = self._solve_dp(
                deposit_scenarios[s], days_remaining,
                days_elapsed_crr_sum, days_elapsed, total_days,
            )
            all_schedules.append(schedule)
            all_incomes.append(income)
            all_freed.append(freed)
            all_compliant.append(compliant)

        # Aggregate across scenarios
        schedules_arr = np.array(all_schedules)
        optimal_ratios = np.clip(np.median(schedules_arr, axis=0),
                                 CRR_DAILY_MIN, _CRR_CEILING)

        # Build schedule output
        today = datetime.date.today()
        schedule_output = []
        total_freed_liquidity = 0.0
        total_income = 0.0
        for day_idx in range(days_remaining):
            ratio = float(optimal_ratios[day_idx])
            day_dep = float(np.median(deposit_scenarios[:, day_idx]))
            # Freed liquidity = cash saved by holding ratio below the weekly avg
            # Even on high-ratio days, use MC mean values for aggregate metrics
            freed = max(day_dep * CRR_WEEKLY_AVG - day_dep * ratio, 0.0)
            # If ratio >= weekly avg, no freed cash that day, but use scenario averages
            if freed <= 0:
                freed = float(np.mean([
                    max(deposit_scenarios[s, day_idx] * CRR_WEEKLY_AVG
                        - deposit_scenarios[s, day_idx] * all_schedules[s][day_idx], 0.0)
                    for s in range(min(50, self.n_scenarios))
                ]))
            day_income = _overnight_income(freed)
            total_freed_liquidity += freed
            total_income += day_income
            schedule_output.append({
                "day": day_idx + 1,
                "date": (today + datetime.timedelta(days=day_idx)).isoformat(),
                "day_name": _SBP_WEEK_DAYS_NAMES[(days_elapsed + day_idx) % _SBP_WEEK_DAYS],
                "crr_ratio_pct": round(ratio * 100, 2),
                "deposit_base": round(day_dep, 0),
                "crr_amount": round(day_dep * ratio, 0),
                "freed_liquidity": round(freed, 0),
                "overnight_income": round(day_income, 0),
            })

        all_ratios_sum = days_elapsed_crr_sum + float(np.sum(optimal_ratios))
        weekly_avg = all_ratios_sum / total_days if total_days > 0 else 0.0

        incomes_arr = np.array(all_incomes)
        freed_arr = np.array(all_freed)
        compliance_rate = float(np.mean(all_compliant))
        risk_metrics = {
            "compliance_probability": round(compliance_rate, 4),
            "income_mean": round(float(np.mean(incomes_arr)), 0),
            "income_std": round(float(np.std(incomes_arr)), 0),
            "income_p5": round(float(np.percentile(incomes_arr, 5)), 0),
            "income_p95": round(float(np.percentile(incomes_arr, 95)), 0),
            "freed_liquidity_mean": round(float(np.mean(freed_arr)), 0),
            "freed_liquidity_std": round(float(np.std(freed_arr)), 0),
            "var_95": round(float(np.mean(incomes_arr) - np.percentile(incomes_arr, 5)), 0),
            "weekly_avg_crr_pct": round(weekly_avg * 100, 2),
            "scenarios_run": self.n_scenarios,
        }
        return _to_python({
            "optimal_schedule": schedule_output,
            "expected_freed_liquidity": round(total_freed_liquidity, 0),
            "expected_income": round(total_income, 0),
            "compliance_probability": round(compliance_rate, 4),
            "weekly_avg_crr_pct": round(weekly_avg * 100, 2),
            "risk_metrics": risk_metrics,
            "parameters": {
                "deposit_base": round(deposit_base, 0),
                "days_remaining": days_remaining, "days_elapsed": days_elapsed,
                "crr_daily_min_pct": CRR_DAILY_MIN * 100,
                "crr_weekly_avg_pct": CRR_WEEKLY_AVG * 100,
                "overnight_repo_rate_pct": OVERNIGHT_REPO_RATE * 100,
                "mc_scenarios": self.n_scenarios,
            },
        })

    def _generate_deposit_scenarios(self, base: float, days: int) -> np.ndarray:
        """GBM Monte Carlo paths for deposit base. Shape: (n_scenarios, days)."""
        shocks = self.rng.normal(loc=0.0, scale=self.daily_volatility,
                                 size=(self.n_scenarios, days))
        return base * np.cumprod(np.exp(shocks), axis=1)

    def _solve_dp(self, deposit_path: np.ndarray, days_remaining: int,
                  prior_crr_sum: float, days_elapsed: int,
                  total_days: int) -> Tuple[List[float], float, float, bool]:
        """
        Backward induction DP for a single deposit scenario.
        Returns: (schedule_ratios, total_freed, total_income, is_compliant)
        """
        n_steps = int((_CRR_CEILING - CRR_DAILY_MIN) / _CRR_STEP) + 1
        crr_choices = np.linspace(CRR_DAILY_MIN, _CRR_CEILING, n_steps)

        max_cum = _CRR_CEILING * total_days
        cum_step = _CRR_STEP
        n_cum = int(max_cum / cum_step) + 2
        cum_values = np.linspace(0, max_cum, n_cum)

        INF_PENALTY = -1e18
        value = np.full((days_remaining + 1, n_cum), INF_PENALTY)
        policy = np.zeros((days_remaining, n_cum), dtype=int)

        # Terminal condition
        required_sum = CRR_WEEKLY_AVG * total_days
        avg_deposit = float(np.mean(deposit_path))
        for ci in range(n_cum):
            total_sum = prior_crr_sum + cum_values[ci]
            if total_sum >= required_sum - 1e-9:
                value[days_remaining, ci] = 0.0
            else:
                shortfall_ratio = required_sum - total_sum
                shortfall_amount = shortfall_ratio / total_days * avg_deposit
                # Multiply penalty by regulatory risk factor (10x) to reflect
                # reputational cost + SBP sanctions beyond the monetary penalty
                value[days_remaining, ci] = -10.0 * _shortfall_penalty(shortfall_amount, days_remaining)

        # Backward induction
        for day in range(days_remaining - 1, -1, -1):
            day_deposit = deposit_path[day]
            baseline_crr = day_deposit * CRR_WEEKLY_AVG
            for ci in range(n_cum):
                best_val, best_action = INF_PENALTY, 0
                for ai, crr_ratio in enumerate(crr_choices):
                    freed = max(baseline_crr - day_deposit * crr_ratio, 0.0)
                    income = _overnight_income(freed)
                    new_cum = cum_values[ci] + crr_ratio
                    next_ci = min(int(round(new_cum / cum_step)), n_cum - 1)
                    total_val = income + value[day + 1, next_ci]
                    if total_val > best_val:
                        best_val, best_action = total_val, ai
                value[day, ci] = best_val
                policy[day, ci] = best_action

        # Forward pass: extract optimal schedule
        schedule, total_freed, total_income = [], 0.0, 0.0
        cum_idx = 0
        for day in range(days_remaining):
            crr_ratio = crr_choices[policy[day, cum_idx]]
            day_deposit = deposit_path[day]
            freed = max(day_deposit * CRR_WEEKLY_AVG - day_deposit * crr_ratio, 0.0)
            income = _overnight_income(freed)
            schedule.append(float(crr_ratio))
            total_freed += freed
            total_income += income
            new_cum = cum_values[cum_idx] + crr_ratio
            cum_idx = min(int(round(new_cum / cum_step)), n_cum - 1)

        total_ratio_sum = prior_crr_sum + sum(schedule)
        weekly_avg = total_ratio_sum / total_days if total_days > 0 else 0.0
        return schedule, total_freed, total_income, weekly_avg >= CRR_WEEKLY_AVG - 1e-9


# ---------------------------------------------------------------------------
# CRRStrategyGame
# ---------------------------------------------------------------------------
class CRRStrategyGame:
    """
    Repeated game: UBL vs SBP for CRR management.
    Bank strategies: Conservative / Moderate / Aggressive
    SBP audit intensity: Low / Medium / High
    Payoffs = freed_liquidity_income - expected_penalties.
    """
    BANK_STRATEGIES = ["Conservative", "Moderate", "Aggressive"]
    SBP_INTENSITIES = ["Low", "Medium", "High"]
    _STRATEGY_PARAMS = {
        "Conservative": {"daily_min": 0.045, "weekly_target": 0.065,
                         "floor_frequency": 0.0, "compliance_prob": 0.999},
        "Moderate":     {"daily_min": 0.040, "weekly_target": 0.060,
                         "floor_frequency": 0.3, "compliance_prob": 0.95},
        "Aggressive":   {"daily_min": 0.040, "weekly_target": 0.060,
                         "floor_frequency": 0.6, "compliance_prob": 0.85},
    }

    def __init__(self, deposit_base: float = _DEPOSIT_BASE):
        self.deposit_base = deposit_base

    def build_payoff_matrices(self) -> Dict[str, Any]:
        """Build 3x3 payoff matrices and find Nash equilibria."""
        n_bank, n_sbp = len(self.BANK_STRATEGIES), len(self.SBP_INTENSITIES)
        bank_payoffs = np.zeros((n_bank, n_sbp))
        sbp_payoffs = np.zeros((n_bank, n_sbp))
        audit_costs = {"Low": 1.0, "Medium": 5.0, "High": 15.0}  # PKR Millions
        compliance_value = 50.0  # PKR Millions per week

        for i, strat in enumerate(self.BANK_STRATEGIES):
            params = self._STRATEGY_PARAMS[strat]
            for j, intensity in enumerate(self.SBP_INTENSITIES):
                audit_prob = _SBP_AUDIT_PROB[intensity.lower()]
                # Bank income from freed liquidity
                if strat in ("Aggressive", "Moderate"):
                    floor_days = int(params["floor_frequency"] * _SBP_WEEK_DAYS)
                    floor_freed = (CRR_WEEKLY_AVG - CRR_DAILY_MIN) * self.deposit_base
                    freed_weekly = floor_freed * floor_days / _SBP_WEEK_DAYS
                    income = _overnight_income(freed_weekly, _SBP_WEEK_DAYS)
                else:
                    freed_amt = max(0, (CRR_WEEKLY_AVG - params["weekly_target"])) * self.deposit_base
                    income = _overnight_income(freed_amt, _SBP_WEEK_DAYS)

                # Expected penalty (audit AND non-compliant)
                non_comp = 1.0 - params["compliance_prob"]
                trigger = audit_prob * non_comp
                shortfall_amt = 0.002 * self.deposit_base
                penalty = trigger * _shortfall_penalty(shortfall_amt, _SBP_WEEK_DAYS)

                # Reputation cost for aggressive under scrutiny (PKR M)
                rep_cost = 0.0
                if strat == "Aggressive" and intensity == "High":
                    rep_cost = 20.0
                elif strat == "Aggressive" and intensity == "Medium":
                    rep_cost = 5.0

                bank_payoffs[i, j] = income - penalty - rep_cost
                sbp_payoffs[i, j] = (penalty + params["compliance_prob"] * compliance_value
                                     - audit_costs[intensity])

        equilibria = find_nash_equilibria(bank_payoffs, sbp_payoffs)

        # Format tables
        bank_table = []
        for i, strat in enumerate(self.BANK_STRATEGIES):
            row = {"strategy": strat, "params": self._STRATEGY_PARAMS[strat]}
            for j, intensity in enumerate(self.SBP_INTENSITIES):
                row[f"vs_{intensity.lower()}"] = round(float(bank_payoffs[i, j]), 0)
            bank_table.append(row)

        sbp_table = []
        for j, intensity in enumerate(self.SBP_INTENSITIES):
            row = {"intensity": intensity}
            for i, strat in enumerate(self.BANK_STRATEGIES):
                row[f"vs_{strat.lower()}"] = round(float(sbp_payoffs[i, j]), 0)
            sbp_table.append(row)

        nash_results = [{
            "bank_strategy": self.BANK_STRATEGIES[eq[0]],
            "sbp_intensity": self.SBP_INTENSITIES[eq[1]],
            "bank_payoff": round(float(bank_payoffs[eq[0], eq[1]]), 0),
            "sbp_payoff": round(float(sbp_payoffs[eq[0], eq[1]]), 0),
        } for eq in equilibria]

        mixed_results = self._compute_mixed_equilibria(bank_payoffs, sbp_payoffs)
        recommendation = self._recommend_strategy(bank_payoffs, equilibria, mixed_results)

        return _to_python({
            "bank_strategies": self.BANK_STRATEGIES,
            "sbp_intensities": self.SBP_INTENSITIES,
            "bank_payoff_matrix": bank_table,
            "sbp_payoff_matrix": sbp_table,
            "bank_payoffs_raw": bank_payoffs.tolist(),
            "sbp_payoffs_raw": sbp_payoffs.tolist(),
            "nash_equilibria": nash_results,
            "mixed_strategy_equilibria": mixed_results,
            "recommendation": recommendation,
        })

    def _compute_mixed_equilibria(self, bank_payoffs: np.ndarray,
                                  sbp_payoffs: np.ndarray) -> List[Dict[str, Any]]:
        """Compute mixed Nash equilibria for all 2x2 sub-games."""
        results = []
        for i1 in range(len(self.BANK_STRATEGIES)):
            for i2 in range(i1 + 1, len(self.BANK_STRATEGIES)):
                for j1 in range(len(self.SBP_INTENSITIES)):
                    for j2 in range(j1 + 1, len(self.SBP_INTENSITIES)):
                        sub_a = bank_payoffs[np.ix_([i1, i2], [j1, j2])]
                        sub_b = sbp_payoffs[np.ix_([i1, i2], [j1, j2])]
                        mixed = compute_mixed_nash_2x2(sub_a, sub_b)
                        if mixed is not None:
                            results.append({
                                "bank_strategies": [self.BANK_STRATEGIES[i1],
                                                    self.BANK_STRATEGIES[i2]],
                                "sbp_intensities": [self.SBP_INTENSITIES[j1],
                                                    self.SBP_INTENSITIES[j2]],
                                "bank_mix": [round(mixed["player_a_prob"][0], 4),
                                             round(mixed["player_a_prob"][1], 4)],
                                "sbp_mix": [round(mixed["player_b_prob"][0], 4),
                                            round(mixed["player_b_prob"][1], 4)],
                            })
        return results

    def _recommend_strategy(self, bank_payoffs: np.ndarray,
                            equilibria: List[Tuple[int, int]],
                            mixed_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate strategy recommendation based on game analysis."""
        worst_case = np.min(bank_payoffs, axis=1)
        maximin_idx = int(np.argmax(worst_case))
        maximin_strat = self.BANK_STRATEGIES[maximin_idx]
        expected = np.mean(bank_payoffs, axis=1)
        best_exp_idx = int(np.argmax(expected))
        nash_strat = self.BANK_STRATEGIES[equilibria[0][0]] if equilibria else None

        return {
            "maximin_strategy": maximin_strat,
            "maximin_payoff": round(float(worst_case[maximin_idx]), 0),
            "best_expected_strategy": self.BANK_STRATEGIES[best_exp_idx],
            "best_expected_payoff": round(float(expected[best_exp_idx]), 0),
            "nash_strategy": nash_strat,
            "rationale": (
                f"Maximin (worst-case safe) recommends '{maximin_strat}'. "
                f"Under uniform SBP audit assumption, "
                f"'{self.BANK_STRATEGIES[best_exp_idx]}' maximizes expected "
                f"weekly income at PKR {expected[best_exp_idx]:,.0f}. "
                f"Nash equilibrium suggests '{nash_strat or 'mixed strategy'}'."
            ),
        }


# ---------------------------------------------------------------------------
# Database query functions
# ---------------------------------------------------------------------------
def _ledger_crr_timeline(db: Session, weeks: int = 12) -> Optional[Dict[str, Any]]:
    """Build the weekly-timeline payload from the reconciled ledger (last `weeks`
    maintenance weeks). Returns None if the ledger is unavailable (caller falls back
    to the stale ORM table). Amounts PKR Millions; ratios in percent for display."""
    from sqlalchemy import text
    try:
        row = db.execute(
            text("SELECT MAX(date) FROM fact_gl_daily WHERE date <= :t"),
            {"t": str(datetime.date.today())},
        ).fetchone()
        as_of = row[0] if row and row[0] else None
        if not as_of:
            return None
        as_of_d = datetime.datetime.strptime(as_of, "%Y-%m-%d").date()
        start = _week_start(as_of_d - datetime.timedelta(weeks=weeks))
        rows = db.execute(
            text("SELECT date, SUM(crr_held_m) held, SUM(crr_required_m) req "
                 "FROM fact_gl_daily WHERE date >= :s AND date <= :e "
                 "GROUP BY date ORDER BY date"),
            {"s": str(start), "e": as_of},
        ).fetchall()
        if not rows:
            return None
        buckets: Dict[datetime.date, List[Tuple[str, float, float]]] = {}
        for r in rows:
            d = datetime.datetime.strptime(r.date, "%Y-%m-%d").date()
            buckets.setdefault(_week_start(d), []).append(
                (r.date, float(r.held or 0.0), float(r.req or 0.0)))
        tol = 0.001
        timeline = []
        for i, ws in enumerate(sorted(buckets), start=1):
            days = buckets[ws]
            deps = [(h / (q / CRR_WEEKLY_AVG)) if q else 0.0 for _, h, q in days]  # daily ratio
            avg_held = float(np.mean([h for _, h, _ in days]))
            avg_req = float(np.mean([q for _, _, q in days]))
            deposit = avg_req / CRR_WEEKLY_AVG if CRR_WEEKLY_AVG else 0.0
            weekly_avg = (avg_held / deposit) if deposit else 0.0
            excess = max(0.0, avg_held - avg_req)
            timeline.append({
                "week_number": i,
                "date_start": days[0][0],
                "date_end": days[-1][0],
                "days_reported": len(days),
                "daily_crr_ratios_pct": [round(x * 100, 2) for x in deps],
                "weekly_avg_crr_pct": round(weekly_avg * 100, 2),
                "is_compliant": avg_held >= avg_req * (1.0 - tol),
                "excess_crr_pct": round(max(0.0, weekly_avg - CRR_WEEKLY_AVG) * 100, 3),
                "freed_liquidity": round(excess, 0),
                "income_earned": round(_overnight_income(excess, _SBP_WEEK_DAYS), 0),
                "daily_details": [{
                    "date": dt,
                    "crr_ratio_pct": round((h / (q / CRR_WEEKLY_AVG)) * 100, 2) if q else 0.0,
                    "deposit_base": round(q / CRR_WEEKLY_AVG, 0) if q else 0.0,
                    "actual_crr": round(h, 0),
                    "excess_crr": round(max(0.0, h - q), 0),
                    "freed_liquidity": round(max(0.0, h - q), 0),
                    "income_earned": round(_overnight_income(max(0.0, h - q), 1), 0),
                    "is_compliant": h >= q * (1.0 - tol),
                } for dt, h, q in days],
            })
        return {
            "weeks_requested": weeks, "weeks_returned": len(timeline),
            "timeline": timeline,
            "thresholds": {"weekly_avg_pct": CRR_WEEKLY_AVG * 100,
                           "daily_min_pct": CRR_DAILY_MIN * 100},
            "data_source": "reconciled",
        }
    except Exception:
        return None


def get_crr_summary(db: Session) -> Dict[str, Any]:
    """
    Query CRRPosition table, compute current week status, historical
    compliance (52 weeks), freed liquidity, waste metrics, and optimal
    vs actual comparison.
    """
    try:
        today = datetime.date.today()
        current_week = _sbp_week_number(today)

        # Prefer the reconciled ledger (fact_gl_daily) so figures match the CFO/business
        # CRR view and aren't degenerate-zero from the stale crr_positions ORM table
        # (which ends 2025-03 — outside the trailing-52-week window). Note: CRR is a
        # WEEKLY-AVERAGE requirement, so intra-week timing frees no capital in aggregate;
        # the only genuine float is over-holding above requirement (excess_m), which is
        # ~0 when the bank tracks the requirement — a correct, well-managed outcome.
        lweeks = _ledger_crr_weeks(db, weeks_back=52)
        if lweeks:
            # Operational compliance tolerance: the weekly average must meet the
            # requirement within ~10bps. Without it, synthetic daily noise around an
            # essentially-exact 6% hold flips borderline weeks to "non-compliant".
            tol = 0.001
            def _compliant(w):
                return w["avg_held_m"] >= w["avg_req_m"] * (1.0 - tol)

            cur = lweeks[-1]
            current_avg = cur["avg_ratio"]
            current_compliant = _compliant(cur)
            current_excess = max(0.0, current_avg - CRR_WEEKLY_AVG)
            days_reported = cur["days"]

            compliant_weeks = sum(1 for w in lweeks if _compliant(w))
            total_weeks = len(lweeks)
            total_freed = sum(w["excess_m"] for w in lweeks)
            total_income = sum(_overnight_income(w["excess_m"], _SBP_WEEK_DAYS) for w in lweeks)
            excess_ratios = [max(0.0, w["avg_ratio"] - CRR_WEEKLY_AVG) for w in lweeks]
            avg_excess = float(np.mean(excess_ratios)) if excess_ratios else 0.0
            compliance_rate = compliant_weeks / total_weeks if total_weeks else 1.0
            deposit_base = float(np.mean([w["deposit_m"] for w in lweeks]))

            wasted_liquidity = avg_excess * deposit_base
            wasted_income = _overnight_income(wasted_liquidity, 365)
            weekly_freed_estimate = max(0.0, avg_excess) * deposit_base
            optimal_weekly_income = _overnight_income(weekly_freed_estimate, _SBP_WEEK_DAYS)
            actual_weekly_income = total_income / max(total_weeks, 1)

            return _to_python({
                "current_week": {
                    "week_number": current_week, "days_reported": days_reported,
                    "avg_crr_ratio_pct": round(current_avg * 100, 2),
                    "is_compliant": current_compliant,
                    "excess_crr_pct": round(current_excess * 100, 2),
                    "days_remaining": _days_remaining_in_sbp_week(today),
                },
                "historical": {
                    "total_weeks_analyzed": total_weeks,
                    "compliant_weeks": compliant_weeks,
                    "compliance_rate_pct": round(compliance_rate * 100, 2),
                    "total_freed_liquidity": round(total_freed, 0),
                    "total_income_earned": round(total_income, 0),
                    "avg_excess_crr_pct": round(avg_excess * 100, 3),
                    "wasted_liquidity_annual": round(wasted_liquidity, 0),
                    "wasted_income_annual": round(wasted_income, 0),
                },
                "comparison": {
                    "actual_avg_weekly_income": round(actual_weekly_income, 0),
                    "optimal_weekly_income": round(optimal_weekly_income, 0),
                    "income_gap": round(max(0, optimal_weekly_income - actual_weekly_income), 0),
                    "efficiency_pct": round(
                        (actual_weekly_income / optimal_weekly_income * 100)
                        if optimal_weekly_income > 0 else 100.0, 2),
                },
                "deposit_base": round(deposit_base, 0),
                "policy_rate_pct": POLICY_RATE * 100,
                "overnight_repo_rate_pct": OVERNIGHT_REPO_RATE * 100,
                "crr_weekly_avg_pct": CRR_WEEKLY_AVG * 100,
                "crr_daily_min_pct": CRR_DAILY_MIN * 100,
                "data_source": "reconciled",
            })

        # Fallback: stale ORM CRRPosition table
        current_week_positions = (
            db.query(CRRPosition)
            .filter(CRRPosition.week_number == current_week)
            .order_by(CRRPosition.date).all()
        )

        if current_week_positions:
            # DB stores crr_ratio as percentage (6.0 = 6%), convert to decimal (0.06)
            ratios = [p.crr_ratio / 100.0 for p in current_week_positions if p.crr_ratio]
            current_avg = float(np.mean(ratios)) if ratios else 0.0
            current_compliant = current_avg >= CRR_WEEKLY_AVG
            current_excess = max(0.0, current_avg - CRR_WEEKLY_AVG)
            days_reported = len(current_week_positions)
        else:
            current_avg, current_compliant, current_excess, days_reported = (
                CRR_WEEKLY_AVG, True, 0.0, 0)

        # Historical (last 52 weeks)
        cutoff = today - datetime.timedelta(weeks=52)
        historical = (
            db.query(CRRPosition).filter(CRRPosition.date >= cutoff)
            .order_by(CRRPosition.date).all()
        )

        weeks: Dict[int, List[CRRPosition]] = {}
        for pos in historical:
            weeks.setdefault(pos.week_number, []).append(pos)

        compliant_weeks, total_freed, total_income = 0, 0.0, 0.0
        excess_ratios = []
        for wk, positions in weeks.items():
            wk_ratios = [p.crr_ratio / 100.0 for p in positions if p.crr_ratio is not None]
            if wk_ratios:
                avg = float(np.mean(wk_ratios))
                if avg >= CRR_WEEKLY_AVG - 1e-9:
                    compliant_weeks += 1
                excess_ratios.append(max(0.0, avg - CRR_WEEKLY_AVG))
            for p in positions:
                total_freed += p.freed_liquidity or 0.0
                total_income += p.income_earned or 0.0

        total_weeks = len(weeks)
        compliance_rate = compliant_weeks / total_weeks if total_weeks > 0 else 1.0
        avg_excess = float(np.mean(excess_ratios)) if excess_ratios else 0.0

        # Deposit base from data or default
        deposit_base = _DEPOSIT_BASE
        db_vals = [p.deposit_base for p in historical if p.deposit_base]
        if db_vals:
            deposit_base = float(np.mean(db_vals))

        wasted_liquidity = avg_excess * deposit_base
        wasted_income = _overnight_income(wasted_liquidity, 365)

        # Optimal comparison — estimate without running full optimizer
        # Freed liquidity ≈ excess CRR above daily min deployed at overnight rate
        weekly_freed_estimate = max(0, avg_excess) * deposit_base
        optimal_weekly_income = _overnight_income(weekly_freed_estimate, _SBP_WEEK_DAYS)
        actual_weekly_income = total_income / max(total_weeks, 1)

        return _to_python({
            "current_week": {
                "week_number": current_week, "days_reported": days_reported,
                "avg_crr_ratio_pct": round(current_avg * 100, 2),
                "is_compliant": current_compliant,
                "excess_crr_pct": round(current_excess * 100, 2),
                "days_remaining": _days_remaining_in_sbp_week(today),
            },
            "historical": {
                "total_weeks_analyzed": total_weeks,
                "compliant_weeks": compliant_weeks,
                "compliance_rate_pct": round(compliance_rate * 100, 2),
                "total_freed_liquidity": round(total_freed, 0),
                "total_income_earned": round(total_income, 0),
                "avg_excess_crr_pct": round(avg_excess * 100, 3),
                "wasted_liquidity_annual": round(wasted_liquidity, 0),
                "wasted_income_annual": round(wasted_income, 0),
            },
            "comparison": {
                "actual_avg_weekly_income": round(actual_weekly_income, 0),
                "optimal_weekly_income": round(optimal_weekly_income, 0),
                "income_gap": round(max(0, optimal_weekly_income - actual_weekly_income), 0),
                "efficiency_pct": round(
                    (actual_weekly_income / optimal_weekly_income * 100)
                    if optimal_weekly_income > 0 else 100.0, 2),
            },
            "deposit_base": round(deposit_base, 0),
            "policy_rate_pct": POLICY_RATE * 100,
            "overnight_repo_rate_pct": OVERNIGHT_REPO_RATE * 100,
            "crr_weekly_avg_pct": CRR_WEEKLY_AVG * 100,
            "crr_daily_min_pct": CRR_DAILY_MIN * 100,
            "data_source": "snapshot",
        })
    except Exception as exc:
        logger.error("Error computing CRR summary: %s", exc, exc_info=True)
        return {"error": str(exc), "current_week": {}, "historical": {}, "comparison": {}}


def get_crr_weekly_timeline(db: Session, weeks: int = 12) -> Dict[str, Any]:
    """Return last N weeks of CRR data for frontend timeline chart."""
    try:
        today = datetime.date.today()

        # Prefer the reconciled ledger so the timeline chart isn't blank (the stale
        # CRRPosition ORM table ends 2025-03, outside the window).
        ledger_tl = _ledger_crr_timeline(db, weeks)
        if ledger_tl is not None:
            return _to_python(ledger_tl)

        start_date = today - datetime.timedelta(weeks=weeks)
        positions = (
            db.query(CRRPosition).filter(CRRPosition.date >= start_date)
            .order_by(CRRPosition.date).all()
        )

        week_data: Dict[int, List[CRRPosition]] = {}
        for pos in positions:
            week_data.setdefault(pos.week_number, []).append(pos)

        timeline = []
        for wk in sorted(week_data.keys()):
            wk_pos = sorted(week_data[wk], key=lambda p: p.date)
            dates = [p.date.isoformat() for p in wk_pos]
            # DB stores crr_ratio as percentage (6.0 = 6%), keep as-is for display
            daily_ratios = [round(p.crr_ratio or 0.0, 2) for p in wk_pos]
            wk_ratios = [p.crr_ratio / 100.0 for p in wk_pos if p.crr_ratio is not None]
            weekly_avg = float(np.mean(wk_ratios)) if wk_ratios else 0.0
            freed = sum(p.freed_liquidity or 0.0 for p in wk_pos)
            income = sum(p.income_earned or 0.0 for p in wk_pos)
            compliant = weekly_avg >= CRR_WEEKLY_AVG - 1e-9

            daily_details = [{
                "date": p.date.isoformat(),
                "crr_ratio_pct": round(p.crr_ratio or 0.0, 2),
                "deposit_base": round(p.deposit_base or 0.0, 0),
                "actual_crr": round(p.actual_crr or 0.0, 0),
                "excess_crr": round(p.excess_crr or 0.0, 0),
                "freed_liquidity": round(p.freed_liquidity or 0.0, 0),
                "income_earned": round(p.income_earned or 0.0, 0),
                "is_compliant": p.is_compliant,
            } for p in wk_pos]

            timeline.append({
                "week_number": wk,
                "date_start": dates[0] if dates else None,
                "date_end": dates[-1] if dates else None,
                "days_reported": len(wk_pos),
                "daily_crr_ratios_pct": daily_ratios,
                "weekly_avg_crr_pct": round(weekly_avg * 100, 2),
                "is_compliant": compliant,
                "excess_crr_pct": round(max(0.0, weekly_avg - CRR_WEEKLY_AVG) * 100, 3),
                "freed_liquidity": round(freed, 0),
                "income_earned": round(income, 0),
                "daily_details": daily_details,
            })

        return _to_python({
            "weeks_requested": weeks, "weeks_returned": len(timeline),
            "timeline": timeline,
            "thresholds": {"weekly_avg_pct": CRR_WEEKLY_AVG * 100,
                           "daily_min_pct": CRR_DAILY_MIN * 100},
        })
    except Exception as exc:
        logger.error("Error computing CRR timeline: %s", exc, exc_info=True)
        return {"error": str(exc), "weeks_requested": weeks,
                "weeks_returned": 0, "timeline": []}


def get_optimal_schedule(db: Session) -> Dict[str, Any]:
    """Run CRR optimizer on current state, return 7-day optimal schedule + game theory."""
    try:
        today = datetime.date.today()
        current_week = _sbp_week_number(today)
        current_positions = (
            db.query(CRRPosition)
            .filter(CRRPosition.week_number == current_week)
            .order_by(CRRPosition.date).all()
        )

        if current_positions:
            dep_vals = [p.deposit_base for p in current_positions if p.deposit_base]
            deposit_base = float(np.mean(dep_vals)) if dep_vals else _DEPOSIT_BASE
            # DB stores crr_ratio as percentage (6.0 = 6%), convert to decimal (0.06)
            crr_ratios = [p.crr_ratio / 100.0 for p in current_positions if p.crr_ratio is not None]
            days_elapsed = len(crr_ratios)
            crr_sum = sum(crr_ratios)
            current_crr_deposits = (current_positions[-1].actual_crr or 0.0)
        else:
            deposit_base, days_elapsed, crr_sum, current_crr_deposits = (
                _DEPOSIT_BASE, 0, 0.0, 0.0)

        # Cap days_remaining so total SBP week never exceeds 7 days
        days_remaining = max(1, min(
            _days_remaining_in_sbp_week(today),
            _SBP_WEEK_DAYS - days_elapsed,
        ))

        optimizer = CRRFloatOptimizer(deposit_base=deposit_base)
        result = optimizer.optimize(
            deposit_base=deposit_base, current_crr_deposits=current_crr_deposits,
            days_remaining_in_week=days_remaining,
            days_elapsed_crr_sum=crr_sum, days_elapsed=days_elapsed,
        )

        game = CRRStrategyGame(deposit_base=deposit_base)
        result["current_state"] = {
            "week_number": current_week,
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
            "elapsed_crr_ratios": [round(p.crr_ratio or 0.0, 2)
                                   for p in current_positions],
            "elapsed_avg_crr_pct": round(
                (crr_sum / days_elapsed * 100) if days_elapsed > 0 else 0.0, 2),
            "deposit_base": round(deposit_base, 0),
        }
        result["game_theory"] = game.build_payoff_matrices()
        return _to_python(result)

    except Exception as exc:
        logger.error("Error computing optimal CRR schedule: %s", exc, exc_info=True)
        return {"error": str(exc), "optimal_schedule": [],
                "current_state": {}, "game_theory": {}}
