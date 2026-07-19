from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from puffin.database import Base


class _UTCDateTime(TypeDecorator):
    """A DateTime that guarantees UTC tzinfo across SQLite round-trips.

    SQLite stores datetimes as naive strings, so timezone info is lost on read.
    This decorator normalizes to UTC on every save and re-attaches UTC on
    every load.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        # SQLite's dialect discards tzinfo when binding, so an aware value in
        # any other offset would be written as its local wall clock and then
        # read back as UTC -- e.g. 10:00-04:00 stored as "10:00" and returned
        # as 10:00+00:00, a silent four-hour shift.  Convert first so the
        # stored wall clock really is UTC.  Naive values are assumed to be UTC
        # already, matching how they are read back.
        if value is not None and value.tzinfo is not None:
            return value.astimezone(UTC)
        return value

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


_TZ_DATETIME = _UTCDateTime()


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Child(Base):
    """An optional profile a log can be associated with.

    Profiles are opt-in: an install with no rows here behaves exactly as
    Puffin did before profiles existed.
    """

    __tablename__ = "children"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)


def _child_fk() -> Mapped[int | None]:
    """A nullable association to a :class:`Child`.

    ``NULL`` means *unassigned* — the state of every log predating profiles,
    of logs whose profile was deleted, and of logs explicitly set back to
    unassigned by editing them.
    """
    return mapped_column(Integer, ForeignKey("children.id", ondelete="SET NULL"), nullable=True)


class DiaperChange(Base):
    __tablename__ = "diaper_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    type: Mapped[str] = mapped_column(String, nullable=False)  # pee, poop, both
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_id: Mapped[int | None] = _child_fk()
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (
        Index("idx_diaper_timestamp", "timestamp"),
        Index("idx_diaper_child", "child_id"),
    )


class Feeding(Base):
    __tablename__ = "feedings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    feeding_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # breast_left, breast_right, bottle
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    bottle_type: Mapped[str | None] = mapped_column(String, nullable=True)  # breastmilk, formula
    child_id: Mapped[int | None] = _child_fk()
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (
        Index("idx_feeding_timestamp", "timestamp"),
        Index("idx_feeding_child", "child_id"),
    )


class Medication(Base):
    __tablename__ = "medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    medication_name: Mapped[str] = mapped_column(String, nullable=False)
    dosage_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    dosage_unit: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_id: Mapped[int | None] = _child_fk()
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (
        Index("idx_medication_timestamp", "timestamp"),
        Index("idx_medication_child", "child_id"),
    )


class TemperatureReading(Base):
    __tablename__ = "temperature_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(_TZ_DATETIME, nullable=False, default=_utcnow)
    temperature_celsius: Mapped[float] = mapped_column(Float, nullable=False)
    location: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # rectal, oral, axillary, temporal
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_id: Mapped[int | None] = _child_fk()
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)

    __table_args__ = (
        Index("idx_temperature_timestamp", "timestamp"),
        Index("idx_temperature_child", "child_id"),
    )


class SavedMedication(Base):
    __tablename__ = "saved_medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(_TZ_DATETIME, default=_utcnow)
