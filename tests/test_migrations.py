"""Tests for ``_run_migrations`` against legacy database schemas.

These tests simulate the schema that existed before the medication-dosage
split (issue #26) and autocomplete feature (issue #27) to guarantee that a
user upgrading from an older release still ends up with:

- ``dosage_quantity`` / ``dosage_unit`` columns populated from the old
  free-text ``dosage`` field.
- The obsolete NOT NULL ``dosage`` column dropped — otherwise every new
  medication save would fail with a ``NOT NULL constraint`` error.
- ``saved_medications`` seeded from prior log entries so the autocomplete
  dropdown is non-empty on first use.
"""

import sqlite3

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from puffin import models  # noqa: F401  (register ORM models on Base.metadata)
from puffin.database import Base, _run_migrations


def _legacy_schema_sql() -> str:
    """The medications table as it existed before issue #26 — single
    free-text ``dosage`` column, no ``saved_medications`` table.  Other
    tables are included because ``_run_migrations`` touches ``feedings``.
    """
    return """
    CREATE TABLE diaper_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL, type TEXT NOT NULL,
        notes TEXT, created_at DATETIME);
    CREATE TABLE feedings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL, feeding_type TEXT NOT NULL,
        duration_minutes INTEGER, amount_oz REAL,
        notes TEXT, created_at DATETIME);
    CREATE TABLE medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL, medication_name TEXT NOT NULL,
        dosage TEXT NOT NULL, notes TEXT, created_at DATETIME);
    CREATE TABLE temperature_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL, temperature_celsius REAL NOT NULL,
        location TEXT, notes TEXT, created_at DATETIME);
    """


@pytest.fixture
def legacy_engine(tmp_path):
    """A file-backed engine whose DB file starts with the pre-#26 schema."""
    db_path = tmp_path / "legacy.db"
    raw = sqlite3.connect(db_path)
    raw.executescript(_legacy_schema_sql())
    raw.executemany(
        "INSERT INTO medications (timestamp, medication_name, dosage, notes, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        [
            ("2026-04-01 10:00:00", "Tylenol", "2.5 ml", None, "2026-04-01 10:00:00"),
            ("2026-04-02 10:00:00", "Vitamin D", "400 IU (1 drop)", None, "2026-04-02 10:00:00"),
            ("2026-04-03 10:00:00", "tylenol", "2.5 ml", None, "2026-04-03 10:00:00"),
        ],
    )
    raw.executemany(
        "INSERT INTO feedings "
        "(timestamp, feeding_type, duration_minutes, amount_oz, notes, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("2026-04-01 09:00:00", "bottle", None, 3.5, None, "2026-04-01 09:00:00"),
            ("2026-04-01 10:00:00", "breast_left", 12, None, None, "2026-04-01 10:00:00"),
        ],
    )
    raw.commit()
    raw.close()

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    _run_migrations(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


def test_migration_adds_split_dosage_columns(legacy_engine):
    with legacy_engine.connect() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("medications")}
    assert "dosage_quantity" in cols
    assert "dosage_unit" in cols


def test_migration_renames_feeding_amount_column(legacy_engine):
    with legacy_engine.connect() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
        rows = conn.execute(
            text("SELECT feeding_type, amount, amount_unit FROM feedings ORDER BY id")
        ).fetchall()
    assert "amount" in cols
    assert "amount_unit" in cols
    assert "amount_oz" not in cols
    assert rows[0] == ("bottle", 3.5, "oz")
    assert rows[1] == ("breast_left", None, None)


@pytest.mark.parametrize(
    "table",
    ["diaper_changes", "feedings", "medications", "temperature_readings"],
)
def test_migration_adds_child_id_to_every_log_table(legacy_engine, table):
    """Issue #44 — profiles are opt-in, so the column must simply exist."""
    with legacy_engine.connect() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns(table)}
    assert "child_id" in cols


def test_migration_leaves_existing_logs_unassigned(legacy_engine):
    """No log is silently adopted by a profile — bulk assignment is opt-in.

    ``feedings`` is the sharp case: it is rebuilt wholesale by the amount_oz
    rename, so this also proves ``child_id`` survives that rebuild.
    """
    with legacy_engine.connect() as conn:
        for table in ("feedings", "medications"):
            rows = conn.execute(text(f"SELECT child_id FROM {table}")).fetchall()  # noqa: S608
            assert rows, f"expected seeded rows in {table}"
            assert all(child_id is None for (child_id,) in rows)


