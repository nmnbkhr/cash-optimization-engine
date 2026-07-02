"""
Data Health & Lineage registry (Phase B3)
=========================================
Operationalises the "single source of truth + visible freshness" architecture. Declares
which tables are CANONICAL (the reconciled system of record that production/decisioning
surfaces must read) and which are DEPRECATED legacy tables that must NOT feed any Tier-1
surface — so a future regen can never silently break a dashboard again (the UC-01/UC-10
failure mode).

`data_health()` returns per-table row counts, date coverage, and a freshness verdict, plus
the deprecation registry with each legacy table's replacement. Backs GET /api/data-health
and the Data Health page. No writes.
"""
from __future__ import annotations

import datetime
import sqlite3
from pathlib import Path
from typing import Any, Dict, List

DB_PATH = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")

# The reconciled system of record. Production/decisioning surfaces read ONLY these.
CANONICAL_TABLES = [
    {"table": "fact_gl_daily", "grain": "branch-day GL ledger",
     "feeds": "T3 forecast, UC-01 optimizer, UC-10 P&L, oversight"},
    {"table": "fact_transactions", "grain": "individual cash/CIT transactions",
     "feeds": "UC-10 transaction volume, reconciliation checks"},
    {"table": "dim_calendar", "grain": "Pakistan banking calendar/day",
     "feeds": "T3 features, event windows"},
    {"table": "branches", "grain": "branch master + current vault snapshot",
     "feeds": "all branch views"},
]

# Legacy tables retired by the reconciled spine. Must not feed any Tier-1 surface.
DEPRECATED_TABLES = [
    {"table": "vault_positions", "reason": "stale (ends 2025-03) and degenerate "
     "(deposits==withdrawals -> flat balance)", "replacement": "fact_gl_daily"},
    {"table": "transactions", "reason": "empty (0 rows)", "replacement": "fact_transactions"},
]

# "Today" — synthetic dataset runs into the future, so freshness = reads the table's
# newest slice; a real deployment would compare max(date) against wall-clock now.
_TODAY = datetime.date(2026, 6, 30)
STALE_AFTER_DAYS = 45   # canonical table is "stale" if its latest date is older than this vs the newest canonical date


def _table_exists(con, table: str) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is not None


def _stats(con, table: str) -> Dict[str, Any]:
    if not _table_exists(con, table):
        return {"exists": False, "rows": 0, "min_date": None, "max_date": None}
    rows = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    has_date = any(r[1] == "date" for r in con.execute(f"PRAGMA table_info({table})").fetchall())
    mn = mx = None
    if has_date and rows:
        mn, mx = con.execute(f"SELECT MIN(date), MAX(date) FROM {table}").fetchone()
    return {"exists": True, "rows": int(rows), "min_date": mn, "max_date": mx}


# Tiering for the schema catalog (uses the same registry as data_health()).
_CATEGORY = {
    "fact_gl_daily": "canonical", "fact_transactions": "canonical",
    "dim_calendar": "canonical", "dim_market": "canonical", "branches": "canonical",
    "vault_positions": "deprecated", "transactions": "deprecated",
    "forecasts": "output", "forecast_drivers": "output",
    "atms": "domain", "atm_cassettes": "domain", "cit_trips": "domain",
    "crr_positions": "domain", "denomination_inventory": "domain",
    "nostro_accounts": "domain", "vostro_accounts": "domain",
    "cdm_devices": "domain", "alerts": "domain",
    "alembic_version": "system",
}
_CATEGORY_LABEL = {
    "canonical": "Canonical — reconciled system of record",
    "output": "Model output — forecasts & attribution",
    "domain": "Domain model — illustrative / legacy",
    "deprecated": "Deprecated — quarantined, do not use",
    "system": "System / migrations",
}

# One-line purpose per table (what it is and who reads it).
_PURPOSE = {
    "fact_gl_daily": "Reconciled branch-day GL ledger (opening/closing balance, cash flows, CIT) — the spine for T3 forecasting, the UC-01 optimizer, and UC-10 P&L.",
    "fact_transactions": "Individual cash & CIT transactions — drives UC-10 transaction volume and feeds the ledger reconciliation checks.",
    "dim_calendar": "Pakistan banking calendar: weekends, holidays, Eid/Ramadan windows, salary-day and month-end flags used as forecast features.",
    "dim_market": "Daily market reference: KIBOR tenors, SBP policy rate, FX rates — the rate environment for opportunity-cost math.",
    "branches": "Branch master (1,547 nodes) plus the current vault snapshot, type, region and efficiency score; joined by every branch view.",
    "forecasts": "Stored model predictions (T3 managed-level and legacy LSTM) with horizon, confidence bounds and MAPE.",
    "forecast_drivers": "Per-forecast SHAP attribution — the top feature drivers behind each prediction, surfaced in the oversight layer.",
    "atms": "ATM device master (2,180 units): location type, capacity and average daily dispense.",
    "atm_cassettes": "Denomination cassettes per ATM with capacity, current level and reorder point.",
    "cit_trips": "Cash-in-Transit routes: vehicle, stops, distance, cost and status.",
    "crr_positions": "Weekly Cash Reserve Requirement tracking: deposit base, actual CRR, freed liquidity and compliance.",
    "denomination_inventory": "Note stock per branch by denomination, with fit/soiled classification.",
    "nostro_accounts": "Correspondent (nostro) FX accounts: balance vs required minimum, excess and overnight rate.",
    "vostro_accounts": "Respondent (vostro) liability accounts: balance, 30-day average, volatility and deployable portion.",
    "cdm_devices": "Cash Deposit Machine fleet for the SBP CDM digital-shift mandate (currently unpopulated).",
    "alerts": "Operational alert feed for branch/treasury exceptions (currently unpopulated).",
    "vault_positions": "DEPRECATED — stale (ends 2025-03) and degenerate per-branch vault time-series; superseded by fact_gl_daily.",
    "transactions": "DEPRECATED — empty legacy transaction table; superseded by fact_transactions.",
    "alembic_version": "Alembic migration bookkeeping (schema version pointer).",
}

