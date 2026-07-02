"""
Contract test — business_output.py prescriptive layer is on the reconciled spine.

Guards the migration of the flagship `vault_recommendation` off the legacy ORM Branch
snapshot onto `fact_gl_daily`, with every recommendation passing the Cash Constitution
gate before it is surfaced. Mirrors test_uc10_data_source_contract.py.
"""
import sqlite3
from pathlib import Path

import pytest

from app.database import SessionLocal
from app.services.business_output import CashOptimizationEngine
from app.core.cash_constitution import CONSTITUTION

DB_PATH = str(Path(__file__).resolve().parent.parent / "cash_engine.db")


def _a_reconciled_branch() -> str:
    con = sqlite3.connect(DB_PATH)
    row = con.execute(
        "SELECT branch_id FROM fact_gl_daily "
        "WHERE date = (SELECT MAX(date) FROM fact_gl_daily) LIMIT 1"
    ).fetchone()
    con.close()
    assert row, "fact_gl_daily is empty — reconciled spine missing"
    return row[0]


@pytest.fixture(scope="module")
def engine():
    db = SessionLocal()
    yield CashOptimizationEngine(db)
    db.close()


def test_vault_recommendation_reads_reconciled_spine(engine):
    """For a branch present in fact_gl_daily, the recommendation is tagged reconciled and
    its current_vault equals that branch's latest reconciled closing balance."""
    bid = _a_reconciled_branch()
    con = sqlite3.connect(DB_PATH)
    close_m = con.execute(
        "SELECT closing_balance_m FROM fact_gl_daily WHERE branch_id = ? "
        "ORDER BY date DESC LIMIT 1", (bid,)
    ).fetchone()[0]
    con.close()

    rec = engine.vault_recommendation(bid)
    assert rec.get("data_source") == "reconciled", "flagship must use the reconciled ledger"
    assert rec["decision"]["current_vault"] == round(float(close_m), 1)


def test_every_recommendation_passes_constitution_gate(engine):
    """No recommendation reaches a human without a constitution verdict attached."""
    rec = engine.vault_recommendation(_a_reconciled_branch())
    assert rec.get("constitution_status") in {"CLEAR", "ANNOTATED", "BLOCKED"}
    assert "constitution_violations" in rec
    assert "auto_flag" in rec


def test_constitution_blocks_a_hard_breach():
    """A vault above its insured maximum is BLOCKED and auto-flagged to Exceptions."""
    gated = CONSTITUTION.enforce(
        {"vault_balance_m": 95.0, "vault_capacity_m": 100.0, "vault_min_m": 5.0},
        {"branch_id": "TEST"},
    )
    assert gated["constitution_status"] == "BLOCKED"
    assert gated["auto_flag"] is True
