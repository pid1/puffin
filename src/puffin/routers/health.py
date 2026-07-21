from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from puffin import crud
from puffin.crud import ChildFilter
from puffin.database import get_db
from puffin.dependencies import child_filter, validate_child_id
from puffin.schemas import (
    MedicationCreate,
    MedicationResponse,
    MedicationUpdate,
    PeriodStats,
    TemperatureCreate,
    TemperatureResponse,
    TemperatureUpdate,
)

router = APIRouter(tags=["health"])


# --- Medications ---


@router.post("/api/medications", response_model=MedicationResponse, status_code=201)
def create_medication(data: MedicationCreate, db: Session = Depends(get_db)):
    validate_child_id(db, data.child_id)
    result = crud.create_medication(
        db,
        timestamp=data.timestamp,
        medication_name=data.medication_name,
        dosage_quantity=data.dosage_quantity,
        dosage_unit=data.dosage_unit.value,
        notes=data.notes,
        child_id=data.child_id,
    )
    crud.add_saved_medication(db, data.medication_name)
    return result


@router.get("/api/medications/saved-names", response_model=list[str])
def list_saved_medication_names(db: Session = Depends(get_db)):
    return crud.get_saved_medications(db)


@router.get("/api/medications", response_model=list[MedicationResponse])
def list_medications(
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None, description="Exclusive upper bound"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    child: ChildFilter = Depends(child_filter),
    db: Session = Depends(get_db),
):
    return crud.get_medications(
        db, start_date=start_date, end_date=end_date, limit=limit, offset=offset, child=child
    )


@router.get("/api/medications/stats", response_model=PeriodStats)
def get_medication_stats(
    child: ChildFilter = Depends(child_filter),
    db: Session = Depends(get_db),
):
    return crud.medication_stats(db, child)


@router.get("/api/medications/{medication_id}", response_model=MedicationResponse)
def get_medication(medication_id: int, db: Session = Depends(get_db)):
    obj = crud.get_medication(db, medication_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Medication record not found")
    return obj


@router.put("/api/medications/{medication_id}", response_model=MedicationResponse)
def update_medication(medication_id: int, data: MedicationUpdate, db: Session = Depends(get_db)):
    updates = {}
    if data.timestamp is not None:
        updates["timestamp"] = data.timestamp
    if data.medication_name is not None:
        updates["medication_name"] = data.medication_name
    if data.dosage_quantity is not None:
        updates["dosage_quantity"] = data.dosage_quantity
    if data.dosage_unit is not None:
        updates["dosage_unit"] = data.dosage_unit.value
    if data.notes is not None:
        updates["notes"] = data.notes
    # ``child_id`` keys off fields_set, not None: an explicit null is how a log
    # is moved back to unassigned.
    if "child_id" in data.model_fields_set:
        validate_child_id(db, data.child_id)
        updates["child_id"] = data.child_id
    obj = crud.update_medication(db, medication_id, **updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Medication record not found")
    return obj


@router.delete("/api/medications/{medication_id}", status_code=204)
def delete_medication(medication_id: int, db: Session = Depends(get_db)):
    if not crud.delete_medication(db, medication_id):
        raise HTTPException(status_code=404, detail="Medication record not found")


# --- Temperatures ---


@router.post("/api/temperatures", response_model=TemperatureResponse, status_code=201)
def create_temperature(data: TemperatureCreate, db: Session = Depends(get_db)):
    validate_child_id(db, data.child_id)
    return crud.create_temperature(
        db,
        timestamp=data.timestamp,
        temperature_celsius=data.temperature_celsius,
        unit=data.unit.value,
        location=data.location.value if data.location else None,
        notes=data.notes,
        child_id=data.child_id,
    )


@router.get("/api/temperatures", response_model=list[TemperatureResponse])
def list_temperatures(
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None, description="Exclusive upper bound"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    child: ChildFilter = Depends(child_filter),
    db: Session = Depends(get_db),
):
    return crud.get_temperatures(
        db, start_date=start_date, end_date=end_date, limit=limit, offset=offset, child=child
    )


@router.get("/api/temperatures/{temp_id}", response_model=TemperatureResponse)
def get_temperature(temp_id: int, db: Session = Depends(get_db)):
    obj = crud.get_temperature(db, temp_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Temperature reading not found")
    return obj


@router.put("/api/temperatures/{temp_id}", response_model=TemperatureResponse)
def update_temperature(temp_id: int, data: TemperatureUpdate, db: Session = Depends(get_db)):
    updates = {}
    if data.timestamp is not None:
        updates["timestamp"] = data.timestamp
    if data.temperature_celsius is not None:
        updates["temperature_celsius"] = data.temperature_celsius
    if data.unit is not None:
        updates["unit"] = data.unit.value
    if data.location is not None:
        updates["location"] = data.location.value
    if data.notes is not None:
        updates["notes"] = data.notes
    # ``child_id`` keys off fields_set, not None: an explicit null is how a log
    # is moved back to unassigned.
    if "child_id" in data.model_fields_set:
        validate_child_id(db, data.child_id)
        updates["child_id"] = data.child_id
    obj = crud.update_temperature(db, temp_id, **updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Temperature reading not found")
    return obj


@router.delete("/api/temperatures/{temp_id}", status_code=204)
def delete_temperature(temp_id: int, db: Session = Depends(get_db)):
    if not crud.delete_temperature(db, temp_id):
        raise HTTPException(status_code=404, detail="Temperature reading not found")
