import datetime

from sqlalchemy import Column, Integer, String, Float, Date, DateTime

from app.database import Base


class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False)  # branch / atm
    entity_id = Column(String, nullable=False, index=True)
    forecast_date = Column(Date, nullable=False, index=True)
    target_date = Column(Date, nullable=False)
    predicted_value = Column(Float, nullable=False)
    confidence_lower = Column(Float, nullable=False)
    confidence_upper = Column(Float, nullable=False)
    actual_value = Column(Float, nullable=True)
    mape = Column(Float, nullable=True)
    model_version = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<Forecast {self.entity_type}={self.entity_id} target={self.target_date}>"
