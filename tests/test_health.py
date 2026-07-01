def test_create_medication(client):
    resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage_quantity": 2.5,
            "dosage_unit": "mL",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["medication_name"] == "Tylenol"
    assert data["dosage_quantity"] == 2.5
    assert data["dosage_unit"] == "mL"


def test_create_medication_with_timestamp(client):
    """Test creating a medication with a custom timestamp for past events."""
    custom_time = "2026-04-05T14:00:00Z"
    resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage_quantity": 2.5,
            "dosage_unit": "mL",
            "timestamp": custom_time,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["medication_name"] == "Tylenol"
    assert data["timestamp"] == custom_time


def test_create_medication_integer_quantity(client):
    resp = client.post(
        "/api/medications",
        json={"medication_name": "Vitamin D", "dosage_quantity": 1, "dosage_unit": "tablet(s)"},
    )
    assert resp.status_code == 201
    assert resp.json()["dosage_quantity"] == 1.0


def test_create_medication_two_decimal_quantity(client):
    resp = client.post(
        "/api/medications",
        json={"medication_name": "Ibuprofen", "dosage_quantity": 2.25, "dosage_unit": "mL"},
    )
    assert resp.status_code == 201
    assert resp.json()["dosage_quantity"] == 2.25


def test_create_medication_invalid_quantity_too_many_decimals(client):
    resp = client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 1.555, "dosage_unit": "mL"},
    )
    assert resp.status_code == 422


def test_create_medication_invalid_quantity_zero(client):
    resp = client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 0, "dosage_unit": "mL"},
    )
    assert resp.status_code == 422


def test_create_medication_invalid_quantity_negative(client):
    resp = client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": -1.5, "dosage_unit": "mL"},
    )
    assert resp.status_code == 422


def test_create_medication_invalid_unit(client):
    resp = client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 2.5, "dosage_unit": "oz"},
    )
    assert resp.status_code == 422


def test_create_medication_all_valid_units(client):
    for unit in ["mL", "tsp(s)", "tbsp(s)", "drop(s)", "spray(s)", "tablet(s)", "unit(s)"]:
        resp = client.post(
            "/api/medications",
            json={"medication_name": "Med", "dosage_quantity": 1.0, "dosage_unit": unit},
        )
        assert resp.status_code == 201, f"Failed for unit: {unit}"
        assert resp.json()["dosage_unit"] == unit


def test_list_medications(client):
    client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 2.5, "dosage_unit": "mL"},
    )
    resp = client.get("/api/medications")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_medication(client):
    create_resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage_quantity": 2.5,
            "dosage_unit": "mL",
        },
    )
    mid = create_resp.json()["id"]
    resp = client.put(f"/api/medications/{mid}", json={"dosage_quantity": 5.0, "dosage_unit": "mL"})
    assert resp.status_code == 200
    assert resp.json()["dosage_quantity"] == 5.0
    assert resp.json()["dosage_unit"] == "mL"


def test_update_medication_unit_only(client):
    create_resp = client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 1.0, "dosage_unit": "mL"},
    )
    mid = create_resp.json()["id"]
    resp = client.put(f"/api/medications/{mid}", json={"dosage_unit": "tsp(s)"})
    assert resp.status_code == 200
    assert resp.json()["dosage_unit"] == "tsp(s)"
    assert resp.json()["dosage_quantity"] == 1.0


