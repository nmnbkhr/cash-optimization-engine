import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["optimization"])


@router.post("/uc01/optimize/{branch_id}")
async def optimize_vault(branch_id: str, db: Session = Depends(get_db)):
    """Run stochastic vault optimizer (scipy SAA) for a branch."""
    from app.models.branch import Branch
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    try:
        from app.services.uc01_vault_forecast import VaultOptimizer
        from app.services.uc01_demand_input import reconciled_demand_forecast

        # Demand input now comes from the RECONCILED ledger (withdrawal flow), not the
        # stale/degenerate LSTM on vault_positions. Same system of record as the T3 model.
        fc = reconciled_demand_forecast(branch.branch_id)
        if fc is None:
            raise HTTPException(status_code=404,
                                detail="No reconciled ledger data for branch")
        mean, std, meta = fc

        optimizer = VaultOptimizer()
        result = optimizer.optimize(
            forecast_mean=mean,
            forecast_std=std,
            vault_capacity=branch.vault_capacity,
            current_vault_level=branch.current_vault_balance,
            branch_minimum=branch.optimal_vault_balance * 0.5,
        )
        result["forecast_source"] = meta
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Optimization failed for %s", branch_id)
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.post("/uc01/game-theory/{branch_id}")
async def game_theory_branch(branch_id: str, db: Session = Depends(get_db)):
    """Run Nash equilibrium + CES/BMIS analysis for a branch."""
    from app.models.branch import Branch
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    try:
        from app.services.uc01_vault_forecast import CashEfficiencyEngine
        engine = CashEfficiencyEngine()
        result = engine.analyze_branch(db, branch.id)
        return result
    except Exception as e:
        logger.exception("Game theory failed for %s", branch_id)
        raise HTTPException(status_code=500, detail=f"Game theory analysis failed: {str(e)}")


@router.get("/uc01/network-summary")
async def uc01_network_summary(db: Session = Depends(get_db)):
    """Aggregate UC-01 metrics across all branches."""
    try:
        from app.services.uc01_vault_forecast import get_network_summary
        return get_network_summary(db)
    except Exception as e:
        logger.exception("Network summary failed")
        raise HTTPException(status_code=500, detail=f"Network summary failed: {str(e)}")


@router.post("/uc01/ai-brief/{branch_id}")
async def uc01_ai_brief(branch_id: str, db: Session = Depends(get_db)):
    """THE ONLY AI ENDPOINT — sends pre-computed results to GPT-4.1 for executive brief."""
    from app.models.branch import Branch
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    from app.core.ai_client import ask_ai

    branch_type = branch.branch_type.value if hasattr(branch.branch_type, 'value') else str(branch.branch_type)
    idle = branch.idle_cash or 0
    savings = idle * 0.11
    ces = (branch.cash_efficiency_score or 0) * 100

    system_prompt = (
        "You are a senior bank treasury analyst. Given pre-computed optimization "
        "results for a Pakistani bank branch, write a 4-5 sentence executive brief. "
        "Include: risk assessment, key action, expected savings. Be specific with numbers. "
        "Do NOT recompute anything — just narrate the provided results clearly."
    )

    user_content = (
        f"{branch.name} ({branch.branch_id}), {branch.city}, Type: {branch_type}\n"
        f"Vault Capacity: {branch.vault_capacity:.1f}M PKR\n"
        f"Current Vault Balance: {branch.current_vault_balance:.1f}M PKR\n"
        f"Optimal Vault Balance: {branch.optimal_vault_balance:.1f}M PKR\n"
        f"Idle Cash: {idle:.1f}M PKR\n"
        f"Annual Savings Potential: {savings:.1f}M PKR at 10.5% policy rate\n"
        f"Cash Efficiency Score: {ces:.1f}%\n"
        f"Daily Transactions: {branch.daily_transactions}\n"
        f"SBP Policy Rate: 10.5%"
    )

    result = ask_ai(system_prompt, user_content)
    return result
