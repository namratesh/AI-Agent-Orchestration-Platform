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
    rows = list_executions(db, limit=limit, offset=offset)
    result = []
    for r in rows:
        rec = ExecutionRecord.model_validate(r)
        result.append(rec)
    return result


@router.get("/{execution_id}", response_model=ExecutionRecord)
def get_execution_endpoint(execution_id: UUID, db: Session = Depends(get_db)):
    row = get_execution(db, execution_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return ExecutionRecord.model_validate(row)


@router.delete("/{execution_id}", status_code=204)
def delete_execution_endpoint(execution_id: UUID, db: Session = Depends(get_db)):
    if not delete_execution(db, execution_id):
        raise HTTPException(status_code=404, detail="Execution not found")
