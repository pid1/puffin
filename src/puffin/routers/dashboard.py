import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import DashboardSummary

router = APIRouter(prefix="/api", tags=["dashboard"])

_PDF_MAX_CELL_LENGTH = 40  # max characters per cell before truncation


@router.get("/dashboard", response_model=DashboardSummary)
def get_dashboard(
    date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
):
    return crud.get_dashboard(db, date_str=date)


@router.get("/export")
def export_data(
    export_format: str = Query("csv", alias="format", pattern="^(csv|json|pdf)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: Session = Depends(get_db),
):
    diapers = crud.get_diapers(db, start_date=start_date, end_date=end_date, limit=10000)
    feedings = crud.get_feedings(db, start_date=start_date, end_date=end_date, limit=10000)
    medications = crud.get_medications(db, start_date=start_date, end_date=end_date, limit=10000)
    temperatures = crud.get_temperatures(db, start_date=start_date, end_date=end_date, limit=10000)

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
                self.set_font("Helvetica", "B", 16)
                self.cell(
                    0, 10, "Puffin Baby Tracker Report", align="C", new_x="LMARGIN", new_y="NEXT"
                )
                self.set_font("Helvetica", "", 9)
                report_range = _build_date_range_label(start_date, end_date)
                self.cell(0, 6, report_range, align="C", new_x="LMARGIN", new_y="NEXT")
                self.ln(4)

            def footer(self):
                self.set_y(-15)
                self.set_font("Helvetica", "I", 8)
                self.cell(0, 10, f"Page {self.page_no()}", align="C")

        pdf = PuffinPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()

        _pdf_section(
            pdf,
            "Diaper Changes",
            ["Time", "Type", "Notes"],
            [
                [
                    _fmt_ts(d.timestamp),
                    str(d.type),
                    d.notes or "",
                ]
                for d in diapers
            ],
        )

        _pdf_section(
            pdf,
            "Feedings",
            ["Time", "Type", "Duration (min)", "Amount (oz)", "Notes"],
            [
                [
                    _fmt_ts(f.timestamp),
                    str(f.feeding_type),
                    str(f.duration_minutes) if f.duration_minutes is not None else "",
                    str(f.amount_oz) if f.amount_oz is not None else "",
                    f.notes or "",
                ]
                for f in feedings
            ],
        )

        _pdf_section(
            pdf,
            "Medications",
            ["Time", "Medication", "Dosage", "Notes"],
            [
                [
                    _fmt_ts(m.timestamp),
                    m.medication_name,
                    f"{m.dosage_quantity:.2f} {m.dosage_unit}",
                    m.notes or "",
                ]
                for m in medications
            ],
        )

        _pdf_section(
            pdf,
            "Temperature Readings",
            ["Time", "Temp (°C)", "Location", "Notes"],
            [
                [
                    _fmt_ts(t.timestamp),
                    str(t.temperature_celsius),
                    str(t.location) if t.location else "",
                    t.notes or "",
                ]
                for t in temperatures
            ],
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

    writer.writerow(["--- Diaper Changes ---"])
    writer.writerow(["id", "timestamp", "type", "notes", "created_at"])
    for d in diapers:
        writer.writerow([d.id, d.timestamp, d.type, d.notes, d.created_at])

    writer.writerow([])
    writer.writerow(["--- Feedings ---"])
    writer.writerow(
        ["id", "timestamp", "feeding_type", "duration_minutes", "amount_oz", "notes", "created_at"]
    )
    for f in feedings:
        writer.writerow(
            [
                f.id,
                f.timestamp,
                f.feeding_type,
                f.duration_minutes,
                f.amount_oz,
                f.notes,
                f.created_at,
            ]
        )

    writer.writerow([])
    writer.writerow(["--- Medications ---"])
    writer.writerow(
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
    for m in medications:
        writer.writerow(
            [
                m.id,
                m.timestamp,
                m.medication_name,
                m.dosage_quantity,
                m.dosage_unit,
                m.notes,
                m.created_at,
            ]
        )

    writer.writerow([])
    writer.writerow(["--- Temperature Readings ---"])
    writer.writerow(["id", "timestamp", "temperature_celsius", "location", "notes", "created_at"])
    for t in temperatures:
        writer.writerow(
            [t.id, t.timestamp, t.temperature_celsius, t.location, t.notes, t.created_at]
        )

    content = output.getvalue()
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=puffin_export.csv"},
    )


def _fmt_ts(ts: datetime) -> str:
    """Format a UTC datetime for display in the PDF."""
    return ts.strftime("%Y-%m-%d %H:%M") if ts else ""


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
    # Section heading
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_fill_color(230, 240, 255)
    pdf.cell(0, 8, title, fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    if not rows:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No records", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
        return

    # Compute column widths: distribute page width proportionally
    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    n = len(headers)
    col_w = page_w / n

    # Header row
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(200, 220, 240)
    for h in headers:
        pdf.cell(col_w, 7, h, border=1, fill=True)
    pdf.ln()

    # Data rows
    pdf.set_font("Helvetica", "", 8)
    fill = False
    pdf.set_fill_color(245, 248, 255)
    for row in rows:
        # Wrap long text — simple truncation
        cells = [str(v)[:_PDF_MAX_CELL_LENGTH] for v in row]
        for cell in cells:
            pdf.cell(col_w, 6, cell, border=1, fill=fill)
        pdf.ln()
        fill = not fill

    pdf.ln(4)
