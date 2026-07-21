import csv
import io
import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from puffin import crud
from puffin.crud import ChildFilter
from puffin.database import get_db
from puffin.dependencies import child_filter
from puffin.schemas import DashboardSummary

router = APIRouter(prefix="/api", tags=["dashboard"])

_PDF_MAX_CELL_LENGTH = 40  # max characters per cell before truncation

_UNASSIGNED_LABEL = "Unassigned"

# Bundled Unicode font for the PDF export. FPDF's core fonts are Latin-1 only
# and raise on anything outside that range (emoji, curly quotes a phone
# inserts, accents), which crashed the whole export. When these are missing we
# fall back to Helvetica and transliterate — see ``_register_pdf_fonts``.
_FONT_DIR = Path(__file__).resolve().parents[3] / "static" / "fonts"
_FONT_REGULAR = _FONT_DIR / "DejaVuSans.ttf"
_FONT_BOLD = _FONT_DIR / "DejaVuSans-Bold.ttf"

# Smart punctuation a phone keyboard produces, mapped to Latin-1 equivalents so
# the Helvetica fallback path degrades gracefully instead of dropping to "?".
_SMART_PUNCTUATION = {
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "–": "-",
    "—": "-",
    "…": "...",
    "•": "*",
    " ": " ",
}


def _latin1_safe(text: str) -> str:
    """Make *text* renderable by the Latin-1 core font without raising.

    Only used on the fallback path when the bundled Unicode font is absent:
    common smart punctuation is transliterated, and anything still outside
    Latin-1 (e.g. emoji) becomes ``?`` rather than crashing the export.
    """
    for fancy, plain in _SMART_PUNCTUATION.items():
        text = text.replace(fancy, plain)
    return text.encode("latin-1", "replace").decode("latin-1")


def _register_pdf_fonts(pdf) -> str:
    """Register the bundled Unicode font if present; return the family to use.

    Returns ``"DejaVu"`` when the font files are available (full Unicode), or
    ``"Helvetica"`` when they are not — in which case body text must be run
    through ``_latin1_safe`` before rendering.
    """
    if _FONT_REGULAR.exists() and _FONT_BOLD.exists():
        pdf.add_font("DejaVu", "", str(_FONT_REGULAR))
        pdf.add_font("DejaVu", "B", str(_FONT_BOLD))
        return "DejaVu"
    return "Helvetica"


def _format_bottle_amount(amount: float | None, amount_unit: str | None) -> str:
    if amount is None or amount_unit is None:
        return ""
    if amount_unit == "mL":
        return f"{amount:.0f} mL"
    return f"{amount:.2f} oz"


def _truncate_cell(text: str) -> str:
    """Clip a PDF cell to the max width, marking the cut with an ellipsis."""
    if len(text) <= _PDF_MAX_CELL_LENGTH:
        return text
    return text[: _PDF_MAX_CELL_LENGTH - 1] + "…"


def _feeding_type_label(feeding_type: str, bottle_type: str | None) -> str:
    """Feeding type for display, surfacing breastmilk vs formula for bottles.

    The PDF has no dedicated bottle_type column, so it is folded in here (the
    CSV/JSON carry it as its own field).
    """
    if feeding_type == "bottle" and bottle_type:
        return f"bottle ({bottle_type})"
    return str(feeding_type)


@router.get("/dashboard", response_model=DashboardSummary)
def get_dashboard(
    date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    child: ChildFilter = Depends(child_filter),
    db: Session = Depends(get_db),
):
    return crud.get_dashboard(db, date_str=date, child=child)


