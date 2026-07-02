"""Forecast Lab API — multi-model comparison, per-horizon accuracy, tunable params.
Additive: separate router, does not touch the existing /api/uc01 forecast routes."""
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.forecast_lab import get_lab

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/forecast-lab", tags=["forecast-lab"])


class RunRequest(BaseModel):
    branch_id: str
    target: str = "withdrawal"          # 'withdrawal' | 'deposit'
    horizon: int = 7                    # 1..14 days
    models: list[str] | None = None     # subset of ['xgboost','sarima','prophet']
    params: dict | None = None          # per-model hyperparameter overrides
    origins: int = 5                    # rolling-origin backtest count (1..12)


@router.get("/config")
async def config():
    """Model list, param schema, and control ranges for the UI."""
    return get_lab().defaults()


@router.post("/run")
async def run(req: RunRequest):
    """Train + rolling-origin backtest the selected models for one branch and return
    per-horizon accuracy, interval coverage, feature importances, and forecast paths."""
    return get_lab().run(
        branch_id=req.branch_id, target=req.target, horizon=req.horizon,
        models=req.models, params=req.params, origins=req.origins,
    )
