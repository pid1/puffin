import sqlite3

from puffin.backup import backup_database


def _make_db(path, rows):
    conn = sqlite3.connect(str(path))
    conn.execute("CREATE TABLE feedings (id INTEGER PRIMARY KEY, note TEXT)")
    conn.executemany("INSERT INTO feedings (note) VALUES (?)", [(r,) for r in rows])
    conn.commit()
    conn.close()


def _read_notes(path):
    conn = sqlite3.connect(str(path))
    try:
        return [r[0] for r in conn.execute("SELECT note FROM feedings ORDER BY id")]
    finally:
        conn.close()


def test_backup_copies_data_consistently(tmp_path):
    db = tmp_path / "puffin.db"
    _make_db(db, ["morning feed", "afternoon feed"])

    dest = backup_database(db, reason="manual")

    assert dest is not None
    assert dest.parent == tmp_path / "backups"
    assert "manual" in dest.name
    # The snapshot holds exactly the source data.
    assert _read_notes(dest) == ["morning feed", "afternoon feed"]


def test_backup_is_a_point_in_time_copy(tmp_path):
    """Writing to the source after a backup must not change the backup."""
    db = tmp_path / "puffin.db"
    _make_db(db, ["first"])

    dest = backup_database(db, reason="pre-migration")

    conn = sqlite3.connect(str(db))
    conn.execute("INSERT INTO feedings (note) VALUES ('second')")
    conn.commit()
    conn.close()

    assert _read_notes(dest) == ["first"], "the snapshot is frozen at backup time"
    assert _read_notes(db) == ["first", "second"]


def test_reason_appears_in_filename(tmp_path):
    db = tmp_path / "puffin.db"
    _make_db(db, ["x"])

    pre = backup_database(db, reason="pre-migration")
    manual = backup_database(db, reason="manual")

    assert "pre-migration" in pre.name
    assert "manual" in manual.name
    assert pre.name != manual.name, "microsecond stamp keeps same-second backups distinct"


def test_missing_database_is_a_noop(tmp_path):
    assert backup_database(tmp_path / "absent.db") is None
    assert not (tmp_path / "backups").exists()


def test_empty_database_is_a_noop(tmp_path):
    db = tmp_path / "puffin.db"
    db.touch()  # zero bytes -- a fresh install with nothing worth keeping

    assert backup_database(db) is None


def test_pruning_keeps_only_the_newest(tmp_path):
    db = tmp_path / "puffin.db"
    _make_db(db, ["x"])

    created = [backup_database(db, reason="manual", keep=3) for _ in range(5)]

    remaining = sorted((tmp_path / "backups").glob("puffin-*.db"))
    assert len(remaining) == 3, "only the retention count survives"
    # The three newest are the ones kept.
    assert {p.name for p in remaining} == {p.name for p in created[-3:]}


def test_keep_zero_disables_pruning(tmp_path):
    db = tmp_path / "puffin.db"
    _make_db(db, ["x"])

    for _ in range(4):
        backup_database(db, reason="manual", keep=0)

    assert len(list((tmp_path / "backups").glob("puffin-*.db"))) == 4


def test_backup_failure_returns_none_without_raising(tmp_path, monkeypatch):
    """A backup error must never take down the caller (startup)."""
    db = tmp_path / "puffin.db"
    _make_db(db, ["x"])

    def boom(*args, **kwargs):
        raise sqlite3.OperationalError("disk full")

    monkeypatch.setattr(sqlite3, "connect", boom)
    # Must swallow the error and report failure, not propagate it.
    assert backup_database(db) is None