@router.get("/export")
def export_data(
    export_format: str = Query("csv", alias="format", pattern="^(csv|json|pdf)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None, description="Exclusive upper bound"),
    child: ChildFilter = Depends(child_filter),
    db: Session = Depends(get_db),
):
    # limit=None means every matching row: an export must never silently drop
    # the oldest records (the old fixed 10k cap did so with no indication).
    diapers = crud.get_diapers(
        db, start_date=start_date, end_date=end_date, limit=None, child=child
    )
    feedings = crud.get_feedings(
        db, start_date=start_date, end_date=end_date, limit=None, child=child
    )
    medications = crud.get_medications(
        db, start_date=start_date, end_date=end_date, limit=None, child=child
    )
    temperatures = crud.get_temperatures(
        db, start_date=start_date, end_date=end_date, limit=None, child=child
    )

    # A child column only earns its place when the export spans more than one
    # child.  Scoped exports are already about a single child, and installs
    # with no profiles would just get a blank column.
    child_names = {c.id: c.name for c in crud.get_children(db)}
    include_child = child is None and bool(child_names)

    def child_name(obj) -> str:
        return child_names.get(obj.child_id, _UNASSIGNED_LABEL)

    # Timestamps are stored in UTC; the app's UI shows them in the configured
    # local zone. The human-facing CSV and PDF exports do the same so they
    # don't contradict what the user saw when logging. (JSON stays UTC ISO-8601
    # — unambiguous and standard for machine consumption.)
    local_tz = crud.get_local_tz()

    if export_format == "json":
        from puffin.schemas import (
            DiaperChangeResponse,
            FeedingResponse,
            MedicationResponse,
            TemperatureResponse,
        )

        data = {
            "diapers": [
                DiaperChangeResponse.model_validate(d).model_dump(mode="json") for d in diapers
            ],
            "feedings": [
                FeedingResponse.model_validate(f).model_dump(mode="json") for f in feedings
            ],
            "medications": [
                MedicationResponse.model_validate(m).model_dump(mode="json") for m in medications
            ],
            "temperatures": [
                TemperatureResponse.model_validate(t).model_dump(mode="json") for t in temperatures
            ],
        }
        if include_child:
            # Records carry ``child_id``; this resolves those ids to names
            # without repeating the name on every row.
            data["children"] = {str(cid): name for cid, name in child_names.items()}
        content = json.dumps(data, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=puffin_export.json"},
        )

    if export_format == "pdf":
        from fpdf import FPDF

        class PuffinPDF(FPDF):
            def header(self):
                self.set_font(self.body_family, "B", 16)
                self.cell(
                    0, 10, "Puffin Baby Tracker Report", align="C", new_x="LMARGIN", new_y="NEXT"
                )
                self.set_font(self.body_family, "", 9)
                report_range = _build_date_range_label(start_date, end_date)
                self.cell(0, 6, report_range, align="C", new_x="LMARGIN", new_y="NEXT")
                self.set_font(self.body_family, "", 8)
                self.cell(
                    0,
                    5,
                    f"Times shown in {self.tz_label}",
                    align="C",
                    new_x="LMARGIN",
                    new_y="NEXT",
                )
                self.ln(3)

            def footer(self):
                self.set_y(-15)
                # Page numbers are ASCII, so the Latin-1 core font is always safe.
                self.set_font("Helvetica", "I", 8)
                self.cell(0, 10, f"Page {self.page_no()}", align="C")

        pdf = PuffinPDF()
        # Fonts must be registered before add_page(), which triggers header().
        pdf.body_family = _register_pdf_fonts(pdf)
        pdf.sanitize = pdf.body_family == "Helvetica"
        pdf.tz_label = str(local_tz)
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()

        def with_child(headers: list[str], rows: list[list[str]], objs) -> tuple:
            """Append a trailing Child column when the export spans children."""
            if not include_child:
                return headers, rows
            return headers + ["Child"], [
                row + [child_name(obj)] for row, obj in zip(rows, objs, strict=True)
            ]

        _pdf_section(
            pdf,
            "Diaper Changes",
            *with_child(
                ["Time", "Type", "Notes"],
                [
                    [
                        _fmt_ts(d.timestamp, local_tz),
                        str(d.type),
                        d.notes or "",
                    ]
                    for d in diapers
                ],
                diapers,
            ),
        )

        _pdf_section(
            pdf,
            "Feedings",
            *with_child(
                ["Time", "Type", "Duration (min)", "Amount", "Notes"],
                [
                    [
                        _fmt_ts(f.timestamp, local_tz),
                        _feeding_type_label(f.feeding_type, f.bottle_type),
                        str(f.duration_minutes) if f.duration_minutes is not None else "",
                        _format_bottle_amount(f.amount, f.amount_unit),
                        f.notes or "",
                    ]
                    for f in feedings
                ],
                feedings,
            ),
        )

        _pdf_section(
            pdf,
            "Medications",
            *with_child(
                ["Time", "Medication", "Dosage", "Notes"],
                [
                    [
                        _fmt_ts(m.timestamp, local_tz),
                        m.medication_name,
                        f"{m.dosage_quantity:.2f} {m.dosage_unit}",
                        m.notes or "",
                    ]
                    for m in medications
                ],
                medications,
            ),
        )

        _pdf_section(
            pdf,
            "Temperature Readings",
            *with_child(
                ["Time", "Temp", "Location", "Notes"],
                [
                    [
                        _fmt_ts(t.timestamp, local_tz),
                        _fmt_temperature(t),
                        str(t.location) if t.location else "",
                        t.notes or "",
                    ]
                    for t in temperatures
                ],
                temperatures,
            ),
        )

        pdf_bytes = pdf.output()
        return StreamingResponse(
            io.BytesIO(bytes(pdf_bytes)),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=puffin_export.pdf"},
        )

    # CSV export
    output = io.StringIO()
    writer = csv.writer(output)

    def header(cols: list[str]) -> list[str]:
        return cols + ["child"] if include_child else cols

    def row(cells: list, obj) -> list:
        return cells + [child_name(obj)] if include_child else cells

    def ts(value: datetime | None) -> str:
        # Local ISO-8601 with offset (e.g. 2026-07-19T14:30:00-04:00): matches
        # the time the UI showed, and the offset keeps it unambiguous.
        return value.astimezone(local_tz).isoformat() if value else ""

    writer.writerow(["--- Diaper Changes ---"])
    writer.writerow(header(["id", "timestamp", "type", "notes", "created_at"]))
    for d in diapers:
        writer.writerow(row([d.id, ts(d.timestamp), d.type, d.notes, ts(d.created_at)], d))

    writer.writerow([])
    writer.writerow(["--- Feedings ---"])
    writer.writerow(
        header(
            [
                "id",
                "timestamp",
                "feeding_type",
                "duration_minutes",
                "amount",
                "amount_unit",
                "notes",
                "session_id",
                "bottle_type",
                "created_at",
            ]
        )
    )
    for f in feedings:
        writer.writerow(
            row(
                [
                    f.id,
                    ts(f.timestamp),
                    f.feeding_type,
                    f.duration_minutes,
                    f.amount,
                    f.amount_unit,
                    f.notes,
                    f.session_id,
                    f.bottle_type,
                    ts(f.created_at),
                ],
                f,
            )
        )

    writer.writerow([])
    writer.writerow(["--- Medications ---"])
    writer.writerow(
        header(
            [
                "id",
                "timestamp",
                "medication_name",
                "dosage_quantity",
                "dosage_unit",
                "notes",
                "created_at",
            ]
        )
    )
    for m in medications:
        writer.writerow(
            row(
                [
                    m.id,
                    ts(m.timestamp),
                    m.medication_name,
                    m.dosage_quantity,
                    m.dosage_unit,
                    m.notes,
                    ts(m.created_at),
                ],
                m,
            )
        )

    writer.writerow([])
    writer.writerow(["--- Temperature Readings ---"])
    writer.writerow(
        header(
            ["id", "timestamp", "temperature_celsius", "unit", "location", "notes", "created_at"]
        )
    )
    for t in temperatures:
        writer.writerow(
            row(
                [
                    t.id,
                    ts(t.timestamp),
                    t.temperature_celsius,
                    t.unit,
                    t.location,
                    t.notes,
                    ts(t.created_at),
                ],
                t,
            )
        )

    content = output.getvalue()
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=puffin_export.csv"},
    )


