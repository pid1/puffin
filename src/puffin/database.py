import os
import re
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_DOSAGE_UNIT_MAP = {
    "ml": "mL",
    "mL": "mL",
    "tsp": "tsp(s)",
    "tsps": "tsp(s)",
    "teaspoon": "tsp(s)",
    "teaspoons": "tsp(s)",
    "tbsp": "tbsp(s)",
    "tbsps": "tbsp(s)",
    "tablespoon": "tbsp(s)",
    "tablespoons": "tbsp(s)",
    "drop": "drop(s)",
    "drops": "drop(s)",
    "spray": "spray(s)",
    "sprays": "spray(s)",
    "tablet": "tablet(s)",
    "tablets": "tablet(s)",
    "tab": "tablet(s)",
    "unit": "unit(s)",
    "units": "unit(s)",
}


def _parse_dosage(dosage: str) -> tuple[float, str]:
    """Attempt to parse a free-text dosage string into (quantity, unit).

    Used during the data migration from the old single dosage field.
    Returns (0.0, 'unit(s)') when the string cannot be parsed.
    """
    if not dosage:
        return 0.0, "unit(s)"
    dosage = dosage.strip()
    m = re.match(r"^(\d+(?:\.\d{1,2})?)\s*([a-zA-Z]+)", dosage)
    if m:
        try:
            qty = round(float(m.group(1)), 2)
            unit = _DOSAGE_UNIT_MAP.get(
                m.group(2), _DOSAGE_UNIT_MAP.get(m.group(2).lower(), "unit(s)")
            )
            return qty, unit
        except ValueError:
            pass
    m = re.match(r"^(\d+(?:\.\d{1,2})?)$", dosage)
    if m:
        try:
            return round(float(m.group(1)), 2), "unit(s)"
        except ValueError:
            pass
    return 0.0, "unit(s)"


