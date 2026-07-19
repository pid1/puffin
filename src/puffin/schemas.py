import math
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Bounds for the free-numeric log fields.  These are deliberately generous --
# the goal is to reject transparently impossible input (negative durations, a
# -500 C body temperature that the PDF export happily renders as -868 F), not
# to second-guess a real reading.  The frontend converts Fahrenheit to Celsius
# before posting, so a temperature always arrives in Celsius.
_MIN_TEMP_C = 20.0  # below profound hypothermia
_MAX_TEMP_C = 45.0  # above survivable hyperthermia
_MAX_FEED_MINUTES = 24 * 60
_MAX_BOTTLE_AMOUNT = 2000.0  # generous in either mL or oz

# --- Enums ---


class DiaperType(StrEnum):
    pee = "pee"
    poop = "poop"
    both = "both"
    dry = "dry"


class FeedingType(StrEnum):
    breast_left = "breast_left"
    breast_right = "breast_right"
    bottle = "bottle"


class BottleType(StrEnum):
    breastmilk = "breastmilk"
    formula = "formula"


class BottleUnit(StrEnum):
    oz = "oz"
    ml = "mL"


class TemperatureLocation(StrEnum):
    rectal = "rectal"
    oral = "oral"
    axillary = "axillary"
    temporal = "temporal"


class DosageUnit(StrEnum):
    ml = "mL"
    tsp = "tsp(s)"
    tbsp = "tbsp(s)"
    drop = "drop(s)"
    spray = "spray(s)"
    tablet = "tablet(s)"
    unit = "unit(s)"


# --- Child Schemas ---


class ChildCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class ChildUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class ChildResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime


class UnassignedSummary(BaseModel):
    """Whether any logs are currently unassigned.

    Drives both the conditional ``Unassigned logs`` switcher option and the
    one-time migration offer at first profile creation.
    """

    count: int = 0


class BulkAssignResult(BaseModel):
    assigned: int = 0


# --- Diaper Schemas ---


class DiaperChangeCreate(BaseModel):
    timestamp: datetime | None = None
    type: DiaperType
    notes: str | None = None
    child_id: int | None = None


class DiaperChangeUpdate(BaseModel):
    timestamp: datetime | None = None
    type: DiaperType | None = None
    notes: str | None = None
    child_id: int | None = None


class DiaperChangeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    type: DiaperType
    notes: str | None
    child_id: int | None = None
    created_at: datetime


# --- Feeding Schemas ---


class FeedingCreate(BaseModel):
    timestamp: datetime | None = None
    feeding_type: FeedingType
    duration_minutes: int | None = Field(None, ge=0, le=_MAX_FEED_MINUTES)
    amount: float | None = Field(None, gt=0, le=_MAX_BOTTLE_AMOUNT)
    amount_unit: BottleUnit | None = None
    notes: str | None = None
    session_id: str | None = None
    bottle_type: BottleType | None = None
    child_id: int | None = None

    @model_validator(mode="after")
    def validate_bottle_amount(self) -> Self:
        if self.feeding_type == FeedingType.bottle:
            if (self.amount is None) != (self.amount_unit is None):
                raise ValueError("Bottle feeds require amount and amount_unit together")
        else:
            self.amount = None
            self.amount_unit = None
        return self


class FeedingUpdate(BaseModel):
    timestamp: datetime | None = None
    feeding_type: FeedingType | None = None
    duration_minutes: int | None = Field(None, ge=0, le=_MAX_FEED_MINUTES)
    amount: float | None = Field(None, gt=0, le=_MAX_BOTTLE_AMOUNT)
    amount_unit: BottleUnit | None = None
    notes: str | None = None
    bottle_type: BottleType | None = None
    child_id: int | None = None

    @model_validator(mode="after")
    def validate_bottle_amount(self) -> Self:
        if self.feeding_type == FeedingType.bottle:
            if (self.amount is None) != (self.amount_unit is None):
                raise ValueError("Bottle feeds require amount and amount_unit together")
        elif self.feeding_type in {FeedingType.breast_left, FeedingType.breast_right}:
            self.amount = None
            self.amount_unit = None
        return self


class FeedingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    feeding_type: FeedingType
    duration_minutes: int | None
    amount: float | None
    amount_unit: BottleUnit | None
    notes: str | None
    session_id: str | None
    bottle_type: BottleType | None
    child_id: int | None = None
    created_at: datetime


# --- Medication Schemas ---


def _validate_dosage_quantity(v: float) -> float:
    # NaN and infinity must be rejected before the exponent check: for those,
    # ``as_tuple().exponent`` is the string 'n'/'F' rather than an int, so
    # comparing it raises TypeError -- which Pydantic does not convert into a
    # validation error, surfacing as an unhandled 500.  Python's json parser
    # accepts bare NaN/Infinity literals, so this is reachable from any client.
    if not math.isfinite(v):
        raise ValueError("Quantity must be a finite number")
    if Decimal(str(v)).as_tuple().exponent < -2:
        raise ValueError("Quantity must have at most 2 decimal places")
    if v <= 0:
        raise ValueError("Quantity must be greater than zero")
    return v


class MedicationCreate(BaseModel):
    timestamp: datetime | None = None
    medication_name: str
    dosage_quantity: float
    dosage_unit: DosageUnit
    notes: str | None = None
    child_id: int | None = None

    @field_validator("dosage_quantity")
    @classmethod
    def check_dosage_quantity(cls, v: float) -> float:
        return _validate_dosage_quantity(v)


class MedicationUpdate(BaseModel):
    timestamp: datetime | None = None
    medication_name: str | None = None
    dosage_quantity: float | None = None
    dosage_unit: DosageUnit | None = None
    notes: str | None = None
    child_id: int | None = None

    @field_validator("dosage_quantity")
    @classmethod
    def check_dosage_quantity(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return _validate_dosage_quantity(v)


class MedicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    medication_name: str
    dosage_quantity: float
    dosage_unit: str
    notes: str | None
    child_id: int | None = None
    created_at: datetime


# --- Temperature Schemas ---


class TemperatureCreate(BaseModel):
    timestamp: datetime | None = None
    temperature_celsius: float = Field(ge=_MIN_TEMP_C, le=_MAX_TEMP_C)
    location: TemperatureLocation | None = None
    notes: str | None = None
    child_id: int | None = None


class TemperatureUpdate(BaseModel):
    timestamp: datetime | None = None
    temperature_celsius: float | None = Field(None, ge=_MIN_TEMP_C, le=_MAX_TEMP_C)
    location: TemperatureLocation | None = None
    notes: str | None = None
    child_id: int | None = None


class TemperatureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    temperature_celsius: float
    location: TemperatureLocation | None
    notes: str | None
    child_id: int | None = None
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
    secondary_id: int | None = None
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
