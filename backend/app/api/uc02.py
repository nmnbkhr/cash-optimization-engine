import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc02", tags=["uc02"])


@router.get("/atms")
async def list_atms(location_type: str = None, city: str = None, db: Session = Depends(get_db)):
    """List all ATMs with cassette data."""
    from app.models.atm import ATM, ATMCassette
    query = db.query(ATM)
    if location_type:
        query = query.filter(ATM.location_type == location_type)
    if city:
        query = query.filter(ATM.city == city)
    atms = query.order_by(ATM.atm_id).all()
    result = []
    for a in atms:
        cassettes = db.query(ATMCassette).filter(ATMCassette.atm_id == a.id).all()
        fill_pct = sum(c.current_level for c in cassettes) / max(sum(c.capacity for c in cassettes), 1) * 100
        result.append({
            "id": a.id, "atm_id": a.atm_id, "branch_id": a.branch_id,
            "location_type": a.location_type, "city": a.city,
            "total_capacity": a.total_capacity, "avg_daily_dispense": a.avg_daily_dispense,
            "uptime_pct": a.uptime_pct, "status": a.status,
            "fill_pct": round(fill_pct, 1),
            "last_loaded": str(a.last_loaded) if a.last_loaded else None,
            "cassettes": [
                {"denomination": c.denomination, "capacity": c.capacity,
                 "current_level": c.current_level, "reorder_point": c.reorder_point,
                 "order_up_to": c.order_up_to}
                for c in cassettes
            ]
        })
    return result


@router.get("/atms/{atm_id}")
async def get_atm(atm_id: str, db: Session = Depends(get_db)):
    """Get ATM detail with cassettes."""
    from app.models.atm import ATM, ATMCassette
    atm = db.query(ATM).filter(ATM.atm_id == atm_id).first()
    if not atm:
        raise HTTPException(status_code=404, detail="ATM not found")
    cassettes = db.query(ATMCassette).filter(ATMCassette.atm_id == atm.id).all()
    return {
        "id": atm.id, "atm_id": atm.atm_id, "branch_id": atm.branch_id,
        "location_type": atm.location_type, "city": atm.city,
        "latitude": atm.latitude, "longitude": atm.longitude,
        "total_capacity": atm.total_capacity, "avg_daily_dispense": atm.avg_daily_dispense,
        "uptime_pct": atm.uptime_pct, "status": atm.status,
        "last_loaded": str(atm.last_loaded) if atm.last_loaded else None,
        "cassettes": [
            {"denomination": c.denomination, "capacity": c.capacity,
             "current_level": c.current_level, "reorder_point": c.reorder_point,
             "order_up_to": c.order_up_to}
            for c in cassettes
        ]
    }


@router.post("/forecast/{atm_id}")
async def forecast_atm_endpoint(atm_id: str, db: Session = Depends(get_db)):
    """Run LSTM forecast for ATM."""
    from app.models.atm import ATM
    atm = db.query(ATM).filter(ATM.atm_id == atm_id).first()
    if not atm:
        raise HTTPException(status_code=404, detail="ATM not found")
    try:
        from app.services.uc02_atm_optimizer import forecast_atm
        return forecast_atm(db, atm.id)
    except Exception as e:
        logger.exception("ATM forecast failed for %s", atm_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize/{atm_id}")
async def optimize_atm_endpoint(atm_id: str, db: Session = Depends(get_db)):
    """Run (s,S) inventory optimization."""
    from app.models.atm import ATM
    atm = db.query(ATM).filter(ATM.atm_id == atm_id).first()
    if not atm:
        raise HTTPException(status_code=404, detail="ATM not found")
    try:
        from app.services.uc02_atm_optimizer import ATMInventoryOptimizer
        optimizer = ATMInventoryOptimizer()
        return optimizer.optimize(atm.id, db)
    except Exception as e:
        logger.exception("ATM optimize failed for %s", atm_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dqn-recommend/{atm_id}")
async def dqn_recommend_endpoint(atm_id: str, db: Session = Depends(get_db)):
    """Get DQN agent recommendation."""
    from app.models.atm import ATM
    atm = db.query(ATM).filter(ATM.atm_id == atm_id).first()
    if not atm:
        raise HTTPException(status_code=404, detail="ATM not found")
    try:
        from app.services.uc02_atm_optimizer import dqn_recommend
        return dqn_recommend(db, atm.id)
    except Exception as e:
        logger.exception("DQN recommend failed for %s", atm_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/network-summary")
async def atm_network_summary(db: Session = Depends(get_db)):
    """ATM network summary."""
    try:
        from app.services.uc02_atm_optimizer import get_atm_network_summary
        return get_atm_network_summary(db)
    except Exception as e:
        logger.exception("ATM network summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stackelberg-analysis")
async def stackelberg_analysis():
    """Stackelberg CIT game analysis."""
    try:
        from app.services.uc02_atm_optimizer import StackelbergCITGame
        game = StackelbergCITGame()
        return game.analyze()
    except Exception as e:
        logger.exception("Stackelberg analysis failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief/{atm_id}")
async def atm_ai_brief(atm_id: str, db: Session = Depends(get_db)):
    """GPT-4.1 executive brief for ATM (ONLY AI endpoint)."""
    from app.models.atm import ATM, ATMCassette
    atm = db.query(ATM).filter(ATM.atm_id == atm_id).first()
    if not atm:
        raise HTTPException(status_code=404, detail="ATM not found")
    from app.core.ai_client import ask_ai
    cassettes = db.query(ATMCassette).filter(ATMCassette.atm_id == atm.id).all()
    cass_info = ", ".join([f"Rs.{c.denomination}: {c.current_level/c.capacity*100:.0f}% full" for c in cassettes])

    system_prompt = (
        "You are an ATM operations expert. Given pre-computed ATM replenishment optimization results, "
        "write a 4-5 sentence executive brief. Focus on: stockout risk, cost savings, recommended action. "
        "Be specific with numbers."
    )
    user_content = (
        f"ATM {atm.atm_id}, {atm.city}, Type: {atm.location_type}\n"
        f"Capacity: {atm.total_capacity:.1f}M PKR, Avg Dispense: {atm.avg_daily_dispense:.1f}M/day\n"
        f"Uptime: {atm.uptime_pct:.1f}%, Status: {atm.status}\n"
        f"Cassettes: {cass_info}\n"
        f"Last loaded: {atm.last_loaded}"
    )
    return ask_ai(system_prompt, user_content)
