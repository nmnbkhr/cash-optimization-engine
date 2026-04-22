"""
UC-05: Nostro Balance Optimization
====================================
Optimizes UBL's 35 correspondent bank nostro accounts across 7 currencies
using MDP value iteration, Nash bargaining for minimum balance negotiations,
and FX carry trade analysis.

Classes:
    NostroOptimizer      - Multi-currency MDP solved via value iteration
    NostroNashBargaining - Closed-form Nash bargaining for minimum negotiations
    FXCarryAnalyzer      - Carry trade opportunity analysis per currency
Functions:
    get_nostro_summary, get_nostro_portfolio, get_currency_breakdown
"""
import logging
import datetime
from typing import Any, Dict, List

import numpy as np
from sqlalchemy.orm import Session

from app.core.constants import POLICY_RATE, OVERNIGHT_REPO_RATE
from app.core.game_theory import find_nash_equilibria, compute_mixed_nash_2x2
from app.database import SessionLocal
from app.models.nostro_account import NostroAccount

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FX_RATES_PKR = {
    "USD": 278.0, "EUR": 302.0, "GBP": 352.0,
    "AED": 75.7, "SAR": 74.1, "CNY": 38.3, "JPY": 1.86,
}
FOREIGN_OVERNIGHT_RATES = {
    "USD": 0.053, "EUR": 0.039, "GBP": 0.052,
    "AED": 0.051, "SAR": 0.055, "CNY": 0.018, "JPY": 0.001,
}
_DAYS_PER_YEAR = 365
_GAMMA = 0.95
_MAX_VI_ITER = 100
_VI_TOL = 1e-6
_BAL_LEVELS = 7
_OBL_LEVELS = 3
_FX_REGIMES = 3
_ACTIONS = ["hold", "transfer_in", "overnight_deposit", "repatriate", "pre_fund"]
_N_ACT = len(_ACTIONS)
_TRANSFER_COST = 0.001
_FX_RISK_ANN = 0.08
_BELOW_MIN_PEN = 0.002
_PREFUND_PREM = 0.0005
_UBL_POWER = 0.45
_CORR_POWER = 0.55
_OBL_FRACTIONS = [0.05, 0.15, 0.30]
_OBL_TRANS = [
    np.array([0.6, 0.3, 0.1]),
    np.array([0.2, 0.5, 0.3]),
    np.array([0.1, 0.3, 0.6]),
]
_FX_TRANS = [
    np.array([0.5, 0.35, 0.15]),
    np.array([0.2, 0.6, 0.2]),
    np.array([0.15, 0.35, 0.5]),
]
_EMPTY_BARGAIN = {
    "negotiated_minimum": 0.0, "reduction": 0.0, "reduction_pct": 0.0,
    "ubl_annual_savings_pkr": 0.0, "correspondent_annual_cost": 0.0, "nash_surplus": 0.0,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_py(val):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    if isinstance(val, dict):
        return {k: _to_py(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_to_py(v) for v in val]
    return val


def _fcy_income(amount: float, ccy: str, days: int = 1) -> float:
    return amount * FOREIGN_OVERNIGHT_RATES.get(ccy, 0.0) / _DAYS_PER_YEAR * days


def _pkr_income(amount_pkr: float, days: int = 1) -> float:
    return amount_pkr * OVERNIGHT_REPO_RATE / _DAYS_PER_YEAR * days


def _hhi(shares: List[float]) -> float:
    total = sum(shares)
    if total <= 0:
        return 0.0
    return sum((s / total) ** 2 for s in shares)


# ---------------------------------------------------------------------------
# NostroOptimizer — MDP Value Iteration
# ---------------------------------------------------------------------------
class NostroOptimizer:
    """
    35 correspondent banks, 7 currencies.
    State: (balance_level, obligation_level, fx_regime)
    Actions: hold, transfer_in, overnight_deposit, repatriate, pre_fund
    FX modeled via GARCH-like volatility (numpy). Solved via value iteration.
    """

    def __init__(self):
        self.n_states = _BAL_LEVELS * _OBL_LEVELS * _FX_REGIMES
        self.n_actions = _N_ACT

    def _si(self, b: int, o: int, f: int) -> int:
        return b * (_OBL_LEVELS * _FX_REGIMES) + o * _FX_REGIMES + f

    def _decode(self, s: int):
        f = s % _FX_REGIMES
        r = s // _FX_REGIMES
        return r // _OBL_LEVELS, r % _OBL_LEVELS, f

    def _bal_mult(self, lvl: int) -> float:
        return 0.5 + lvl * (1.5 / max(_BAL_LEVELS - 1, 1))

    def _build_rewards(self, acct: NostroAccount) -> np.ndarray:
        req = max(acct.required_minimum, 1.0)
        ccy, fx = acct.currency, FX_RATES_PKR.get(acct.currency, 1.0)
        fvd = _FX_RISK_ANN / np.sqrt(_DAYS_PER_YEAR)
        R = np.zeros((self.n_states, self.n_actions))
        for s in range(self.n_states):
            bl, ol, fr = self._decode(s)
            bal = req * self._bal_mult(bl)
            of = _OBL_FRACTIONS[ol]
            drift = [-fvd, 0.0, fvd][fr]
            excess, deficit = max(bal - req, 0.0), max(req - bal, 0.0)
            # hold
            R[s, 0] = _fcy_income(bal, ccy) - abs(drift) * bal * 0.5 - deficit * _BELOW_MIN_PEN
            # transfer_in
            ta = max(req * 0.3, deficit)
            R[s, 1] = -ta * _TRANSFER_COST - _pkr_income(ta * fx) + (deficit * _BELOW_MIN_PEN * 0.8 if deficit > 0 else 0)
            # overnight_deposit
            R[s, 2] = _fcy_income(excess * 0.8, ccy) - abs(drift) * bal * 0.3 - deficit * _BELOW_MIN_PEN
            # repatriate
            ra = excess * 0.7
            rr = _pkr_income(ra * fx) - ra * _TRANSFER_COST
            if fr == 0:
                rr += ra * fvd * 0.5
            elif fr == 2:
                rr -= ra * fvd * 0.3
            R[s, 3] = rr - (deficit * _BELOW_MIN_PEN * 1.5 if deficit > 0 else 0)
            # pre_fund
            pa = req * of
            R[s, 4] = -pa * (_TRANSFER_COST + _PREFUND_PREM) - _pkr_income(pa * fx) + pa * _BELOW_MIN_PEN * of * 5
        return R

    def _build_transitions(self) -> np.ndarray:
        T = np.zeros((self.n_states, self.n_actions, self.n_states))
        bal_shift = [0, 1, 0, -1, 1]  # per action
        for s in range(self.n_states):
            bl, ol, fr = self._decode(s)
            for a in range(self.n_actions):
                nb = max(0, min(bl + bal_shift[a], _BAL_LEVELS - 1))
                for no in range(_OBL_LEVELS):
                    for nf in range(_FX_REGIMES):
                        T[s, a, self._si(nb, no, nf)] += _OBL_TRANS[ol][no] * _FX_TRANS[fr][nf]
        return T

    def _value_iteration(self, R: np.ndarray, T: np.ndarray):
        V = np.zeros(self.n_states)
        policy = np.zeros(self.n_states, dtype=int)
        for _ in range(_MAX_VI_ITER):
            Vn = np.zeros(self.n_states)
            for s in range(self.n_states):
                qv = R[s] + _GAMMA * T[s] @ V
                policy[s] = int(np.argmax(qv))
                Vn[s] = qv[policy[s]]
            if np.max(np.abs(Vn - V)) < _VI_TOL:
                return Vn, policy
            V = Vn
        return V, policy

    def _classify(self, acct: NostroAccount) -> int:
        req = max(acct.required_minimum, 1.0)
        ratio = acct.balance / req if req > 0 else 1.0
        bl = max(0, min(int(round((ratio - 0.5) / (1.5 / max(_BAL_LEVELS - 1, 1)))), _BAL_LEVELS - 1))
        er = (acct.excess_balance or 0) / req if req > 0 else 0.5
        ol = 0 if er > 0.3 else (1 if er > 0.1 else 2)
        return self._si(bl, ol, 1)  # default stable FX regime

    def optimize_account(self, acct: NostroAccount) -> Dict[str, Any]:
        """Run MDP for a single nostro account."""
        try:
            R = self._build_rewards(acct)
            T = self._build_transitions()
            V, pol = self._value_iteration(R, T)
            cs = self._classify(acct)
            action = _ACTIONS[pol[cs]]
            req = max(acct.required_minimum, 1.0)
            bal, fx = acct.balance, FX_RATES_PKR.get(acct.currency, 1.0)
            excess, deficit = max(bal - req, 0.0), max(req - bal, 0.0)
            # Rebalancing
            r_amt, r_dir = 0.0, "none"
            if action == "repatriate" and excess > 0:
                r_amt, r_dir = excess * 0.7, "repatriate_to_pkr"
            elif action == "transfer_in":
                r_amt, r_dir = max(req * 0.3, deficit), "fund_from_pkr"
            elif action == "pre_fund":
                r_amt, r_dir = req * 0.15, "fund_from_pkr"
            # Q-values
            avs = {_ACTIONS[a]: round(float(R[cs, a] + _GAMMA * T[cs, a] @ V), 4) for a in range(self.n_actions)}
            return _to_py({
                "account_id": acct.id, "bank_name": acct.bank_name,
                "currency": acct.currency, "balance": round(bal, 2),
                "required_minimum": round(req, 2),
                "excess": round(excess, 2), "deficit": round(deficit, 2),
                "optimal_action": action,
                "expected_daily_value": round(float(V[cs]), 4),
                "action_values": avs,
                "rebalance": {"direction": r_dir, "amount_fcy": round(r_amt, 2), "amount_pkr": round(r_amt * fx, 0)},
                "balance_to_minimum_ratio": round(bal / req, 2) if req > 0 else 0.0,
                "pkr_equivalent_balance": round(bal * fx, 0),
                "pkr_equivalent_excess": round(excess * fx, 0),
            })
        except Exception as exc:
            logger.error("Error optimizing account %s: %s", acct.id, exc, exc_info=True)
            return {"account_id": acct.id, "bank_name": getattr(acct, "bank_name", "?"),
                    "currency": getattr(acct, "currency", "?"), "error": str(exc)}

    def optimize_all(self, db: Session) -> Dict[str, Any]:
        """Optimize all nostro accounts, return portfolio summary."""
        try:
            accounts = db.query(NostroAccount).all()
            if not accounts:
                return {"error": "No nostro accounts found", "accounts": [], "summary": {}}
            results, tot_ex, tot_rep, tot_fund = [], 0.0, 0.0, 0.0
            act_cnt = {a: 0 for a in _ACTIONS}
            for acct in accounts:
                res = self.optimize_account(acct)
                results.append(res)
                if "error" not in res:
                    act_cnt[res["optimal_action"]] += 1
                    tot_ex += res.get("pkr_equivalent_excess", 0.0)
                    rb = res.get("rebalance", {})
                    if rb.get("direction") == "repatriate_to_pkr":
                        tot_rep += rb.get("amount_pkr", 0.0)
                    elif rb.get("direction") == "fund_from_pkr":
                        tot_fund += rb.get("amount_pkr", 0.0)
            return _to_py({
                "accounts": results,
                "summary": {
                    "total_accounts": len(accounts),
                    "total_excess_pkr": round(tot_ex, 0),
                    "total_repatriate_pkr": round(tot_rep, 0),
                    "total_fund_pkr": round(tot_fund, 0),
                    "net_rebalance_pkr": round(tot_rep - tot_fund, 0),
                    "potential_annual_income_pkr": round(tot_rep * OVERNIGHT_REPO_RATE, 0),
                    "action_distribution": act_cnt,
                },
            })
        except Exception as exc:
            logger.error("Error in optimize_all: %s", exc, exc_info=True)
            return {"error": str(exc), "accounts": [], "summary": {}}


# ---------------------------------------------------------------------------
# NostroNashBargaining
# ---------------------------------------------------------------------------
class NostroNashBargaining:
    """
    Nash bargaining for minimum balance negotiations with correspondent banks.
    UBL wants low minimum (frees capital). Correspondent wants high minimum (cheap funding).
    """

    def __init__(self, ubl_power: float = _UBL_POWER, corr_power: float = _CORR_POWER):
        self.ubl_power = ubl_power
        self.corr_power = corr_power
        self.optimizer = NostroOptimizer()

    def _optimal_minimum(self, acct: NostroAccount) -> float:
        result = self.optimizer.optimize_account(acct)
        action = result.get("optimal_action", "hold")
        req = max(acct.required_minimum, 1.0)
        factors = {"repatriate": 0.65, "hold": 0.85, "overnight_deposit": 0.85,
                   "transfer_in": 1.0, "pre_fund": 1.0}
        return req * factors.get(action, 0.85)

    def _bargain(self, cur_min: float, opt_min: float, acct: NostroAccount) -> Dict[str, Any]:
        fx = FX_RATES_PKR.get(acct.currency, 1.0)
        fr = FOREIGN_OVERNIGHT_RATES.get(acct.currency, 0.0)
        red = cur_min - opt_min
        if red <= 0:
            return {**_EMPTY_BARGAIN, "negotiated_minimum": cur_min}
        ubl_mb = fx * OVERNIGHT_REPO_RATE
        corr_mc = fr * 0.5
        surplus = red * (ubl_mb - corr_mc)
        if surplus <= 0:
            return {**_EMPTY_BARGAIN, "negotiated_minimum": cur_min}
        nr = red * self.ubl_power
        return {
            "negotiated_minimum": round(float(cur_min - nr), 2),
            "reduction": round(float(nr), 2),
            "reduction_pct": round(float(nr / cur_min * 100), 2),
            "ubl_annual_savings_pkr": round(float(nr * fx * OVERNIGHT_REPO_RATE), 0),
            "correspondent_annual_cost": round(float(nr * fr * 0.5), 2),
            "nash_surplus": round(float(surplus), 2),
        }

    def negotiate_minimums(self, db: Session) -> Dict[str, Any]:
        """Compute Nash bargaining recommendations for all accounts."""
        try:
            accounts = db.query(NostroAccount).all()
            if not accounts:
                return {"error": "No nostro accounts found", "negotiations": []}
            negs, total_sav = [], 0.0
            for acct in accounts:
                try:
                    cm = max(acct.required_minimum, 1.0)
                    om = self._optimal_minimum(acct)
                    br = self._bargain(cm, om, acct)
                    negs.append({
                        "account_id": acct.id, "bank_name": acct.bank_name,
                        "currency": acct.currency, "country": acct.country,
                        "current_minimum": round(cm, 2),
                        "ubl_optimal_minimum": round(float(om), 2),
                        "bargaining_result": br,
                    })
                    total_sav += br.get("ubl_annual_savings_pkr", 0.0)
                except Exception as ie:
                    logger.warning("Negotiation error for %s: %s", acct.id, ie)
                    negs.append({"account_id": acct.id, "bank_name": acct.bank_name,
                                 "currency": acct.currency, "error": str(ie)})
            return _to_py({
                "negotiations": negs,
                "total_annual_savings_pkr": round(total_sav, 0),
                "ubl_bargaining_power": self.ubl_power,
                "correspondent_bargaining_power": self.corr_power,
                "accounts_analyzed": len(negs),
            })
        except Exception as exc:
            logger.error("Error in negotiate_minimums: %s", exc, exc_info=True)
            return {"error": str(exc), "negotiations": []}


# ---------------------------------------------------------------------------
# FXCarryAnalyzer
# ---------------------------------------------------------------------------
class FXCarryAnalyzer:
    """Carry trade analysis: PKR rate vs foreign overnight rates per currency."""

    def analyze_carry(self, db: Session) -> Dict[str, Any]:
        """Currency-level carry analysis with recommendations."""
        try:
            accounts = db.query(NostroAccount).all()
            if not accounts:
                return {"error": "No nostro accounts found", "currencies": []}
            cdata: Dict[str, Dict[str, float]] = {}
            for a in accounts:
                c = a.currency
                if c not in cdata:
                    cdata[c] = {"bal": 0.0, "exc": 0.0, "req": 0.0, "cnt": 0, "rsum": 0.0}
                d = cdata[c]
                d["bal"] += a.balance or 0.0
                d["exc"] += a.excess_balance or 0.0
                d["req"] += a.required_minimum or 0.0
                d["cnt"] += 1
                d["rsum"] += a.overnight_rate or 0.0
            currencies, total_ci = [], 0.0
            for ccy, d in sorted(cdata.items()):
                fx = FX_RATES_PKR.get(ccy, 1.0)
                fr = FOREIGN_OVERNIGHT_RATES.get(ccy, 0.0)
                avg_r = d["rsum"] / d["cnt"] if d["cnt"] > 0 else fr
                eff_r = max(avg_r, fr)
                spread = OVERNIGHT_REPO_RATE - eff_r
                exc_pkr = d["exc"] * fx
                ci = exc_pkr * spread if spread > 0 else 0.0
                oc = abs(exc_pkr * spread) if spread < 0 else 0.0
                total_ci += ci
                if spread > 0.03:
                    rec = "Strongly repatriate excess to PKR"
                elif spread > 0.01:
                    rec = "Repatriate excess, maintain minimum"
                elif spread > -0.01:
                    rec = "Hold current levels, monitor FX"
                else:
                    rec = "Consider increasing FCY deposits"
                currencies.append({
                    "currency": ccy, "fx_rate_pkr": fx,
                    "foreign_overnight_rate_pct": round(eff_r * 100, 2),
                    "pkr_overnight_rate_pct": round(OVERNIGHT_REPO_RATE * 100, 2),
                    "carry_spread_pct": round(spread * 100, 2),
                    "carry_direction": "positive" if spread > 0 else "negative",
                    "total_balance_fcy": round(d["bal"], 2),
                    "total_excess_fcy": round(d["exc"], 2),
                    "total_balance_pkr": round(d["bal"] * fx, 0),
                    "total_excess_pkr": round(d["exc"] * fx, 0),
                    "annual_carry_income_pkr": round(ci, 0),
                    "annual_opportunity_cost_pkr": round(oc, 0),
                    "account_count": d["cnt"],
                    "recommendation": rec,
                })
            currencies.sort(key=lambda x: x["annual_carry_income_pkr"], reverse=True)
            return _to_py({
                "currencies": currencies,
                "total_annual_carry_income_pkr": round(total_ci, 0),
                "pkr_policy_rate_pct": round(POLICY_RATE * 100, 2),
                "pkr_overnight_rate_pct": round(OVERNIGHT_REPO_RATE * 100, 2),
                "analysis_date": datetime.date.today().isoformat(),
            })
        except Exception as exc:
            logger.error("Error in carry analysis: %s", exc, exc_info=True)
            return {"error": str(exc), "currencies": []}


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------
def get_nostro_summary(db: Session) -> Dict[str, Any]:
    """Compute total balances by currency, excess, repatriation income, HHI, compliance."""
    try:
        accounts = db.query(NostroAccount).all()
        if not accounts:
            return {"error": "No nostro accounts found", "currencies": {},
                    "totals": {}, "concentration": {}, "compliance": {}}
        by_ccy: Dict[str, Dict[str, Any]] = {}
        by_bank: Dict[str, float] = {}
        tot_bal, tot_exc = 0.0, 0.0
        below_min = []
        for acct in accounts:
            ccy = acct.currency
            fx = FX_RATES_PKR.get(ccy, 1.0)
            bp = (acct.balance or 0.0) * fx
            ep = (acct.excess_balance or 0.0) * fx
            if ccy not in by_ccy:
                by_ccy[ccy] = {"total_balance_fcy": 0.0, "total_balance_pkr": 0.0,
                               "total_excess_fcy": 0.0, "total_excess_pkr": 0.0,
                               "total_required_fcy": 0.0, "account_count": 0, "fx_rate_pkr": fx}
            d = by_ccy[ccy]
            d["total_balance_fcy"] += acct.balance or 0.0
            d["total_balance_pkr"] += bp
            d["total_excess_fcy"] += acct.excess_balance or 0.0
            d["total_excess_pkr"] += ep
            d["total_required_fcy"] += acct.required_minimum or 0.0
            d["account_count"] += 1
            tot_bal += bp
            tot_exc += ep
            by_bank[acct.bank_name] = by_bank.get(acct.bank_name, 0.0) + bp
            if (acct.balance or 0.0) < (acct.required_minimum or 0.0):
                sf = (acct.required_minimum or 0.0) - (acct.balance or 0.0)
                below_min.append({
                    "account_id": acct.id, "bank_name": acct.bank_name,
                    "currency": ccy, "balance": round(acct.balance or 0.0, 2),
                    "required_minimum": round(acct.required_minimum or 0.0, 2),
                    "shortfall": round(sf, 2), "shortfall_pkr": round(sf * fx, 0),
                })
        for d in by_ccy.values():
            for k in d:
                if isinstance(d[k], float):
                    d[k] = round(d[k], 2) if "fcy" in k else round(d[k], 0)
        hhi_c = _hhi([d["total_balance_pkr"] for d in by_ccy.values()])
        hhi_b = _hhi(list(by_bank.values()))
        return _to_py({
            "currencies": by_ccy,
            "totals": {
                "total_balance_pkr": round(tot_bal, 0),
                "total_excess_pkr": round(tot_exc, 0),
                "total_accounts": len(accounts),
                "potential_repatriation_income_annual_pkr": round(tot_exc * OVERNIGHT_REPO_RATE, 0),
            },
            "concentration": {
                "hhi_by_currency": round(hhi_c, 4), "hhi_by_bank": round(hhi_b, 4),
                "currency_count": len(by_ccy), "bank_count": len(by_bank),
                "hhi_interpretation": ("Concentrated" if hhi_c > 0.25
                                       else "Moderate" if hhi_c > 0.15 else "Diversified"),
            },
            "compliance": {
                "accounts_below_minimum": len(below_min),
                "total_shortfall_pkr": round(sum(a["shortfall_pkr"] for a in below_min), 0),
                "details": below_min,
            },
            "rates": {
                "pkr_policy_rate_pct": round(POLICY_RATE * 100, 2),
                "pkr_overnight_rate_pct": round(OVERNIGHT_REPO_RATE * 100, 2),
                "fx_rates_pkr": FX_RATES_PKR,
            },
        })
    except Exception as exc:
        logger.error("Error computing nostro summary: %s", exc, exc_info=True)
        return {"error": str(exc), "currencies": {}, "totals": {},
                "concentration": {}, "compliance": {}}


def get_nostro_portfolio(db: Session) -> Dict[str, Any]:
    """Return all nostro accounts with MDP optimization recommendations."""
    try:
        return NostroOptimizer().optimize_all(db)
    except Exception as exc:
        logger.error("Error computing nostro portfolio: %s", exc, exc_info=True)
        return {"error": str(exc), "accounts": [], "summary": {}}


def get_currency_breakdown(db: Session) -> Dict[str, Any]:
    """Return currency-level aggregation for frontend treemap/table."""
    try:
        accounts = db.query(NostroAccount).all()
        if not accounts:
            return {"error": "No nostro accounts found", "breakdown": []}
        cmap: Dict[str, Dict[str, Any]] = {}
        for acct in accounts:
            ccy = acct.currency
            fx = FX_RATES_PKR.get(ccy, 1.0)
            if ccy not in cmap:
                cmap[ccy] = {
                    "currency": ccy, "fx_rate_pkr": fx,
                    "total_balance_fcy": 0.0, "total_balance_pkr": 0.0,
                    "total_excess_fcy": 0.0, "total_excess_pkr": 0.0,
                    "total_required_fcy": 0.0, "account_count": 0, "banks": [],
                    "foreign_overnight_rate_pct": round(FOREIGN_OVERNIGHT_RATES.get(ccy, 0.0) * 100, 2),
                    "carry_spread_pct": round((OVERNIGHT_REPO_RATE - FOREIGN_OVERNIGHT_RATES.get(ccy, 0.0)) * 100, 2),
                }
            d = cmap[ccy]
            d["total_balance_fcy"] += acct.balance or 0.0
            d["total_balance_pkr"] += (acct.balance or 0.0) * fx
            d["total_excess_fcy"] += acct.excess_balance or 0.0
            d["total_excess_pkr"] += (acct.excess_balance or 0.0) * fx
            d["total_required_fcy"] += acct.required_minimum or 0.0
            d["account_count"] += 1
            d["banks"].append({
                "account_id": acct.id, "bank_name": acct.bank_name,
                "country": acct.country,
                "balance": round(acct.balance or 0.0, 2),
                "required_minimum": round(acct.required_minimum or 0.0, 2),
                "excess": round(acct.excess_balance or 0.0, 2),
                "overnight_rate_pct": round((acct.overnight_rate or 0.0) * 100, 3),
                "balance_pkr": round((acct.balance or 0.0) * fx, 0),
            })
        breakdown, tot = [], 0.0
        for ccy, d in sorted(cmap.items(), key=lambda x: x[1]["total_balance_pkr"], reverse=True):
            for k in ("total_balance_fcy", "total_excess_fcy", "total_required_fcy"):
                d[k] = round(d[k], 2)
            for k in ("total_balance_pkr", "total_excess_pkr"):
                d[k] = round(d[k], 0)
            tot += d["total_balance_pkr"]
            breakdown.append(d)
        for d in breakdown:
            d["portfolio_share_pct"] = round(d["total_balance_pkr"] / tot * 100, 2) if tot > 0 else 0.0
        return _to_py({
            "breakdown": breakdown, "total_portfolio_pkr": round(tot, 0),
            "currency_count": len(breakdown), "total_accounts": len(accounts),
        })
    except Exception as exc:
        logger.error("Error computing currency breakdown: %s", exc, exc_info=True)
        return {"error": str(exc), "breakdown": []}
