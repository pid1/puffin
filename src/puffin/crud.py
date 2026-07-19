import logging
import os
from datetime import UTC, datetime, timedelta
from datetime import date as date_type
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from puffin.models import DiaperChange, Feeding, Medication, SavedMedication, TemperatureReading

# "uvicorn.error" is uvicorn's general-purpose app logger, not just errors.
# Using it makes startup warnings match the surrounding "INFO:" server lines
# instead of arriving unformatted via logging's last-resort handler.
logger = logging.getLogger("uvicorn.error")

# --- Generic helpers ---


def _get_local_tz() -> ZoneInfo:
    """Return the configured local timezone, defaulting to UTC.

    Set the ``TZ`` environment variable to a valid IANA timezone name
    (e.g. ``America/New_York``) so that "today" boundaries are computed
    in the user's local time rather than UTC.
    """
    tz_name = os.environ.get("TZ", "UTC")
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        return ZoneInfo("UTC")


def warn_if_tz_unconfigured() -> None:
    """Log a warning at startup if ``TZ`` is unset or unusable.

    Day boundaries silently fall back to UTC in both cases, which shifts
    evening activity west of UTC onto the next day. Called from the app
    lifespan so self-hosters see it in the container logs.
    """
    tz_name = os.environ.get("TZ")
    if tz_name is None:
        logger.warning(
            "TZ is not set; day boundaries use UTC. Activity logged in the evening "
            "west of UTC will count toward tomorrow. Set TZ to an IANA timezone "
            "name (e.g. TZ=America/New_York)."
        )
        return
    try:
        ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        logger.warning(
            "TZ=%r is not a recognized IANA timezone name; falling back to UTC. "
            "Day boundaries will not match your local time.",
            tz_name,
        )


def _period_count(db: Session, model, timestamp_col, period: str) -> int:
    local_tz = _get_local_tz()
    now = datetime.now(local_tz)
    if period == "today":
        local_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = local_midnight.astimezone(UTC)
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
    obj = DiaperChange(timestamp=timestamp or datetime.now(UTC), type=type_, notes=notes)
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


def _format_bottle_amount(amount: float | None, amount_unit: str | None) -> str:
    if amount is None or amount_unit is None:
        return ""
    if amount_unit == "mL":
        return f"{amount:.0f} mL"
    return f"{amount:.2f} oz"


