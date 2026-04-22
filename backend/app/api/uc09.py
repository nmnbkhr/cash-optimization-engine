import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uc09", tags=["uc09"])


@router.get("/summary")
async def incentive_summary(db: Session = Depends(get_db)):
    """Digital channel incentivization summary metrics."""
    try:
        from app.services.uc09_digital_incentive import get_incentive_summary
        return get_incentive_summary(db)
    except Exception as e:
        logger.exception("Incentive summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/segment-dashboard")
async def segment_dashboard(db: Session = Depends(get_db)):
    """Per-segment digital adoption dashboard."""
    try:
        from app.services.uc09_digital_incentive import get_segment_dashboard
        return get_segment_dashboard(db)
    except Exception as e:
        logger.exception("Segment dashboard failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def optimize_incentive(db: Session = Depends(get_db)):
    """Run Thompson Sampling multi-armed bandit optimization."""
    try:
        from app.services.uc09_digital_incentive import IncentiveOptimizer
        return IncentiveOptimizer().run_simulation()
    except Exception as e:
        logger.exception("Thompson Sampling optimization failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/equilibrium")
async def compute_equilibrium(db: Session = Depends(get_db)):
    """Compute subgame perfect equilibrium for incentive game."""
    try:
        from app.services.uc09_digital_incentive import IncentiveOptimizer
        return IncentiveOptimizer().compute_equilibrium()
    except Exception as e:
        logger.exception("Equilibrium computation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/roi")
async def calculate_roi(db: Session = Depends(get_db)):
    """Calculate ROI for digital incentive programs."""
    try:
        from app.services.uc09_digital_incentive import ROICalculator
        return ROICalculator().calculate_roi(db)
    except Exception as e:
        logger.exception("ROI calculation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ab-test")
async def ab_test(
    segment: str = Query(..., description="Customer segment name"),
    arm_a: str = Query(..., description="First incentive arm"),
    arm_b: str = Query(..., description="Second incentive arm"),
    db: Session = Depends(get_db),
):
    """Run A/B test simulation for two incentive arms on a segment."""
    try:
        from app.services.uc09_digital_incentive import get_ab_simulator
        return get_ab_simulator(db, segment, arm_a, arm_b)
    except Exception as e:
        logger.exception("A/B test simulation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-brief")
async def incentive_ai_brief(db: Session = Depends(get_db)):
    """AI executive brief for digital channel incentivization results."""
    from app.core.ai_client import ask_ai
    try:
        from app.services.uc09_digital_incentive import get_incentive_summary
        summary = get_incentive_summary(db)

        system_prompt = (
            "You are a senior digital banking strategist specializing in customer migration from cash to digital channels. "
            "Given pre-computed Thompson Sampling bandit optimization results for a Pakistani bank's digital incentivization program, "
            "write a 4-5 sentence executive brief. Include: current digital adoption rates, segment-level performance, "
            "Thompson Sampling findings for optimal incentive allocation, budget ROI analysis, and recommended next steps. "
            "Do NOT recompute anything -- just narrate the provided results clearly."
        )
        user_content = (
            f"Digital Adoption Rate: {summary.get('digital_adoption_pct', 0):.1f}%\n"
            f"Budget Utilized: {summary.get('budget_utilized', 0):.1f}M PKR\n"
            f"Total Budget: {summary.get('total_budget', 0):.1f}M PKR\n"
            f"Expected ROI: {summary.get('expected_roi', 0):.1f}%\n"
            f"Best Segment: {summary.get('best_segment', 'N/A')}\n"
            f"Average Lift: {summary.get('avg_lift', 0):.1f}%\n"
            f"Segments Tracked: {summary.get('segments_count', 5)}\n"
            f"Active Arms: {summary.get('active_arms', 0)}\n"
            f"Top Arm: {summary.get('top_arm', 'N/A')}\n"
            f"Conversion Improvement: {summary.get('conversion_improvement', 0):.1f}%"
        )
        return ask_ai(system_prompt, user_content)
    except Exception as e:
        logger.exception("UC-09 AI brief failed")
        raise HTTPException(status_code=500, detail=str(e))
