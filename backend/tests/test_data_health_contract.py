"""
Data-health & deprecation contract (Phase B3).

Enforces the single-source-of-truth architecture: canonical reconciled tables are healthy,
the deprecated legacy tables are registered with replacements, and — critically — no Tier-1
(decisioning / reconciled) service reads a deprecated table. This is the guard that stops a
future change from silently re-wiring a production surface onto a stale/empty table.

Run:  cd backend && python -m pytest tests/test_data_health_contract.py -v
"""
from pathlib import Path

import pytest

from app.services.data_health import (CANONICAL_TABLES, DEPRECATED_TABLES, data_health)

_SERVICES = Path(__file__).resolve().parent.parent / "app" / "services"

# Tier-1 / decisioning services that must read only the reconciled spine.
TIER1_SERVICES = [
    "managed_level_forecast.py",
    "uc01_demand_input.py",
    "uc10_pnl_reconciled.py",
    "exceptions_queue.py",
    "forecast_attribution.py",
]
DEPRECATED_NAMES = [d["table"] for d in DEPRECATED_TABLES]


def test_canonical_tables_healthy():
    h = data_health()
    assert h["canonical_ok"] is True
    assert h["summary"]["canonical_healthy"] == len(CANONICAL_TABLES)
    for c in h["canonical"]:
        assert c["status"] == "healthy", f"{c['table']} not healthy: {c['status']}"


def test_deprecated_registry_has_replacements():
    h = data_health()
    dep = {d["table"]: d for d in h["deprecated"]}
    assert "vault_positions" in dep and dep["vault_positions"]["replacement"] == "fact_gl_daily"
    assert "transactions" in dep and dep["transactions"]["replacement"] == "fact_transactions"
    for d in h["deprecated"]:
        assert d["status"] == "deprecated" and d["replacement"]


@pytest.mark.parametrize("service", TIER1_SERVICES)
def test_tier1_services_avoid_deprecated_tables(service):
    """A Tier-1 service may MENTION a deprecated table in a docstring (explaining what it
    replaced) but must never READ one — no SQL FROM, no ORM query, no model import."""
    src = (_SERVICES / service).read_text()
    flat = src.replace(" ", "")
    for name in DEPRECATED_NAMES:
        assert f"FROM {name}" not in src, f"{service} SQL-reads deprecated table {name}"
    # No ORM access to / import of the deprecated models.
    assert "query(VaultPosition" not in flat, f"{service} ORM-reads vault_positions"
    assert "query(Transaction)" not in flat, f"{service} ORM-reads the empty transactions table"
    assert "import VaultPosition" not in src and "models.vault_position" not in src, \
        f"{service} imports the deprecated VaultPosition model"


def test_canonical_tables_are_the_reconciled_spine():
    names = {c["table"] for c in CANONICAL_TABLES}
    assert {"fact_gl_daily", "fact_transactions"}.issubset(names)
