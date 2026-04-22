import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class ATM(Base):
    __tablename__ = "atms"

    id = Column(Integer, primary_key=True, index=True)
    atm_id = Column(String, unique=True, nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    location_type = Column(String, nullable=False)  # lobby / offsite / mall
    city = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    total_capacity = Column(Float, nullable=False)
    avg_daily_dispense = Column(Float, default=0.0)
    last_loaded = Column(DateTime, nullable=True)
    uptime_pct = Column(Float, default=100.0)
    status = Column(String, nullable=False, default="active")  # active / maintenance / offline
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    branch = relationship("Branch", back_populates="atms")
    cassettes = relationship("ATMCassette", back_populates="atm", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ATM {self.atm_id} status={self.status}>"


class ATMCassette(Base):
    __tablename__ = "atm_cassettes"

    id = Column(Integer, primary_key=True, index=True)
    atm_id = Column(Integer, ForeignKey("atms.id"), nullable=False, index=True)
    denomination = Column(Integer, nullable=False)
    capacity = Column(Float, nullable=False)
    current_level = Column(Float, default=0.0)
    reorder_point = Column(Float, default=0.0)
    order_up_to = Column(Float, default=0.0)

    # Relationships
    atm = relationship("ATM", back_populates="cassettes")

    def __repr__(self):
        return f"<ATMCassette atm={self.atm_id} denom={self.denomination}>"
