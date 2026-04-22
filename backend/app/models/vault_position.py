import datetime

from sqlalchemy import Column, Integer, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class VaultPosition(Base):
    __tablename__ = "vault_positions"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    opening_balance = Column(Float, nullable=False)
    closing_balance = Column(Float, nullable=False)
    deposits = Column(Float, default=0.0)
    withdrawals = Column(Float, default=0.0)
    net_flow = Column(Float, default=0.0)
    vault_utilization = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    branch = relationship("Branch", back_populates="vault_positions")

    def __repr__(self):
        return f"<VaultPosition branch={self.branch_id} date={self.date}>"
