"""Shared reconciled-ledger helpers.

The ORM `branches` table holds a stale seed snapshot (current_vault_balance,
idle_cash, optimal_vault_balance) that no longer matches the reconciled ledger
`fact_gl_daily`. The business/CFO layer reads the ledger; the older UC technical
services historically read the ORM snapshot, so their idle/surplus figures ran
~50% higher and contradicted the CFO numbers.

This module centralizes the ledger lookup so UC services can present figures
consistent with the reconciled truth. All amounts are RAW PKR to match the ORM
column units the UC services already assume.
"""
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

INSURANCE_LIMIT_PCT = 0.85  # vault insurance ceiling; same clamp the business layer uses


def reconciled_branch_map(db: Session) -> dict:
    """{branch_id: {"balance": raw_pkr, "idle": raw_pkr}} from fact_gl_daily at the
    latest date on/before today. RAW PKR (ledger *_m columns x 1e6). Empty dict if
    the ledger is unavailable, so callers can fall back to the ORM snapshot."""
    try:
        row = db.execute(
            text("SELECT MAX(date) FROM fact_gl_daily WHERE date <= :t"),
            {"t": str(date.today())},
        ).fetchone()
        as_of = row[0] if row and row[0] else None
        if not as_of:
            return {}
        rows = db.execute(
            text("SELECT branch_id, closing_balance_m, idle_cash_m "
                 "FROM fact_gl_daily WHERE date = :d"),
            {"d": as_of},
        ).fetchall()
        return {
            r.branch_id: {
                "balance": float(r.closing_balance_m or 0.0) * 1e6,
                "idle": float(r.idle_cash_m or 0.0) * 1e6,
            }
            for r in rows
        }
    except Exception:
        return {}


def clamp_optimal(optimal, capacity):
    """Clamp an optimal-vault target to the insurance limit (0.85 x capacity).
    The seed generator produced unclamped optimals that exceeded physical vault
    capacity for ~24% of branches."""
    if optimal is None or capacity is None:
        return optimal
    return min(float(optimal), INSURANCE_LIMIT_PCT * float(capacity))


def apply_reconciled_to_orm(db: Session, branches) -> bool:
    """Overwrite each ORM Branch's current_vault_balance / idle_cash / (clamped)
    optimal_vault_balance IN MEMORY with reconciled ledger values, so downstream
    classification/aggregation (which read these attributes) reflect the reconciled
    truth. Callers MUST run under `db.no_autoflush` and MUST NOT commit — these
    mutations are display-only and revert when the request session closes.
    Returns True if the ledger was applied, False if it fell back to the snapshot."""
    recon = reconciled_branch_map(db)
    for b in branches:
        b.optimal_vault_balance = clamp_optimal(b.optimal_vault_balance, b.vault_capacity)
        r = recon.get(b.branch_id)
        if r:
            b.current_vault_balance = r["balance"]
            b.idle_cash = r["idle"]
    return bool(recon)