# Columns that imply a relationship when no FK is declared (referenced table, kind).
_INFERRED_REFS = {
    "branch_id": ("branches", "id"),
    "feeding_branch_id": ("branches", "id"),
    "atm_id": ("atms", "id"),
    "date": ("dim_calendar", "date"),
}


def _relationships(con, table: str, col_names: set, existing_tables: set):
    """Declared FKs (PRAGMA) plus naming-convention inferences, de-duplicated."""
    rels = []
    seen = set()
    for fk in con.execute(f"PRAGMA foreign_key_list({table})").fetchall():
        # fk = (id, seq, ref_table, from_col, to_col, ...)
        key = (fk[3], fk[2])
        if key in seen:
            continue
        seen.add(key)
        rels.append({"column": fk[3], "ref_table": fk[2], "ref_column": fk[4],
                     "declared": True})
    for col, (ref_t, ref_c) in _INFERRED_REFS.items():
        if col in col_names and ref_t != table and ref_t in existing_tables \
                and (col, ref_t) not in seen:
            seen.add((col, ref_t))
            rels.append({"column": col, "ref_table": ref_t, "ref_column": ref_c,
                         "declared": False})
    return rels


def schema_catalog() -> Dict[str, Any]:
    """Full table catalog: every table with its columns, row count, tier, purpose and relationships."""
    con = sqlite3.connect(DB_PATH)
    try:
        names = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        name_set = set(names)
        tables = []
        for t in names:
            st = _stats(con, t)
            cols = [{"name": c[1], "type": c[2] or "", "pk": bool(c[5]),
                     "not_null": bool(c[3])} for c in con.execute(f"PRAGMA table_info({t})")]
            cat = _CATEGORY.get(t, "domain")
            rels = _relationships(con, t, {c["name"] for c in cols}, name_set)
            tables.append({
                "table": t, "category": cat, "category_label": _CATEGORY_LABEL[cat],
                "purpose": _PURPOSE.get(t, ""),
                "rows": st["rows"], "min_date": st["min_date"], "max_date": st["max_date"],
                "n_columns": len(cols), "columns": cols, "relationships": rels,
            })
        order = {"canonical": 0, "output": 1, "domain": 2, "deprecated": 3, "system": 4}
        tables.sort(key=lambda x: (order.get(x["category"], 9), x["table"]))
        counts: Dict[str, int] = {}
        for t in tables:
            counts[t["category"]] = counts.get(t["category"], 0) + 1
        return {
            "database": "cash_engine.db",
            "total_tables": len(tables),
            "total_rows": sum(t["rows"] for t in tables),
            "total_relationships": sum(len(t["relationships"]) for t in tables),
            "category_counts": counts,
            "category_labels": _CATEGORY_LABEL,
            "tables": tables,
        }
    finally:
        con.close()


def data_health() -> Dict[str, Any]:
    con = sqlite3.connect(DB_PATH)
    try:
        canon = []
        latest_dates = []
        for spec in CANONICAL_TABLES:
            st = _stats(con, spec["table"])
            if st["max_date"]:
                latest_dates.append(st["max_date"])
            canon.append({**spec, **st})

        # Reference = newest date across canonical dated tables.
        ref = max(latest_dates) if latest_dates else None
        for c in canon:
            healthy = c["exists"] and c["rows"] > 0
            stale = False
            age_days = None
            if c["max_date"] and ref:
                age_days = (datetime.date.fromisoformat(ref) - datetime.date.fromisoformat(c["max_date"])).days
                stale = age_days > STALE_AFTER_DAYS
            c["status"] = "stale" if (healthy and stale) else ("healthy" if healthy else "missing")
            c["age_vs_latest_days"] = age_days

        deprecated = []
        for spec in DEPRECATED_TABLES:
            st = _stats(con, spec["table"])
            deprecated.append({**spec, **st, "status": "deprecated"})

        canonical_ok = all(c["status"] == "healthy" for c in canon)
        return {
            "as_of": ref,
            "reference_date": ref,
            "canonical_ok": canonical_ok,
            "summary": {
                "canonical_tables": len(canon),
                "canonical_healthy": sum(1 for c in canon if c["status"] == "healthy"),
                "deprecated_tables": len(deprecated),
            },
            "canonical": canon,
            "deprecated": deprecated,
            "policy": ("Decisioning surfaces read only canonical tables. Deprecated tables "
                       "must not feed any Tier-1 surface (enforced by contract tests)."),
        }
    finally:
        con.close()
