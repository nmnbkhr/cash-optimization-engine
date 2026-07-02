from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db

router = APIRouter(prefix="/api", tags=["branches"])

# 85% of vault capacity = insurance limit. The seed/data-generator precomputed
# optimal_vault_balance with no such clamp, so ~24% of branches carried optimal
# targets ABOVE physical capacity. Clamp to the same insurance limit the business
# layer (business_output._branch_optimal) uses so both layers agree.
INSURANCE_LIMIT_PCT = 0.85


def _clamp_optimal(optimal, capacity):
    if optimal is None:
        return optimal
    if capacity is None:
        return optimal
    return min(float(optimal), INSURANCE_LIMIT_PCT * float(capacity))


def _reconciled_balances(db: Session, branch_ids=None) -> dict:
    """Latest reconciled (closing_balance, idle_cash) per branch from fact_gl_daily, in
    RAW PKR (×1e6) to match this endpoint's established unit contract. Anchored to the
    latest ledger date on/before today so it reflects the present, not the 2027 horizon.
    Returns {branch_id: (current_vault_raw, idle_raw)}; empty if the ledger is unavailable."""
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
        return {r.branch_id: (float(r.closing_balance_m or 0.0) * 1e6,
                              float(r.idle_cash_m or 0.0) * 1e6) for r in rows}
    except Exception:
        return {}


@router.get("/branches")
async def list_branches(
    branch_type: str = None,
    city: str = None,
    db: Session = Depends(get_db),
):
    from app.models.branch import Branch, BranchType
    query = db.query(Branch)
    if branch_type:
        try:
            bt_enum = BranchType(branch_type)
            query = query.filter(Branch.branch_type == bt_enum)
        except ValueError:
            pass
    if city:
        query = query.filter(Branch.city == city)
    branches = query.order_by(Branch.branch_id).all()
    recon = _reconciled_balances(db)
    out = []
    for b in branches:
        r = recon.get(b.branch_id)
        current = r[0] if r else b.current_vault_balance
        idle = r[1] if r else b.idle_cash
        optimal = _clamp_optimal(b.optimal_vault_balance, b.vault_capacity)
        out.append({
            "id": b.id, "branch_id": b.branch_id, "name": b.name,
            "city": b.city, "region": b.region,
            "branch_type": b.branch_type.value if hasattr(b.branch_type, 'value') else b.branch_type,
            "vault_capacity": b.vault_capacity,
            "current_vault_balance": current,
            "optimal_vault_balance": optimal,
            "idle_cash": idle,
            "cash_efficiency_score": b.cash_efficiency_score,
            "daily_transactions": b.daily_transactions,
            "is_cpc": b.is_cpc,
            "latitude": b.latitude, "longitude": b.longitude,
            "data_source": "reconciled" if r else "snapshot",
        })
    return out


@router.get("/branches/{branch_id}")
async def get_branch(branch_id: str, db: Session = Depends(get_db)):
    from app.models.branch import Branch
    from app.models.vault_position import VaultPosition

    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Branch not found")

    vault_history = (
        db.query(VaultPosition)
        .filter(VaultPosition.branch_id == branch.id)
        .order_by(VaultPosition.date.desc())
        .limit(30)
        .all()
    )

    r = _reconciled_balances(db, [branch_id]).get(branch_id)
    current = r[0] if r else branch.current_vault_balance
    idle = r[1] if r else branch.idle_cash

    return {
        "id": branch.id, "branch_id": branch.branch_id, "name": branch.name,
        "city": branch.city, "region": branch.region,
        "branch_type": branch.branch_type.value if hasattr(branch.branch_type, 'value') else branch.branch_type,
        "vault_capacity": branch.vault_capacity,
        "avg_daily_deposits": branch.avg_daily_deposits,
        "avg_daily_withdrawals": branch.avg_daily_withdrawals,
        "current_vault_balance": current,
        "optimal_vault_balance": _clamp_optimal(branch.optimal_vault_balance, branch.vault_capacity),
        "idle_cash": idle,
        "data_source": "reconciled" if r else "snapshot",
        "cash_efficiency_score": branch.cash_efficiency_score,
        "daily_transactions": branch.daily_transactions,
        "manager_name": branch.manager_name,
        "is_cpc": branch.is_cpc,
        "latitude": branch.latitude, "longitude": branch.longitude,
        "vault_history": [
            {
                "date": str(v.date), "opening_balance": v.opening_balance,
                "closing_balance": v.closing_balance, "deposits": v.deposits,
                "withdrawals": v.withdrawals, "net_flow": v.net_flow,
                "vault_utilization": v.vault_utilization,
            }
            for v in vault_history
        ],
    }
