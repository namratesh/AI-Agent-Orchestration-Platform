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
