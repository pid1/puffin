"""Tests for optional child profiles (issue #44).

Profiles are opt-in: an install with no profiles must behave exactly as Puffin
did before they existed, which is what ``test_zero_profiles_*`` guards.
"""

import pytest


@pytest.fixture
def child(client):
    """A single profile named Maya."""
    return client.post("/api/children", json={"name": "Maya"}).json()


@pytest.fixture
def two_children(client):
    maya = client.post("/api/children", json={"name": "Maya"}).json()
    theo = client.post("/api/children", json={"name": "Theo"}).json()
    return maya, theo


# --- Profile CRUD ---


def test_create_child(client):
    resp = client.post("/api/children", json={"name": "Maya"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Maya"
    assert data["id"] is not None


def test_create_child_trims_name(client):
    resp = client.post("/api/children", json={"name": "  Maya  "})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Maya"


@pytest.mark.parametrize("name", ["", "   "])
def test_create_child_rejects_blank_name(client, name):
    assert client.post("/api/children", json={"name": name}).status_code == 422


def test_list_children_is_creation_ordered(client, two_children):
    """Creation order is the switcher's order and picks the default child."""
    names = [c["name"] for c in client.get("/api/children").json()]
    assert names == ["Maya", "Theo"]


def test_rename_child(client, child):
    resp = client.put(f"/api/children/{child['id']}", json={"name": "Maya Rose"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Maya Rose"


def test_rename_child_not_found(client):
    assert client.put("/api/children/999", json={"name": "Ghost"}).status_code == 404


def test_delete_child_not_found(client):
    assert client.delete("/api/children/999").status_code == 404


# --- Deleting a profile keeps its logs ---


def test_delete_child_unassigns_logs_rather_than_deleting_them(client, child):
    cid = child["id"]
    diaper = client.post("/api/diapers", json={"type": "pee", "child_id": cid}).json()
    feeding = client.post(
        "/api/feedings", json={"feeding_type": "breast_left", "child_id": cid}
    ).json()

    assert client.delete(f"/api/children/{cid}").status_code == 204

    # Logs survive, stripped of the association.
    assert client.get(f"/api/diapers/{diaper['id']}").json()["child_id"] is None
    assert client.get(f"/api/feedings/{feeding['id']}").json()["child_id"] is None
    assert client.get("/api/children/unassigned").json()["count"] == 2


def test_delete_child_leaves_other_childs_logs_alone(client, two_children):
    maya, theo = two_children
    kept = client.post("/api/diapers", json={"type": "pee", "child_id": theo["id"]}).json()
    client.post("/api/diapers", json={"type": "poop", "child_id": maya["id"]})

    client.delete(f"/api/children/{maya['id']}")

    assert client.get(f"/api/diapers/{kept['id']}").json()["child_id"] == theo["id"]
    assert client.get("/api/children/unassigned").json()["count"] == 1


# --- Unassigned count and bulk assignment ---


def test_unassigned_count_spans_every_log_type(client):
    client.post("/api/diapers", json={"type": "pee"})
    client.post("/api/feedings", json={"feeding_type": "breast_left"})
    client.post(
        "/api/medications",
        json={"medication_name": "Tylenol", "dosage_quantity": 2.5, "dosage_unit": "mL"},
    )
    client.post("/api/temperatures", json={"temperature_celsius": 37.0})

    assert client.get("/api/children/unassigned").json()["count"] == 4


def test_bulk_assign_moves_every_unassigned_log(client, child):
    """The one-time migration offer and the later bulk re-assign share this."""
    client.post("/api/diapers", json={"type": "pee"})
    client.post("/api/feedings", json={"feeding_type": "bottle", "amount": 3, "amount_unit": "oz"})
    client.post("/api/temperatures", json={"temperature_celsius": 37.0})

    resp = client.post(f"/api/children/{child['id']}/assign-unassigned")
    assert resp.status_code == 200
    assert resp.json()["assigned"] == 3
    assert client.get("/api/children/unassigned").json()["count"] == 0


def test_bulk_assign_leaves_already_assigned_logs_with_their_child(client, two_children):
    maya, theo = two_children
    theos = client.post("/api/diapers", json={"type": "pee", "child_id": theo["id"]}).json()
    client.post("/api/diapers", json={"type": "poop"})  # unassigned

    assert client.post(f"/api/children/{maya['id']}/assign-unassigned").json()["assigned"] == 1
    assert client.get(f"/api/diapers/{theos['id']}").json()["child_id"] == theo["id"]


def test_bulk_assign_unknown_child_is_404(client):
    assert client.post("/api/children/999/assign-unassigned").status_code == 404


# --- Assigning logs at creation and by editing ---


def test_create_log_with_child(client, child):
    resp = client.post("/api/diapers", json={"type": "pee", "child_id": child["id"]})
    assert resp.status_code == 201
    assert resp.json()["child_id"] == child["id"]


def test_edit_log_moves_it_between_children(client, two_children):
    maya, theo = two_children
    log = client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]}).json()

    resp = client.put(f"/api/diapers/{log['id']}", json={"child_id": theo["id"]})
    assert resp.status_code == 200
    assert resp.json()["child_id"] == theo["id"]


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/api/diapers", {"type": "pee"}),
        ("/api/feedings", {"feeding_type": "breast_left"}),
        (
            "/api/medications",
            {"medication_name": "Tylenol", "dosage_quantity": 2.5, "dosage_unit": "mL"},
        ),
        ("/api/temperatures", {"temperature_celsius": 37.0}),
    ],
)
def test_edit_log_can_set_child_back_to_unassigned(client, child, path, payload):
    """An explicit null must unassign rather than read as "field omitted"."""
    log = client.post(path, json={**payload, "child_id": child["id"]}).json()

    resp = client.put(f"{path}/{log['id']}", json={"child_id": None})
    assert resp.status_code == 200
    assert resp.json()["child_id"] is None


