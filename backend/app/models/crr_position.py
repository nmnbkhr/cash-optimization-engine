import datetime

from sqlalchemy import Column, Integer, Float, Boolean, Date, DateTime

from app.database import Base


class CRRPosition(Base):
    __tablename__ = "crr_positions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    deposit_base = Column(Float, nullable=False)
    required_crr = Column(Float, nullable=False)
    actual_crr = Column(Float, nullable=False)
    crr_ratio = Column(Float, default=0.0)
    excess_crr = Column(Float, default=0.0)
    freed_liquidity = Column(Float, default=0.0)
    overnight_deployment = Column(Float, default=0.0)
    income_earned = Column(Float, default=0.0)
    week_number = Column(Integer, nullable=False)
    is_compliant = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<CRRPosition date={self.date} compliant={self.is_compliant}>"
