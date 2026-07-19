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
