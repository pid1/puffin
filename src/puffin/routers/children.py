from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from puffin import crud
from puffin.database import get_db
from puffin.schemas import (
    BulkAssignResult,
    ChildCreate,
    ChildResponse,
    ChildUpdate,
    UnassignedSummary,
)

router = APIRouter(prefix="/api/children", tags=["children"])


@router.get("", response_model=list[ChildResponse])
def list_children(db: Session = Depends(get_db)):
    return crud.get_children(db)


@router.post("", response_model=ChildResponse, status_code=201)
def create_child(data: ChildCreate, db: Session = Depends(get_db)):
    return crud.create_child(db, name=data.name)


@router.get("/unassigned", response_model=UnassignedSummary)
def get_unassigned_summary(db: Session = Depends(get_db)):
    """How many logs belong to no profile.

    Drives the conditional ``Unassigned logs`` switcher option, and tells the
    client whether the one-time migration offer applies at first profile
    creation.  Declared before ``/{child_id}`` so it is not shadowed by it.
    """
    return {"count": crud.count_unassigned_logs(db)}


@router.get("/{child_id}", response_model=ChildResponse)
def get_child(child_id: int, db: Session = Depends(get_db)):
    obj = crud.get_child(db, child_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Child not found")
    return obj


@router.put("/{child_id}", response_model=ChildResponse)
def update_child(child_id: int, data: ChildUpdate, db: Session = Depends(get_db)):
    obj = crud.update_child(db, child_id, name=data.name)
    if not obj:
        raise HTTPException(status_code=404, detail="Child not found")
    return obj


@router.delete("/{child_id}", status_code=204)
def delete_child(child_id: int, db: Session = Depends(get_db)):
    """Delete a profile. Its logs are kept and returned to unassigned."""
    if not crud.delete_child(db, child_id):
        raise HTTPException(status_code=404, detail="Child not found")


@router.post("/{child_id}/assign-unassigned", response_model=BulkAssignResult)
def assign_unassigned(child_id: int, db: Session = Depends(get_db)):
    """Move every unassigned log to this profile.

    Used both by the one-time offer at first profile creation and by the bulk
    re-assign in the unassigned view.  The two-step confirmation guarding this
    is a client concern; the endpoint itself is a single idempotent-ish sweep.
    """
    if not crud.get_child(db, child_id):
        raise HTTPException(status_code=404, detail="Child not found")
    return {"assigned": crud.assign_unassigned_logs(db, child_id)}
