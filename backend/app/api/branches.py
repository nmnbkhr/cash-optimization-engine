from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db

router = APIRouter(prefix="/api", tags=["branches"])


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
    return [
        {
            "id": b.id, "branch_id": b.branch_id, "name": b.name,
            "city": b.city, "region": b.region,
            "branch_type": b.branch_type.value if hasattr(b.branch_type, 'value') else b.branch_type,
            "vault_capacity": b.vault_capacity,
            "current_vault_balance": b.current_vault_balance,
            "optimal_vault_balance": b.optimal_vault_balance,
            "idle_cash": b.idle_cash,
            "cash_efficiency_score": b.cash_efficiency_score,
            "daily_transactions": b.daily_transactions,
            "is_cpc": b.is_cpc,
            "latitude": b.latitude, "longitude": b.longitude,
        }
        for b in branches
    ]


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

    return {
        "id": branch.id, "branch_id": branch.branch_id, "name": branch.name,
        "city": branch.city, "region": branch.region,
        "branch_type": branch.branch_type.value if hasattr(branch.branch_type, 'value') else branch.branch_type,
        "vault_capacity": branch.vault_capacity,
        "avg_daily_deposits": branch.avg_daily_deposits,
        "avg_daily_withdrawals": branch.avg_daily_withdrawals,
        "current_vault_balance": branch.current_vault_balance,
        "optimal_vault_balance": branch.optimal_vault_balance,
        "idle_cash": branch.idle_cash,
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
