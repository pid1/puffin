def test_create_feeding(client):
    resp = client.post("/api/feedings", json={"feeding_type": "breast_left"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["feeding_type"] == "breast_left"


def test_create_feeding_with_duration(client):
    resp = client.post(
        "/api/feedings",
        json={
            "feeding_type": "breast_right",
            "duration_minutes": 15,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["duration_minutes"] == 15


def test_create_bottle_feeding(client):
    resp = client.post("/api/feedings", json={"feeding_type": "bottle"})
    assert resp.status_code == 201
    assert resp.json()["feeding_type"] == "bottle"


def test_create_bottle_feeding_with_oz(client):
    resp = client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "amount_oz": 3.5},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["feeding_type"] == "bottle"
    assert data["amount_oz"] == 3.5
    assert data["duration_minutes"] is None


def test_create_feeding_with_timestamp(client):
    """Test creating a feeding with a custom timestamp for past events."""
    custom_time = "2026-04-05T08:00:00Z"
    resp = client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "amount_oz": 4.0, "timestamp": custom_time},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["feeding_type"] == "bottle"
    assert data["timestamp"] == custom_time


def test_create_feeding_invalid_type(client):
    resp = client.post("/api/feedings", json={"feeding_type": "invalid"})
    assert resp.status_code == 422


def test_list_feedings(client):
    client.post("/api/feedings", json={"feeding_type": "breast_left"})
    client.post("/api/feedings", json={"feeding_type": "bottle"})
    resp = client.get("/api/feedings")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_update_feeding(client):
    create_resp = client.post("/api/feedings", json={"feeding_type": "breast_left"})
    fid = create_resp.json()["id"]
    resp = client.put(f"/api/feedings/{fid}", json={"duration_minutes": 20})
    assert resp.status_code == 200
    assert resp.json()["duration_minutes"] == 20


def test_delete_feeding(client):
    create_resp = client.post("/api/feedings", json={"feeding_type": "breast_left"})
    fid = create_resp.json()["id"]
    assert client.delete(f"/api/feedings/{fid}").status_code == 204
    assert client.get(f"/api/feedings/{fid}").status_code == 404


def test_feeding_stats(client):
    client.post("/api/feedings", json={"feeding_type": "bottle"})
    resp = client.get("/api/feedings/stats")
    assert resp.status_code == 200
    assert resp.json()["today"] == 1


def test_feeding_stats_paired_session_counts_as_one(client):
    """Paired breast feedings sharing a session_id must count as a single session."""
    session_id = "test-session-abc"
    client.post(
        "/api/feedings",
        json={"feeding_type": "breast_left", "duration_minutes": 8, "session_id": session_id},
    )
    client.post(
        "/api/feedings",
        json={"feeding_type": "breast_right", "duration_minutes": 6, "session_id": session_id},
    )
    resp = client.get("/api/feedings/stats")
    assert resp.status_code == 200
    assert resp.json()["today"] == 1  # two records but one session


def test_feeding_stats_mixed_sessions(client):
    """Individual and paired feedings are counted correctly together."""
    session_id = "test-session-xyz"
    # One paired breast session
    client.post(
        "/api/feedings",
        json={"feeding_type": "breast_left", "duration_minutes": 8, "session_id": session_id},
    )
    client.post(
        "/api/feedings",
        json={"feeding_type": "breast_right", "duration_minutes": 6, "session_id": session_id},
    )
    # One individual bottle feed
    client.post("/api/feedings", json={"feeding_type": "bottle", "amount_oz": 3.0})
    resp = client.get("/api/feedings/stats")
    assert resp.status_code == 200
    assert resp.json()["today"] == 2  # one paired session + one bottle


def test_feeding_stats_timezone_today(client, monkeypatch):
    """Feedings recorded just after local midnight must count as today,
    even when local midnight falls later than 00:00 UTC.

    Simulate a UTC+14 timezone (Pacific/Kiritimati) where local midnight
    is 14 hours *behind* UTC. A feeding timestamped at 00:30 local time
    (i.e. the previous UTC calendar day at 10:30 UTC) should still be
    counted as "today" in the local timezone.
    """
    from datetime import UTC, datetime, timedelta, timezone

    # UTC+14 — local midnight is 14 hours behind UTC
    local_tz_offset = timezone(timedelta(hours=14))

    # Build a timestamp that is 00:30 in local time today
    local_now = datetime.now(local_tz_offset)
    local_midnight_plus_30m = local_now.replace(hour=0, minute=30, second=0, microsecond=0)
    # Convert to UTC ISO string for the API
    ts_utc = local_midnight_plus_30m.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "timestamp": ts_utc},
    )

    # Patch TZ to the UTC+14 offset name so _get_local_tz uses the right zone.
    # Python's zoneinfo needs a real IANA name; use "Etc/GMT-14" (note: Etc/GMT
    # signs are inverted by POSIX convention, so GMT-14 = UTC+14).
    monkeypatch.setenv("TZ", "Etc/GMT-14")

    resp = client.get("/api/feedings/stats")
    assert resp.status_code == 200
    assert resp.json()["today"] == 1


