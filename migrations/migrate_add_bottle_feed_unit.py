#!/usr/bin/env python3
"""Migration: Add amount_unit column to feedings and backfill bottle sessions with 'oz'.
Safe to run multiple times (idempotent).
"""

import os
import sqlite3
import sys
from pathlib import Path


def migrate():
    """Run the migration. Return True on success, False on failure."""
    db_path = os.environ.get("PUFFIN_DB_PATH")

    if not db_path:
        prod_path = Path("/data/puffin.db")
        dev_path = Path(__file__).parent.parent / "puffin.db"
        db_path = str(prod_path) if prod_path.exists() else str(dev_path)

    db_path = Path(db_path)

    if not db_path.exists():
        print(f"  Database not found at {db_path}")
        print("  No migration needed - database will be created with correct schema.")
        return True

    print(f"Checking database at {db_path}...")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(feedings)")
        columns = [col[1] for col in cursor.fetchall()]

        if not columns:
            print("  feedings table not found")
            print("  No migration needed - table will be created with correct schema.")
            return True

        if "session_id" not in columns:
            cursor.execute("ALTER TABLE feedings ADD COLUMN session_id TEXT")
            columns.append("session_id")
        if "bottle_type" not in columns:
            cursor.execute("ALTER TABLE feedings ADD COLUMN bottle_type TEXT")
            columns.append("bottle_type")

        has_amount_unit = "amount_unit" in columns
        has_amount_oz = "amount_oz" in columns
        has_amount = "amount" in columns

        if has_amount_unit:
            print("✓ Migration: feedings.amount_unit already exists (idempotent check)")
        else:
            print("  Adding feedings.amount_unit column...")
            cursor.execute("ALTER TABLE feedings ADD COLUMN amount_unit TEXT")
            print("✓ Migration: feedings.amount_unit added")

        cursor.execute(
            "UPDATE feedings SET amount_unit = 'oz' "
            "WHERE feeding_type = 'bottle' AND amount_unit IS NULL"
        )
        updated = cursor.rowcount
        print(f"✓ Migration: backfilled {updated} bottle session(s) with amount_unit = 'oz'")

        if has_amount_oz and not has_amount:
            print("  Renaming feedings.amount_oz to feedings.amount...")
            cursor.execute("PRAGMA foreign_keys=off")
            cursor.execute(
                """
                CREATE TABLE feedings_new (
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
                )
                """
            )
            cursor.execute(
                """
                INSERT INTO feedings_new
                    (id, timestamp, feeding_type, duration_minutes, amount,
                     amount_unit, notes, session_id, bottle_type, created_at)
                SELECT
                    id, timestamp, feeding_type, duration_minutes, amount_oz,
                    amount_unit, notes, session_id, bottle_type, created_at
                FROM feedings
                """
            )
            cursor.execute("DROP TABLE feedings")
            cursor.execute("ALTER TABLE feedings_new RENAME TO feedings")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_feeding_timestamp ON feedings (timestamp)"
            )
            cursor.execute("PRAGMA foreign_keys=on")
            print("✓ Migration: feedings.amount_oz renamed to feedings.amount")
        elif has_amount:
            print("✓ Migration: feedings.amount already exists (idempotent check)")

        conn.commit()
        print("✓ Migration complete: bottle feed unit support added")
        return True

    except sqlite3.Error as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
