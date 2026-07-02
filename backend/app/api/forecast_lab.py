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


class PromoteRequest(BaseModel):
    branch_id: str
    target: str = "withdrawal"
    horizon: int = 7
    model: str = "xgboost"              # single winning model to push to production
    params: dict | None = None
    mape: float | None = None           # backtest MAPE to store alongside the forecast


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


@router.post("/promote")
async def promote(req: PromoteRequest):
    """Push the chosen model's forward forecast into the production `forecasts` table so the
    vault base-stock optimizer (business_output) consumes it. Closes the Lab→production loop."""
    return get_lab().promote(
        branch_id=req.branch_id, target=req.target, horizon=req.horizon,
        model=req.model, params=req.params, mape=req.mape,
    )
