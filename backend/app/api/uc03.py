import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc03", tags=["uc03"])


@router.get("/network-summary")
async def netting_network_summary(db: Session = Depends(get_db)):
    """Network-wide netting summary."""
    try:
        from app.services.uc03_netting import get_netting_network_summary
        return get_netting_network_summary(db)
    except Exception as e:
        logger.exception("Netting network summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/solve-netting")
async def solve_netting(db: Session = Depends(get_db)):
    """Solve min-cost network flow for optimal cash netting."""
    try:
        from app.services.uc03_netting import BranchCashNetwork
        network = BranchCashNetwork(db)
        return network.solve_netting_simple()
    except Exception as e:
        logger.exception("Netting solve failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-auction")
async def run_auction(db: Session = Depends(get_db)):
    """Run VCG auction for internal cash market."""
    try:
        from app.services.uc03_netting import CashAuction
        auction = CashAuction(db)
        return auction.run_auction()
    except Exception as e:
        logger.exception("Auction failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/city-heatmap")
async def city_heatmap(db: Session = Depends(get_db)):
    """City-level surplus/deficit heatmap data."""
    try:
        from app.services.uc03_netting import get_city_heatmap_data
        return get_city_heatmap_data(db)
    except Exception as e:
        logger.exception("City heatmap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def netting_ai_brief(db: Session = Depends(get_db)):
    """GPT-4.1 executive brief for netting results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc03_netting import get_netting_network_summary
        summary = get_netting_network_summary(db)

        system_prompt = (
            "You are a cash logistics strategist. Given pre-computed inter-branch netting results, "
            "write a 4-5 sentence executive brief. Focus on: netting savings, optimal routes, network efficiency."
        )
        user_content = (
            f"Network: {summary['total_branches']} branches\n"
            f"Total Surplus: {summary['total_surplus']/1e3:.1f}B PKR across {summary['surplus_branches']} branches\n"
            f"Total Deficit: {summary['total_deficit']/1e3:.1f}B PKR across {summary['deficit_branches']} branches\n"
            f"Nettable Amount: {summary['nettable_amount']/1e3:.1f}B PKR\n"
            f"Estimated Annual Savings: {summary.get('estimated_annual_savings', summary.get('estimated_savings', 0)):.1f}M PKR\n"
            f"Cities with highest netting potential: {', '.join(c['city'] for c in summary.get('top_netting_cities', [])[:5])}"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
