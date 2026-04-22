"""
Daily Operations Runner
═══════════════════════
Runs every morning at 6:00 AM via cron or `make daily-run`.
Fetches latest SBP rates, recomputes optimizations, flags exceptions.
"""

import json
import logging
from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, text
from app.database import SessionLocal, engine, Base

logger = logging.getLogger(__name__)


class DailyResult(Base):
    __tablename__ = "daily_results"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_date = Column(String, index=True)
    run_timestamp = Column(String)
    elapsed_seconds = Column(Float)
    plans_generated = Column(Integer)
    alerts_count = Column(Integer)
    kibor_rate = Column(Float)
    total_idle_cash_m = Column(Float)
    total_annual_savings_m = Column(Float)
    status = Column(String)
    alerts_json = Column(String)


# Create table if not exists
Base.metadata.create_all(bind=engine)


class DailyRunner:

    def run_morning_cycle(self) -> dict:
        """Complete morning cycle."""
        db = SessionLocal()
        start = datetime.now()
        logger.info(f"=== DAILY CYCLE STARTED: {start} ===")

        try:
            # Phase 1: Refresh SBP rates
            rates = self._refresh_rates()

            # Phase 2: Compute consolidated metrics
            from app.services.business_output import CashOptimizationEngine
            eng = CashOptimizationEngine(db)
            consolidated = eng.consolidated_dashboard()

            # Phase 3: Count plans (vault recommendations)
            from app.models.branch import Branch
            branch_count = db.query(Branch).count()

            # Phase 4: Check exceptions
            alerts = self._check_exceptions(eng)

            elapsed = (datetime.now() - start).total_seconds()

            # Store result
            result = DailyResult(
                run_date=str(date.today()),
                run_timestamp=start.isoformat(),
                elapsed_seconds=round(elapsed, 1),
                plans_generated=branch_count,
                alerts_count=len(alerts),
                kibor_rate=rates.get("kibor_6m", 0),
                total_idle_cash_m=consolidated["bank_snapshot"]["total_idle_cash"],
                total_annual_savings_m=consolidated["optimization_impact"]["annual_value_realized"],
                status="ok",
                alerts_json=json.dumps(alerts),
            )
            db.add(result)
            db.commit()

            logger.info(f"=== DAILY CYCLE COMPLETE: {elapsed:.0f}s, {len(alerts)} alerts ===")

            return {
                "status": "ok",
                "date": str(date.today()),
                "elapsed_seconds": round(elapsed, 1),
                "plans_generated": branch_count,
                "alerts": alerts,
                "kibor": rates.get("kibor_6m"),
                "idle_cash_m": consolidated["bank_snapshot"]["total_idle_cash"],
            }

        except Exception as e:
            logger.error(f"Daily cycle failed: {e}")
            return {"status": "error", "error": str(e)}
        finally:
            db.close()

    def _refresh_rates(self) -> dict:
        try:
            from app.core.sbp_data import get_sbp_service
            return get_sbp_service().get_all_rates_summary()
        except Exception as e:
            logger.warning(f"SBP refresh failed: {e}")
            return {"kibor_6m": 10.5}

    def _check_exceptions(self, eng) -> list:
        alerts = []

        # CRR compliance
        try:
            crr = eng.crr_deployment()
            if "error" not in crr and crr["risk"]["compliance_status"] != "ON_TRACK":
                alerts.append({
                    "type": "CRR_WARNING", "severity": "HIGH",
                    "message": f"CRR compliance at risk: {crr['position']['avg_pct_so_far']}%",
                })
        except Exception:
            pass

        # Nostro underfunded
        try:
            nostro = eng.nostro_vostro_actions()
            for a in nostro["nostro"]["actions"]:
                if a["action"] == "FUND":
                    alerts.append({
                        "type": "NOSTRO_UNDERFUNDED", "severity": "MEDIUM",
                        "message": f"{a['bank']} ({a['currency']}) needs PKR {a['amount']}M funding",
                    })
        except Exception:
            pass

        # High idle branches
        try:
            from app.models.branch import Branch
            db = eng.db
            high_idle = db.query(Branch).filter(
                Branch.idle_cash > Branch.optimal_vault_balance * 3
            ).count()
            if high_idle > 0:
                alerts.append({
                    "type": "HIGH_IDLE_BRANCHES", "severity": "HIGH",
                    "message": f"{high_idle} branches have idle cash > 3x optimal",
                })
        except Exception:
            pass

        return alerts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = DailyRunner().run_morning_cycle()
    print(json.dumps(result, indent=2))
