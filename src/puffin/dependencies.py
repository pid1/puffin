from fastapi import Query

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
