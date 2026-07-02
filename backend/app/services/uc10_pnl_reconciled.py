"""
UC-10 Cash P&L Attribution — RECONCILED (Phase B2)
==================================================
Repoints UC-10 from the legacy parametric model (everything re-derived from one static
`Branch.daily_transactions` field x synthetic constants x 365) onto the RECONCILED LEDGER
(`fact_gl_daily`), the same system of record the T3 forecaster and oversight layer use.

Correct accounting treatment (this is the "make sense" part):
  * FLOW columns (per-day costs/income) are SUMMED over the trailing year  -> real annual P&L
    (cit_cost_m, cash_handling_cost_m, personnel/premises/direct/other, interest, fee).
  * STOCK columns (a daily balance) are AVERAGED, then x rate for the opportunity cost
    (idle_cash_m, crr_held/required, vault balance). Summing a stock would give nonsense
    (e.g. 12-trillion "idle"), which is exactly the trap the legacy code's annualisation hid.
  * Real transaction VOLUME for cost-per-txn comes from `fact_transactions` (18M+ rows),
    not an estimate.
  * `insurance_cost_m` in the ledger is mis-scaled, so vault insurance is recomputed from
    the average vault balance x the documented VAULT_INSURANCE_RATE (ledger-derived, sane).

Every response carries a `lineage` block (source table, as-of date, period, coverage) so
staleness is visible, never hidden. Same response SHAPES as the legacy service, so the
frontend renders unchanged. All amounts PKR Millions unless suffixed _pkr (raw PKR).
"""
from __future__ import annotations

import datetime
import sqlite3
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from app.core.constants import OVERNIGHT_REPO_RATE, POLICY_RATE, VAULT_INSURANCE_RATE

DB_PATH = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")
LOOKBACK_DAYS = 365
AVG_TICKET_PKR = 25_000.0   # avg cash transaction value, for cost-per-volume ranking

# Cash-operations cost pools. Idle cash is a genuine cost (forgone yield); the upside of
# redeploying it is surfaced as a RECOMMENDATION, not netted here as a phantom income
# (policy rate == overnight repo rate, so netting would just zero it out — a double-count).
_POOL_LABELS = {
    "idle_cash_opportunity_cost": "Idle Cash Opportunity Cost",
    "vault_insurance": "Vault Insurance",
    "cit_logistics": "CIT Logistics",
    "cash_handling": "Cash Handling & Sorting",
    "crr_excess_opportunity_cost": "CRR Excess Opp. Cost",
}
POOL_NAMES = list(_POOL_LABELS.keys())
COST_POOLS = list(POOL_NAMES)


def _d(a, b, default=0.0):
    return a / b if b else default


# ---------------------------------------------------------------------------
# Core build — one reconciled per-branch P&L frame, cached per process+as_of
# ---------------------------------------------------------------------------
_CACHE: dict = {}