def test_feeding_stats_timezone_excludes_yesterday(client, monkeypatch):
    """A feeding recorded just before local midnight must NOT count as today.

    Uses ``Etc/GMT+5`` (always UTC-5, no DST) for consistent behaviour
    regardless of when the test runs.
    """
    from datetime import UTC, datetime, timedelta
    from zoneinfo import ZoneInfo

    local_tz = ZoneInfo("Etc/GMT+5")  # UTC-5, no DST (POSIX sign convention)

    # Build a timestamp that is 23:30 *yesterday* in local time
    local_now = datetime.now(local_tz)
    local_yesterday_2330 = local_now.replace(
        hour=23, minute=30, second=0, microsecond=0
    ) - timedelta(days=1)
    ts_utc = local_yesterday_2330.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "timestamp": ts_utc},
    )

    # Etc/GMT+5 = UTC-5 (fixed, no DST) so today starts at 05:00 UTC.
    # The feeding is at 04:30 UTC — before local midnight — so today == 0.
    monkeypatch.setenv("TZ", "Etc/GMT+5")

    resp = client.get("/api/feedings/stats")
    assert resp.status_code == 200
    assert resp.json()["today"] == 0


def test_migration_adds_session_id_column(setup_db):
    """_run_migrations should add session_id to feedings tables that pre-date PR #13.

    Simulates a database that was created before the session_id column existed
    by building the schema with explicit DDL (no session_id), then verifies that
    _run_migrations() adds the column and that the feedings endpoints work.
    """
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from puffin.database import _run_migrations, get_db
    from puffin.main import app

    # Build a fresh in-memory DB using explicit DDL that mirrors the pre-PR13
    # schema (feedings table without session_id).
    old_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with old_engine.connect() as conn:
        conn.execute(text(
            """
            CREATE TABLE feedings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                feeding_type VARCHAR NOT NULL,
                duration_minutes INTEGER,
                amount_oz FLOAT,
                notes TEXT,
                created_at DATETIME
            )
            """
        ))
        conn.commit()

    # Confirm the column is absent before migration
    with old_engine.connect() as conn:
        pre_cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
    assert "session_id" not in pre_cols

    # Run the migration against the old-schema engine via the explicit parameter
    _run_migrations(bind=old_engine)

    with old_engine.connect() as conn:
        post_cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
    assert "session_id" in post_cols

    # Running the migration a second time must be idempotent (no error)
    _run_migrations(bind=old_engine)

    # The feedings stats endpoint should work through the migrated engine
    old_session = sessionmaker(autocommit=False, autoflush=False, bind=old_engine)

    def override_get_db():
        db = old_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as c:
            resp = c.get("/api/feedings/stats")
            assert resp.status_code == 200
            assert resp.json()["today"] == 0
    finally:
        app.dependency_overrides.clear()
