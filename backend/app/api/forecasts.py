import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["forecasts"])


@router.post("/uc01/forecast/{branch_id}")
async def forecast_branch(branch_id: str, db: Session = Depends(get_db)):
    """Run LSTM forecast on GPU for a branch. Returns 7-day prediction with CI."""
    from app.models.branch import Branch
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    try:
        from app.services.uc01_vault_forecast import forecast_branch as run_forecast
        result = run_forecast(db, branch.id)
        return result
    except Exception as e:
        logger.exception("Forecast failed for %s", branch_id)
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


@router.post("/uc01/closing-balance-forecast")
async def closing_balance_forecast(payload: dict | None = None):
    """7-day-forward CLOSING-BALANCE forecast per branch (the business north star).

    Body (optional): {"branch_ids": [...], "limit": N, "persist": false}.
    Returns each branch's 7-day path {predicted, lower, upper, band_pct, actual,
    within_125} plus a network-level coverage summary (held-out last-30-day backtest).
    Interval is split-conformal on the closing-balance residual directly, stratified
    by horizon x (branch_type x salary x eid) segment.
    """
    payload = payload or {}
    try:
        from app.services.closing_balance_forecast import get_service
        svc = get_service()
        branch_ids = payload.get("branch_ids")
        if not branch_ids and payload.get("limit"):
            # default to a sample so the response stays light unless caller asks for all
            import sqlite3
            from app.services.closing_balance_forecast import DB_PATH
            con = sqlite3.connect(DB_PATH)
            branch_ids = [r[0] for r in con.execute(
                "SELECT branch_id FROM branches ORDER BY branch_id LIMIT ?",
                (int(payload["limit"]),)).fetchall()]
            con.close()
        paths = svc.forecast_path(branch_ids=branch_ids)
        persisted = svc.persist(paths) if payload.get("persist") else 0
        return {
            "model_version": "uc01-closingbal-direct-xgb-v1",
            "origin_date": paths[0]["origin_date"] if paths else None,
            "n_branches": len(paths),
            "network_coverage": svc.coverage,
            "persisted_rows": persisted,
            "forecasts": paths,
        }
    except Exception as e:
        logger.exception("Closing-balance forecast failed")
        raise HTTPException(status_code=500, detail=f"Closing-balance forecast failed: {str(e)}")


@router.post("/uc01/managed-level-forecast")
async def managed_level_forecast(payload: dict | None = None):
    """7-day-forward MANAGED CASH LEVEL forecast per branch (Phase 3 north star).

    Target = EWMA(closing_balance_m, span=7): the smoothed level treasury manages toward,
    with the CIT-reset sawtooth removed (CIT is the optimizer's lever, not a forecast
    target). Direct multi-horizon XGBoost; interval is split-conformal on the T3 residual,
    stratified by horizon x (branch_type x salary x pre_eid). Beats a persistence baseline
    on every horizon/segment in the rolling-origin backtest (incl. Eid windows).

    Body (optional): {"branch_ids": [...], "limit": N, "persist": false}.
    """
    payload = payload or {}
    try:
        from app.services.managed_level_forecast import get_service, DB_PATH
        svc = get_service()
        branch_ids = payload.get("branch_ids")
        if not branch_ids and payload.get("limit"):
            import sqlite3
            con = sqlite3.connect(DB_PATH)
            branch_ids = [r[0] for r in con.execute(
                "SELECT branch_id FROM branches ORDER BY branch_id LIMIT ?",
                (int(payload["limit"]),)).fetchall()]
            con.close()
        paths = svc.forecast_path(branch_ids=branch_ids)
        persisted = svc.persist(paths) if payload.get("persist") else 0
        return {
            "model_version": "uc01-managedlevel-direct-xgb-v1",
            "target": "EWMA(closing_balance_m, span=7)",
            "origin_date": paths[0]["origin_date"] if paths else None,
            "n_branches": len(paths),
            "persisted_rows": persisted,
            "forecasts": paths,
        }
    except Exception as e:
        logger.exception("Managed-level forecast failed")
        raise HTTPException(status_code=500, detail=f"Managed-level forecast failed: {str(e)}")


