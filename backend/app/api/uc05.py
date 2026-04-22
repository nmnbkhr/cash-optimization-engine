import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc05", tags=["uc05"])


@router.get("/summary")
async def nostro_summary(db: Session = Depends(get_db)):
    """Nostro balance optimization summary metrics."""
    try:
        from app.services.uc05_nostro import get_nostro_summary
        return get_nostro_summary(db)
    except Exception as e:
        logger.exception("Nostro summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/portfolio")
async def nostro_portfolio(db: Session = Depends(get_db)):
    """All nostro accounts with MDP recommendations."""
    try:
        from app.services.uc05_nostro import get_nostro_portfolio
        return get_nostro_portfolio(db)
    except Exception as e:
        logger.exception("Nostro portfolio failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/currency-breakdown")
async def currency_breakdown(db: Session = Depends(get_db)):
    """Currency breakdown for treemap visualization."""
    try:
        from app.services.uc05_nostro import get_currency_breakdown
        return get_currency_breakdown(db)
    except Exception as e:
        logger.exception("Currency breakdown failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def nostro_optimize(db: Session = Depends(get_db)):
    """Run full MDP optimization across all nostro accounts."""
    try:
        from app.services.uc05_nostro import NostroOptimizer
        return NostroOptimizer().optimize_all(db)
    except Exception as e:
        logger.exception("Nostro optimization failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nash-bargaining")
async def nash_bargaining(db: Session = Depends(get_db)):
    """Run Nash bargaining for minimum balance negotiations."""
    try:
        from app.services.uc05_nostro import NostroNashBargaining
        return NostroNashBargaining().negotiate_minimums(db)
    except Exception as e:
        logger.exception("Nash bargaining failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fx-carry")
async def fx_carry(db: Session = Depends(get_db)):
    """Run FX carry trade analysis."""
    try:
        from app.services.uc05_nostro import FXCarryAnalyzer
        return FXCarryAnalyzer().analyze_carry(db)
    except Exception as e:
        logger.exception("FX carry analysis failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def nostro_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for nostro optimization results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc05_nostro import get_nostro_summary
        summary = get_nostro_summary(db)

        system_prompt = (
            "You are a senior bank treasury analyst specializing in correspondent banking. "
            "Given pre-computed nostro optimization results for a Pakistani bank, write a 4-5 sentence "
            "executive brief. Include: excess balance opportunity, FX carry analysis, recommended actions. "
            "Do NOT recompute anything — just narrate the provided results clearly."
        )
        user_content = (
            f"Total Nostro Balances (PKR equiv): {summary.get('total_balance_pkr', 0):.1f}M PKR\n"
            f"Total Excess Balances: {summary.get('total_excess_pkr', 0):.1f}M PKR\n"
            f"Repatriation Opportunity: {summary.get('repatriation_opportunity_pkr', 0):.1f}M PKR\n"
            f"Accounts Below Minimum: {summary.get('accounts_below_minimum', 0)}\n"
            f"Portfolio HHI: {summary.get('portfolio_hhi', 0):.4f}\n"
            f"Total Accounts: {summary.get('total_accounts', 0)}\n"
            f"Active Currencies: {summary.get('active_currencies', 0)}\n"
            f"Avg Carry Spread: {summary.get('avg_carry_spread', 0):.2f}%\n"
            f"Top Excess Currency: {summary.get('top_excess_currency', 'N/A')}\n"
            f"Optimization Status: {summary.get('optimization_status', 'N/A')}"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("Nostro AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
