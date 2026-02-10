"""Generate 14 days of realistic newborn demo data.

Simulates a baby born 14 days ago with:
- Feedings every 2-3 hours (mix of breast/bottle)
  - Breast sessions may produce paired left/right entries (simulating timer switching)
- 10-12 diaper changes per day
- Daily vitamin D drops
- Temperature checks in the first few days
- Occasional Tylenol for circumcision recovery (days 1-3)

Usage:
    python -m puffin.seed
"""

import random
from datetime import datetime, timedelta

from puffin.database import SessionLocal, init_db
from puffin.models import DiaperChange, Feeding, Medication, TemperatureReading

# Seed for reproducibility
random.seed(42)

BIRTH_DATE = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=14)

DIAPER_TYPES = ["pee", "poop", "both"]
DIAPER_WEIGHTS = [0.45, 0.25, 0.30]  # pee most common

FEEDING_NOTES = [
    None,
    None,
    None,
    "Good latch",
    "Fussy at start",
    "Fell asleep during feeding",
    "Extra hungry",
    "Spit up after",
]

DIAPER_NOTES = [
    None,
    None,
    None,
    None,
    "Blowout",
    "Seedy yellow",
    "Very wet",
    "Small amount",
]


def _jitter(minutes: int) -> timedelta:
    """Add random jitter of +/- `minutes` minutes."""
    return timedelta(minutes=random.randint(-minutes, minutes))


def generate_feedings(day_offset: int, base_date: datetime) -> list[Feeding]:
    """Generate feedings for a single day.

    Breast sessions may produce paired left/right entries to simulate the
    timer switching feature (~65% of breast feeds use both breasts).
    """
    feedings = []
    day_start = base_date + timedelta(days=day_offset)

    # Newborns feed every 2-3 hours = ~8-12 feeds/day
    # First few days: more frequent, shorter durations
    feeds_per_day = random.randint(8, 12) if day_offset < 5 else random.randint(7, 10)
    interval = timedelta(hours=24 / feeds_per_day)

    current_time = day_start + _jitter(30)
    now = datetime.now()
    for _i in range(feeds_per_day):
        if current_time > now:
            break
        if random.random() < 0.15:
            # Bottle feeding — single entry with ounces
            feedings.append(
                Feeding(
                    timestamp=current_time,
                    feeding_type="bottle",
                    amount_oz=round(random.uniform(1.0, 4.0), 1),
                    notes=random.choice(FEEDING_NOTES),
                    created_at=current_time,
                )
            )
        else:
            # Breast feeding — duration increases over the first week
            base_duration = 10 + min(day_offset, 7) * 2

            if random.random() < 0.65:
                # Paired session: both breasts with individual durations
                first_side = random.choice(["breast_left", "breast_right"])
                second_side = (
                    "breast_right" if first_side == "breast_left" else "breast_left"
                )

                half = base_duration // 2
                first_dur = random.randint(max(3, half - 3), half + 4)
                second_dur = random.randint(max(3, half - 3), half + 4)

                feedings.append(
                    Feeding(
                        timestamp=current_time,
                        feeding_type=first_side,
                        duration_minutes=first_dur,
                        notes=random.choice(FEEDING_NOTES),
                        created_at=current_time,
                    )
                )

                second_time = current_time + timedelta(minutes=first_dur)
                feedings.append(
                    Feeding(
                        timestamp=second_time,
                        feeding_type=second_side,
                        duration_minutes=second_dur,
                        notes=None,
                        created_at=second_time,
                    )
                )
            else:
                # Single-breast session
                side = random.choice(["breast_left", "breast_right"])
                duration = random.randint(max(5, base_duration - 8), base_duration + 5)
                feedings.append(
                    Feeding(
                        timestamp=current_time,
                        feeding_type=side,
                        duration_minutes=duration,
                        notes=random.choice(FEEDING_NOTES),
                        created_at=current_time,
                    )
                )

        current_time += interval + _jitter(20)

    return feedings