def test_migration_creates_children_table(legacy_engine):
    with legacy_engine.connect() as conn:
        assert inspect(conn).has_table("children")
        assert conn.execute(text("SELECT COUNT(*) FROM children")).scalar() == 0


def test_migration_is_idempotent_for_child_id(legacy_engine):
    """Startup runs migrations every time; a second pass must be a no-op."""
    _run_migrations(bind=legacy_engine)
    _run_migrations(bind=legacy_engine)
    with legacy_engine.connect() as conn:
        cols = [c["name"] for c in inspect(conn).get_columns("diaper_changes")]
    assert cols.count("child_id") == 1


def test_migration_adds_amount_unit_to_current_amount_schema(tmp_path):
    db_path = tmp_path / "amount_without_unit.db"
    raw = sqlite3.connect(db_path)
    raw.executescript(
        """
        CREATE TABLE feedings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            feeding_type TEXT NOT NULL,
            duration_minutes INTEGER,
            amount REAL,
            notes TEXT,
            session_id TEXT,
            bottle_type TEXT,
            created_at DATETIME
        );
        INSERT INTO feedings
            (timestamp, feeding_type, duration_minutes, amount, notes, created_at)
        VALUES
            ('2026-04-01 09:00:00', 'bottle', NULL, 120, NULL, '2026-04-01 09:00:00'),
            ('2026-04-01 10:00:00', 'breast_left', 12, NULL, NULL, '2026-04-01 10:00:00');
        """
    )
    raw.commit()
    raw.close()

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    try:
        _run_migrations(bind=engine)
        _run_migrations(bind=engine)
        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
            rows = conn.execute(
                text("SELECT feeding_type, amount, amount_unit FROM feedings ORDER BY id")
            ).fetchall()
    finally:
        engine.dispose()

    assert "amount" in cols
    assert "amount_unit" in cols
    assert "amount_oz" not in cols
    assert rows[0] == ("bottle", 120.0, "oz")
    assert rows[1] == ("breast_left", None, None)


def test_migration_backfills_temperature_unit_as_celsius(tmp_path):
    """Legacy temperature rows have no recorded unit; the stored value is
    Celsius, so the migration backfills ``unit`` to 'C' rather than assuming an
    entry unit it cannot recover. See issue #58.
    """
    db_path = tmp_path / "temps_without_unit.db"
    raw = sqlite3.connect(db_path)
    raw.executescript(
        """
        CREATE TABLE feedings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            feeding_type TEXT NOT NULL,
            duration_minutes INTEGER,
            amount REAL,
            amount_unit TEXT,
            notes TEXT,
            session_id TEXT,
            bottle_type TEXT,
            created_at DATETIME
        );
        CREATE TABLE temperature_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            temperature_celsius REAL NOT NULL,
            location TEXT,
            notes TEXT,
            created_at DATETIME
        );
        INSERT INTO temperature_readings
            (timestamp, temperature_celsius, location, notes, created_at)
        VALUES
            ('2026-04-01 09:00:00', 37.0, NULL, NULL, '2026-04-01 09:00:00'),
            ('2026-04-02 09:00:00', 38.2, 'oral', NULL, '2026-04-02 09:00:00');
        """
    )
    raw.commit()
    raw.close()

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    try:
        _run_migrations(bind=engine)
        _run_migrations(bind=engine)
        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("temperature_readings")}
            rows = conn.execute(
                text("SELECT unit, temperature FROM temperature_readings ORDER BY id")
            ).all()
    finally:
        engine.dispose()

    assert "unit" in cols
    assert "temperature" in cols
    assert "temperature_celsius" not in cols
    # Legacy rows have no known unit → treated as Celsius and kept as-is.
    assert rows == [("C", 37.0), ("C", 38.2)]