def test_edit_without_child_id_leaves_association_untouched(client, child):
    """Omitting child_id must not silently orphan the log."""
    log = client.post("/api/diapers", json={"type": "pee", "child_id": child["id"]}).json()

    resp = client.put(f"/api/diapers/{log['id']}", json={"notes": "updated"})
    assert resp.json()["child_id"] == child["id"]
    assert resp.json()["notes"] == "updated"


# --- Dashboard and activity scoping ---


def test_dashboard_counts_only_the_selected_child(client, two_children):
    maya, theo = two_children
    client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]})
    client.post("/api/diapers", json={"type": "poop", "child_id": maya["id"]})
    client.post("/api/diapers", json={"type": "pee", "child_id": theo["id"]})

    assert client.get(f"/api/dashboard?child_id={maya['id']}").json()["diaper_stats"]["today"] == 2
    assert client.get(f"/api/dashboard?child_id={theo['id']}").json()["diaper_stats"]["today"] == 1


def test_dashboard_last_activity_is_scoped(client, two_children):
    """ "Last fed" must never report the other child's feeding."""
    maya, theo = two_children
    client.post("/api/feedings", json={"feeding_type": "breast_left", "child_id": maya["id"]})
    theos = client.post(
        "/api/feedings",
        json={"feeding_type": "bottle", "amount": 3, "amount_unit": "oz", "child_id": theo["id"]},
    ).json()

    last = client.get(f"/api/dashboard?child_id={theo['id']}").json()["last_feeding"]
    assert last["id"] == theos["id"]


def test_dashboard_unassigned_filter(client, child):
    client.post("/api/diapers", json={"type": "pee", "child_id": child["id"]})
    client.post("/api/diapers", json={"type": "poop"})

    resp = client.get("/api/dashboard?unassigned=true").json()
    assert resp["diaper_stats"]["today"] == 1


def test_activities_scoped_to_child(client, two_children):
    maya, theo = two_children
    client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]})
    client.post("/api/diapers", json={"type": "poop", "child_id": theo["id"]})

    date = client.get("/api/diapers").json()[0]["timestamp"][:10]
    items = client.get(f"/api/activities?date={date}&child_id={maya['id']}").json()
    assert len(items) == 1
    assert items[0]["subtype"] == "pee"


def test_list_endpoints_scoped_to_child(client, two_children):
    maya, theo = two_children
    client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]})
    client.post("/api/diapers", json={"type": "poop", "child_id": theo["id"]})
    client.post("/api/diapers", json={"type": "pee"})

    assert len(client.get(f"/api/diapers?child_id={maya['id']}").json()) == 1
    assert len(client.get("/api/diapers?unassigned=true").json()) == 1
    assert len(client.get("/api/diapers").json()) == 3


def test_unassigned_wins_over_child_id(client, child):
    """The two filters can never combine into an impossible query."""
    client.post("/api/diapers", json={"type": "pee", "child_id": child["id"]})
    client.post("/api/diapers", json={"type": "poop"})

    resp = client.get(f"/api/diapers?child_id={child['id']}&unassigned=true").json()
    assert len(resp) == 1
    assert resp[0]["child_id"] is None


# --- Export scoping ---


def test_export_csv_scoped_to_child_has_no_child_column(client, two_children):
    maya, theo = two_children
    client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]})
    client.post("/api/diapers", json={"type": "poop", "child_id": theo["id"]})

    body = client.get(f"/api/export?format=csv&child_id={maya['id']}").text
    assert "child" not in body.splitlines()[1]
    assert "pee" in body
    assert "poop" not in body


def test_export_csv_all_children_includes_child_column(client, two_children):
    maya, theo = two_children
    client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]})
    client.post("/api/diapers", json={"type": "poop", "child_id": theo["id"]})
    client.post("/api/temperatures", json={"temperature_celsius": 37.0})

    body = client.get("/api/export?format=csv").text
    assert body.splitlines()[1].endswith("child")
    assert "Maya" in body
    assert "Theo" in body
    assert "Unassigned" in body  # the temperature belongs to no profile


def test_export_json_all_children_includes_child_lookup(client, child):
    client.post("/api/diapers", json={"type": "pee", "child_id": child["id"]})

    data = client.get("/api/export?format=json").json()
    assert data["children"] == {str(child["id"]): "Maya"}
    assert data["diapers"][0]["child_id"] == child["id"]


def test_export_json_scoped_omits_child_lookup(client, child):
    client.post("/api/diapers", json={"type": "pee", "child_id": child["id"]})

    data = client.get(f"/api/export?format=json&child_id={child['id']}").json()
    assert "children" not in data


def test_export_pdf_still_renders_with_children(client, two_children):
    maya, _ = two_children
    client.post("/api/diapers", json={"type": "pee", "child_id": maya["id"]})

    resp = client.get("/api/export?format=pdf")
    assert resp.status_code == 200
    assert resp.content[:4] == b"%PDF"


# --- Zero-profile installs are untouched ---


def test_zero_profiles_dashboard_counts_every_log(client):
    client.post("/api/diapers", json={"type": "pee"})
    client.post("/api/diapers", json={"type": "poop"})

    assert client.get("/api/dashboard").json()["diaper_stats"]["today"] == 2


def test_zero_profiles_export_has_no_child_column(client):
    client.post("/api/diapers", json={"type": "pee"})

    body = client.get("/api/export?format=csv").text
    assert "child" not in body.splitlines()[1]


def test_zero_profiles_children_list_is_empty(client):
    assert client.get("/api/children").json() == []
    assert client.get("/api/children/unassigned").json()["count"] == 0
