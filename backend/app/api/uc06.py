import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc06", tags=["uc06"])


@router.get("/summary")
async def vostro_summary(db: Session = Depends(get_db)):
    """Vostro liability optimization summary metrics."""
    try:
        from app.services.uc06_vostro import get_vostro_summary
        return get_vostro_summary(db)
    except Exception as e:
        logger.exception("Vostro summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/portfolio")
async def vostro_portfolio(db: Session = Depends(get_db)):
    """All vostro accounts with LaR analysis."""
    try:
        from app.services.uc06_vostro import get_vostro_portfolio
        return get_vostro_portfolio(db)
    except Exception as e:
        logger.exception("Vostro portfolio failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/deployment-breakdown")
async def deployment_breakdown(db: Session = Depends(get_db)):
    """Deployment breakdown for stacked bar visualization."""
    try:
        from app.services.uc06_vostro import get_deployment_breakdown
        return get_deployment_breakdown(db)
    except Exception as e:
        logger.exception("Deployment breakdown failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compute-lar")
async def compute_lar(db: Session = Depends(get_db)):
    """Compute Liquidity-at-Risk across all vostro accounts."""
    try:
        from app.services.uc06_vostro import VostroLaREngine
        return VostroLaREngine().compute_all(db)
    except Exception as e:
        logger.exception("Vostro LaR computation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize-deployment")
async def optimize_deployment(db: Session = Depends(get_db)):
    """Optimize vostro balance deployment across instruments."""
    try:
        from app.services.uc06_vostro import VostroDeploymentOptimizer
        return VostroDeploymentOptimizer().optimize_deployment(db)
    except Exception as e:
        logger.exception("Vostro deployment optimization failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cooperative-game")
async def cooperative_game(db: Session = Depends(get_db)):
    """Run cooperative game theory analysis for vostro pooling."""
    try:
        from app.services.uc06_vostro import VostroCooperativeGame
        return VostroCooperativeGame().analyze_cooperation(db)
    except Exception as e:
        logger.exception("Vostro cooperative game failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def vostro_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for vostro liability optimization results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc06_vostro import get_vostro_summary
        summary = get_vostro_summary(db)

        system_prompt = (
            "You are a senior bank treasury analyst specializing in vostro liability management. "
            "Given pre-computed vostro optimization results for a Pakistani bank, write a 4-5 sentence "
            "executive brief. Include: stable vs volatile balance analysis, deployment income opportunity, "
            "LaR metrics, and cooperative pooling benefits. "
            "Do NOT recompute anything -- just narrate the provided results clearly."
        )
        user_content = (
            f"Total Vostro Balances: {summary.get('total_vostro_balance', 0)/1e9:.1f}B PKR\n"
            f"Stable Portion: {summary.get('stable_portion', 0)/1e9:.1f}B PKR\n"
            f"Volatile Portion: {summary.get('volatile_portion', 0)/1e9:.1f}B PKR\n"
            f"Current Deployment Income: {summary.get('current_deployment_income', 0):.1f}M PKR\n"
            f"Optimization Gap: {summary.get('optimization_gap', 0):.1f}M PKR\n"
            f"Respondent Banks: {summary.get('respondent_banks', 0)}\n"
            f"Avg Stability Ratio: {summary.get('avg_stability_ratio', 0):.1%}\n"
            f"Total Deployable: {summary.get('total_deployable', 0)/1e9:.1f}B PKR\n"
            f"LaR 99% (1-day): {summary.get('lar_99_1d', 0):.1f}M PKR\n"
            f"Pooling Benefit: {summary.get('pooling_benefit', 0):.1f}M PKR"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("Vostro AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
