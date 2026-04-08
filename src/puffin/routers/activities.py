from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import ActivityItem

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", response_model=list[ActivityItem])
def list_activities(
    date: str = Query(..., description="Local date as YYYY-MM-DD", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
):
    return crud.get_activities_for_date(db, date_str=date)