def _fmt_ts(ts: datetime, tz) -> str:
    """Format a stored UTC datetime in the local zone for the PDF."""
    return ts.astimezone(tz).strftime("%Y-%m-%d %H:%M") if ts else ""


def _fmt_temperature(t) -> str:
    """Render a temperature reading in its recorded unit for the PDF."""
    return crud.format_temperature(t.temperature_celsius, t.unit)


def _build_date_range_label(start: datetime | None, end: datetime | None) -> str:
    if start and end:
        return f"{start.strftime('%Y-%m-%d')} to {end.strftime('%Y-%m-%d')}"
    if start:
        return f"From {start.strftime('%Y-%m-%d')}"
    if end:
        return f"Up to {end.strftime('%Y-%m-%d')}"
    return "All records"


def _pdf_section(pdf, title: str, headers: list[str], rows: list[list[str]]) -> None:
    """Render a titled table section into the PDF."""
    family = pdf.body_family

    # Section heading
    pdf.set_font(family, "B", 12)
    pdf.set_fill_color(230, 240, 255)
    pdf.cell(0, 8, title, fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    if not rows:
        # "No records" is ASCII, so the core italic font is always safe here.
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No records", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
        return

    # Compute column widths: distribute page width proportionally
    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    n = len(headers)
    col_w = page_w / n

    # Header row (labels are app-controlled ASCII)
    pdf.set_font(family, "B", 9)
    pdf.set_fill_color(200, 220, 240)
    for h in headers:
        pdf.cell(col_w, 7, h, border=1, fill=True)
    pdf.ln()

    # Data rows — these carry user text (notes, names), so they must be
    # transliterated when the Unicode font is unavailable.
    pdf.set_font(family, "", 8)
    fill = False
    pdf.set_fill_color(245, 248, 255)
    for row in rows:
        # Truncate long cells with an ellipsis so a cut is visible (the full
        # text remains in the CSV/JSON exports).
        cells = [_truncate_cell(str(v)) for v in row]
        if pdf.sanitize:
            cells = [_latin1_safe(c) for c in cells]
        for cell in cells:
            pdf.cell(col_w, 6, cell, border=1, fill=fill)
        pdf.ln()
        fill = not fill

    pdf.ln(4)
