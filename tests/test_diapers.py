def test_create_diaper(client):
    resp = client.post("/api/diapers", json={"type": "pee"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "pee"
    assert data["id"] is not None


def test_create_diaper_with_notes(client):
    resp = client.post("/api/diapers", json={"type": "both", "notes": "Very full"})
    assert resp.status_code == 201
    assert resp.json()["notes"] == "Very full"


def test_create_diaper_with_timestamp(client):
    """Test creating a diaper with a custom timestamp for past events."""
    custom_time = "2026-04-05T10:30:00Z"
    resp = client.post("/api/diapers", json={"type": "pee", "timestamp": custom_time})
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "pee"
    assert data["timestamp"] == custom_time


def test_create_diaper_invalid_type(client):
    resp = client.post("/api/diapers", json={"type": "invalid"})
    assert resp.status_code == 422


def test_create_diaper_dry(client):
    resp = client.post("/api/diapers", json={"type": "dry"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "dry"


def test_list_diapers(client):
    client.post("/api/diapers", json={"type": "pee"})
    client.post("/api/diapers", json={"type": "poop"})
    resp = client.get("/api/diapers")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_diaper(client):
    create_resp = client.post("/api/diapers", json={"type": "pee"})
    diaper_id = create_resp.json()["id"]
    resp = client.get(f"/api/diapers/{diaper_id}")
    assert resp.status_code == 200
    assert resp.json()["type"] == "pee"


def test_get_diaper_not_found(client):
    resp = client.get("/api/diapers/999")
    assert resp.status_code == 404


def test_update_diaper(client):
    create_resp = client.post("/api/diapers", json={"type": "pee"})
    diaper_id = create_resp.json()["id"]
    resp = client.put(f"/api/diapers/{diaper_id}", json={"type": "both"})
    assert resp.status_code == 200
    assert resp.json()["type"] == "both"


def test_delete_diaper(client):
    create_resp = client.post("/api/diapers", json={"type": "pee"})
    diaper_id = create_resp.json()["id"]
    resp = client.delete(f"/api/diapers/{diaper_id}")
    assert resp.status_code == 204
    assert client.get(f"/api/diapers/{diaper_id}").status_code == 404


def test_diaper_stats(client):
    client.post("/api/diapers", json={"type": "pee"})
    client.post("/api/diapers", json={"type": "poop"})
    resp = client.get("/api/diapers/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["today"] == 2
    assert data["week"] >= 2
    assert data["month"] >= 2


def test_diaper_stats_week_boundary_respects_utc_offset(client, monkeypatch):
    """The week window must be measured in UTC, not local wall clock.

    ``_period_count`` builds its bound from ``datetime.now(local_tz)``, and
    SQLite drops tzinfo when binding a datetime — so a bound that is not
    explicitly converted to UTC is compared as local wall clock against
    UTC-stored rows, silently widening the window by the local offset.

    A diaper logged 7 days *and 2 hours* ago is outside the window at any
    offset.  Under ``Etc/GMT+5`` (UTC-5) an unconverted bound would shift
    the cutoff 5 hours earlier and wrongly include it.
    """
    from datetime import UTC, datetime, timedelta

    ts = (datetime.now(UTC) - timedelta(days=7, hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    client.post("/api/diapers", json={"type": "pee", "timestamp": ts})

    monkeypatch.setenv("TZ", "Etc/GMT+5")

    resp = client.get("/api/diapers/stats")
    assert resp.status_code == 200
    assert resp.json()["week"] == 0
