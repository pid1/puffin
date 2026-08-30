"""SQLite backup helpers.

The whole database is a single file holding irreplaceable family records, so
two cheap safety nets guard it:

* a snapshot taken automatically before every migration run (``init_db``),
  since migrations rewrite tables in place on the one live copy; and
* an on-demand backup (``python -m puffin.backup``) to wire to cron/systemd.

Both use SQLite's online backup API, which produces a consistent copy even if
the database is being written concurrently, and both land in a ``backups/``
directory beside the database. That protects against a bad migration or logical
corruption; it does **not** protect against losing the disk itself, since the
copies share it -- see README for off-box replication.
"""

import logging
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger("uvicorn.error")

# How many snapshots to retain per database. Override with PUFFIN_BACKUP_KEEP;
# 0 or negative disables pruning (keep everything).
DEFAULT_KEEP = 10


def _keep_count() -> int:
    raw = os.environ.get("PUFFIN_BACKUP_KEEP")
    if raw is None:
        return DEFAULT_KEEP
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_KEEP


def _backup_dir(db_path: Path) -> Path:
    return db_path.parent / "backups"


def _prune(backups: Path, stem: str, keep: int) -> None:
    """Keep only the newest *keep* snapshots for *stem*.

    Filenames are timestamped with a fixed-width, zero-padded stamp, so
    lexical order is chronological order.
    """
    if keep <= 0:
        return
    snaps = sorted(backups.glob(f"{stem}-*.db"))
    for old in snaps[:-keep]:
        old.unlink(missing_ok=True)


def backup_database(db_path, *, reason: str = "manual", keep: int | None = None) -> Path | None:
    """Write a consistent snapshot of *db_path* into its ``backups/`` dir.

    Returns the snapshot path, or ``None`` when there is nothing to back up
    (the file is missing or empty, i.e. a fresh install). *reason* is embedded
    in the filename so ``pre-migration`` and ``manual`` copies are
    distinguishable. Never raises on backup failure -- a failed backup must not
    take down startup -- but logs it.
    """
    db_path = Path(db_path)
    if not db_path.exists() or db_path.stat().st_size == 0:
        return None

    if keep is None:
        keep = _keep_count()

    backups = _backup_dir(db_path)
    backups.mkdir(parents=True, exist_ok=True)
    # Microseconds keep the stamp unique when two snapshots land in one second
    # (e.g. a manual backup right after the pre-migration one).
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S_%fZ")
    dest = backups / f"{db_path.stem}-{stamp}-{reason}.db"

    try:
        src = sqlite3.connect(str(db_path))
        try:
            dst = sqlite3.connect(str(dest))
            try:
                with dst:
                    src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    except sqlite3.Error:
        logger.exception("Database backup to %s failed", dest)
        dest.unlink(missing_ok=True)
        return None

    _prune(backups, db_path.stem, keep)
    logger.info("Database backed up to %s (reason=%s)", dest, reason)
    return dest


def main() -> None:
    # Imported lazily so this module has no import-time dependency on database
    # (which imports this one).
    from puffin.database import DB_PATH

    dest = backup_database(DB_PATH, reason="manual")
    if dest is None:
        print("No database to back up yet.")
    else:
        print(f"Backed up to {dest}")


if __name__ == "__main__":
    main()
