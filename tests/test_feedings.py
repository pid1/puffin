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
