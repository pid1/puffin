from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import FeedingCreate, FeedingResponse, FeedingUpdate, PeriodStats

router = APIRouter(prefix="/api/feedings", tags=["feedings"])


@router.post("", response_model=FeedingResponse, status_code=201)
def create_feeding(data: FeedingCreate, db: Session = Depends(get_db)):
    return crud.create_feeding(
        db,
        timestamp=data.timestamp,
        feeding_type=data.feeding_type.value,
        duration_minutes=data.duration_minutes,
        amount_oz=data.amount_oz,
        notes=data.notes,
    )


@router.get("", response_model=list[FeedingResponse])
def list_feedings(
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.get_feedings(
        db, start_date=start_date, end_date=end_date, limit=limit, offset=offset
    )


@router.get("/stats", response_model=PeriodStats)
def get_feeding_stats(db: Session = Depends(get_db)):
    return crud.feeding_stats(db)


@router.get("/{feeding_id}", response_model=FeedingResponse)
def get_feeding(feeding_id: int, db: Session = Depends(get_db)):
    obj = crud.get_feeding(db, feeding_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Feeding not found")
    return obj


@router.put("/{feeding_id}", response_model=FeedingResponse)
def update_feeding(feeding_id: int, data: FeedingUpdate, db: Session = Depends(get_db)):
    updates = {}
    if data.timestamp is not None:
        updates["timestamp"] = data.timestamp
    if data.feeding_type is not None:
        updates["feeding_type"] = data.feeding_type.value
    if data.duration_minutes is not None:
        updates["duration_minutes"] = data.duration_minutes
    if data.amount_oz is not None:
        updates["amount_oz"] = data.amount_oz
    if data.notes is not None:
        updates["notes"] = data.notes
    obj = crud.update_feeding(db, feeding_id, **updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Feeding not found")
    return obj


@router.delete("/{feeding_id}", status_code=204)
def delete_feeding(feeding_id: int, db: Session = Depends(get_db)):
    if not crud.delete_feeding(db, feeding_id):
        raise HTTPException(status_code=404, detail="Feeding not found")
