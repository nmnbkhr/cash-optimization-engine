import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc04", tags=["uc04"])


@router.get("/summary")
async def crr_summary(db: Session = Depends(get_db)):
    """CRR float engineering summary metrics."""
    try:
        from app.services.uc04_crr_float import get_crr_summary
        return get_crr_summary(db)
    except Exception as e:
        logger.exception("CRR summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weekly-timeline")
async def crr_weekly_timeline(db: Session = Depends(get_db)):
    """7-day CRR timeline with actual vs optimal schedule."""
    try:
        from app.services.uc04_crr_float import get_crr_weekly_timeline
        return get_crr_weekly_timeline(db)
    except Exception as e:
        logger.exception("CRR weekly timeline failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def crr_optimize(db: Session = Depends(get_db)):
    """Run DP optimizer for optimal CRR schedule."""
    try:
        from app.services.uc04_crr_float import get_optimal_schedule
        return get_optimal_schedule(db)
    except Exception as e:
        logger.exception("CRR optimization failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/strategy-game")
async def crr_strategy_game(db: Session = Depends(get_db)):
    """Run CRR strategy game analysis (Bank vs SBP audit)."""
    try:
        from app.services.uc04_crr_float import CRRStrategyGame
        game = CRRStrategyGame()
        return game.build_payoff_matrices()
    except Exception as e:
        logger.exception("CRR strategy game failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def crr_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for CRR optimization results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc04_crr_float import get_crr_summary
        summary = get_crr_summary(db)

        system_prompt = (
            "You are a senior bank treasury analyst. Given pre-computed CRR optimization "
            "results for a Pakistani bank, write a 4-5 sentence executive brief. "
            "Include: compliance risk, freed liquidity opportunity, recommended strategy. "
            "Do NOT recompute anything — just narrate the provided results clearly."
        )
        user_content = (
            f"Current CRR Ratio: {summary.get('current_crr_ratio', 0):.2f}%\n"
            f"Weekly Average CRR: {summary.get('weekly_avg_crr', 0):.2f}%\n"
            f"Freed Liquidity: {summary.get('freed_liquidity', 0):.1f}M PKR\n"
            f"Income Earned: {summary.get('income_earned', 0):.1f}M PKR\n"
            f"Compliance Rate (52 weeks): {summary.get('compliance_rate', 0):.1f}%\n"
            f"Daily Minimum Requirement: {summary.get('daily_min_pct', 4.0):.1f}%\n"
            f"Weekly Average Target: {summary.get('weekly_avg_target', 6.0):.1f}%\n"
            f"Monte Carlo Compliance Probability: {summary.get('mc_compliance_prob', 0):.1f}%\n"
            f"Optimal Strategy: {summary.get('optimal_strategy', 'N/A')}"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("CRR AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
