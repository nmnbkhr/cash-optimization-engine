"""
UC-06: Vostro Liability Optimization
======================================
Vostro accounts are held BY foreign banks AT UBL. These are liabilities on
UBL's books, but UBL can deploy the stable portion to earn income (T-bills,
overnight repo) while keeping enough liquidity to honour withdrawals.

Classes:
    VostroLaREngine            - Liquidity-at-Risk via Monte Carlo simulation
    VostroDeploymentOptimizer  - Optimal split: T-bills / overnight / buffer
    VostroCooperativeGame      - Shapley-based benefit allocation from pooling
Functions:
    get_vostro_summary, get_vostro_portfolio, get_deployment_breakdown
"""
import logging
import datetime
from typing import Any, Dict, List

import numpy as np
from sqlalchemy.orm import Session

from app.core.constants import POLICY_RATE, OVERNIGHT_REPO_RATE
from app.core.game_theory import shapley_value
from app.models.vostro_account import VostroAccount

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_DAYS_YEAR = 365
_MC_SIMS = 1000
_HORIZONS = [1, 7, 30]
_CONF_LEVELS = [0.99, 0.95]
_BUFFER_PCT = 0.05          # 5% safety buffer kept undeployed
_TBILL_YIELD = 0.10         # ~10% annual on T-bills
_OVERNIGHT_YIELD = OVERNIGHT_REPO_RATE  # 10.5%
_MAX_COOP_PLAYERS = 15      # cap for Shapley (2^n coalitions)
_CORR_FACTOR = 0.3          # cross-account outflow correlation
_SEED = 42

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _py(val):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    if isinstance(val, dict):
        return {k: _py(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_py(v) for v in val]
    return val


def _hhi(shares: List[float]) -> float:
    t = sum(shares)
    return sum((s / t) ** 2 for s in shares) if t > 0 else 0.0


def _div(a: float, b: float, d: float = 0.0) -> float:
    return a / b if b != 0 else d


# ---------------------------------------------------------------------------
# VostroLaREngine - Liquidity-at-Risk via Monte Carlo
# ---------------------------------------------------------------------------
class VostroLaREngine:
    """
    LaR = 99th percentile of outflow distribution (1d, 7d, 30d).
    Stable portion -> T-bills (higher yield). Volatile -> overnight (liquid).
    ALL pure statistics. No API.
    """

    def __init__(self, n_sims: int = _MC_SIMS, seed: int = _SEED):
        self.n_sims = n_sims
        self.rng = np.random.default_rng(seed)

    def compute_lar(self, account: VostroAccount) -> Dict[str, Any]:
        """Simulate outflow distribution for a single vostro account."""
        try:
            balance = account.balance or 0.0
            vol = account.volatility if account.volatility and account.volatility > 0 else 0.02
            if balance <= 0:
                return self._empty_lar(account)

            lar = {}
            for h in _HORIZONS:
                drift = -0.001 * balance
                sigma = vol * balance
                changes = self.rng.normal(drift, sigma, (self.n_sims, h))
                outflows = np.maximum(-np.sum(changes, axis=1), 0.0)
                for c in _CONF_LEVELS:
                    lar[f"lar_{int(c*100)}_{h}d"] = round(float(np.percentile(outflows, c * 100)), 2)

            lar_99_30d = min(lar.get("lar_99_30d", balance), balance)
            stable = max(balance - lar_99_30d, 0.0)
            return _py({
                "account_id": account.id, "bank_name": account.bank_name,
                "currency": account.currency, "country": account.country,
                "balance": round(balance, 2), "volatility": round(vol, 4),
                "lar": lar, "stable_portion": round(stable, 2),
                "volatile_portion": round(lar_99_30d, 2),
                "stable_pct": round(_div(stable, balance) * 100, 2),
                "volatile_pct": round(_div(lar_99_30d, balance) * 100, 2),
                "confidence": "99% over 30 days",
            })
        except Exception as exc:
            logger.error("LaR error for account %s: %s", account.id, exc, exc_info=True)
            return {"account_id": account.id, "bank_name": getattr(account, "bank_name", "?"),
                    "currency": getattr(account, "currency", "?"), "error": str(exc)}

    def _empty_lar(self, acct: VostroAccount) -> Dict[str, Any]:
        lar = {f"lar_{int(c*100)}_{h}d": 0.0 for h in _HORIZONS for c in _CONF_LEVELS}
        return _py({
            "account_id": acct.id, "bank_name": acct.bank_name,
            "currency": acct.currency, "country": acct.country,
            "balance": 0.0, "volatility": 0.0, "lar": lar,
            "stable_portion": 0.0, "volatile_portion": 0.0,
            "stable_pct": 0.0, "volatile_pct": 0.0, "confidence": "99% over 30 days",
        })

    def compute_all(self, db: Session) -> Dict[str, Any]:
        """Run LaR on all vostro accounts. Return portfolio and per-account breakdown."""
        try:
            accounts = db.query(VostroAccount).all()
            if not accounts:
                return {"error": "No vostro accounts found", "accounts": [], "portfolio": {}}

            results, t_bal, t_st, t_vol = [], 0.0, 0.0, 0.0
            for acct in accounts:
                res = self.compute_lar(acct)
                results.append(res)
                if "error" not in res:
                    t_bal += res["balance"]
                    t_st += res["stable_portion"]
                    t_vol += res["volatile_portion"]

            p_lar = self._portfolio_lar(accounts)
            return _py({
                "accounts": results,
                "portfolio": {
                    "total_balance": round(t_bal, 2), "total_stable": round(t_st, 2),
                    "total_volatile": round(t_vol, 2),
                    "stable_pct": round(_div(t_st, t_bal) * 100, 2),
                    "volatile_pct": round(_div(t_vol, t_bal) * 100, 2),
                    "account_count": len(accounts),
                    "portfolio_lar_30d_99": round(p_lar, 2),
                    "diversification_benefit": round(max(t_vol - p_lar, 0.0), 2),
                    "diversification_benefit_pct": round(_div(max(t_vol - p_lar, 0.0), t_vol) * 100, 2),
                },
            })
        except Exception as exc:
            logger.error("Error in compute_all: %s", exc, exc_info=True)
            return {"error": str(exc), "accounts": [], "portfolio": {}}

    def _portfolio_lar(self, accounts: List[VostroAccount]) -> float:
        """Portfolio-level LaR using correlated Monte Carlo (correlation=0.3)."""
        n = len(accounts)
        if n == 0:
            return 0.0
        bals = np.array([max(a.balance or 0.0, 0.0) for a in accounts])
        vols = np.array([a.volatility if a.volatility and a.volatility > 0 else 0.02 for a in accounts])
        if np.sum(bals) <= 0:
            return 0.0

        corr = np.full((n, n), _CORR_FACTOR)
        np.fill_diagonal(corr, 1.0)
        try:
            L = np.linalg.cholesky(corr)
        except np.linalg.LinAlgError:
            L = np.eye(n)

        sigmas = vols * bals
        total_out = np.zeros(self.n_sims)
        for _ in range(30):  # 30-day horizon
            z = self.rng.standard_normal((n, self.n_sims))
            changes = -0.001 * bals[:, None] + sigmas[:, None] * (L @ z)
            total_out += np.maximum(-changes.sum(axis=0), 0.0)
        return float(np.percentile(total_out, 99))


# ---------------------------------------------------------------------------
# VostroDeploymentOptimizer
# ---------------------------------------------------------------------------
class VostroDeploymentOptimizer:
    """Optimal deployment: T-bills (stable), overnight repo (volatile), 5% buffer."""

    def __init__(self):
        self.lar_engine = VostroLaREngine()

    def _optimize_one(self, acct: VostroAccount, lar: Dict[str, Any]) -> Dict[str, Any]:
        bal = lar.get("balance", 0.0)
        if bal <= 0:
            return {"account_id": acct.id, "bank_name": acct.bank_name,
                    "currency": acct.currency, "balance": 0.0,
                    "deployment": {"tbills": 0.0, "overnight": 0.0, "buffer": 0.0},
                    "deployment_pct": {"tbills_pct": 0.0, "overnight_pct": 0.0, "buffer_pct": 0.0},
                    "income": {"tbill_income": 0.0, "overnight_income": 0.0,
                               "total_expected_annual": 0.0, "current_annual": 0.0, "improvement": 0.0},
                    "effective_yield_pct": 0.0, "current_yield_pct": 0.0}

        stable = lar.get("stable_portion", 0.0)
        buf = bal * _BUFFER_PCT
        deployable = max(bal - buf, 0.0)
        tbills = min(stable, deployable)
        overnight = max(deployable - tbills, 0.0)
        undeployed = bal - tbills - overnight

        tb_inc = tbills * _TBILL_YIELD
        on_inc = overnight * _OVERNIGHT_YIELD
        total_inc = tb_inc + on_inc
        cur_yield = acct.yield_rate or 0.0
        cur_inc = bal * cur_yield

        return _py({
            "account_id": acct.id, "bank_name": acct.bank_name,
            "currency": acct.currency, "country": acct.country,
            "balance": round(bal, 2),
            "deployment": {"tbills": round(tbills, 2), "overnight": round(overnight, 2), "buffer": round(undeployed, 2)},
            "deployment_pct": {
                "tbills_pct": round(_div(tbills, bal) * 100, 2),
                "overnight_pct": round(_div(overnight, bal) * 100, 2),
                "buffer_pct": round(_div(undeployed, bal) * 100, 2),
            },
            "income": {
                "tbill_income": round(tb_inc, 2), "overnight_income": round(on_inc, 2),
                "total_expected_annual": round(total_inc, 2),
                "current_annual": round(cur_inc, 2), "improvement": round(total_inc - cur_inc, 2),
            },
            "effective_yield_pct": round(_div(total_inc, bal) * 100, 3),
            "current_yield_pct": round(cur_yield * 100, 3),
        })

    def optimize_deployment(self, db: Session) -> Dict[str, Any]:
        """Per-account and portfolio deployment plan with expected income."""
        try:
            accounts = db.query(VostroAccount).all()
            if not accounts:
                return {"error": "No vostro accounts found", "accounts": [], "portfolio": {}}

            results = []
            tot = {"bal": 0.0, "tb": 0.0, "on": 0.0, "buf": 0.0, "exp": 0.0, "cur": 0.0}
            for acct in accounts:
                lar = self.lar_engine.compute_lar(acct)
                dep = self._optimize_one(acct, lar)
                results.append(dep)
                if "error" not in dep:
                    tot["bal"] += dep.get("balance", 0.0)
                    d = dep.get("deployment", {})
                    tot["tb"] += d.get("tbills", 0.0)
                    tot["on"] += d.get("overnight", 0.0)
                    tot["buf"] += d.get("buffer", 0.0)
                    inc = dep.get("income", {})
                    tot["exp"] += inc.get("total_expected_annual", 0.0)
                    tot["cur"] += inc.get("current_annual", 0.0)

            deployed = tot["tb"] + tot["on"]
            return _py({
                "accounts": results,
                "portfolio": {
                    "total_balance": round(tot["bal"], 2),
                    "total_tbills": round(tot["tb"], 2), "total_overnight": round(tot["on"], 2),
                    "total_buffer": round(tot["buf"], 2), "total_deployed": round(deployed, 2),
                    "deployment_ratio_pct": round(_div(deployed, tot["bal"]) * 100, 2),
                    "total_expected_annual_income": round(tot["exp"], 2),
                    "total_current_annual_income": round(tot["cur"], 2),
                    "income_improvement": round(tot["exp"] - tot["cur"], 2),
                    "effective_portfolio_yield_pct": round(_div(tot["exp"], tot["bal"]) * 100, 3),
                    "tbill_yield_pct": round(_TBILL_YIELD * 100, 2),
                    "overnight_yield_pct": round(_OVERNIGHT_YIELD * 100, 2),
                    "account_count": len(accounts),
                },
            })
        except Exception as exc:
            logger.error("Error in optimize_deployment: %s", exc, exc_info=True)
            return {"error": str(exc), "accounts": [], "portfolio": {}}


# ---------------------------------------------------------------------------
# VostroCooperativeGame
# ---------------------------------------------------------------------------
class VostroCooperativeGame:
    """
    Cooperative game among vostro account holders (foreign banks).
    Coalition value = pooled stable portion with diversification benefit.
    Shapley value fairly allocates the benefit of pooling.
    """

    def __init__(self):
        self.lar_engine = VostroLaREngine()

    def _coalition_value(self, accounts: List[VostroAccount],
                         ind_lars: Dict[int, float]) -> float:
        """Coalition value = income from freed capital due to diversification."""
        if not accounts:
            return 0.0
        bals = np.array([max(a.balance or 0.0, 0.0) for a in accounts])
        vols = np.array([a.volatility if a.volatility and a.volatility > 0 else 0.02 for a in accounts])
        if np.sum(bals) <= 0 or len(accounts) < 2:
            return 0.0

        sum_ind = sum(ind_lars.get(a.id, 0.0) for a in accounts)
        # Portfolio variance with correlation
        s30 = vols * bals * np.sqrt(30)
        pvar = np.sum(s30 ** 2)
        n = len(accounts)
        for i in range(n):
            for j in range(i + 1, n):
                pvar += 2 * _CORR_FACTOR * s30[i] * s30[j]
        pooled_lar = 2.326 * np.sqrt(max(pvar, 0.0))  # 99% z-score
        return max(sum_ind - pooled_lar, 0.0) * _TBILL_YIELD

    def analyze_cooperation(self, db: Session) -> Dict[str, Any]:
        """Shapley allocations, coalition values, individual vs pooled LaR."""
        try:
            accounts = db.query(VostroAccount).all()
            if not accounts:
                return {"error": "No vostro accounts found", "players": [], "coalition_analysis": {}}

            if len(accounts) > _MAX_COOP_PLAYERS:
                accounts = sorted(accounts, key=lambda a: a.balance or 0.0, reverse=True)[:_MAX_COOP_PLAYERS]
            n = len(accounts)

            # Individual LaRs
            ind_lars: Dict[int, float] = {}
            ind_res: Dict[int, Dict] = {}
            for acct in accounts:
                r = self.lar_engine.compute_lar(acct)
                ind_lars[acct.id] = r.get("volatile_portion", 0.0)
                ind_res[acct.id] = r

            # Characteristic function
            idx_map = {i: accounts[i] for i in range(n)}
            cf: Dict[frozenset, float] = {frozenset(): 0.0}
            for mask in range(1, 2 ** n):
                members = [i for i in range(n) if mask & (1 << i)]
                cf[frozenset(members)] = self._coalition_value([idx_map[i] for i in members], ind_lars)

            sv = shapley_value(cf, n)
            grand = cf.get(frozenset(range(n)), 0.0)

            players = []
            for i in range(n):
                a = idx_map[i]
                il = ind_lars.get(a.id, 0.0)
                ir = ind_res.get(a.id, {})
                players.append({
                    "player_index": i, "account_id": a.id, "bank_name": a.bank_name,
                    "currency": a.currency, "country": a.country,
                    "balance": round(a.balance or 0.0, 2),
                    "individual_lar_30d": round(il, 2),
                    "individual_stable": round(ir.get("stable_portion", 0.0), 2),
                    "shapley_value": round(float(sv[i]), 2),
                    "shapley_share_pct": round(_div(float(sv[i]), grand) * 100, 2),
                })

            t_ind_lar = sum(ind_lars.values())
            p_lar = self.lar_engine._portfolio_lar(accounts)
            t_bal = sum(a.balance or 0.0 for a in accounts)
            reduction = max(t_ind_lar - p_lar, 0.0)

            return _py({
                "players": players,
                "coalition_analysis": {
                    "grand_coalition_value": round(grand, 2),
                    "total_individual_lar": round(t_ind_lar, 2),
                    "pooled_lar": round(p_lar, 2),
                    "lar_reduction": round(reduction, 2),
                    "lar_reduction_pct": round(_div(reduction, t_ind_lar) * 100, 2),
                    "additional_deployable": round(reduction, 2),
                    "additional_annual_income": round(reduction * _TBILL_YIELD, 2),
                },
                "total_balance": round(t_bal, 2), "player_count": n,
                "shapley_total": round(float(np.sum(sv)), 2),
                "analysis_note": "Shapley values represent each bank's fair share of the "
                                 "diversification benefit from pooling vostro balances.",
            })
        except Exception as exc:
            logger.error("Error in analyze_cooperation: %s", exc, exc_info=True)
            return {"error": str(exc), "players": [], "coalition_analysis": {}}


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------
def get_vostro_summary(db: Session) -> Dict[str, Any]:
    """Total balances by currency, stable/volatile split, deployment income, LaR, concentration."""
    try:
        accounts = db.query(VostroAccount).all()
        if not accounts:
            return {"error": "No vostro accounts found", "currencies": {}, "totals": {},
                    "concentration": {}, "deployment": {}, "lar_metrics": {}}

        lar_engine = VostroLaREngine()
        by_ccy: Dict[str, Dict[str, Any]] = {}
        by_bank: Dict[str, float] = {}
        t_bal, t_st, t_vol, t_cur_inc = 0.0, 0.0, 0.0, 0.0

        for acct in accounts:
            ccy, bal = acct.currency, acct.balance or 0.0
            if ccy not in by_ccy:
                by_ccy[ccy] = {"total_balance": 0.0, "account_count": 0,
                               "total_stable": 0.0, "total_volatile": 0.0}
            by_ccy[ccy]["total_balance"] += bal
            by_ccy[ccy]["account_count"] += 1

            lar = lar_engine.compute_lar(acct)
            st, vol = lar.get("stable_portion", 0.0), lar.get("volatile_portion", 0.0)
            by_ccy[ccy]["total_stable"] += st
            by_ccy[ccy]["total_volatile"] += vol
            t_bal += bal; t_st += st; t_vol += vol
            t_cur_inc += bal * (acct.yield_rate or 0.0)
            by_bank[acct.bank_name] = by_bank.get(acct.bank_name, 0.0) + bal

        for d in by_ccy.values():
            for k in ("total_balance", "total_stable", "total_volatile"):
                d[k] = round(d[k], 2)
            d["stable_pct"] = round(_div(d["total_stable"], d["total_balance"]) * 100, 2)

        opt_inc = t_st * _TBILL_YIELD + t_vol * _OVERNIGHT_YIELD
        p_lar = lar_engine._portfolio_lar(accounts)
        hhi_c = _hhi([d["total_balance"] for d in by_ccy.values()])
        hhi_b = _hhi(list(by_bank.values()))

        return _py({
            "currencies": by_ccy,
            "totals": {"total_balance": round(t_bal, 2), "total_accounts": len(accounts),
                       "total_stable": round(t_st, 2), "total_volatile": round(t_vol, 2),
                       "stable_pct": round(_div(t_st, t_bal) * 100, 2)},
            "deployment": {"current_annual_income": round(t_cur_inc, 2),
                           "optimal_annual_income": round(opt_inc, 2),
                           "income_gap": round(opt_inc - t_cur_inc, 2),
                           "tbill_yield_pct": round(_TBILL_YIELD * 100, 2),
                           "overnight_yield_pct": round(_OVERNIGHT_YIELD * 100, 2)},
            "lar_metrics": {"portfolio_lar_30d_99": round(p_lar, 2),
                            "sum_individual_volatile": round(t_vol, 2),
                            "diversification_benefit": round(max(t_vol - p_lar, 0.0), 2)},
            "concentration": {"hhi_by_currency": round(hhi_c, 4), "hhi_by_bank": round(hhi_b, 4),
                              "currency_count": len(by_ccy), "bank_count": len(by_bank),
                              "hhi_interpretation": ("Concentrated" if hhi_b > 0.25
                                                     else "Moderate" if hhi_b > 0.15 else "Diversified")},
            "rates": {"policy_rate_pct": round(POLICY_RATE * 100, 2),
                      "overnight_repo_rate_pct": round(OVERNIGHT_REPO_RATE * 100, 2)},
            "analysis_date": datetime.date.today().isoformat(),
        })
    except Exception as exc:
        logger.error("Error computing vostro summary: %s", exc, exc_info=True)
        return {"error": str(exc), "currencies": {}, "totals": {},
                "concentration": {}, "deployment": {}, "lar_metrics": {}}


def _deploy_rec(lar: Dict, dep: Dict) -> str:
    """Human-readable deployment recommendation."""
    sp = lar.get("stable_pct", 0.0)
    imp = dep.get("income", {}).get("improvement", 0.0)
    if sp >= 70:
        b = "High stability - maximize T-bill deployment"
    elif sp >= 40:
        b = "Moderate stability - balanced T-bill/overnight split"
    else:
        b = "High volatility - prioritize overnight liquidity"
    if imp > 0:
        b += f"; potential income uplift: {imp:,.0f}"
    return b


def get_vostro_portfolio(db: Session) -> Dict[str, Any]:
    """All vostro accounts with LaR analysis and deployment recommendations."""
    try:
        accounts = db.query(VostroAccount).all()
        if not accounts:
            return {"error": "No vostro accounts found", "accounts": [], "summary": {}}

        lar_engine = VostroLaREngine()
        deployer = VostroDeploymentOptimizer()
        results = []
        for acct in accounts:
            lar = lar_engine.compute_lar(acct)
            dep = deployer._optimize_one(acct, lar)
            results.append({
                "account_id": acct.id, "bank_name": acct.bank_name,
                "currency": acct.currency, "country": acct.country,
                "balance": round(acct.balance or 0.0, 2),
                "average_balance_30d": round(acct.average_balance_30d or 0.0, 2),
                "last_updated": acct.last_updated.isoformat() if acct.last_updated else None,
                "lar": lar.get("lar", {}),
                "stable_portion": lar.get("stable_portion", 0.0),
                "volatile_portion": lar.get("volatile_portion", 0.0),
                "stable_pct": lar.get("stable_pct", 0.0),
                "deployment": dep.get("deployment", {}),
                "deployment_pct": dep.get("deployment_pct", {}),
                "income": dep.get("income", {}),
                "effective_yield_pct": dep.get("effective_yield_pct", 0.0),
                "recommendation": _deploy_rec(lar, dep),
            })

        t_bal = sum(r["balance"] for r in results)
        t_st = sum(r["stable_portion"] for r in results)
        t_inc = sum(r["income"].get("total_expected_annual", 0.0) for r in results)
        return _py({
            "accounts": results,
            "summary": {"total_accounts": len(results), "total_balance": round(t_bal, 2),
                        "total_stable": round(t_st, 2),
                        "total_expected_annual_income": round(t_inc, 2),
                        "average_yield_pct": round(_div(t_inc, t_bal) * 100, 3)},
        })
    except Exception as exc:
        logger.error("Error computing vostro portfolio: %s", exc, exc_info=True)
        return {"error": str(exc), "accounts": [], "summary": {}}


def get_deployment_breakdown(db: Session) -> Dict[str, Any]:
    """Deployment allocation breakdown for frontend (T-bills vs overnight vs buffer)."""
    try:
        result = VostroDeploymentOptimizer().optimize_deployment(db)
        if "error" in result and not result.get("accounts"):
            return result

        breakdown = []
        for a in result.get("accounts", []):
            d, dp, inc = a.get("deployment", {}), a.get("deployment_pct", {}), a.get("income", {})
            breakdown.append({
                "account_id": a.get("account_id"), "bank_name": a.get("bank_name"),
                "currency": a.get("currency"), "country": a.get("country"),
                "balance": a.get("balance", 0.0),
                "tbills": d.get("tbills", 0.0), "overnight": d.get("overnight", 0.0),
                "buffer": d.get("buffer", 0.0),
                "tbills_pct": dp.get("tbills_pct", 0.0), "overnight_pct": dp.get("overnight_pct", 0.0),
                "buffer_pct": dp.get("buffer_pct", 0.0),
                "expected_annual_income": inc.get("total_expected_annual", 0.0),
                "current_annual_income": inc.get("current_annual", 0.0),
                "income_improvement": inc.get("improvement", 0.0),
            })

        # Aggregate by currency for treemap
        ccy_agg: Dict[str, Dict[str, Any]] = {}
        for item in breakdown:
            ccy = item["currency"]
            if ccy not in ccy_agg:
                ccy_agg[ccy] = {"currency": ccy, "total_balance": 0.0, "total_tbills": 0.0,
                                "total_overnight": 0.0, "total_buffer": 0.0,
                                "total_income": 0.0, "account_count": 0}
            c = ccy_agg[ccy]
            c["total_balance"] += item["balance"]; c["total_tbills"] += item["tbills"]
            c["total_overnight"] += item["overnight"]; c["total_buffer"] += item["buffer"]
            c["total_income"] += item["expected_annual_income"]; c["account_count"] += 1

        by_ccy = []
        for ccy, c in sorted(ccy_agg.items(), key=lambda x: x[1]["total_balance"], reverse=True):
            for k in ("total_balance", "total_tbills", "total_overnight", "total_buffer", "total_income"):
                c[k] = round(c[k], 2)
            by_ccy.append(c)

        pf = result.get("portfolio", {})
        return _py({
            "accounts": breakdown, "by_currency": by_ccy,
            "portfolio": {
                "total_balance": pf.get("total_balance", 0.0),
                "total_tbills": pf.get("total_tbills", 0.0),
                "total_overnight": pf.get("total_overnight", 0.0),
                "total_buffer": pf.get("total_buffer", 0.0),
                "deployment_ratio_pct": pf.get("deployment_ratio_pct", 0.0),
                "total_expected_income": pf.get("total_expected_annual_income", 0.0),
                "total_current_income": pf.get("total_current_annual_income", 0.0),
                "income_improvement": pf.get("income_improvement", 0.0),
            },
            "account_count": len(breakdown),
        })
    except Exception as exc:
        logger.error("Error computing deployment breakdown: %s", exc, exc_info=True)
        return {"error": str(exc), "accounts": [], "by_currency": [], "portfolio": {}}