def _build(lookback: int = LOOKBACK_DAYS) -> tuple[pd.DataFrame, dict]:
    con = sqlite3.connect(DB_PATH)
    max_date = con.execute("SELECT MAX(date) FROM fact_gl_daily").fetchone()[0]
    if max_date is None:
        con.close()
        return pd.DataFrame(), {"error": "fact_gl_daily empty"}
    if max_date in _CACHE:
        con.close()
        return _CACHE[max_date]

    start = con.execute("SELECT date(?, ?)", (max_date, f"-{lookback - 1} days")).fetchone()[0]

    # FLOWS summed, STOCKS averaged — the correct accounting treatment.
    gl = pd.read_sql_query(
        """
        SELECT branch_id,
               SUM(cit_cost_m)            AS cit_cost_m,
               SUM(cash_handling_cost_m)  AS cash_handling_cost_m,
               SUM(personnel_cost_m)      AS personnel_cost_m,
               SUM(premises_cost_m)       AS premises_cost_m,
               SUM(direct_cost_m)         AS direct_cost_m,
               SUM(other_cost_m)          AS other_cost_m,
               SUM(interest_income_m)     AS interest_income_m,
               SUM(interest_expense_m)    AS interest_expense_m,
               SUM(fee_income_m)          AS fee_income_m,
               AVG(idle_cash_m)           AS avg_idle_m,
               AVG(crr_held_m)            AS avg_crr_held_m,
               AVG(crr_required_m)        AS avg_crr_required_m,
               AVG((opening_balance_m + closing_balance_m) / 2.0) AS avg_vault_m,
               COUNT(*)                   AS branch_days
        FROM fact_gl_daily
        WHERE date BETWEEN ? AND ?
        GROUP BY branch_id
        """, con, params=(start, max_date))

    # Real transaction volume from the reconciled transaction ledger.
    txn = pd.read_sql_query(
        "SELECT branch_id, COUNT(*) AS txn_count FROM fact_transactions "
        "WHERE date BETWEEN ? AND ? GROUP BY branch_id", con, params=(start, max_date))
    meta_branches = pd.read_sql_query(
        "SELECT branch_id, name, city, region, branch_type FROM branches", con)
    con.close()

    df = gl.merge(txn, on="branch_id", how="left").merge(meta_branches, on="branch_id", how="left")
    df["txn_count"] = df["txn_count"].fillna(0).astype(int)
    df["branch_type"] = df["branch_type"].fillna("Balanced").astype(str)

    # ---- Cost pools (all reconciled-sourced) ----
    df["pool_idle_cash_opportunity_cost"] = df["avg_idle_m"].clip(lower=0) * POLICY_RATE
    # Insurance applied as a flat fraction of insured value (matches how business_output /
    # the legacy engine use the constant). Annualising the "/day" label would imply ~5.5%/yr,
    # which is ~30x real cash-in-vault insurance and would swamp the P&L — so we don't.
    df["pool_vault_insurance"] = df["avg_vault_m"].clip(lower=0) * VAULT_INSURANCE_RATE
    df["pool_cit_logistics"] = df["cit_cost_m"]
    df["pool_cash_handling"] = df["cash_handling_cost_m"]
    df["pool_crr_excess_opportunity_cost"] = (
        (df["avg_crr_held_m"] - df["avg_crr_required_m"]).clip(lower=0) * POLICY_RATE)

    ccols = [f"pool_{n}" for n in COST_POOLS]
    df["gross_cost"] = df[ccols].sum(axis=1)
    df["net_cash_cost"] = df["gross_cost"]               # all pools are costs
    df["total_benefits"] = 0.0
    # Informational upside (not netted): repo income recoverable if idle is redeployed.
    df["deployment_opportunity_m"] = df["avg_idle_m"].clip(lower=0) * OVERNIGHT_REPO_RATE

    # ---- Context (real booked, summed) ----
    df["net_interest_income_m"] = df["interest_income_m"] - df["interest_expense_m"]
    df["operating_overhead_m"] = (df["personnel_cost_m"] + df["premises_cost_m"]
                                  + df["direct_cost_m"] + df["other_cost_m"])
    df["net_contribution_m"] = (df["net_interest_income_m"] + df["fee_income_m"]
                                - df["net_cash_cost"] - df["operating_overhead_m"])

    # ranking metric: net cash cost per PKR-million of transaction value
    df["txn_value_pkr"] = df["txn_count"] * AVG_TICKET_PKR
    df["cost_per_million_txn_value"] = df.apply(
        lambda r: round(_d(r["net_cash_cost"] * 1e6, r["txn_value_pkr"] / 1e6), 2), axis=1)

    today = datetime.date(2026, 6, 30)
    lineage = {
        "data_source": "fact_gl_daily + fact_transactions (reconciled ledger)",
        "as_of": max_date,
        "period_start": start,
        "period_end": max_date,
        "branch_days": int(df["branch_days"].sum()),
        "branches": int(len(df)),
        "transactions_in_period": int(df["txn_count"].sum()),
        "is_latest_slice": True,           # we always read the table's newest date
        "data_age_days": (today - datetime.date.fromisoformat(max_date)).days,
        "treatment": "flows summed, stocks averaged x rate",
    }
    _CACHE[max_date] = (df, lineage)
    return df, lineage


