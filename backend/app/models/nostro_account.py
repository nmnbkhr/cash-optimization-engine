import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime

from app.database import Base


class NostroAccount(Base):
    __tablename__ = "nostro_accounts"

    id = Column(Integer, primary_key=True, index=True)
    bank_name = Column(String, nullable=False)
    currency = Column(String(3), nullable=False)
    country = Column(String, nullable=False)
    balance = Column(Float, default=0.0)
    required_minimum = Column(Float, default=0.0)
    excess_balance = Column(Float, default=0.0)
    overnight_rate = Column(Float, default=0.0)
    last_updated = Column(DateTime, nullable=True)
    account_number = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<NostroAccount {self.bank_name} {self.currency}>"