def generate_diapers(day_offset: int, base_date: datetime) -> list[DiaperChange]:
    """Generate diaper changes for a single day."""
    diapers = []
    day_start = base_date + timedelta(days=day_offset)

    # 10-12 per day first week, 8-10 after
    count = random.randint(10, 12) if day_offset < 7 else random.randint(8, 10)
    interval = timedelta(hours=24 / count)

    now = datetime.now()
    current_time = day_start + timedelta(minutes=random.randint(0, 60))
    for _ in range(count):
        if current_time > now:
            break
        dtype = random.choices(DIAPER_TYPES, weights=DIAPER_WEIGHTS, k=1)[0]
        diapers.append(
            DiaperChange(
                timestamp=current_time,
                type=dtype,
                notes=random.choice(DIAPER_NOTES),
                created_at=current_time,
            )
        )
        current_time += interval + _jitter(15)

    return diapers


def generate_medications(day_offset: int, base_date: datetime) -> list[Medication]:
    """Generate medication records for a single day."""
    meds = []
    day_start = base_date + timedelta(days=day_offset)

    now = datetime.now()

    # Daily vitamin D drops (every day from day 1)
    if day_offset >= 1:
        vit_d_time = day_start + timedelta(
            hours=random.randint(9, 11), minutes=random.randint(0, 59)
        )
        if vit_d_time <= now:
            meds.append(
                Medication(
                    timestamp=vit_d_time,
                    medication_name="Vitamin D",
                    dosage="400 IU (1 drop)",
                    notes=None,
                    created_at=vit_d_time,
                )
            )

    # Tylenol for days 1-3 (circumcision recovery) — 2-3 doses per day
    if 1 <= day_offset <= 3:
        doses = random.randint(2, 3)
        for i in range(doses):
            t = day_start + timedelta(hours=8 + i * 6, minutes=random.randint(0, 30))
            if t > now:
                break
            meds.append(
                Medication(
                    timestamp=t,
                    medication_name="Infant Tylenol",
                    dosage="1.25 ml",
                    notes="Circumcision pain" if i == 0 else None,
                    created_at=t,
                )
            )

    return meds


def generate_temperatures(day_offset: int, base_date: datetime) -> list[TemperatureReading]:
    """Generate temperature readings for a single day."""
    temps = []
    day_start = base_date + timedelta(days=day_offset)

    now = datetime.now()

    # Check temp more often in first 3 days, then occasionally
    if day_offset <= 2:
        checks = random.randint(2, 3)
    elif day_offset <= 5:
        checks = 1
    elif random.random() < 0.3:
        checks = 1
    else:
        checks = 0

    for i in range(checks):
        t = day_start + timedelta(hours=8 + i * 8, minutes=random.randint(0, 59))
        if t > now:
            break
        # Normal newborn temp: 36.5-37.5°C, slight variation
        temp_c = round(random.uniform(36.4, 37.4), 1)
        location = random.choice(["rectal", "axillary", "temporal"])
        temps.append(
            TemperatureReading(
                timestamp=t,
                temperature_celsius=temp_c,
                location=location,
                notes=None,
                created_at=t,
            )
        )

    return temps


def seed():
    """Generate and insert 14 days of demo data."""
    init_db()
    db = SessionLocal()

    try:
        # Check if data already exists
        existing = db.query(Feeding).count()
        if existing > 0:
            print(f"Database already has {existing} feedings. Skipping seed.")
            print("Delete puffin.db to start fresh, then re-run seed.")
            return

        total = {"feedings": 0, "diapers": 0, "medications": 0, "temperatures": 0}

        for day in range(15):  # 0 = birth day, 14 = today
            feedings = generate_feedings(day, BIRTH_DATE)
            diapers = generate_diapers(day, BIRTH_DATE)
            medications = generate_medications(day, BIRTH_DATE)
            temperatures = generate_temperatures(day, BIRTH_DATE)

            db.add_all(feedings)
            db.add_all(diapers)
            db.add_all(medications)
            db.add_all(temperatures)

            total["feedings"] += len(feedings)
            total["diapers"] += len(diapers)
            total["medications"] += len(medications)
            total["temperatures"] += len(temperatures)

        db.commit()

        print(f"Seeded {sum(total.values())} records over 15 days:")
        print(f"  Feedings:     {total['feedings']}")
        print(f"  Diapers:      {total['diapers']}")
        print(f"  Medications:  {total['medications']}")
        print(f"  Temperatures: {total['temperatures']}")
        print(f"\nBirth date: {BIRTH_DATE.strftime('%Y-%m-%d %H:%M')}")
        print(f"Today:      {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
