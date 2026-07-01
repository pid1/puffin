#!/usr/bin/env python3
"""Run all database migrations in order.
This script runs all migration files in sequence. Each migration should be idempotent.
Add new migrations by importing them here and adding to the MIGRATIONS list.
"""

import sys


def run_migrations():
    """Run all migrations in order."""
    try:
        from migrate_add_bottle_feed_unit import (
            migrate as migrate_001_add_bottle_feed_unit,
        )
    except ImportError as e:
        print(f"✗ Failed to import migrations: {e}")
        return False

    migrations = [
        ("001_add_bottle_feed_unit", migrate_001_add_bottle_feed_unit),
    ]

    print("=" * 60)
    print("Running Puffin database migrations...")
    print("=" * 60)

    success = True
    for name, migration_func in migrations:
        print(f"\n[{name}]")
        try:
            result = migration_func()
            if result is False:
                print(f"✗ Migration {name} failed")
                success = False
                break
        except Exception as e:
            print(f"✗ Migration {name} raised exception: {e}")
            success = False
            break

    print("\n" + "=" * 60)
    if success:
        print("✓ All migrations completed successfully")
    else:
        print("✗ Migrations failed")
    print("=" * 60)

    return success


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