def test_migration_reconstructs_entered_fahrenheit(tmp_path):
    """Storing temperatures as entered (#60): ``temperature_celsius`` is renamed
    to ``temperature``; Fahrenheit rows are reconstructed from their stored
    Celsius value, Celsius rows are kept as-is.
    """
    db_path = tmp_path / "temps_celsius_with_unit.db"
    raw = sqlite3.connect(db_path)
    raw.executescript(
        """
        CREATE TABLE feedings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            feeding_type TEXT NOT NULL,
            duration_minutes INTEGER,
            amount REAL,
            amount_unit TEXT,
            notes TEXT,
            session_id TEXT,
            bottle_type TEXT,
            created_at DATETIME
        );
        CREATE TABLE temperature_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            temperature_celsius REAL NOT NULL,
            unit TEXT NOT NULL DEFAULT 'C',
            location TEXT,
            notes TEXT,
            created_at DATETIME
        );
        INSERT INTO temperature_readings
            (timestamp, temperature_celsius, unit, location, notes, created_at)
        VALUES
            ('2026-04-01 09:00:00', 37.0, 'C', NULL, NULL, '2026-04-01 09:00:00'),
            ('2026-04-02 09:00:00', 37.0, 'F', NULL, NULL, '2026-04-02 09:00:00');
        """
    )
    raw.commit()
    raw.close()

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    try:
        _run_migrations(bind=engine)
        _run_migrations(bind=engine)
        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("temperature_readings")}
            rows = conn.execute(
                text("SELECT unit, temperature FROM temperature_readings ORDER BY id")
            ).all()
    finally:
        engine.dispose()

    assert "temperature" in cols
    assert "temperature_celsius" not in cols
    # C row kept as-is; F row reconstructed from stored Celsius: 37.0 C -> 98.6 F.
    assert rows == [("C", 37.0), ("F", 98.6)]


def test_migration_drops_obsolete_dosage_column(legacy_engine):
    """The old NOT NULL ``dosage`` column must go — otherwise new medication
    saves fail with a NOT NULL constraint error (issue #30)."""
    with legacy_engine.connect() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("medications")}
    assert "dosage" not in cols


def test_migration_parses_existing_dosage_values(legacy_engine):
    with legacy_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT medication_name, dosage_quantity, dosage_unit FROM medications ORDER BY id"
            )
        ).fetchall()
    assert rows[0] == ("Tylenol", 2.5, "mL")
    assert rows[1] == ("Vitamin D", 400.0, "unit(s)")


def test_migration_seeds_saved_medications(legacy_engine):
    """Previously-logged medication names must appear in the autocomplete
    source (issue #30, part 1)."""
    with legacy_engine.connect() as conn:
        names = [
            r[0]
            for r in conn.execute(text("SELECT name FROM saved_medications ORDER BY id")).fetchall()
        ]
    # "tylenol" should be deduped against "Tylenol" (first casing wins)
    assert names == ["Tylenol", "Vitamin D"]


def test_new_medication_insert_works_after_migration(legacy_engine):
    """After the migration, a fresh ORM-style INSERT (which never supplies the
    old ``dosage`` column) must succeed."""
    with legacy_engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO medications "
                "(timestamp, medication_name, dosage_quantity, dosage_unit, notes, created_at) "
                "VALUES (:ts, :name, :qty, :unit, :notes, :created_at)"
            ),
            {
                "ts": "2026-04-24 00:00:00",
                "name": "Advil",
                "qty": 1.0,
                "unit": "mL",
                "notes": None,
                "created_at": "2026-04-24 00:00:00",
            },
        )
        conn.commit()
        count = conn.execute(
            text("SELECT COUNT(*) FROM medications WHERE medication_name = 'Advil'")
        ).scalar()
    assert count == 1


def test_migration_is_idempotent(legacy_engine):
    """Running migrations a second time must be a no-op and must not wipe
    previously-seeded saved_medications."""
    _run_migrations(bind=legacy_engine)
    with legacy_engine.connect() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("medications")}
        feeding_cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
        saved = conn.execute(text("SELECT COUNT(*) FROM saved_medications")).scalar()
    assert "dosage" not in cols
    assert "dosage_quantity" in cols
    assert "amount" in feeding_cols
    assert "amount_unit" in feeding_cols
    assert "amount_oz" not in feeding_cols
    assert saved == 2
