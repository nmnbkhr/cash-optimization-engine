import datetime

from sqlalchemy import Column, Integer, Float, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class DenominationInventory(Base):
    __tablename__ = "denomination_inventory"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    denomination = Column(Integer, nullable=False)  # 5000 / 1000 / 500 / 100 / 50 / 20 / 10
    quantity = Column(Integer, default=0)
    value = Column(Float, default=0.0)
    is_fit = Column(Boolean, default=True)
    is_soiled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    branch = relationship("Branch", back_populates="denomination_inventory")

    def __repr__(self):
        return f"<DenominationInventory branch={self.branch_id} denom={self.denomination}>"
