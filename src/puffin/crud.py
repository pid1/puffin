from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from puffin.models import DiaperChange, Feeding, Medication, TemperatureReading

# --- Generic helpers ---


def _period_count(db: Session, model, timestamp_col, period: str) -> int:
    now = datetime.now()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    else:
        start = now
    stmt = select(func.count()).select_from(model).where(timestamp_col >= start)
    return db.execute(stmt).scalar() or 0


# --- Diaper Changes ---


def create_diaper(
    db: Session, timestamp: datetime | None, type_: str, notes: str | None
) -> DiaperChange:
    obj = DiaperChange(timestamp=timestamp or datetime.now(), type=type_, notes=notes)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_diapers(
    db: Session,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[DiaperChange]:
    stmt = select(DiaperChange).order_by(DiaperChange.timestamp.desc())
    if start_date:
        stmt = stmt.where(DiaperChange.timestamp >= start_date)
    if end_date:
        stmt = stmt.where(DiaperChange.timestamp <= end_date)
    stmt = stmt.offset(offset).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_diaper(db: Session, diaper_id: int) -> DiaperChange | None:
    return db.get(DiaperChange, diaper_id)


def update_diaper(db: Session, diaper_id: int, **kwargs) -> DiaperChange | None:
    obj = db.get(DiaperChange, diaper_id)
    if not obj:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_diaper(db: Session, diaper_id: int) -> bool:
    obj = db.get(DiaperChange, diaper_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def diaper_stats(db: Session) -> dict[str, int]:
    return {
        "today": _period_count(db, DiaperChange, DiaperChange.timestamp, "today"),
        "week": _period_count(db, DiaperChange, DiaperChange.timestamp, "week"),
        "month": _period_count(db, DiaperChange, DiaperChange.timestamp, "month"),
    }


# --- Feedings ---


def create_feeding(
    db: Session,
    timestamp: datetime | None,
    feeding_type: str,
    duration_minutes: int | None,
    amount_oz: float | None,
    notes: str | None,
) -> Feeding:
    obj = Feeding(
        timestamp=timestamp or datetime.now(),
        feeding_type=feeding_type,
        duration_minutes=duration_minutes,
        amount_oz=amount_oz,
        notes=notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_feedings(
    db: Session,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Feeding]:
    stmt = select(Feeding).order_by(Feeding.timestamp.desc())
    if start_date:
        stmt = stmt.where(Feeding.timestamp >= start_date)
    if end_date:
        stmt = stmt.where(Feeding.timestamp <= end_date)
    stmt = stmt.offset(offset).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_feeding(db: Session, feeding_id: int) -> Feeding | None:
    return db.get(Feeding, feeding_id)


def update_feeding(db: Session, feeding_id: int, **kwargs) -> Feeding | None:
    obj = db.get(Feeding, feeding_id)
    if not obj:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_feeding(db: Session, feeding_id: int) -> bool:
    obj = db.get(Feeding, feeding_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def feeding_stats(db: Session) -> dict[str, int]:
    return {
        "today": _period_count(db, Feeding, Feeding.timestamp, "today"),
        "week": _period_count(db, Feeding, Feeding.timestamp, "week"),
        "month": _period_count(db, Feeding, Feeding.timestamp, "month"),
    }


# --- Medications ---


def create_medication(
    db: Session,
    timestamp: datetime | None,
    medication_name: str,
    dosage: str,
    notes: str | None,
) -> Medication:
    obj = Medication(
        timestamp=timestamp or datetime.now(),
        medication_name=medication_name,
        dosage=dosage,
        notes=notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_medications(
    db: Session,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Medication]:
    stmt = select(Medication).order_by(Medication.timestamp.desc())
    if start_date:
        stmt = stmt.where(Medication.timestamp >= start_date)
    if end_date:
        stmt = stmt.where(Medication.timestamp <= end_date)
    stmt = stmt.offset(offset).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_medication(db: Session, medication_id: int) -> Medication | None:
    return db.get(Medication, medication_id)


def update_medication(db: Session, medication_id: int, **kwargs) -> Medication | None:
    obj = db.get(Medication, medication_id)
    if not obj:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_medication(db: Session, medication_id: int) -> bool:
    obj = db.get(Medication, medication_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def medication_stats(db: Session) -> dict[str, int]:
    return {
        "today": _period_count(db, Medication, Medication.timestamp, "today"),
        "week": _period_count(db, Medication, Medication.timestamp, "week"),
        "month": _period_count(db, Medication, Medication.timestamp, "month"),
    }


# --- Temperature Readings ---


def create_temperature(
    db: Session,
    timestamp: datetime | None,
    temperature_celsius: float,
    location: str | None,
    notes: str | None,
) -> TemperatureReading:
    obj = TemperatureReading(
        timestamp=timestamp or datetime.now(),
        temperature_celsius=temperature_celsius,
        location=location,
        notes=notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_temperatures(
    db: Session,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[TemperatureReading]:
    stmt = select(TemperatureReading).order_by(TemperatureReading.timestamp.desc())
    if start_date:
        stmt = stmt.where(TemperatureReading.timestamp >= start_date)
    if end_date:
        stmt = stmt.where(TemperatureReading.timestamp <= end_date)
    stmt = stmt.offset(offset).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_temperature(db: Session, temp_id: int) -> TemperatureReading | None:
    return db.get(TemperatureReading, temp_id)


def update_temperature(db: Session, temp_id: int, **kwargs) -> TemperatureReading | None:
    obj = db.get(TemperatureReading, temp_id)
    if not obj:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_temperature(db: Session, temp_id: int) -> bool:
    obj = db.get(TemperatureReading, temp_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# --- Dashboard ---


def get_dashboard(db: Session) -> dict:
    now = datetime.now()

    # Stats
    d_stats = diaper_stats(db)
    f_stats = feeding_stats(db)
    med_today = _period_count(db, Medication, Medication.timestamp, "today")

    # Last entries
    last_diaper = db.execute(
        select(DiaperChange).order_by(DiaperChange.timestamp.desc()).limit(1)
    ).scalar_one_or_none()
    last_feeding = db.execute(
        select(Feeding).order_by(Feeding.timestamp.desc()).limit(1)
    ).scalar_one_or_none()
    last_temp = db.execute(
        select(TemperatureReading).order_by(TemperatureReading.timestamp.desc()).limit(1)
    ).scalar_one_or_none()

    # Recent activities (last 3 days, excluding future) — union all types
    three_days_ago = now - timedelta(days=3)
    activities = []
    diaper_labels = {"pee": "Pee", "poop": "Poop", "both": "Pee + Poop"}
    diaper_emojis = {"pee": "\U0001f4a7", "poop": "\U0001f4a9", "both": "\U0001f4a7\U0001f4a9"}
    feeding_labels = {
        "breast_left": "Left Breast",
        "breast_right": "Right Breast",
        "breast_both": "Both Breasts",
        "bottle": "Bottle",
    }
    feeding_emojis = {
        "breast_left": "\U0001f931",
        "breast_right": "\U0001f931",
        "breast_both": "\U0001f931",
        "bottle": "\U0001f37c",
    }

    for d in get_diapers(db, start_date=three_days_ago, end_date=now, limit=200):
        activities.append(
            {
                "type": "diaper",
                "subtype": d.type,
                "timestamp": d.timestamp.isoformat(),
                "id": d.id,
                "emoji": diaper_emojis.get(d.type, "\U0001f9f7"),
                "label": diaper_labels.get(d.type, d.type),
                "detail": "",
                "summary": f"Diaper: {d.type}",
                "notes": d.notes,
            }
        )
    for f in get_feedings(db, start_date=three_days_ago, end_date=now, limit=200):
        if f.amount_oz:
            detail = f"{f.amount_oz} oz"
        elif f.duration_minutes:
            detail = f"{f.duration_minutes} min"
        else:
            detail = ""
        activities.append(
            {
                "type": "feeding",
                "subtype": f.feeding_type,
                "timestamp": f.timestamp.isoformat(),
                "id": f.id,
                "emoji": feeding_emojis.get(f.feeding_type, "\U0001f37c"),
                "label": feeding_labels.get(f.feeding_type, f.feeding_type),
                "detail": detail,
                "summary": f"Feeding: {f.feeding_type}",
                "notes": f.notes,
            }
        )
    for m in get_medications(db, start_date=three_days_ago, end_date=now, limit=200):
        activities.append(
            {
                "type": "medication",
                "subtype": "medication",
                "timestamp": m.timestamp.isoformat(),
                "id": m.id,
                "emoji": "\U0001f48a",
                "label": m.medication_name,
                "detail": m.dosage,
                "summary": f"Med: {m.medication_name}",
                "notes": m.notes,
            }
        )
    for t in get_temperatures(db, start_date=three_days_ago, end_date=now, limit=200):
        temp_f = round(t.temperature_celsius * 9 / 5 + 32, 1)
        activities.append(
            {
                "type": "temperature",
                "subtype": "temperature",
                "timestamp": t.timestamp.isoformat(),
                "id": t.id,
                "emoji": "\U0001f321\ufe0f",
                "label": "Temperature",
                "detail": f"{temp_f}\u00b0F",
                "summary": f"Temp: {temp_f}\u00b0F",
                "notes": t.notes,
            }
        )

    activities.sort(key=lambda a: a["timestamp"], reverse=True)

    return {
        "diaper_stats": d_stats,
        "feeding_stats": f_stats,
        "medication_count_today": med_today,
        "last_diaper": last_diaper,
        "last_feeding": last_feeding,
        "last_temperature": last_temp,
        "recent_activities": activities,
    }