# ---------------------------------------------------------------------------
# Public API — same shapes as the legacy service
# ---------------------------------------------------------------------------
def _branch_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    df = df.sort_values("net_cash_cost", ascending=True)
    out = []
    for rank, (_, r) in enumerate(df.iterrows(), 1):
        out.append({
            "rank": rank, "branch_id": r["branch_id"], "name": r["name"],
            "city": r["city"], "region": r["region"], "branch_type": r["branch_type"],
            "transactions": int(r["txn_count"]),
            "daily_transactions": int(round(r["txn_count"] / LOOKBACK_DAYS)),
            "avg_vault_balance_m": round(float(r["avg_vault_m"]), 1),
            "avg_idle_m": round(float(r["avg_idle_m"]), 1),
            "cost_pools": {n: round(float(r[f"pool_{n}"]), 2) for n in POOL_NAMES},
            "gross_cost": round(float(r["gross_cost"]), 2),
            "total_benefits": round(float(r["total_benefits"]), 2),
            "net_cash_cost": round(float(r["net_cash_cost"]), 2),
            "net_interest_income_m": round(float(r["net_interest_income_m"]), 2),
            "fee_income_m": round(float(r["fee_income_m"]), 2),
            "operating_overhead_m": round(float(r["operating_overhead_m"]), 2),
            "net_contribution_m": round(float(r["net_contribution_m"]), 2),
            "cost_per_million_txn_value": float(r["cost_per_million_txn_value"]),
        })
    return out


def get_pnl_summary(db=None) -> Dict[str, Any]:
    df, lineage = _build()
    if df.empty:
        return {"error": "No reconciled ledger data", "cost_pools": {}, "lineage": lineage}
    pt = {n: round(float(df[f"pool_{n}"].sum()), 2) for n in POOL_NAMES}
    net = round(float(df["net_cash_cost"].sum()), 2)
    gross = round(float(df["gross_cost"].sum()), 2)
    benefits = round(float(df["total_benefits"].sum()), 2)
    txn = int(df["txn_count"].sum())
    return {
        "summary_date": lineage["as_of"],
        "network_branches": int(len(df)),
        "annual_transactions": txn,
        "total_avg_vault_m": round(float(df["avg_vault_m"].sum()), 0),
        "total_avg_idle_m": round(float(df["avg_idle_m"].sum()), 0),
        "cost_pools": pt,
        "cost_items": {k: v for k, v in pt.items() if v >= 0},
        "income_items": {k: abs(v) for k, v in pt.items() if v < 0},
        "gross_cost": gross,
        "total_benefits": benefits,
        "net_cash_cost": net,
        "net_interest_income_m": round(float(df["net_interest_income_m"].sum()), 2),
        "fee_income_m": round(float(df["fee_income_m"].sum()), 2),
        "operating_overhead_m": round(float(df["operating_overhead_m"].sum()), 2),
        "net_contribution_m": round(float(df["net_contribution_m"].sum()), 2),
        "deployment_opportunity_m": round(float(df["deployment_opportunity_m"].sum()), 2),
        "cost_per_branch": round(_d(net, len(df)), 2),
        "cost_per_transaction": round(_d(net * 1e6, txn), 2),
        "rates": {
            "policy_rate_pct": round(POLICY_RATE * 100, 2),
            "overnight_repo_rate_pct": round(OVERNIGHT_REPO_RATE * 100, 2),
            "vault_insurance_rate_pct": round(VAULT_INSURANCE_RATE * 100, 4),
        },
        "lineage": lineage,
    }


def get_pnl_waterfall(db=None) -> Dict[str, Any]:
    s = get_pnl_summary(db)
    if "error" in s and not s.get("cost_pools"):
        return {"error": s["error"], "steps": [], "lineage": s.get("lineage")}
    pools = s["cost_pools"]
    steps, running = [], 0.0
    for n in POOL_NAMES:
        v = pools.get(n, 0.0)
        running += v
        steps.append({"label": _POOL_LABELS[n], "pool_key": n, "value": round(v, 2),
                      "running_total": round(running, 2),
                      "type": "benefit" if v < 0 else "cost"})
    steps.append({"label": "Net Cash Cost", "pool_key": "net_cash_cost",
                  "value": round(running, 2), "running_total": round(running, 2), "type": "total"})
    return {"chart_type": "waterfall", "title": "Cash Operations P&L Waterfall (reconciled)",
            "currency": "PKR M", "period": f"{s['lineage']['period_start']} .. {s['lineage']['period_end']}",
            "gross_cost": s["gross_cost"], "net_cash_cost": round(running, 2),
            "steps": steps, "lineage": s["lineage"]}


