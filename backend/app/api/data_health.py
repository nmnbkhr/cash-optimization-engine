import logging

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["data-health"])


@router.get("/data-health")
async def get_data_health():
    """Data lineage + freshness: canonical (reconciled) tables with row counts/coverage and
    a freshness verdict, plus the deprecated legacy-table registry and their replacements."""
    try:
        from app.services.data_health import data_health
        return data_health()
    except Exception as e:
        logger.exception("Data health failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schema")
async def get_schema():
    """Full database schema catalog: every table with columns, row counts, and tier."""
    try:
        from app.services.data_health import schema_catalog
        return schema_catalog()
    except Exception as e:
        logger.exception("Schema catalog failed")
        raise HTTPException(status_code=500, detail=str(e))
