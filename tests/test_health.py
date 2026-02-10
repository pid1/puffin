def test_create_medication(client):
    resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage": "2.5ml",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["medication_name"] == "Tylenol"
    assert data["dosage"] == "2.5ml"


def test_list_medications(client):
    client.post("/api/medications", json={"medication_name": "Tylenol", "dosage": "2.5ml"})
    resp = client.get("/api/medications")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_medication(client):
    create_resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage": "2.5ml",
        },
    )
    mid = create_resp.json()["id"]
    resp = client.put(f"/api/medications/{mid}", json={"dosage": "5ml"})
    assert resp.status_code == 200
    assert resp.json()["dosage"] == "5ml"


def test_delete_medication(client):
    create_resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage": "2.5ml",
        },
    )
    mid = create_resp.json()["id"]
    assert client.delete(f"/api/medications/{mid}").status_code == 204


def test_create_temperature(client):
    resp = client.post(
        "/api/temperatures",
        json={
            "temperature_celsius": 37.5,
            "location": "rectal",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["temperature_celsius"] == 37.5
    assert data["location"] == "rectal"


def test_list_temperatures(client):
    client.post("/api/temperatures", json={"temperature_celsius": 37.0})
    resp = client.get("/api/temperatures")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_temperature(client):
    create_resp = client.post("/api/temperatures", json={"temperature_celsius": 37.0})
    tid = create_resp.json()["id"]
    resp = client.put(f"/api/temperatures/{tid}", json={"temperature_celsius": 38.0})
    assert resp.status_code == 200
    assert resp.json()["temperature_celsius"] == 38.0


def test_delete_temperature(client):
    create_resp = client.post("/api/temperatures", json={"temperature_celsius": 37.0})
    tid = create_resp.json()["id"]
    assert client.delete(f"/api/temperatures/{tid}").status_code == 204


def test_dashboard(client):
    client.post("/api/diapers", json={"type": "pee"})
    client.post("/api/feedings", json={"feeding_type": "bottle"})
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["diaper_stats"]["today"] == 1
    assert data["feeding_stats"]["today"] == 1
    assert len(data["recent_activities"]) == 2


def test_dashboard_empty(client):
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["diaper_stats"]["today"] == 0
    assert data["last_diaper"] is None


def test_export_csv(client):
    client.post("/api/diapers", json={"type": "pee"})
    resp = client.get("/api/export?format=csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_export_json(client):
    client.post("/api/diapers", json={"type": "pee"})
    resp = client.get("/api/export?format=json")
    assert resp.status_code == 200
    data = resp.json()
    assert "diapers" in data
    assert len(data["diapers"]) == 1
