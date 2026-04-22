import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime

from app.database import Base


class VostroAccount(Base):
    __tablename__ = "vostro_accounts"

    id = Column(Integer, primary_key=True, index=True)
    bank_name = Column(String, nullable=False)
    currency = Column(String(3), nullable=False)
    country = Column(String, nullable=False)
    balance = Column(Float, default=0.0)
    average_balance_30d = Column(Float, default=0.0)
    volatility = Column(Float, default=0.0)
    stable_portion = Column(Float, default=0.0)
    deployable_amount = Column(Float, default=0.0)
    current_deployment = Column(String, nullable=True)
    yield_rate = Column(Float, default=0.0)
    last_updated = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<VostroAccount {self.bank_name} {self.currency}>"