def get_branch_ranking(db=None) -> Dict[str, Any]:
    df, lineage = _build()
    if df.empty:
        return {"error": "No data", "branches": [], "quartile_summary": {}, "lineage": lineage}
    recs = _branch_records(df)
    recs.sort(key=lambda x: x["cost_per_million_txn_value"]
              if x["cost_per_million_txn_value"] > 0 else float("inf"))
    n = len(recs)
    qs = max(n // 4, 1)
    vals = [r["cost_per_million_txn_value"] for r in recs if r["cost_per_million_txn_value"] > 0]
    med = float(np.median(vals)) if vals else 0.0
    for i, r in enumerate(recs):
        r["efficiency_rank"] = i + 1
        r["quartile"] = "Q1" if i < qs else "Q2" if i < 2 * qs else "Q3" if i < 3 * qs else "Q4"
        r["vs_benchmark_pct"] = round(_d(r["cost_per_million_txn_value"] - med, med) * 100, 2)
    labels = {"Q1": "Top Performers", "Q2": "Above Average",
              "Q3": "Below Average", "Q4": "Needs Improvement"}
    qsum = {}
    for ql in ("Q1", "Q2", "Q3", "Q4"):
        qb = [r for r in recs if r["quartile"] == ql]
        if qb:
            c = [r["cost_per_million_txn_value"] for r in qb]
            qsum[ql] = {"count": len(qb), "avg_cost_per_million": round(float(np.mean(c)), 2),
                        "min_cost_per_million": round(float(np.min(c)), 2),
                        "max_cost_per_million": round(float(np.max(c)), 2), "label": labels[ql]}
    return {"total_branches": n, "metric": "cost_per_million_txn_value (PKR)",
            "quartile_summary": qsum, "branches": recs, "lineage": lineage}


def get_cost_treemap(db=None) -> Dict[str, Any]:
    df, lineage = _build()
    if df.empty:
        return {"error": "No data", "regions": [], "lineage": lineage}
    recs = _branch_records(df)
    hier: Dict[str, Dict[str, list]] = {}
    for e in recs:
        hier.setdefault(e["region"] or "Unknown", {}).setdefault(e["city"] or "Unknown", []).append(e)
    regions = []
    for rn, cities in sorted(hier.items()):
        rc, cnodes = 0.0, []
        for cn, bs in sorted(cities.items()):
            cc = sum(b["net_cash_cost"] for b in bs)
            cnodes.append({"name": cn, "net_cash_cost": round(cc, 2), "branch_count": len(bs),
                           "branches": [{"name": b["name"], "branch_id": b["branch_id"],
                                         "net_cash_cost": b["net_cash_cost"],
                                         "gross_cost": b["gross_cost"],
                                         "daily_transactions": b["daily_transactions"],
                                         "branch_type": b["branch_type"]}
                                        for b in sorted(bs, key=lambda x: x["net_cash_cost"])]})
            rc += cc
        regions.append({"name": rn, "net_cash_cost": round(rc, 2), "city_count": len(cnodes),
                        "branch_count": sum(c["branch_count"] for c in cnodes),
                        "cities": sorted(cnodes, key=lambda c: c["net_cash_cost"])})
    tc = sum(r["net_cash_cost"] for r in regions) or 1.0
    for r in regions:
        r["pct_of_total"] = round(r["net_cash_cost"] / tc * 100, 2)
    return {"chart_type": "treemap", "title": "Cash Cost Distribution (reconciled)",
            "currency": "PKR M", "total_net_cost": round(sum(r["net_cash_cost"] for r in regions), 2),
            "regions": sorted(regions, key=lambda r: r["net_cash_cost"]), "lineage": lineage}


class TransferPricingEngine:
    def compute_transfer_prices(self, db=None) -> List[Dict[str, Any]]:
        df, _ = _build()
        if df.empty:
            return []
        df = df.copy()
        df["capital_charge"] = df["avg_vault_m"] * POLICY_RATE
        df["overnight_credit"] = df["avg_idle_m"].clip(lower=0) * OVERNIGHT_REPO_RATE
        df["fee_credit"] = df["fee_income_m"]
        df["total_credits"] = df["overnight_credit"] + df["fee_credit"]
        df["tp_net"] = df["total_credits"] - df["capital_charge"]
        df = df.sort_values("tp_net", ascending=False)
        return [{
            "rank": i, "branch_id": r["branch_id"], "name": r["name"],
            "city": r["city"], "region": r["region"], "branch_type": r["branch_type"],
            "avg_vault_balance": round(float(r["avg_vault_m"]), 1),
            "capital_charge_annual": round(float(r["capital_charge"]), 2),
            "daily_capital_charge": round(float(r["capital_charge"]) / 365, 2),
            "overnight_credit": round(float(r["overnight_credit"]), 2),
            "digital_credit": round(float(r["fee_credit"]), 2),
            "total_credits": round(float(r["total_credits"]), 2),
            "tp_net_pnl": round(float(r["tp_net"]), 2),
            "status": "profit_centre" if r["tp_net"] >= 0 else "cost_centre",
        } for i, (_, r) in enumerate(df.iterrows(), 1)]


def get_alco_report(db=None) -> Dict[str, Any]:
    s = get_pnl_summary(db)
    if "error" in s and not s.get("cost_pools"):
        return {"error": s["error"], "sections": [], "lineage": s.get("lineage")}
    ranked = get_branch_ranking(db)["branches"]
    tp = TransferPricingEngine().compute_transfer_prices(db)
    pools = s["cost_pools"]
    nb, net, gross = s["network_branches"], s["net_cash_cost"], s["gross_cost"]
    benefits = s["total_benefits"]
    idle, vault = s["total_avg_idle_m"], s["total_avg_vault_m"]
    ir = _d(idle, vault)
    top5, bot5 = ranked[:5], ranked[-5:]
    prof = [t for t in tp if t["status"] == "profit_centre"]
    cost_c = [t for t in tp if t["status"] == "cost_centre"]

    risks = []
    if ir > 0.20:
        risks.append({"severity": "high", "category": "Idle Cash",
                      "description": f"Idle-cash ratio {ir:.1%} exceeds 20% (avg PKR {idle:,.0f} M idle)."})
    elif ir > 0.10:
        risks.append({"severity": "medium", "category": "Idle Cash",
                      "description": f"Idle-cash ratio {ir:.1%}. Consider rebalancing."})
    if not risks:
        risks.append({"severity": "low", "category": "General",
                      "description": "Cash ops within normal parameters."})

    recs = [{"priority": 1, "action": "Reduce Idle Cash Holdings",
             "potential_savings_pkr": round(pools.get("idle_cash_opportunity_cost", 0) * 0.3 * 1e6, 0),
             "description": "Redeploy 30% of idle cash via overnight repo."}]
    if bot5:
        wc = sum(b["net_cash_cost"] for b in bot5)
        recs.append({"priority": 2, "action": "Targeted Q4 Branch Intervention",
                     "potential_savings_pkr": round(wc * 0.15 * 1e6, 0),
                     "description": f"Bottom 5 branches' net cash cost PKR {wc:,.1f} M; ~15% reducible."})

    def _br(lst):
        return [{"branch_id": b["branch_id"], "name": b["name"],
                 "cost_per_million_txn": b["cost_per_million_txn_value"],
                 "quartile": b.get("quartile")} for b in lst]

    return {
        "report_title": "ALCO Cash Operations P&L Report (reconciled ledger)",
        "bank": "United Bank Limited", "report_date": s["lineage"]["as_of"],
        "prepared_for": "Asset-Liability Committee",
        "executive_summary": {
            "network_branches": nb,
            "gross_cash_cost_pkr": round(gross, 1),
            "total_benefits_pkr": round(benefits, 1),
            "net_cash_cost_pkr": round(net, 1),
            "cost_per_branch_pkr": round(_d(net, nb), 1),
            "cost_per_transaction_pkr": s["cost_per_transaction"],
            "net_interest_income_pkr": s["net_interest_income_m"],
            "fee_income_pkr": s["fee_income_m"],
            "net_contribution_pkr": s["net_contribution_m"],
            "total_vault_balance_pkr": round(vault, 1),
            "total_idle_cash_pkr": round(idle, 1),
            "idle_cash_ratio_pct": round(ir * 100, 2),
        },
        "cost_breakdown": {n: {"amount_pkr": round(pools.get(n, 0), 1),
                               "pct_of_gross": round(_d(abs(pools.get(n, 0)), gross) * 100, 2)}
                           for n in POOL_NAMES},
        "transfer_pricing": {"profit_centres": len(prof), "cost_centres": len(cost_c),
                             "total_capital_charge_pkr": round(sum(t["capital_charge_annual"] for t in tp), 1),
                             "total_credits_pkr": round(sum(t["total_credits"] for t in tp), 1)},
        "tournament_ranking": {"top_5": _br(top5), "bottom_5": _br(bot5)},
        "risk_flags": risks,
        "recommendations": recs,
        "rates_applied": s["rates"],
        "lineage": s["lineage"],
    }
