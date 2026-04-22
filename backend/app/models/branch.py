import enum
import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database import Base


class BranchType(enum.Enum):
    CASH_SURPLUS = "Cash-Surplus"
    DEFICIT = "Deficit"
    BALANCED = "Balanced"
    SEASONAL = "Seasonal"
    HUB = "Hub"


class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    region = Column(String, nullable=False)
    branch_type = Column(SQLEnum(BranchType), nullable=False)
    vault_capacity = Column(Float, nullable=False)
    avg_daily_deposits = Column(Float, default=0.0)
    avg_daily_withdrawals = Column(Float, default=0.0)
    current_vault_balance = Column(Float, default=0.0)
    optimal_vault_balance = Column(Float, default=0.0)
    idle_cash = Column(Float, default=0.0)
    cash_efficiency_score = Column(Float, default=0.0)
    daily_transactions = Column(Integer, default=0)

    # Financial columns (allocated from demo.xlsx bank-wide GL)
    total_deposits = Column(Float, default=0.0)
    deposits_current_account = Column(Float, default=0.0)
    deposits_savings = Column(Float, default=0.0)
    deposits_term = Column(Float, default=0.0)
    monthly_interest_income = Column(Float, default=0.0)
    monthly_interest_expense = Column(Float, default=0.0)
    monthly_personnel_cost = Column(Float, default=0.0)
    monthly_premises_cost = Column(Float, default=0.0)
    monthly_direct_cost = Column(Float, default=0.0)
    monthly_other_cost = Column(Float, default=0.0)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    manager_name = Column(String, nullable=True)
    is_cpc = Column(Boolean, default=False)
    feeding_branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    feeding_branch = relationship("Branch", remote_side=[id], backref="fed_branches")
    vault_positions = relationship("VaultPosition", back_populates="branch")
    transactions = relationship("Transaction", back_populates="branch")
    atms = relationship("ATM", back_populates="branch")
    denomination_inventory = relationship("DenominationInventory", back_populates="branch")

    def __repr__(self):
        return f"<Branch {self.branch_id} - {self.name}>"
