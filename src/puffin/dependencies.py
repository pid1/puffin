from fastapi import HTTPException, Query
from sqlalchemy.orm import Session

from puffin import crud
from puffin.crud import UNASSIGNED, ChildFilter


def child_filter(
    child_id: int | None = Query(None, description="Only include logs for this child"),
    unassigned: bool = Query(False, description="Only include logs belonging to no child"),
) -> ChildFilter:
    """Resolve the child scope of a request.

    Omitting both parameters means *every* log regardless of child, which is
    what an install with no profiles always sees.  ``unassigned`` wins over
    ``child_id`` so the two can never be combined into an impossible filter.
    """
    if unassigned:
        return UNASSIGNED
    return child_id


def validate_child_id(db: Session, child_id: int | None) -> None:
    """Reject a ``child_id`` that does not name an existing profile.

    ``None`` is always valid — it means "unassigned".

    Nothing at the database level catches this: SQLite enforces foreign keys
    only when ``PRAGMA foreign_keys=ON``, so an orphaned log is written
    happily.  It is then invisible everywhere — no child's scoped view
    matches it, and the unassigned view filters on ``child_id IS NULL`` — so
    the log cannot be reached or recovered through the UI.  A client holding
    a profile id deleted in another tab is enough to trigger it.
    """
    if child_id is None:
        return
    if crud.get_child(db, child_id) is None:
        raise HTTPException(status_code=422, detail=f"Child {child_id} not found")
