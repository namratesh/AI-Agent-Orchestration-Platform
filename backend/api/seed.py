"""
Demo data seed API endpoint.

Exposes the database seed function over HTTP so the frontend can trigger it
without requiring direct database access.  Useful for resetting a demo
environment or populating a fresh deployment from the UI.

The underlying seed function is idempotent — it only inserts data when no
agents exist, so calling this endpoint multiple times is safe.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.db import get_db
from db.seed import run_seed

router = APIRouter(prefix="/seed", tags=["seed"])


@router.post("")
def trigger_seed(db: Session = Depends(get_db)):
    """Seed demo agents, tool, and workflow.

    Safe to call multiple times — returns {"seeded": false} when data
    already exists rather than duplicating records.
    """
    return run_seed(db)
