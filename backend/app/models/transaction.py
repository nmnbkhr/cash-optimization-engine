import datetime

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    transaction_type = Column(String, nullable=False)  # deposit / withdrawal / transfer
    amount = Column(Float, nullable=False)
    channel = Column(String, nullable=False)  # counter / atm / digital
    denomination_breakdown = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    branch = relationship("Branch", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction {self.transaction_type} {self.amount} on {self.date}>"
