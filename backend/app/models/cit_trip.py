import datetime

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, JSON

from app.database import Base


class CITTrip(Base):
    __tablename__ = "cit_trips"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(String, unique=True, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    vehicle_id = Column(String, nullable=False)
    route = Column(JSON, nullable=False)  # list of branch_ids
    total_distance_km = Column(Float, default=0.0)
    total_value_carried = Column(Float, default=0.0)
    cost = Column(Float, default=0.0)
    duration_hours = Column(Float, default=0.0)
    num_stops = Column(Integer, default=0)
    status = Column(String, nullable=False, default="planned")  # planned / in_progress / completed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<CITTrip {self.trip_id} status={self.status}>"
