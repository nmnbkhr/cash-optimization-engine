import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc10", tags=["uc10"])


@router.get("/summary")
async def pnl_summary(db: Session = Depends(get_db)):
    """Cash P&L attribution summary metrics."""
    try:
        from app.services.uc10_pnl_attribution import get_pnl_summary
        return get_pnl_summary(db)
    except Exception as e:
        logger.exception("P&L summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/waterfall")
async def pnl_waterfall(db: Session = Depends(get_db)):
    """P&L waterfall breakdown from gross cost to net cost."""
    try:
        from app.services.uc10_pnl_attribution import get_pnl_waterfall
        return get_pnl_waterfall(db)
    except Exception as e:
        logger.exception("P&L waterfall failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branch-ranking")
async def branch_ranking(db: Session = Depends(get_db)):
    """Branch performance ranking by net cash cost."""
    try:
        from app.services.uc10_pnl_attribution import get_branch_ranking
        return get_branch_ranking(db)
    except Exception as e:
        logger.exception("Branch ranking failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cost-treemap")
async def cost_treemap(db: Session = Depends(get_db)):
    """Cost treemap data grouped by region."""
    try:
        from app.services.uc10_pnl_attribution import get_cost_treemap
        return get_cost_treemap(db)
    except Exception as e:
        logger.exception("Cost treemap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transfer-pricing")
async def transfer_pricing(db: Session = Depends(get_db)):
    """Compute transfer pricing P&L for all branches."""
    try:
        from app.services.uc10_pnl_attribution import TransferPricingEngine
        return TransferPricingEngine().compute_transfer_prices(db)
    except Exception as e:
        logger.exception("Transfer pricing failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alco-report")
async def alco_report(db: Session = Depends(get_db)):
    """Executive ALCO report for cash operations."""
    try:
        from app.services.uc10_pnl_attribution import get_alco_report
        return get_alco_report(db)
    except Exception as e:
        logger.exception("ALCO report failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def pnl_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for Cash P&L Attribution results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc10_pnl_attribution import get_pnl_summary
        summary = get_pnl_summary(db)

        system_prompt = (
            "You are a senior bank CFO advisor specializing in cash operations P&L attribution. "
            "Given pre-computed ABC costing and transfer pricing results for a Pakistani bank, write a 4-5 sentence "
            "executive brief. Include: total cash cost breakdown, branch cost efficiency analysis, "
            "transfer pricing findings, ALCO risk indicators, and recommended cost reduction actions. "
            "Do NOT recompute anything -- just narrate the provided results clearly."
        )
        user_content = (
            f"Total Cash Cost: {summary.get('total_cash_cost', 0)/1e3:.1f}B PKR\n"
            f"Cost Per Branch: {summary.get('cost_per_branch', 0):.1f}M PKR\n"
            f"Cost Per Transaction: {summary.get('cost_per_transaction', 0):.0f} PKR\n"
            f"Net Deployment Income: {summary.get('net_deployment_income', 0)/1e3:.1f}B PKR\n"
            f"ALCO Score: {summary.get('alco_score', 0):.1f}/100\n"
            f"Total Branches: {summary.get('total_branches', 0)}\n"
            f"Cost Pools: {summary.get('cost_pools', 0)}\n"
            f"Q4 Branches (Worst): {summary.get('q4_branches', 0)}\n"
            f"Transfer Pricing Savings: {summary.get('transfer_pricing_savings', 0):.1f}M PKR"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("P&L AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
