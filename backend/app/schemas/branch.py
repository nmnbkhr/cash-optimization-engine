from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BranchBase(BaseModel):
    branch_id: str
    name: str
    city: str
    region: str
    branch_type: str


class BranchResponse(BranchBase):
    id: int
    vault_capacity: float
    current_vault_balance: float
    optimal_vault_balance: float
    idle_cash: float
    cash_efficiency_score: float
    daily_transactions: int
    is_cpc: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    class Config:
        from_attributes = True


class BranchDetailResponse(BranchResponse):
    avg_daily_deposits: float
    avg_daily_withdrawals: float
    manager_name: Optional[str] = None
    vault_history: list = []


class VaultPositionResponse(BaseModel):
    date: str
    opening_balance: float
    closing_balance: float
    deposits: float
    withdrawals: float
    net_flow: float
    vault_utilization: float

    class Config:
        from_attributes = True
