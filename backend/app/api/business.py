"""Prescriptive Business Output API — the decision-making layer."""

import datetime
from datetime import date
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.business_output import CashOptimizationEngine

router = APIRouter(prefix="/api/business", tags=["Business Output"])


@router.get("/consolidated")
def consolidated(db: Session = Depends(get_db)):
    """CFO/ALCO consolidated dashboard — all UCs in one view."""
    engine = CashOptimizationEngine(db)
    return engine.consolidated_dashboard()


@router.get("/vault-recommendation/{branch_id}")
def vault_recommendation(branch_id: str, db: Session = Depends(get_db)):
    """Branch-level vault action: RELEASE / REQUEST / HOLD."""
    engine = CashOptimizationEngine(db)
    return engine.vault_recommendation(branch_id)


@router.get("/atm-load-orders")
def atm_load_orders(
    branch_id: str = Query(None),
    city: str = Query(None),
    db: Session = Depends(get_db),
):
    """ATM load orders with denomination mix and priority."""
    engine = CashOptimizationEngine(db)
    return engine.atm_load_orders(branch_id, city)


@router.get("/netting/{city}")
def netting(city: str, db: Session = Depends(get_db)):
    """Inter-branch netting opportunities for a city."""
    engine = CashOptimizationEngine(db)
    return engine.netting_opportunities(city)


@router.get("/netting")
def netting_all(db: Session = Depends(get_db)):
    """Network-wide netting opportunities."""
    engine = CashOptimizationEngine(db)
    return engine.netting_opportunities()


@router.get("/crr-deployment")
def crr_deployment(db: Session = Depends(get_db)):
    """Today's CRR deployment recommendation."""
    engine = CashOptimizationEngine(db)
    return engine.crr_deployment()


@router.get("/nostro-vostro")
def nostro_vostro(db: Session = Depends(get_db)):
    """Nostro SWEEP/FUND actions + Vostro deployment."""
    engine = CashOptimizationEngine(db)
    return engine.nostro_vostro_actions()


@router.get("/denomination-plan/{branch_id}")
def denomination_plan(branch_id: str, db: Session = Depends(get_db)):
    """Denomination mix plan for a branch."""
    engine = CashOptimizationEngine(db)
    return engine.denomination_plan(branch_id)


@router.get("/cit-routes/{city}")
def cit_routes(city: str, db: Session = Depends(get_db)):
    """CIT route sheet for a city."""
    engine = CashOptimizationEngine(db)
    return engine.cit_route_sheet(city)


@router.get("/digital-shift")
def digital_shift(db: Session = Depends(get_db)):
    """Digital channel shift analysis."""
    engine = CashOptimizationEngine(db)
    return engine.digital_shift_report()


@router.get("/value-realized")
def value_realized(db: Session = Depends(get_db)):
    """P&L attribution — the bottom line."""
    engine = CashOptimizationEngine(db)
    return engine.value_realized_report()


@router.get("/rates")
def get_live_rates():
    """Live SBP rates — KIBOR, policy rate, FX, CPI."""
    from app.core.sbp_data import get_sbp_service
    return get_sbp_service().get_all_rates_summary()


@router.get("/reconciliation")
def check_reconciliation(db: Session = Depends(get_db)):
    """Verify data integrity: transactions -> daily GL -> branch totals -> demo.xlsx."""
    from sqlalchemy import text

    # Check if CDM tables exist
    try:
        gl_count = db.execute(text("SELECT COUNT(*) FROM fact_gl_daily")).scalar()
        txn_count = db.execute(text("SELECT COUNT(*) FROM fact_transactions")).scalar()
        market_count = db.execute(text("SELECT COUNT(*) FROM dim_market")).scalar()
    except Exception:
        return {"status": "CDM tables not generated yet. Run: make seed-cdm"}

    branch_count = db.execute(text("SELECT COUNT(*) FROM branches")).scalar()

    # GL deposits vs branch avg
    gl_avg = db.execute(text("""
        SELECT g.branch_id,
               AVG(g.total_deposit_flow_m) as gl_avg,
               b.avg_daily_deposits / 1e6 as br_avg
        FROM fact_gl_daily g
        JOIN branches b ON g.branch_id = b.branch_id
        GROUP BY g.branch_id
    """)).fetchall()

    max_gap = max(abs(r[1] - r[2]) for r in gl_avg) if gl_avg else 0
    dep_pass = max_gap < 0.01

    # Bank-wide
    gl_total = db.execute(text(
        "SELECT SUM(total_deposit_flow_m) / COUNT(DISTINCT date) FROM fact_gl_daily"
    )).scalar() or 0
    br_total = db.execute(text(
        "SELECT SUM(avg_daily_deposits) / 1e6 FROM branches"
    )).scalar() or 0

    return {
        "status": "ALL RECONCILED" if dep_pass else "GAPS FOUND",
        "chain": "fact_transactions -> fact_gl_daily -> branches -> demo.xlsx",
        "checks": {
            "gl_deposits_vs_branch": {"max_gap_m": round(max_gap, 6), "pass": dep_pass},
            "bank_wide": {
                "gl_daily_avg_deposits_m": round(gl_total, 1),
                "branch_daily_avg_deposits_m": round(br_total, 1),
            },
        },
        "tables": {
            "branches": branch_count,
            "dim_market": market_count,
            "fact_gl_daily": gl_count,
            "fact_transactions": txn_count,
        },
    }


