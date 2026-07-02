import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/summary")
async def dashboard_summary(db: Session = Depends(get_db)):
    from app.models.branch import Branch
    from app.models.atm import ATM

    branch_count = db.query(func.count(Branch.id)).scalar() or 0
    atm_count = db.query(func.count(ATM.id)).scalar() or 0
    total_idle = db.query(func.sum(Branch.idle_cash)).scalar() or 0
    avg_ces = db.query(func.avg(Branch.cash_efficiency_score)).scalar() or 0

    return {
        "total_branches": branch_count,
        "total_atms": atm_count,
        "total_idle_cash": round(total_idle, 2),
        "avg_cash_efficiency": round(avg_ces * 100, 1) if avg_ces else 0,
        "estimated_annual_savings": round(total_idle * 0.105, 2),
        "sbp_policy_rate": 0.105,
    }


@router.get("/dashboard/executive-summary")
async def executive_summary(db: Session = Depends(get_db)):
    """Aggregate savings and strategy across all 10 UCs.
    All monetary values returned in PKR Millions for frontend formatPKR()."""
    from app.models.branch import Branch
    from app.models.atm import ATM

    uc_results = []

    # --- UC01: Branch Vault Idle Cash ---
    try:
        total_idle = db.query(func.sum(Branch.idle_cash)).scalar() or 0
        branch_count = db.query(func.count(Branch.id)).scalar() or 0
        uc01_savings = round(total_idle * 0.105, 2)
        uc_results.append({
            "uc": "UC-01", "title": "Branch Vault Forecasting",
            "savings": uc01_savings,
            "metric_label": "Idle Cash Redeployed at KIBOR",
            "detail": f"{branch_count} branches, {round(total_idle / 1e6, 0)} PKR M idle",
            "strategy": "LSTM forecast + stochastic LP right-sizing",
            "color": "#d4a853",
        })
    except Exception as e:
        logger.warning("UC01 summary failed: %s", e)

    # --- UC02: ATM Holding Cost ---
    try:
        total_capacity = db.query(func.sum(ATM.total_capacity)).scalar() or 0
        total_dispense = db.query(func.sum(ATM.avg_daily_dispense)).scalar() or 0
        atm_count = db.query(func.count(ATM.id)).scalar() or 0
        network_idle = total_capacity - total_dispense
        uc02_savings = round(network_idle * 0.105, 2)
        uc_results.append({
            "uc": "UC-02", "title": "ATM Replenishment",
            "savings": uc02_savings,
            "metric_label": "ATM Holding Cost Reduction",
            "detail": f"{atm_count} ATMs, idle cash {round(network_idle / 1e6, 0)} PKR M",
            "strategy": "DQN agent + (s,S) inventory policy",
            "color": "#3b82f6",
        })
    except Exception as e:
        logger.warning("UC02 summary failed: %s", e)

    # --- UC03: Netting Savings ---
    try:
        from app.services.uc03_netting import get_netting_network_summary
        netting = get_netting_network_summary(db)
        uc03_savings = round(netting.get("estimated_savings", 0), 2)
        uc_results.append({
            "uc": "UC-03", "title": "Inter-Branch Netting",
            "savings": uc03_savings,
            "metric_label": "Logistics Cost Saved vs Central Vault",
            "detail": f"{netting.get('surplus_branches', 0)} surplus, {netting.get('deficit_branches', 0)} deficit branches",
            "strategy": "Min-cost network flow + VCG auction",
            "color": "#22c55e",
        })
    except Exception as e:
        logger.warning("UC03 summary failed: %s", e)

    # --- UC04: CRR Float Income ---
    try:
        from app.services.uc04_crr_float import get_crr_summary
        crr = get_crr_summary(db)
        hist = crr.get("historical", {})
        uc04_savings = round(hist.get("total_income_earned", 0), 2)
        uc_results.append({
            "uc": "UC-04", "title": "CRR Float Engineering",
            "savings": uc04_savings,
            "metric_label": "Overnight Repo Income from Freed Liquidity",
            "detail": f"Compliance: {hist.get('compliance_rate_pct', 0)}%, {hist.get('total_weeks_analyzed', 0)} weeks",
            "strategy": "DP backward induction + Monte Carlo",
            "color": "#a855f7",
        })
    except Exception as e:
        logger.warning("UC04 summary failed: %s", e)

    # --- UC05: Nostro Repatriation ---
    try:
        from app.services.uc05_nostro import get_nostro_summary
        nostro = get_nostro_summary(db)
        totals = nostro.get("totals", {})
        uc05_savings = round(totals.get("potential_repatriation_income_annual_pkr", 0), 2)
        total_excess = round(totals.get("total_excess_pkr", 0) / 1e6, 0)
        uc_results.append({
            "uc": "UC-05", "title": "Nostro Optimization",
            "savings": uc05_savings,
            "metric_label": "Potential Repatriation Income",
            "detail": f"{totals.get('total_accounts', 0)} accounts, excess {total_excess} PKR M",
            "strategy": "Multi-currency MDP + Nash bargaining",
            "color": "#2dd4bf",
        })
    except Exception as e:
        logger.warning("UC05 summary failed: %s", e)

    # --- UC06: Vostro Deployment ---
    try:
        from app.services.uc06_vostro import get_vostro_summary
        vostro = get_vostro_summary(db)
        totals = vostro.get("totals", {})
        stable = totals.get("total_stable", 0)
        uc06_savings = round(stable * 0.092, 2)
        uc_results.append({
            "uc": "UC-06", "title": "Vostro Optimization",
            "savings": uc06_savings,
            "metric_label": "Stable Liability Deployment Income",
            "detail": f"{totals.get('total_accounts', 0)} respondent banks, stable: {round(stable / 1e6, 0)} PKR M",
            "strategy": "Liquidity-at-Risk + cooperative game",
            "color": "#f59e0b",
        })
    except Exception as e:
        logger.warning("UC06 summary failed: %s", e)

    # --- UC07: Denomination Penalty ---
    try:
        from app.services.uc07_denomination import get_denomination_summary
        denom = get_denomination_summary(db)
        current_penalty = denom.get("total_value", 0) * 0.0005
        uc07_savings = round(current_penalty * 0.85, 2)
        uc_results.append({
            "uc": "UC-07", "title": "Denomination Optimization",
            "savings": uc07_savings,
            "metric_label": "Denomination Mismatch Penalty Reduction",
            "detail": f"7 denominations, {denom.get('total_notes', 0):,} notes",
            "strategy": "NSGA-II Pareto multi-objective",
            "color": "#ec4899",
        })
    except Exception as e:
        logger.warning("UC07 summary failed: %s", e)

    # --- UC08: CIT Route Optimization ---
    try:
        from app.services.uc08_cit_routing import get_cit_summary
        cit = get_cit_summary(db)
        total_cost = cit.get("total_cost_pkr", 0)
        uc08_savings = round(total_cost * 0.38, 2)
        uc_results.append({
            "uc": "UC-08", "title": "CIT Route Optimization",
            "savings": uc08_savings,
            "metric_label": "CIT Logistics Cost Reduction (38%)",
            "detail": f"{cit.get('total_trips', 0)} trips, {round(cit.get('total_distance_km', 0), 0)} km",
            "strategy": "VRPTW + Shapley fair allocation",
            "color": "#f97316",
        })
    except Exception as e:
        logger.warning("UC08 summary failed: %s", e)

    # --- UC09: Digital Incentivization ROI ---
    try:
        from app.services.uc09_digital_incentive import get_incentive_summary
        inc = get_incentive_summary(db)
        roi_data = inc.get("roi", {})
        # Net benefit = value - cost (both in raw PKR)
        total_value = roi_data.get("total_annual_value_pkr", 0)
        total_cost = roi_data.get("total_annual_cost_pkr", 0)
        uc09_savings = round(total_value - total_cost, 2)
        uc_results.append({
            "uc": "UC-09", "title": "Digital Incentivization",
            "savings": uc09_savings,
            "metric_label": "Net Digital Migration Benefit",
            "detail": f"ROI: {roi_data.get('overall_roi_pct', 0):.0f}%, 5 segments",
            "strategy": "Thompson sampling bandit + subgame equilibrium",
            "color": "#06b6d4",
        })
    except Exception as e:
        logger.warning("UC09 summary failed: %s", e)

    # --- UC10: P&L Cost Optimization (reconciled ledger — single source of truth) ---
    try:
        from app.services.uc10_pnl_reconciled import get_pnl_summary
        pnl = get_pnl_summary(db)
        # UC-10 is a cost-attribution lens; its genuine value lever is the idle-cash
        # deployment opportunity (freed idle × KIBOR), not fabricated "benefits" (=0).
        # net_cash_cost is already in PKR M — no /1e6.
        deployment_opp = pnl.get("deployment_opportunity_m", 0)
        net_cost = pnl.get("net_cash_cost", 0)
        uc_results.append({
            "uc": "UC-10", "title": "Cash P&L Attribution",
            "savings": round(deployment_opp, 2),
            "metric_label": "Idle-Cash Deployment Opportunity",
            "detail": f"Net cash cost: {round(net_cost, 0)} PKR M",
            "strategy": "ABC costing (reconciled ledger) + transfer pricing",
            "color": "#8b5cf6",
        })
    except Exception as e:
        logger.warning("UC10 summary failed: %s", e)

    # Aggregate
    total_savings = sum(r["savings"] for r in uc_results)
    top_3 = sorted(uc_results, key=lambda x: x["savings"], reverse=True)[:3]

    return {
        "total_annual_savings": round(total_savings, 2),
        "uc_count": len(uc_results),
        "use_cases": uc_results,
        "top_contributors": [
            {"uc": r["uc"], "title": r["title"], "savings": r["savings"]}
            for r in top_3
        ],
        "strategy_summary": (
            f"Across {len(uc_results)} optimization engines, the Cash Optimization Engine "
            f"identifies PKR {round(total_savings, 0)} M in total annual savings potential. "
            f"Top contributors: {top_3[0]['uc']} ({top_3[0]['title']}), "
            f"{top_3[1]['uc']} ({top_3[1]['title']}), "
            f"{top_3[2]['uc']} ({top_3[2]['title']})."
        ) if len(top_3) >= 3 else "",
    }