@router.get("/uc01/exceptions")
async def uc01_exceptions(origin_date: str | None = None,
                          band_threshold: float = 50.0, limit: int | None = None):
    """Scalable human-in-the-loop oversight: branches whose forecast is too uncertain
    (conformal band_pct > threshold) or whose recommendation breaches a HARD constitution
    rule are routed here for review; everything else is auto-handled. Each item carries
    the flag reason, the SHAP drivers, and any constitution violation.

    Optional ?origin_date=YYYY-MM-DD targets a specific window (e.g. a pre-Eid date) so
    the high-uncertainty pre-Eid / HUB branches surface as actionable exceptions.
    """
    try:
        from app.services.exceptions_queue import build_queue
        return build_queue(origin_date=origin_date, band_threshold=band_threshold, limit=limit)
    except Exception as e:
        logger.exception("Exceptions queue failed")
        raise HTTPException(status_code=500, detail=f"Exceptions queue failed: {str(e)}")


@router.get("/uc01/attribution/{branch_id}")
async def uc01_attribution(branch_id: str, origin_date: str | None = None, persist: bool = False):
    """Top-3 signed SHAP drivers (PKR M + %) for a branch's 7-day managed-level path."""
    try:
        from app.services.forecast_attribution import attribution_for_branch, persist_attribution
        import pandas as pd
        origin = pd.Timestamp(origin_date) if origin_date else None
        a = attribution_for_branch(branch_id, origin_dt=origin)
        if persist and "path" in a:
            a["persisted_rows"] = persist_attribution(a)
        return a
    except Exception as e:
        logger.exception("Attribution failed")
        raise HTTPException(status_code=500, detail=f"Attribution failed: {str(e)}")


@router.get("/uc01/branch-oversight/{branch_id}")
async def uc01_branch_oversight(branch_id: str, db: Session = Depends(get_db)):
    """Per-branch explainability + oversight for BranchDetail: top-3 SHAP drivers and the
    band_pct of the managed-level forecast, plus the Cash Constitution status of the
    branch's CURRENT vault position (CLEAR / ANNOTATED / BLOCKED with breach magnitude).
    A position over the insured maximum renders BLOCKED — not actionable as-is."""
    try:
        from app.core.cash_constitution import CONSTITUTION, VAULT_INSURED_FRACTION
        from app.services.forecast_attribution import attribution_for_branch
        from app.models.branch import Branch

        attr = attribution_for_branch(branch_id)
        h1 = attr["path"][0] if attr.get("path") else None

        branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
        constitution = None
        if branch:
            cap_m = (branch.vault_capacity or 0) / 1e6
            cur_m = (branch.current_vault_balance or 0) / 1e6
            vault_min_m = max((branch.avg_daily_withdrawals or 0) / 1e6 * 0.3, 2.0)
            plan = {"vault_balance_m": cur_m, "vault_capacity_m": cap_m,
                    "vault_min_m": vault_min_m}
            rec = CONSTITUTION.enforce(plan, {"action": "VAULT_POSITION", "current_m": cur_m})
            constitution = {
                "status": rec["constitution_status"],
                "auto_flag": rec["auto_flag"],
                "violations": rec["constitution_violations"],
                "current_vault_m": round(cur_m, 1),
                "insured_limit_m": round(VAULT_INSURED_FRACTION * cap_m, 1),
                "vault_min_m": round(vault_min_m, 1),
            }
        return {
            "branch_id": branch_id,
            "origin_date": attr.get("origin_date"),
            "model_version": attr.get("model_version"),
            "h1_predicted_m": h1["predicted_m"] if h1 else None,
            "h1_band_pct": h1["band_pct"] if h1 else None,
            "drivers": h1["drivers"] if h1 else [],
            "path": attr.get("path", []),
            "constitution": constitution,
        }
    except Exception as e:
        logger.exception("Branch oversight failed")
        raise HTTPException(status_code=500, detail=f"Branch oversight failed: {str(e)}")


@router.get("/uc01/explain/{branch_id}")
async def uc01_explain(branch_id: str, origin_date: str | None = None):
    """Grounded copilot narration of a branch forecast. Uses ONLY the stored attribution +
    constitution + band_pct (LLM if reachable, else a deterministic template)."""
    try:
        from app.services.copilot_grounding import explain
        return explain(branch_id, origin_date=origin_date)
    except Exception as e:
        logger.exception("Explain failed")
        raise HTTPException(status_code=500, detail=f"Explain failed: {str(e)}")
