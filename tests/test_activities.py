"""Tests for the /api/activities endpoint (daily list view) and its timezone handling."""


def test_list_activities_basic(client):
    """Activities for a given date should be returned."""
    client.post("/api/feedings", json={"feeding_type": "bottle"})
    client.post("/api/diapers", json={"type": "pee"})

    from datetime import UTC, datetime

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    resp = client.get(f"/api/activities?date={today}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    types = {item["type"] for item in data}
    assert "feeding" in types
    assert "diaper" in types


def test_list_activities_paired_session_merged(client):
    """Paired breast feedings with the same session_id appear as a single activity."""
    from datetime import UTC, datetime

    session_id = "test-activity-session-456"
    client.post(
        "/api/feedings",
        json={
            "feeding_type": "breast_left",
            "duration_minutes": 8,
            "session_id": session_id,
        },
    )
    client.post(
        "/api/feedings",
        json={
            "feeding_type": "breast_right",
            "duration_minutes": 6,
            "session_id": session_id,
        },
    )

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    resp = client.get(f"/api/activities?date={today}")
    assert resp.status_code == 200
    data = resp.json()
    feeding_activities = [a for a in data if a["type"] == "feeding"]
    assert len(feeding_activities) == 1
    assert feeding_activities[0]["subtype"] == "breast_both"
    assert feeding_activities[0]["label"] == "Both Breasts"
    assert "Left" in feeding_activities[0]["detail"]
    assert "Right" in feeding_activities[0]["detail"]


def test_list_activities_formats_bottle_oz(client):
    from datetime import UTC, datetime

    client.post(
        "/api/feedings",
        json={
            "feeding_type": "bottle",
            "amount": 3.5,
            "amount_unit": "oz",
            "bottle_type": "formula",
        },
    )

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    resp = client.get(f"/api/activities?date={today}")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["detail"] == "Formula · 3.50 oz"


def test_list_activities_formats_bottle_ml(client):
    from datetime import UTC, datetime

    client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "amount": 100, "amount_unit": "mL"},
    )

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    resp = client.get(f"/api/activities?date={today}")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["detail"] == "Breastmilk · 100 mL"


def test_list_activities_empty(client):
    """No activities for a date far in the past."""
    resp = client.get("/api/activities?date=2000-01-01")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_activities_invalid_date(client):
    """Invalid date format returns a validation error."""
    resp = client.get("/api/activities?date=not-a-date")
    assert resp.status_code == 422


def test_activities_timezone_today(client, monkeypatch):
    """An activity recorded just after local midnight counts in that local date.

    Mirrors ``test_feeding_stats_timezone_today``:
    UTC+14 user at 00:30 local time (April 9 local) — the UTC timestamp is
    on the *previous* UTC calendar day (April 8 10:30 UTC).  The daily list
    for "2026-04-09" must include it when TZ=Etc/GMT-14.
    """
    from datetime import UTC, datetime, timedelta, timezone

    local_tz_offset = timezone(timedelta(hours=14))

    # Build a timestamp that is 00:30 on April 9 in local time (UTC+14)
    local_midnight_plus_30m = datetime(2026, 4, 9, 0, 30, 0, tzinfo=local_tz_offset)
    ts_utc = local_midnight_plus_30m.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    client.post("/api/feedings", json={"feeding_type": "bottle", "timestamp": ts_utc})

    # Patch TZ to UTC+14 (Etc/GMT-14 due to POSIX sign inversion)
    monkeypatch.setenv("TZ", "Etc/GMT-14")

    resp = client.get("/api/activities?date=2026-04-09")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_activities_timezone_excludes_yesterday(client, monkeypatch):
    """An activity recorded just before local midnight does NOT appear in the next date.

    UTC-5 user: an activity at 23:30 on April 7 local time must NOT appear
    in the April 8 daily list.
    """
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    local_tz = ZoneInfo("Etc/GMT+5")  # UTC-5, no DST

    # Build a timestamp at 23:30 on April 7 in local UTC-5 time
    local_2330 = datetime(2026, 4, 7, 23, 30, 0, tzinfo=local_tz)
    ts_utc = local_2330.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    client.post("/api/diapers", json={"type": "pee", "timestamp": ts_utc})

    monkeypatch.setenv("TZ", "Etc/GMT+5")

    # Should NOT appear in April 8's list (it's still April 7 local time)
    resp = client.get("/api/activities?date=2026-04-08")
    assert resp.status_code == 200
    assert len(resp.json()) == 0


def test_activities_timezone_included_today(client, monkeypatch):
    """An activity recorded just after local midnight IS included in that date.

    UTC-5 user: an activity at 00:30 on April 8 local time must appear
    in the April 8 daily list.
    """
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    local_tz = ZoneInfo("Etc/GMT+5")  # UTC-5, no DST

    # Build a timestamp at 00:30 on April 8 in local UTC-5 time
    local_0030 = datetime(2026, 4, 8, 0, 30, 0, tzinfo=local_tz)
    ts_utc = local_0030.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    client.post("/api/diapers", json={"type": "pee", "timestamp": ts_utc})

    monkeypatch.setenv("TZ", "Etc/GMT+5")

    resp = client.get("/api/activities?date=2026-04-08")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
