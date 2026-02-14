from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import ActivityItem

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", response_model=list[ActivityItem])
def list_activities(
    start: datetime = Query(..., description="Start of day as ISO datetime"),
    end: datetime = Query(..., description="End of day as ISO datetime"),
    db: Session = Depends(get_db),
):
    return crud.get_activities(db, start=start, end=end)
