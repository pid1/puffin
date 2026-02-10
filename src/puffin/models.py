from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from puffin.database import Base

_TZ_DATETIME = DateTime(timezone=True)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class DiaperChange(Base):
    __tablename__ = "diaper_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    type: Mapped[str] = mapped_column(String, nullable=False)  # pee, poop, both
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (Index("idx_diaper_timestamp", "timestamp"),)


class Feeding(Base):
    __tablename__ = "feedings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    feeding_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # breast_left, breast_right, bottle
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_oz: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (Index("idx_feeding_timestamp", "timestamp"),)


class Medication(Base):
    __tablename__ = "medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    medication_name: Mapped[str] = mapped_column(String, nullable=False)
    dosage: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (Index("idx_medication_timestamp", "timestamp"),)


class TemperatureReading(Base):
    __tablename__ = "temperature_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    temperature_celsius: Mapped[float] = mapped_column(Float, nullable=False)
    location: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # rectal, oral, axillary, temporal
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (Index("idx_temperature_timestamp", "timestamp"),)
