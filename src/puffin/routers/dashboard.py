import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import DashboardSummary

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardSummary)
def get_dashboard(db: Session = Depends(get_db)):
    return crud.get_dashboard(db)


@router.get("/export")
def export_data(
    export_format: str = Query("csv", alias="format", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
):
    diapers = crud.get_diapers(db, limit=10000)
    feedings = crud.get_feedings(db, limit=10000)
    medications = crud.get_medications(db, limit=10000)
    temperatures = crud.get_temperatures(db, limit=10000)

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
        import json

        content = json.dumps(data, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=puffin_export.json"},
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
        writer.writerow([
            f.id, f.timestamp, f.feeding_type,
            f.duration_minutes, f.amount_oz, f.notes, f.created_at,
        ])

    writer.writerow([])
    writer.writerow(["--- Medications ---"])
    writer.writerow(["id", "timestamp", "medication_name", "dosage", "notes", "created_at"])
    for m in medications:
        writer.writerow([m.id, m.timestamp, m.medication_name, m.dosage, m.notes, m.created_at])

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
