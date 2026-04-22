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
