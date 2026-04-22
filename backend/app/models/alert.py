"""Alert model for exception tracking."""

import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float
from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    alert_type = Column(String, index=True)
    severity = Column(String, index=True)  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    message = Column(String)
    branch_id = Column(String, nullable=True, index=True)
    value = Column(Float, nullable=True)
    dismissed = Column(Boolean, default=False)
    dismissed_at = Column(DateTime, nullable=True)
