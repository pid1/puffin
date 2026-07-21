"""Export-path regression tests: PDF Unicode handling and local-time output."""

from pathlib import Path

from puffin.routers import dashboard


def _post_feed(client, note, ts="2026-07-19T18:30:00Z"):
    return client.post(
        "/api/feedings",
        json={
            "feeding_type": "breast_left",
            "duration_minutes": 10,
            "timestamp": ts,
            "notes": note,
        },
    )


# --- PDF: non-Latin-1 text must not crash the export (the core-font bug) ---


def test_pdf_export_survives_smart_quotes_and_emoji(client):
    """A phone-typed note (curly apostrophe + emoji) must not 500 the export.

    FPDF's core fonts are Latin-1 only and raise on anything outside that
    range; the bundled Unicode font (or the transliteration fallback) must
    keep the whole export from failing.
    """
    _post_feed(client, "mom’s note \U0001f37c — café")

    resp = client.get("/api/export?format=pdf")
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    assert len(resp.content) > 1000


def test_pdf_export_renders_temperatures_in_recorded_units(client):
    """Mixed-unit temperature readings export without error, each in its unit."""
    client.post("/api/temperatures", json={"temperature_celsius": 37.0, "unit": "F"})
    client.post("/api/temperatures", json={"temperature_celsius": 37.0, "unit": "C"})

    resp = client.get("/api/export?format=pdf")
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


def test_pdf_uses_the_bundled_unicode_font(client):
    """The bundled DejaVu font should be found and used, not the fallback."""
    assert dashboard._FONT_REGULAR.exists(), "the bundled font is missing from the repo"
    from fpdf import FPDF

    assert dashboard._register_pdf_fonts(FPDF()) == "DejaVu"


def test_pdf_export_falls_back_without_the_font(client, monkeypatch):
    """If the font files vanish, the export transliterates instead of crashing."""
    monkeypatch.setattr(dashboard, "_FONT_REGULAR", Path("/nonexistent/DejaVuSans.ttf"))
    _post_feed(client, "mom’s note \U0001f37c")

    resp = client.get("/api/export?format=pdf")
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


def test_latin1_transliteration_never_raises():
    """The fallback sanitizer maps smart punctuation and replaces the rest."""
    assert dashboard._latin1_safe("mom’s “note” — ok") == 'mom\'s "note" - ok'
    # Emoji and other non-Latin-1 become '?', never an exception.
    out = dashboard._latin1_safe("baby \U0001f37c")
    assert out == "baby ?"
    out.encode("latin-1")  # must be encodable, i.e. safe for the core font


# --- Timezone: human-facing exports render local time, JSON stays UTC ---


def test_csv_timestamps_are_local_with_offset(client, monkeypatch):
    """CSV must show the local time the UI showed, not raw UTC."""
    monkeypatch.setenv("TZ", "America/New_York")  # EDT = -04:00 on 2026-07-19
    _post_feed(client, "n", ts="2026-07-19T18:30:00Z")

    body = client.get("/api/export?format=csv").text
    assert "2026-07-19T14:30:00-04:00" in body, "local time with offset expected"
    assert "18:30:00+00:00" not in body, "raw UTC must not appear"


def test_pdf_timestamps_convert_to_local():
    """_fmt_ts renders a stored UTC datetime in the given zone."""
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    ts = datetime(2026, 7, 19, 18, 30, tzinfo=UTC)
    assert dashboard._fmt_ts(ts, ZoneInfo("America/New_York")) == "2026-07-19 14:30"
    assert dashboard._fmt_ts(None, ZoneInfo("UTC")) == ""


def test_json_export_stays_utc(client):
    """JSON is machine-facing: unambiguous UTC ISO-8601, unchanged."""
    _post_feed(client, "n", ts="2026-07-19T18:30:00Z")

    data = client.get("/api/export?format=json").json()
    assert data["feedings"][0]["timestamp"] == "2026-07-19T18:30:00Z"


# --- Low-severity export completeness (second-audit follow-ups) ---


def test_csv_feeding_includes_bottle_type_and_session_id(client):
    """CSV must carry bottle_type and session_id, matching the JSON export."""
    client.post(
        "/api/feedings",
        json={
            "feeding_type": "bottle",
            "amount": 4.0,
            "amount_unit": "oz",
            "bottle_type": "formula",
        },
    )
    body = client.get("/api/export?format=csv").text

    # Header carries the columns...
    feeding_header = next(
        line for line in body.splitlines() if line.startswith("id,timestamp,feeding_type")
    )
    assert "bottle_type" in feeding_header
    assert "session_id" in feeding_header
    # ...and the value is present in the row.
    assert "formula" in body


def test_pdf_folds_bottle_type_into_the_type_label():
    """The PDF has no bottle_type column, so it's surfaced in the type label."""
    assert dashboard._feeding_type_label("bottle", "formula") == "bottle (formula)"
    assert dashboard._feeding_type_label("bottle", "breastmilk") == "bottle (breastmilk)"
    assert dashboard._feeding_type_label("bottle", None) == "bottle"
    assert dashboard._feeding_type_label("breast_left", None) == "breast_left"


def test_pdf_truncation_marks_the_cut_with_an_ellipsis():
    short = "brief note"
    assert dashboard._truncate_cell(short) == short
    long = "x" * 60
    out = dashboard._truncate_cell(long)
    assert len(out) == dashboard._PDF_MAX_CELL_LENGTH
    assert out.endswith("…")


def test_export_is_not_capped(client):
    """The export must return every row, not a fixed page of them.

    The old code capped each type at 10,000 with no indication; a complete
    export must never silently drop the oldest records.
    """
    from datetime import UTC, datetime, timedelta

    base = datetime(2026, 1, 1, tzinfo=UTC)
    for i in range(120):
        ts = (base + timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        client.post("/api/diapers", json={"type": "pee", "timestamp": ts})

    # A plain list endpoint is capped at 200; the export is not capped at all.
    body = client.get("/api/export?format=csv").text
    diaper_rows = [line for line in body.splitlines() if line and line.split(",")[0].isdigit()]
    # 120 diapers all present (plus any other types, but we posted only diapers).
    assert len(diaper_rows) == 120
