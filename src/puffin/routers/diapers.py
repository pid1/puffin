from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import DiaperChangeCreate, DiaperChangeResponse, DiaperChangeUpdate, PeriodStats

router = APIRouter(prefix="/api/diapers", tags=["diapers"])


@router.post("", response_model=DiaperChangeResponse, status_code=201)
def create_diaper(data: DiaperChangeCreate, db: Session = Depends(get_db)):
    return crud.create_diaper(db, timestamp=data.timestamp, type_=data.type.value, notes=data.notes)


@router.get("", response_model=list[DiaperChangeResponse])
def list_diapers(
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.get_diapers(
        db, start_date=start_date, end_date=end_date, limit=limit, offset=offset
    )


@router.get("/stats", response_model=PeriodStats)
def get_diaper_stats(db: Session = Depends(get_db)):
    return crud.diaper_stats(db)


@router.get("/{diaper_id}", response_model=DiaperChangeResponse)
def get_diaper(diaper_id: int, db: Session = Depends(get_db)):
    obj = crud.get_diaper(db, diaper_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Diaper change not found")
    return obj


@router.put("/{diaper_id}", response_model=DiaperChangeResponse)
def update_diaper(diaper_id: int, data: DiaperChangeUpdate, db: Session = Depends(get_db)):
    updates = {}
    if data.timestamp is not None:
        updates["timestamp"] = data.timestamp
    if data.type is not None:
        updates["type"] = data.type.value
    if data.notes is not None:
        updates["notes"] = data.notes
    obj = crud.update_diaper(db, diaper_id, **updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Diaper change not found")
    return obj


@router.delete("/{diaper_id}", status_code=204)
def delete_diaper(diaper_id: int, db: Session = Depends(get_db)):
    if not crud.delete_diaper(db, diaper_id):
        raise HTTPException(status_code=404, detail="Diaper change not found")
