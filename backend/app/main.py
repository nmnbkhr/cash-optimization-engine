import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.api.branches import router as branches_router
from app.api.forecasts import router as forecasts_router
from app.api.optimization import router as optimization_router
from app.api.ai_summary import router as ai_router
from app.api.dashboard import router as dashboard_router
from app.api.uc02 import router as uc02_router
from app.api.uc03 import router as uc03_router
from app.api.uc04 import router as uc04_router
from app.api.uc05 import router as uc05_router
from app.api.uc06 import router as uc06_router
from app.api.uc07 import router as uc07_router
from app.api.uc08 import router as uc08_router
from app.api.uc09 import router as uc09_router
from app.api.uc10 import router as uc10_router
from app.api.business import router as business_router
from app.api.command_center import router as cc_router
from app.api.data_health import router as data_health_router

app.include_router(branches_router)
app.include_router(forecasts_router)
app.include_router(optimization_router)
app.include_router(ai_router)
app.include_router(dashboard_router)
app.include_router(uc02_router)
app.include_router(uc03_router)
app.include_router(uc04_router)
app.include_router(uc05_router)
app.include_router(uc06_router)
app.include_router(uc07_router)
app.include_router(uc08_router)
app.include_router(uc09_router)
app.include_router(uc10_router)
app.include_router(business_router)
app.include_router(cc_router)
app.include_router(data_health_router)


@app.on_event("startup")
async def startup():
    init_db()
    # Warm the UC-01 forecast model off the request path: load the persisted artifact (~5s)
    # or train once (~100s) in a background thread, so the first "Run Forecast" click is fast
    # instead of blocking on a cold train. The service lock makes an early click wait, not race.
    import threading

    def _warm_forecast():
        try:
            from app.services.managed_level_forecast import get_service
            get_service()
        except Exception:
            logging.getLogger(__name__).exception("forecast warm-up failed")

    threading.Thread(target=_warm_forecast, daemon=True).start()


@app.get("/health")
async def health():
    return {"status": "ok"}
