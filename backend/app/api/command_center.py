"""Command Center API — live netting with state mutation."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.services.netting_state import get_state, reset_state

router = APIRouter(prefix="/api/command-center", tags=["Command Center"])


class TransferReq(BaseModel):
    from_id: str
    to_id: str
    amount: float


@router.get("/snapshot")
def snapshot(db: Session = Depends(get_db)):
    return get_state(db).snapshot()


@router.get("/opportunities")
def opportunities(
    radius: float = Query(15.0),
    min_amt: float = Query(3.0),
    db: Session = Depends(get_db),
):
    return get_state(db).find_opportunities(radius, min_amt)


@router.post("/execute")
def execute(req: TransferReq, db: Session = Depends(get_db)):
    return get_state(db).execute(req.from_id, req.to_id, req.amount)


@router.post("/reset")
def reset(db: Session = Depends(get_db)):
    reset_state()
    return get_state(db).snapshot()


@router.get("/log")
def get_log(db: Session = Depends(get_db)):
    s = get_state(db)
    return {"transfers": s.log, "totals": s.totals}
