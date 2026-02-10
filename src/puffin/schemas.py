from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

# --- Enums ---


class DiaperType(StrEnum):
    pee = "pee"
    poop = "poop"
    both = "both"


class FeedingType(StrEnum):
    breast_left = "breast_left"
    breast_right = "breast_right"
    bottle = "bottle"


class TemperatureLocation(StrEnum):
    rectal = "rectal"
    oral = "oral"
    axillary = "axillary"
    temporal = "temporal"


# --- Diaper Schemas ---


class DiaperChangeCreate(BaseModel):
    timestamp: datetime | None = None
    type: DiaperType
    notes: str | None = None


class DiaperChangeUpdate(BaseModel):
    timestamp: datetime | None = None
    type: DiaperType | None = None
    notes: str | None = None


class DiaperChangeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    type: DiaperType
    notes: str | None
    created_at: datetime


# --- Feeding Schemas ---


class FeedingCreate(BaseModel):
    timestamp: datetime | None = None
    feeding_type: FeedingType
    duration_minutes: int | None = None
    amount_oz: float | None = None
    notes: str | None = None


class FeedingUpdate(BaseModel):
    timestamp: datetime | None = None
    feeding_type: FeedingType | None = None
    duration_minutes: int | None = None
    amount_oz: float | None = None
    notes: str | None = None


class FeedingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    feeding_type: FeedingType
    duration_minutes: int | None
    amount_oz: float | None
    notes: str | None
    created_at: datetime


# --- Medication Schemas ---


class MedicationCreate(BaseModel):
    timestamp: datetime | None = None
    medication_name: str
    dosage: str
    notes: str | None = None


class MedicationUpdate(BaseModel):
    timestamp: datetime | None = None
    medication_name: str | None = None
    dosage: str | None = None
    notes: str | None = None


class MedicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    medication_name: str
    dosage: str
    notes: str | None
    created_at: datetime


# --- Temperature Schemas ---


class TemperatureCreate(BaseModel):
    timestamp: datetime | None = None
    temperature_celsius: float
    location: TemperatureLocation | None = None
    notes: str | None = None


class TemperatureUpdate(BaseModel):
    timestamp: datetime | None = None
    temperature_celsius: float | None = None
    location: TemperatureLocation | None = None
    notes: str | None = None


class TemperatureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    temperature_celsius: float
    location: TemperatureLocation | None
    notes: str | None
    created_at: datetime


# --- Stats / Dashboard Schemas ---


class PeriodStats(BaseModel):
    today: int = 0
    week: int = 0
    month: int = 0


class ActivityItem(BaseModel):
    type: str
    subtype: str
    timestamp: str
    id: int
    emoji: str = ""
    label: str = ""
    detail: str = ""
    summary: str
    notes: str | None = None


class DashboardSummary(BaseModel):
    diaper_stats: PeriodStats
    feeding_stats: PeriodStats
    medication_count_today: int = 0
    last_diaper: DiaperChangeResponse | None = None
    last_feeding: FeedingResponse | None = None
    last_temperature: TemperatureResponse | None = None
    recent_activities: list[ActivityItem] = []
