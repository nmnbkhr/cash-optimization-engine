import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc07", tags=["uc07"])


@router.get("/summary")
async def denomination_summary(db: Session = Depends(get_db)):
    """Denomination mix optimization summary metrics."""
    try:
        from app.services.uc07_denomination import get_denomination_summary
        return get_denomination_summary(db)
    except Exception as e:
        logger.exception("Denomination summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branch/{branch_id}")
async def branch_denomination(branch_id: str, db: Session = Depends(get_db)):
    """Denomination breakdown for a specific branch."""
    try:
        from app.models.branch import Branch
        from app.services.uc07_denomination import get_branch_denomination
        branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
        if not branch:
            raise HTTPException(status_code=404, detail=f"Branch {branch_id} not found")
        return get_branch_denomination(db, branch.id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Branch denomination failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/penalty-heatmap")
async def penalty_heatmap(db: Session = Depends(get_db)):
    """City-level penalty risk heatmap data."""
    try:
        from app.services.uc07_denomination import get_penalty_heatmap
        return get_penalty_heatmap(db)
    except Exception as e:
        logger.exception("Penalty heatmap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def optimize_denomination(
    branch_id: str = Query(None, description="Optional branch ID like ABB-001"),
    scenario: str = Query(None, description="Optional scenario: normal, eid, ramadan"),
    db: Session = Depends(get_db),
):
    """Run NSGA-II multi-objective denomination optimization."""
    try:
        from app.services.uc07_denomination import DenominationOptimizer
        resolved_branch_id = None
        if branch_id:
            from app.models.branch import Branch
            branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
            if not branch:
                raise HTTPException(status_code=404, detail=f"Branch {branch_id} not found")
            resolved_branch_id = branch.id
        return DenominationOptimizer().optimize(db, branch_id=resolved_branch_id, scenario=scenario or "normal")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Denomination optimization failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def denomination_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for denomination mix optimization results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc07_denomination import get_denomination_summary
        summary = get_denomination_summary(db)

        system_prompt = (
            "You are a senior bank operations analyst specializing in currency denomination management. "
            "Given pre-computed denomination mix optimization results for a Pakistani bank, write a 4-5 sentence "
            "executive brief. Include: current denomination distribution analysis, SBP penalty exposure, "
            "NSGA-II Pareto optimization findings, seasonal scenario impacts (Eid/Ramadan), and recommended actions. "
            "Do NOT recompute anything -- just narrate the provided results clearly."
        )
        user_content = (
            f"Total Notes Value: {summary.get('total_notes_value', 0)/1e9:.1f}B PKR\n"
            f"Fit/Soiled Ratio: {summary.get('fit_soiled_ratio', 0):.2f}\n"
            f"Annual Penalty Exposure: {summary.get('annual_penalty_exposure', 0):.1f}M PKR\n"
            f"Branches at Risk: {summary.get('branches_at_risk', 0)}\n"
            f"Optimization Potential: {summary.get('optimization_potential', 0):.1f}%\n"
            f"Total Branches: {summary.get('total_branches', 0)}\n"
            f"Denominations Tracked: {summary.get('denominations_tracked', 7)}\n"
            f"Soiled Rate: {summary.get('soiled_rate', 0):.1%}\n"
            f"Penalty Hotspots: {summary.get('penalty_hotspot_cities', 'N/A')}"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("Denomination AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