def create_feeding(
    db: Session,
    timestamp: datetime | None,
    feeding_type: str,
    duration_minutes: int | None,
    amount: float | None,
    amount_unit: str | None,
    notes: str | None,
    session_id: str | None = None,
    bottle_type: str | None = None,
) -> Feeding:
    if feeding_type != "bottle":
        amount = None
        amount_unit = None
    obj = Feeding(
        timestamp=timestamp or datetime.now(UTC),
        feeding_type=feeding_type,
        duration_minutes=duration_minutes,
        amount=amount,
        amount_unit=amount_unit,
        notes=notes,
        session_id=session_id,
        bottle_type=bottle_type,
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
    target_type = kwargs.get("feeding_type", obj.feeding_type)
    if target_type in {"breast_left", "breast_right"}:
        kwargs["amount"] = None
        kwargs["amount_unit"] = None
    for k, v in kwargs.items():
        if v is not None or k in {"amount", "amount_unit"}:
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


def _feeding_session_count(db: Session, start: datetime) -> int:
    """Count unique feeding sessions from *start* to now.

    Breast feedings that share a ``session_id`` are counted as one session.
    Feedings without a ``session_id`` (e.g. bottle feeds) are each counted
    individually by falling back to their row ``id``.
    """
    session_key = func.coalesce(Feeding.session_id, cast(Feeding.id, String))
    stmt = select(func.count(func.distinct(session_key))).where(Feeding.timestamp >= start)
    return db.execute(stmt).scalar() or 0


def _count_range(db: Session, model, timestamp_col, start: datetime, end: datetime) -> int:
    stmt = (
        select(func.count()).select_from(model).where(timestamp_col >= start, timestamp_col < end)
    )
    return db.execute(stmt).scalar() or 0


def _feeding_session_count_range(db: Session, start: datetime, end: datetime) -> int:
    session_key = func.coalesce(Feeding.session_id, cast(Feeding.id, String))
    stmt = select(func.count(func.distinct(session_key))).where(
        Feeding.timestamp >= start,
        Feeding.timestamp < end,
    )
    return db.execute(stmt).scalar() or 0


def feeding_stats(db: Session) -> dict[str, int]:
    local_tz = _get_local_tz()
    now = datetime.now(local_tz)
    local_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start = local_midnight.astimezone(UTC)
    week_start = (now - timedelta(days=7)).astimezone(UTC)
    month_start = (now - timedelta(days=30)).astimezone(UTC)
    return {
        "today": _feeding_session_count(db, today_start),
        "week": _feeding_session_count(db, week_start),
        "month": _feeding_session_count(db, month_start),
    }


# --- Medications ---


def create_medication(
    db: Session,
    timestamp: datetime | None,
    medication_name: str,
    dosage_quantity: float,
    dosage_unit: str,
    notes: str | None,
) -> Medication:
    obj = Medication(
        timestamp=timestamp or datetime.now(UTC),
        medication_name=medication_name,
        dosage_quantity=dosage_quantity,
        dosage_unit=dosage_unit,
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


def get_saved_medications(db: Session) -> list[str]:
    """Return saved medication names sorted case-insensitively A→Z."""
    stmt = select(SavedMedication.name).order_by(func.lower(SavedMedication.name))
    return list(db.execute(stmt).scalars().all())


def add_saved_medication(db: Session, name: str) -> bool:
    """Add name to saved list if no case-insensitive match exists. Returns True if added."""
    stmt = select(SavedMedication).where(func.lower(SavedMedication.name) == name.lower())
    if db.execute(stmt).scalar_one_or_none() is not None:
        return False
    db.add(SavedMedication(name=name))
    db.commit()
    return True


# --- Temperature Readings ---


def create_temperature(
    db: Session,
    timestamp: datetime | None,
    temperature_celsius: float,
    location: str | None,
    notes: str | None,
) -> TemperatureReading:
    obj = TemperatureReading(
        timestamp=timestamp or datetime.now(UTC),
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


# --- Activities ---

_DIAPER_LABELS = {"pee": "Pee", "poop": "Poop", "both": "Pee + Poop", "dry": "Dry"}
_DIAPER_EMOJIS = {
    "pee": "\U0001f4a7",
    "poop": "\U0001f4a9",
    "both": "\U0001f4a7\U0001f4a9",
    "dry": "\U0001f9f7",
}
_FEEDING_LABELS = {
    "breast_left": "Left Breast",
    "breast_right": "Right Breast",
    "bottle": "Bottle",
}
_FEEDING_LABELS_SHORT = {
    "breast_left": "Left",
    "breast_right": "Right",
    "bottle": "Bottle",
}
_FEEDING_EMOJIS = {
    "breast_left": "\U0001f931",
    "breast_right": "\U0001f931",
    "bottle": "\U0001f37c",
}


def _day_bounds(date_str: str) -> tuple[datetime, datetime]:
    """Compute UTC start and end for a local calendar date (YYYY-MM-DD).

    Uses ``_get_local_tz()`` so the day boundaries match the server's
    configured timezone — the same timezone used by ``_period_count``.
    """
    local_tz = _get_local_tz()
    y, m, d = map(int, date_str.split("-"))
    today = date_type(y, m, d)
    tomorrow = today + timedelta(days=1)
    start = datetime(today.year, today.month, today.day, tzinfo=local_tz).astimezone(UTC)
    end = datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=local_tz).astimezone(UTC)
    return start, end


def get_activities_for_date(db: Session, date_str: str) -> list[dict]:
    """Return activities for a local calendar date (YYYY-MM-DD)."""
    start, end = _day_bounds(date_str)
    return get_activities(db, start=start, end=end)


def get_activities(
    db: Session,
    start: datetime,
    end: datetime,
    limit: int = 200,
) -> list[dict]:
    """Return a merged, sorted list of all activity types in a time range."""
    activities: list[dict] = []

    for d in get_diapers(db, start_date=start, end_date=end, limit=limit):
        activities.append(
            {
                "type": "diaper",
                "subtype": d.type,
                "timestamp": d.timestamp.isoformat(),
                "id": d.id,
                "emoji": _DIAPER_EMOJIS.get(d.type, "\U0001f9f7"),
                "label": _DIAPER_LABELS.get(d.type, d.type),
                "detail": "",
                "summary": f"Diaper: {d.type}",
                "notes": d.notes,
            }
        )
    feedings = get_feedings(db, start_date=start, end_date=end, limit=limit)

    # Separate individually-logged feedings from paired (session_id) ones
    session_groups: dict[str, list] = {}
    for f in feedings:
        if f.session_id:
            session_groups.setdefault(f.session_id, []).append(f)
        else:
            if f.amount is not None and f.amount_unit:
                bottle_label = "Formula" if f.bottle_type == "formula" else "Breastmilk"
                detail = f"{bottle_label} · {_format_bottle_amount(f.amount, f.amount_unit)}"
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
                    "emoji": _FEEDING_EMOJIS.get(f.feeding_type, "\U0001f37c"),
                    "label": _FEEDING_LABELS.get(f.feeding_type, f.feeding_type),
                    "detail": detail,
                    "summary": f"Feeding: {f.feeding_type}",
                    "notes": f.notes,
                }
            )

    # Merge paired breast feedings into a single activity item
    for _sid, group in session_groups.items():
        group.sort(key=lambda f: f.timestamp)  # oldest first
        first = group[0]
        parts = []
        for f in group:
            short = _FEEDING_LABELS_SHORT.get(f.feeding_type, f.feeding_type)
            if f.duration_minutes:
                parts.append(f"{short}: {f.duration_minutes}min")
            else:
                parts.append(short)
        detail = " · ".join(parts)
        notes = next((f.notes for f in group if f.notes), None)
        activities.append(
            {
                "type": "feeding",
                "subtype": "breast_both",
                "timestamp": first.timestamp.isoformat(),
                "id": first.id,
                "secondary_id": group[1].id if len(group) > 1 else None,
                "emoji": "\U0001f931",
                "label": "Both Breasts",
                "detail": detail,
                "summary": "Feeding: Both Breasts",
                "notes": notes,
            }
        )
    for m in get_medications(db, start_date=start, end_date=end, limit=limit):
        activities.append(
            {
                "type": "medication",
                "subtype": "medication",
                "timestamp": m.timestamp.isoformat(),
                "id": m.id,
                "emoji": "\U0001f48a",
                "label": m.medication_name,
                "detail": f"{m.dosage_quantity:.2f} {m.dosage_unit}",
                "summary": f"Med: {m.medication_name}",
                "notes": m.notes,
            }
        )
    for t in get_temperatures(db, start_date=start, end_date=end, limit=limit):
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
    return activities


# --- Dashboard ---


def get_dashboard(db: Session, date_str: str | None = None) -> dict:
    now = datetime.now(UTC)

    # Stats
    d_stats = diaper_stats(db)
    f_stats = feeding_stats(db)
    med_today = _period_count(db, Medication, Medication.timestamp, "today")

    if date_str:
        start, end = _day_bounds(date_str)
        d_stats["today"] = _count_range(db, DiaperChange, DiaperChange.timestamp, start, end)
        f_stats["today"] = _feeding_session_count_range(db, start, end)
        med_today = _count_range(db, Medication, Medication.timestamp, start, end)

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

    # Recent activities (last 3 days, excluding future)
    three_days_ago = now - timedelta(days=3)
    activities = get_activities(db, start=three_days_ago, end=now)

    return {
        "diaper_stats": d_stats,
        "feeding_stats": f_stats,
        "medication_count_today": med_today,
        "last_diaper": last_diaper,
        "last_feeding": last_feeding,
        "last_temperature": last_temp,
        "recent_activities": activities,
    }
