from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from puffin.database import Base


class DiaperChange(Base):
    __tablename__ = "diaper_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    type: Mapped[str] = mapped_column(String, nullable=False)  # pee, poop, both
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_diaper_timestamp", "timestamp"),)


class Feeding(Base):
    __tablename__ = "feedings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    feeding_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # breast_left, breast_right, breast_both, bottle
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_oz: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_feeding_timestamp", "timestamp"),)


class Medication(Base):
    __tablename__ = "medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    medication_name: Mapped[str] = mapped_column(String, nullable=False)
    dosage: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_medication_timestamp", "timestamp"),)


class TemperatureReading(Base):
    __tablename__ = "temperature_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    temperature_celsius: Mapped[float] = mapped_column(Float, nullable=False)
    location: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # rectal, oral, axillary, temporal
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_temperature_timestamp", "timestamp"),)