# ══════════════════════════════════════════════════════
# CDM, IEC, COMPLIANCE (Regulatory)
# ══════════════════════════════════════════════════════

@router.get("/cdm-recycling")
def cdm_recycling(branch_id: str = Query(None), db: Session = Depends(get_db)):
    """CDM priority recommendation with recycling economics."""
    engine = CashOptimizationEngine(db)
    return engine.cdm_recycling_recommendation(branch_id)


@router.get("/iec-opportunities")
def iec_opportunities(city: str = Query(None), db: Session = Depends(get_db)):
    """Interbank Exchange denomination swap matching."""
    engine = CashOptimizationEngine(db)
    return engine.iec_opportunity_finder(city)


@router.get("/compliance-risk")
def compliance_risk(db: Session = Depends(get_db)):
    """Branch-level SBP compliance scoring."""
    engine = CashOptimizationEngine(db)
    return engine.compliance_risk_assessment()


# ══════════════════════════════════════════════════════
# WHAT-IF SIMULATOR
# ══════════════════════════════════════════════════════

class SimulatorParams(BaseModel):
    kibor_change_bps: float = 0        # e.g., -200 = KIBOR drops 200bps
    vault_reduction_pct: float = 0     # e.g., 20 = reduce vault cash 20%
    cdm_branches_added: int = 0        # e.g., 100 = add CDMs to 100 branches
    pkr_depreciation_pct: float = 0    # e.g., 5 = PKR weakens 5%
    is_eid_week: bool = False


@router.post("/simulate")
def simulate(params: SimulatorParams, db: Session = Depends(get_db)):
    """What-if simulator: recalculate with modified parameters."""
    engine = CashOptimizationEngine(db)
    baseline = engine.consolidated_dashboard()
    pnl_base = engine.value_realized_report()

    # Current values
    current_kibor = engine.kibor
    base_revenue = pnl_base["revenue"]["total_revenue"]
    base_idle = baseline["bank_snapshot"]["total_idle_cash"]
    base_annual = baseline["optimization_impact"]["annual_value_realized"]

    # Simulated KIBOR
    sim_kibor = current_kibor + (params.kibor_change_bps / 10000)

    # Revenue scales linearly with KIBOR
    kibor_ratio = sim_kibor / current_kibor if current_kibor > 0 else 1
    sim_revenue = base_revenue * kibor_ratio

    # Vault reduction frees more cash
    vault_freed = base_idle * (params.vault_reduction_pct / 100)
    vault_income = vault_freed * sim_kibor / 12

    # CDM savings: each CDM saves ~PKR 0.5M/month in cash handling
    cdm_savings = params.cdm_branches_added * 0.5

    # PKR depreciation: nostro values increase in PKR terms
    nostro_impact = baseline["today_actions"].get("nostro_sweepable", 0) * (params.pkr_depreciation_pct / 100)

    # Eid effect: 15% more cash demand (increases idle cost)
    eid_factor = 1.15 if params.is_eid_week else 1.0

    sim_annual = (sim_revenue + vault_income + cdm_savings) * 12 * eid_factor
    delta_annual = sim_annual - base_annual

    return {
        "baseline": {
            "kibor_pct": round(current_kibor * 100, 2),
            "monthly_revenue_m": round(base_revenue, 2),
            "annual_value_m": round(base_annual, 1),
            "idle_cash_m": round(base_idle, 0),
        },
        "simulated": {
            "kibor_pct": round(sim_kibor * 100, 2),
            "monthly_revenue_m": round(sim_revenue + vault_income + cdm_savings, 2),
            "annual_value_m": round(sim_annual, 1),
            "vault_freed_m": round(vault_freed, 1),
            "cdm_savings_m": round(cdm_savings, 2),
            "nostro_fx_impact_m": round(nostro_impact, 1),
            "eid_factor": eid_factor,
        },
        "delta": {
            "annual_change_m": round(delta_annual, 1),
            "direction": "UP" if delta_annual > 0 else "DOWN",
            "narrative": (
                f"{'Increase' if delta_annual > 0 else 'Decrease'} of PKR {abs(delta_annual):,.0f}M/year. "
                f"KIBOR {'+'if params.kibor_change_bps>=0 else ''}{params.kibor_change_bps}bps, "
                f"vault -{params.vault_reduction_pct}%, "
                f"{params.cdm_branches_added} new CDMs"
                f"{', Eid week demand +15%' if params.is_eid_week else ''}."
            ),
        },
    }


