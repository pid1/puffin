"""Regression tests for the demo-data generator.

The whole seed command used to crash on the first medication (a non-existent
`dosage` field), inserting zero rows; and its "paired" breast feeds never
shared a session_id, so they didn't actually pair.
"""

import random
from datetime import UTC, datetime, timedelta

from puffin import seed as seed_mod
from puffin.schemas import MedicationCreate


def _window():
    now = datetime.now(UTC)
    base = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=14)
    return base, now


def test_generate_medications_uses_valid_dosage_fields():
    """Medications must construct (no bad kwarg) and carry quantity + unit."""
    base, now = _window()
    meds = seed_mod.generate_medications(day_offset=1, base_date=base, now=now)

    assert meds, "day 1 should produce at least the daily vitamin D"
    for m in meds:
        # The bug was a TypeError at construction; reaching here means it built.
        assert m.dosage_quantity is not None
        assert m.dosage_unit
        # And the values must satisfy the app's own medication schema.
        MedicationCreate(
            medication_name=m.medication_name,
            dosage_quantity=m.dosage_quantity,
            dosage_unit=m.dosage_unit,
        )


def test_paired_breast_feeds_share_a_session_id():
    """Two-sided sessions must carry a shared session_id so they merge as one."""
    random.seed(42)  # deterministic run
    base, now = _window()

    feeds = []
    for day in range(15):
        feeds.extend(seed_mod.generate_feedings(day, base, now))

    paired = [f for f in feeds if f.session_id]
    assert paired, "the generator should produce some paired sessions"

    # Every session_id that appears should group breast feeds (a real pair is
    # two rows; the tail day can clip the second side, leaving one).
    by_session: dict[str, list] = {}
    for f in paired:
        by_session.setdefault(f.session_id, []).append(f)

    two_sided = [group for group in by_session.values() if len(group) == 2]
    assert two_sided, "at least one full left+right pair expected"
    for group in two_sided:
        sides = {f.feeding_type for f in group}
        assert sides == {"breast_left", "breast_right"}, "a pair is one of each side"


def test_seed_generators_produce_a_full_day_of_data():
    """Every record type generates without error for a normal day."""
    base, now = _window()
    assert seed_mod.generate_feedings(3, base, now)
    assert seed_mod.generate_diapers(3, base, now)
    assert seed_mod.generate_temperatures(1, base, now)
