"""
Execution history API router.

Provides read and delete access to workflow execution records.  Executions are
created by the workflow execution pipeline and transition through the statuses:
  queued → success | error

The list endpoint supports pagination via ``limit`` and ``offset`` query
parameters to handle large execution histories efficiently.
"""
from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.db import delete_execution, get_db, get_execution, list_executions
from schemas.models import ExecutionRecord

router = APIRouter(prefix="/executions", tags=["executions"])


@router.get("", response_model=List[ExecutionRecord])
def list_executions_endpoint(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    """Return a paginated list of execution records, newest first.

    Args:
        limit: Maximum number of records to return (default 50).
        offset: Number of records to skip for pagination (default 0).
    """
    rows = list_executions(db, limit=limit, offset=offset)
    result = []
    for r in rows:
        rec = ExecutionRecord.model_validate(r)
        result.append(rec)
    return result


@router.get("/{execution_id}", response_model=ExecutionRecord)
def get_execution_endpoint(execution_id: UUID, db: Session = Depends(get_db)):
    """Return a single execution record by ID.

    Returns 404 if not found.
    """
    row = get_execution(db, execution_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return ExecutionRecord.model_validate(row)


@router.delete("/{execution_id}", status_code=204)
def delete_execution_endpoint(execution_id: UUID, db: Session = Depends(get_db)):
    """Delete an execution record.

    Returns 404 if not found.
    """
    if not delete_execution(db, execution_id):
        raise HTTPException(status_code=404, detail="Execution not found")