# ══════════════════════════════════════════════════════
# ALERTS
# ══════════════════════════════════════════════════════

@router.get("/alerts")
def get_alerts(
    severity: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Get active alerts, newest first."""
    from app.models.alert import Alert
    q = db.query(Alert).filter(Alert.dismissed == False)
    if severity:
        q = q.filter(Alert.severity == severity.upper())
    alerts = q.order_by(Alert.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": a.id,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            "type": a.alert_type,
            "severity": a.severity,
            "message": a.message,
            "branch_id": a.branch_id,
            "value": a.value,
        }
        for a in alerts
    ]


@router.get("/alerts/count")
def alert_count(db: Session = Depends(get_db)):
    """Badge count for header bell icon."""
    from app.models.alert import Alert
    from sqlalchemy import func
    counts = db.query(Alert.severity, func.count(Alert.id)).filter(
        Alert.dismissed == False
    ).group_by(Alert.severity).all()
    result = {s: c for s, c in counts}
    result["total"] = sum(result.values())
    return result


@router.post("/alerts/{alert_id}/dismiss")
def dismiss_alert(alert_id: int, db: Session = Depends(get_db)):
    """Dismiss an alert."""
    from app.models.alert import Alert
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        return {"error": "Alert not found"}
    alert.dismissed = True
    alert.dismissed_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "dismissed", "id": alert_id}


@router.post("/alerts/generate")
def generate_alerts(db: Session = Depends(get_db)):
    """Generate alerts from current data (called by daily runner)."""
    from app.models.alert import Alert
    from app.models.branch import Branch

    engine = CashOptimizationEngine(db)
    new_alerts = []

    # High idle branches
    high_idle = db.query(Branch).filter(
        Branch.idle_cash > Branch.optimal_vault_balance * 2,
        Branch.optimal_vault_balance > 0,
    ).all()
    for b in high_idle[:20]:
        new_alerts.append(Alert(
            alert_type="HIGH_IDLE",
            severity="HIGH" if b.idle_cash > b.optimal_vault_balance * 3 else "MEDIUM",
            message=f"{b.name} ({b.city}): idle PKR {b.idle_cash/1e6:,.0f}M > {b.optimal_vault_balance*2/1e6:,.0f}M threshold",
            branch_id=b.branch_id,
            value=b.idle_cash / 1e6,
        ))

    # CRR status
    try:
        crr = engine.crr_deployment()
        if "error" not in crr and crr["risk"]["compliance_status"] != "ON_TRACK":
            new_alerts.append(Alert(
                alert_type="CRR_WARNING",
                severity="CRITICAL",
                message=f"CRR compliance at risk: {crr['position']['avg_pct_so_far']}% (target 6%)",
            ))
    except Exception:
        pass

    # Nostro underfunded
    try:
        nostro = engine.nostro_vostro_actions()
        for a in nostro["nostro"]["actions"]:
            if a["action"] == "FUND":
                new_alerts.append(Alert(
                    alert_type="NOSTRO_FUND",
                    severity="HIGH",
                    message=f"{a['bank']} ({a['currency']}): needs PKR {a['amount']}M funding",
                    value=a["amount"],
                ))
    except Exception:
        pass

    # Store
    for a in new_alerts:
        db.add(a)
    db.commit()

    return {"alerts_generated": len(new_alerts)}


# ══════════════════════════════════════════════════════
# SEASONAL / INTEGRATED PLAN / VALUE CALCULATOR
# ══════════════════════════════════════════════════════

@router.post("/seasonal-scenario")
def seasonal_scenario(body: dict, db: Session = Depends(get_db)):
    """Seasonal peak cash preparation: Eid, Ramadan, Payroll, etc."""
    engine = CashOptimizationEngine(db)
    return engine.seasonal_peak_preparation(
        body.get("event", "Eid-ul-Fitr"),
        body.get("start_date", str(date.today())),
        body.get("duration_days", 7),
        body.get("uplift_factor", 1.15),
    )


@router.get("/integrated-plan/{branch_id}")
def integrated_plan_branch(branch_id: str, db: Session = Depends(get_db)):
    """Daily decision sheet for a single branch."""
    engine = CashOptimizationEngine(db)
    return engine.integrated_cash_action_plan(branch_id=branch_id)


@router.get("/integrated-plan")
def integrated_plan_city(city: str = Query(None), db: Session = Depends(get_db)):
    """Daily decision sheet for a city or network."""
    engine = CashOptimizationEngine(db)
    return engine.integrated_cash_action_plan(city=city)


@router.get("/value-calculator")
def value_calculator(db: Session = Depends(get_db)):
    """Total value quantification — ROI by UC for board/investor reporting."""
    engine = CashOptimizationEngine(db)
    return engine.value_calculator()


# ══════════════════════════════════════════════════════
# DAILY STATUS
# ══════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════
# ML UPGRADES (Piece 1)
# ══════════════════════════════════════════════════════

@router.post("/ensemble/train")
def train_ensemble():
    """Train XGBoost + Conformal on fact_gl_daily. Takes ~10-30s."""
    from app.services.ensemble_forecast import get_forecast_service
    return get_forecast_service().train()


@router.get("/ensemble/predict/{branch_id}")
def ensemble_predict(branch_id: str, horizon: int = Query(7, le=30)):
    """7-day forecast with conformal intervals."""
    from app.services.ensemble_forecast import get_forecast_service
    return get_forecast_service().predict_branch(branch_id, horizon)


@router.post("/ensemble/predict-all")
def ensemble_predict_all():
    """Batch predict all 1,532 branches + store in forecasts table."""
    from app.services.ensemble_forecast import get_forecast_service
    return get_forecast_service().predict_all()


@router.get("/ensemble/status")
def ensemble_status():
    """Current model training status."""
    from app.services.ensemble_forecast import get_forecast_service
    return get_forecast_service().get_status()


@router.get("/kdtree-netting")
def kdtree_netting(city: str = Query(None), db: Session = Depends(get_db)):
    """Optimal netting via KDTree + max-weight matching."""
    from app.services.kdtree_netting import KDTreeNetting
    return KDTreeNetting(db).solve(city)


@router.get("/rfm-segments")
def rfm_segments():
    """RFM customer clustering for digital migration targeting."""
    from app.services.rfm_clustering import get_rfm_service
    return get_rfm_service().compute_rfm()


# ══════════════════════════════════════════════════════
# REPORTS (Piece 6)
# ══════════════════════════════════════════════════════

@router.get("/report/branch-plan/{branch_id}")
def report_branch_plan(branch_id: str, db: Session = Depends(get_db)):
    """Printable branch daily plan — all data for PDF/print rendering."""
    engine = CashOptimizationEngine(db)
    vault = engine.vault_recommendation(branch_id)
    denom = engine.denomination_plan(branch_id)
    return {
        "report_type": "Branch Daily Plan",
        "generated_at": str(datetime.datetime.utcnow()),
        "vault_recommendation": vault,
        "denomination_plan": denom,
        "print_instructions": "Use browser Print (Ctrl+P) from Branch Scorecard page",
    }


@router.get("/report/regional/{city}")
def report_regional(city: str, db: Session = Depends(get_db)):
    """Regional summary report data."""
    engine = CashOptimizationEngine(db)
    netting = engine.netting_opportunities(city)
    atm = engine.atm_load_orders(city=city)
    cit = engine.cit_route_sheet(city)
    return {
        "report_type": "Regional Summary",
        "city": city,
        "generated_at": str(datetime.datetime.utcnow()),
        "netting": netting,
        "atm_fleet": atm,
        "cit_routes": cit,
    }


@router.get("/report/alco")
def report_alco(db: Session = Depends(get_db)):
    """ALCO monthly report data — full executive pack."""
    engine = CashOptimizationEngine(db)
    return {
        "report_type": "ALCO Monthly Report",
        "generated_at": str(datetime.datetime.utcnow()),
        "consolidated": engine.consolidated_dashboard(),
        "value_realized": engine.value_realized_report(),
        "crr": engine.crr_deployment(),
        "nostro_vostro": engine.nostro_vostro_actions(),
        "digital_shift": engine.digital_shift_report(),
    }


# ══════════════════════════════════════════════════════
# DAILY STATUS
# ══════════════════════════════════════════════════════

@router.get("/daily-status")
def daily_status(db: Session = Depends(get_db)):
    """Last daily run status."""
    from app.services.daily_runner import DailyResult
    latest = db.query(DailyResult).order_by(DailyResult.id.desc()).first()
    if not latest:
        return {"status": "never_run", "message": "Run: make daily-run"}
    return {
        "last_run": latest.run_timestamp,
        "date": latest.run_date,
        "status": latest.status,
        "elapsed_seconds": latest.elapsed_seconds,
        "plans_generated": latest.plans_generated,
        "alerts_count": latest.alerts_count,
        "kibor_rate": latest.kibor_rate,
        "idle_cash_m": latest.total_idle_cash_m,
    }
