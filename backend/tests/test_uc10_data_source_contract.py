"""
Data-source contract test for UC-10 Cash P&L (Phase B2).

Guards against the exact regression that broke UC-10: a dashboard silently reading a
stale/empty legacy table. These tests assert UC-10 is wired to the RECONCILED ledger
(fact_gl_daily + fact_transactions), that those tables are fresh & non-empty, that the
empty legacy `transactions` table is NOT a dependency, and that the resulting P&L is sane.

Run:  cd backend && python -m pytest tests/test_uc10_data_source_contract.py -v
"""
import sqlite3
from pathlib import Path

import pytest

from app.services import uc10_pnl_reconciled as svc

DB_PATH = svc.DB_PATH
RECONCILED_TABLES = ["fact_gl_daily", "fact_transactions"]


def _count(table):
    con = sqlite3.connect(DB_PATH)
    try:
        return con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        con.close()


def _max_date(table):
    con = sqlite3.connect(DB_PATH)
    try:
        return con.execute(f"SELECT MAX(date) FROM {table}").fetchone()[0]
    finally:
        con.close()


# ── Freshness / non-emptiness of the canonical tables ──────────────────────
@pytest.mark.parametrize("table", RECONCILED_TABLES)
def test_reconciled_tables_non_empty(table):
    assert _count(table) > 0, f"{table} is empty — UC-10 would have no real data"


def test_uc10_reads_latest_ledger_slice():
    s = svc.get_pnl_summary()
    lin = s["lineage"]
    assert lin["is_latest_slice"] is True
    assert lin["period_end"] == _max_date("fact_gl_daily"), \
        "UC-10 must read the newest ledger date, not a stale slice"
    assert "fact_gl_daily" in lin["data_source"]
    assert "fact_transactions" in lin["data_source"]


# ── The legacy trap: empty `transactions` must NOT be a dependency ──────────
def test_legacy_transactions_table_is_not_a_dependency():
    # The legacy table is empty (that was the original bug)...
    assert _count("transactions") == 0
    # ...yet the reconciled P&L still produces real, non-zero results.
    s = svc.get_pnl_summary()
    assert s["net_cash_cost"] > 0
    assert s["annual_transactions"] > 0


def test_service_source_reads_reconciled_not_legacy():
    src = Path(svc.__file__).read_text()
    assert "fact_gl_daily" in src
    assert "fact_transactions" in src
    # must not compute from the stale/empty legacy tables
    assert "vault_positions" not in src
    assert "FROM transactions" not in src


# ── Economic sanity of the attribution ─────────────────────────────────────
def test_pnl_is_economically_sane():
    s = svc.get_pnl_summary()
    pools = s["cost_pools"]
    gross = s["gross_cost"]
    assert gross > 0 and s["net_cash_cost"] > 0
    # idle-cash opportunity cost is the dominant, actionable lever (the app's thesis)
    assert pools["idle_cash_opportunity_cost"] == max(pools.values())
    # insurance must not absurdly dominate (the 5.5%/yr annualisation bug we removed)
    assert pools["vault_insurance"] < 0.20 * gross
    # cost per real transaction is in a believable band (PKR)
    assert 50 < s["cost_per_transaction"] < 100_000


def test_annual_transactions_matches_direct_count():
    s = svc.get_pnl_summary()
    lin = s["lineage"]
    con = sqlite3.connect(DB_PATH)
    direct = con.execute(
        "SELECT COUNT(*) FROM fact_transactions WHERE date BETWEEN ? AND ?",
        (lin["period_start"], lin["period_end"])).fetchone()[0]
    con.close()
    assert s["annual_transactions"] == direct


def test_all_endpoints_carry_lineage():
    for fn in (svc.get_pnl_summary, svc.get_pnl_waterfall,
               svc.get_branch_ranking, svc.get_cost_treemap, svc.get_alco_report):
        out = fn()
        assert "lineage" in out and out["lineage"].get("as_of"), \
            f"{fn.__name__} missing lineage/freshness block"
