from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import create_workflow, get_db, get_workflow, list_checkpoints, list_workflows
from schemas.models import (CheckpointResponse, ExecuteRequest, Workflow,
                            WorkflowCreate, WorkflowExecuteResponse)
from services.workflow_executor import workflow_executor

router = APIRouter(prefix="/workflows", tags=["workflows"])
logger = get_logger(__name__)


@router.post("", response_model=Workflow, status_code=201)
def create_workflow_endpoint(payload: WorkflowCreate, db: Session = Depends(get_db)):
    row = create_workflow(db, name=payload.name,
                          definition=payload.definition.model_dump(mode="json"))
    logger.info("workflow_created", workflow_id=str(row.id), name=row.name)
    return Workflow.model_validate(row)


@router.get("", response_model=List[Workflow])
def list_workflows_endpoint(db: Session = Depends(get_db)):
    return [Workflow.model_validate(r) for r in list_workflows(db)]


@router.get("/{workflow_id}", response_model=Workflow)
def get_workflow_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    row = get_workflow(db, workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return Workflow.model_validate(row)


@router.post("/{workflow_id}/execute", response_model=WorkflowExecuteResponse)
def execute_workflow_endpoint(workflow_id: UUID, payload: ExecuteRequest,
                              request: Request, db: Session = Depends(get_db)):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    trace_id = request.state.trace_id
    logger.bind(trace_id=trace_id).info("workflow_execute_request",
                                        workflow_id=str(workflow_id), task=payload.task)
    outcome = workflow_executor.execute(workflow_id, payload.task, trace_id)
    return WorkflowExecuteResponse(workflow_id=workflow_id, task=payload.task,
                                   result=outcome["result"], trace_id=trace_id)


@router.get("/{workflow_id}/checkpoints", response_model=List[CheckpointResponse])
def list_checkpoints_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return [CheckpointResponse.model_validate(r) for r in list_checkpoints(db, workflow_id)]