def test_delete_medication(client):
    create_resp = client.post(
        "/api/medications",
        json={
            "medication_name": "Tylenol",
            "dosage_quantity": 2.5,
            "dosage_unit": "mL",
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


def test_create_temperature_with_timestamp(client):
    """Test creating a temperature with a custom timestamp for past events."""
    custom_time = "2026-04-05T09:00:00Z"
    resp = client.post(
        "/api/temperatures",
        json={
            "temperature_celsius": 37.5,
            "timestamp": custom_time,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["temperature_celsius"] == 37.5
    assert data["timestamp"] == custom_time


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


def test_medication_detail_in_activities(client):
    client.post(
        "/api/medications",
        json={"medication_name": "Vitamin D", "dosage_quantity": 1.5, "dosage_unit": "mL"},
    )
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    activities = resp.json()["recent_activities"]
    med_activity = next(a for a in activities if a["type"] == "medication")
    assert med_activity["detail"] == "1.50 mL"
    assert med_activity["label"] == "Vitamin D"


def test_export_csv(client):
    client.post("/api/diapers", json={"type": "pee"})
    resp = client.get("/api/export?format=csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_export_csv_feeding_amount_columns(client):
    client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "amount": 100, "amount_unit": "mL"},
    )
    resp = client.get("/api/export?format=csv")
    assert resp.status_code == 200
    content = resp.content.decode()
    assert "amount" in content
    assert "amount_unit" in content
    assert "amount_oz" not in content
    assert "100.0" in content
    assert "mL" in content


def test_export_csv_medication_columns(client):
    client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 2.5, "dosage_unit": "mL"},
    )
    resp = client.get("/api/export?format=csv")
    assert resp.status_code == 200
    content = resp.content.decode()
    assert "dosage_quantity" in content
    assert "dosage_unit" in content
    assert "2.5" in content
    assert "mL" in content


def test_export_json(client):
    client.post("/api/diapers", json={"type": "pee"})
    resp = client.get("/api/export?format=json")
    assert resp.status_code == 200
    data = resp.json()
    assert "diapers" in data
    assert len(data["diapers"]) == 1


def test_export_pdf(client):
    client.post("/api/diapers", json={"type": "pee"})
    resp = client.get("/api/export?format=pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_export_pdf_empty(client):
    resp = client.get("/api/export?format=pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_export_invalid_format(client):
    resp = client.get("/api/export?format=xml")
    assert resp.status_code == 422


def test_export_csv_with_date_range(client):
    client.post("/api/diapers", json={"type": "pee", "timestamp": "2026-01-01T10:00:00Z"})
    client.post("/api/diapers", json={"type": "poop", "timestamp": "2026-01-15T10:00:00Z"})
    url = "/api/export?format=csv&start_date=2026-01-10T00:00:00&end_date=2026-01-20T00:00:00"
    resp = client.get(url)
    assert resp.status_code == 200
    content = resp.content.decode()
    assert "poop" in content
    assert "pee" not in content


def test_export_json_with_date_range(client):
    client.post("/api/diapers", json={"type": "pee", "timestamp": "2026-01-01T10:00:00Z"})
    client.post("/api/diapers", json={"type": "poop", "timestamp": "2026-01-15T10:00:00Z"})
    url = "/api/export?format=json&start_date=2026-01-10T00:00:00&end_date=2026-01-20T00:00:00"
    resp = client.get(url)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["diapers"]) == 1
    assert data["diapers"][0]["type"] == "poop"


def test_export_pdf_with_date_range(client):
    client.post("/api/diapers", json={"type": "pee", "timestamp": "2026-01-01T10:00:00Z"})
    url = "/api/export?format=pdf&start_date=2026-01-10T00:00:00&end_date=2026-01-20T00:00:00"
    resp = client.get(url)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


# --- Saved medication names ---


def test_saved_names_empty(client):
    resp = client.get("/api/medications/saved-names")
    assert resp.status_code == 200
    assert resp.json() == []


def test_saved_names_added_on_create(client):
    client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 2.5, "dosage_unit": "mL"},
    )
    resp = client.get("/api/medications/saved-names")
    assert resp.status_code == 200
    assert resp.json() == ["Tylenol"]


def test_saved_names_sorted_case_insensitively(client):
    for name in ["vitamin C", "Tylenol", "ibuprofen"]:
        client.post(
            "/api/medications",
            json={"medication_name": name, "dosage_quantity": 1.0, "dosage_unit": "mL"},
        )
    resp = client.get("/api/medications/saved-names")
    assert resp.status_code == 200
    assert resp.json() == ["ibuprofen", "Tylenol", "vitamin C"]


def test_saved_names_no_case_insensitive_duplicates(client):
    for name in ["Vitamin D", "vitamin d", "VITAMIN D"]:
        client.post(
            "/api/medications",
            json={"medication_name": name, "dosage_quantity": 1.0, "dosage_unit": "tablet(s)"},
        )
    resp = client.get("/api/medications/saved-names")
    assert resp.status_code == 200
    names = resp.json()
    assert len(names) == 1
    # First casing submitted is preserved
    assert names[0] == "Vitamin D"


def test_saved_names_preserves_original_casing(client):
    client.post(
        "/api/medications",
        json={"medication_name": "vitamin C", "dosage_quantity": 1.0, "dosage_unit": "tablet(s)"},
    )
    resp = client.get("/api/medications/saved-names")
    assert resp.json() == ["vitamin C"]