DB_PATH = os.environ.get(
    "PUFFIN_DB_PATH",
    str(Path(__file__).resolve().parent.parent.parent / "puffin.db"),
)
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, connection_record):
    """Enforce foreign keys, which SQLite leaves off per-connection by default.

    Without this the ``ondelete`` clauses on every log table are inert and a
    bad ``child_id`` is written happily, orphaning the log where no view can
    reach it.  Application-level validation in ``dependencies`` is the real
    guard; this is the backstop for any write that bypasses it.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_migrations(bind=None) -> None:
    """Apply incremental schema changes to existing databases.

    SQLAlchemy's ``create_all`` only creates missing tables; it does not add
    new columns to tables that already exist.  Any column added to a model
    after the initial release must be handled here so that deployed databases
    are automatically brought up to date on startup.

    *bind* defaults to the module-level ``engine`` and can be overridden for
    testing.
    """
    target = bind if bind is not None else engine
    with target.connect() as conn:
        existing_cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
        if "session_id" not in existing_cols:
            conn.execute(text("ALTER TABLE feedings ADD COLUMN session_id TEXT"))
            conn.commit()
            existing_cols.add("session_id")
        if "bottle_type" not in existing_cols:
            conn.execute(text("ALTER TABLE feedings ADD COLUMN bottle_type TEXT"))
            conn.commit()
            existing_cols.add("bottle_type")
        if "amount_unit" not in existing_cols:
            conn.execute(text("ALTER TABLE feedings ADD COLUMN amount_unit TEXT"))
            conn.commit()
            existing_cols.add("amount_unit")
        conn.execute(
            text(
                "UPDATE feedings SET amount_unit = 'oz' "
                "WHERE feeding_type = 'bottle' AND amount_unit IS NULL"
            )
        )
        conn.commit()
        if "amount_oz" in existing_cols and "amount" not in existing_cols:
            conn.execute(text("PRAGMA foreign_keys=off"))
            conn.execute(
                text(
                    "CREATE TABLE feedings_new ("
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    "timestamp DATETIME NOT NULL, "
                    "feeding_type VARCHAR NOT NULL, "
                    "duration_minutes INTEGER, "
                    "amount FLOAT, "
                    "amount_unit VARCHAR, "
                    "notes TEXT, "
                    "session_id VARCHAR, "
                    "bottle_type VARCHAR, "
                    "created_at DATETIME)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO feedings_new "
                    "(id, timestamp, feeding_type, duration_minutes, amount, amount_unit, "
                    "notes, session_id, bottle_type, created_at) "
                    "SELECT id, timestamp, feeding_type, duration_minutes, amount_oz, amount_unit, "
                    "notes, session_id, bottle_type, created_at FROM feedings"
                )
            )
            conn.execute(text("DROP TABLE feedings"))
            conn.execute(text("ALTER TABLE feedings_new RENAME TO feedings"))
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_feeding_timestamp ON feedings (timestamp)")
            )
            conn.execute(text("PRAGMA foreign_keys=on"))
            conn.commit()

        # Child profiles: every log table gains a nullable ``child_id``.
        # Existing rows keep ``NULL`` (unassigned) — no log data is read or
        # reinterpreted here.  Bulk assignment to a profile is a separate,
        # user-initiated action.  This must run after the ``feedings`` rebuild
        # above (which recreates the table without ``child_id``) and before the
        # medications early-return below.
        insp = inspect(conn)
        for table, index in (
            ("diaper_changes", "idx_diaper_child"),
            ("feedings", "idx_feeding_child"),
            ("medications", "idx_medication_child"),
            ("temperature_readings", "idx_temperature_child"),
        ):
            if not insp.has_table(table):
                continue
            if "child_id" not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN child_id INTEGER"))
                conn.commit()
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index} ON {table} (child_id)"))
            conn.commit()

        insp = inspect(conn)
        if not insp.has_table("medications"):
            return
        med_cols = {c["name"] for c in insp.get_columns("medications")}
        if "dosage_quantity" not in med_cols:
            conn.execute(
                text("ALTER TABLE medications ADD COLUMN dosage_quantity REAL NOT NULL DEFAULT 0.0")
            )
            conn.execute(
                text(
                    "ALTER TABLE medications ADD COLUMN dosage_unit TEXT NOT NULL DEFAULT 'unit(s)'"
                )
            )
            conn.commit()
            # Attempt to migrate existing free-text dosage values
            rows = conn.execute(text("SELECT id, dosage FROM medications")).fetchall()
            for row_id, dosage_text in rows:
                qty, unit = _parse_dosage(dosage_text or "")
                conn.execute(
                    text(
                        "UPDATE medications SET dosage_quantity = :qty, dosage_unit = :unit "
                        "WHERE id = :id"
                    ),
                    {"qty": qty, "unit": unit, "id": row_id},
                )
            conn.commit()

        # Drop the obsolete NOT NULL ``dosage`` column if it is still lingering.
        # ORM INSERTs don't supply ``dosage``, so leaving it in place causes
        # every new medication save to fail with a NOT NULL constraint error.
        med_cols = {c["name"] for c in inspect(conn).get_columns("medications")}
        if "dosage" in med_cols:
            conn.execute(text("ALTER TABLE medications DROP COLUMN dosage"))
            conn.commit()

        # Seed saved_medications from existing medication log entries (first casing wins)
        if insp.has_table("saved_medications"):
            saved_count = conn.execute(text("SELECT COUNT(*) FROM saved_medications")).scalar()
            if saved_count == 0:
                rows = conn.execute(
                    text("SELECT medication_name FROM medications ORDER BY timestamp ASC, id ASC")
                ).fetchall()
                seen_lower: set[str] = set()
                now = datetime.now(UTC)
                for (name,) in rows:
                    lower = name.lower()
                    if lower not in seen_lower:
                        seen_lower.add(lower)
                        # ``created_at`` is NOT NULL at the SQL level but only has
                        # a Python-side default, so raw INSERTs must populate it
                        # explicitly — without it, INSERT OR IGNORE would silently
                        # skip every row.
                        conn.execute(
                            text(
                                "INSERT OR IGNORE INTO saved_medications (name, created_at) "
                                "VALUES (:name, :created_at)"
                            ),
                            {"name": name, "created_at": now},
                        )
                if seen_lower:
                    conn.commit()


def init_db():
    """Create all tables, disposing stale connections first."""
    engine.dispose()
    Base.metadata.create_all(bind=engine)
    _run_migrations()
