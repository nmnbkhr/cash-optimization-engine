import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc08", tags=["uc08"])


@router.get("/summary")
async def cit_summary(db: Session = Depends(get_db)):
    """CIT route optimization summary metrics."""
    try:
        from app.services.uc08_cit_routing import get_cit_summary
        return get_cit_summary(db)
    except Exception as e:
        logger.exception("CIT summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleet-dashboard")
async def fleet_dashboard(db: Session = Depends(get_db)):
    """Fleet utilization dashboard data."""
    try:
        from app.services.uc08_cit_routing import get_fleet_dashboard
        return get_fleet_dashboard(db)
    except Exception as e:
        logger.exception("Fleet dashboard failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def optimize_routes(
    city: str = Query(None, description="Optional city filter e.g. Karachi"),
    db: Session = Depends(get_db),
):
    """Run VRPTW route optimization for CIT fleet."""
    try:
        from app.services.uc08_cit_routing import CITRouteOptimizer
        return CITRouteOptimizer().optimize_routes(db, city=city)
    except Exception as e:
        logger.exception("CIT route optimization failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/route-comparison")
async def route_comparison(
    city: str = Query(None, description="Optional city filter"),
    db: Session = Depends(get_db),
):
    """Compare current vs optimized routes."""
    try:
        from app.services.uc08_cit_routing import get_route_comparison
        return get_route_comparison(db, city=city)
    except Exception as e:
        logger.exception("Route comparison failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emergency-reroute")
async def emergency_reroute(
    route_id: str = Query(..., description="Route ID to reroute"),
    failed_stop: int = Query(..., description="Index of the failed stop"),
    db: Session = Depends(get_db),
):
    """Simulate emergency reroute for a failed stop."""
    try:
        from app.services.uc08_cit_routing import EmergencyRerouter
        return EmergencyRerouter().simulate_emergency(db, route_id=int(route_id), failed_stop_index=failed_stop)
    except Exception as e:
        logger.exception("Emergency reroute failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def cit_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for CIT route optimization results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc08_cit_routing import get_cit_summary
        summary = get_cit_summary(db)

        system_prompt = (
            "You are a senior logistics analyst specializing in Cash-in-Transit (CIT) operations for a Pakistani bank. "
            "Given pre-computed CIT route optimization results, write a 4-5 sentence executive brief. "
            "Include: current fleet utilization, route efficiency metrics, VRPTW optimization findings, "
            "Shapley value cost allocation insights, and recommended actions for reducing CIT costs. "
            "Do NOT recompute anything -- just narrate the provided results clearly."
        )
        fleet = summary.get('fleet_utilization', {})
        opt = summary.get('optimization_comparison', {})
        cost_bd = summary.get('cost_breakdown', {})
        user_content = (
            f"Total Trips: {summary.get('total_trips', 0)}\n"
            f"Total Distance: {summary.get('total_distance_km', 0):.0f} km\n"
            f"Fleet Utilization: {fleet.get('utilization_pct', 0):.1f}%\n"
            f"Avg Cost per Trip: {summary.get('avg_cost_per_trip_pkr', 0):.0f} PKR\n"
            f"Total Fleet Cost: {summary.get('total_cost_pkr', 0):.1f}M PKR\n"
            f"Active Vehicles: {fleet.get('active_vehicles', 0)}\n"
            f"Total Vehicles: {fleet.get('fleet_size', 0)}\n"
            f"Potential Savings: {opt.get('potential_savings_pct', 0):.1f}%\n"
            f"Avg Stops per Route: {summary.get('avg_stops_per_trip', 0):.1f}\n"
            f"Emergency Trips: {cost_bd.get('emergency_trip_count', 0)}"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("CIT AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
