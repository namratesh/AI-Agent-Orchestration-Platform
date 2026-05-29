from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import (create_execution_queued, create_workflow, delete_workflow,
                   get_db, get_workflow, list_checkpoints, list_workflows)
from schemas.models import (CheckpointResponse, ExecuteRequest, Workflow,
                            WorkflowCreate, WorkflowExecuteResponse)
from services.workflow_executor import validate_workflow_definition, workflow_executor

router = APIRouter(prefix="/workflows", tags=["workflows"])
logger = get_logger(__name__)


def _run_workflow_bg(execution_id: UUID, workflow_id: UUID, task: str,
                     trace_id: str, source: str) -> None:
    """Background task: executes the workflow and updates the queued execution record."""
    try:
        workflow_executor.execute(workflow_id, task, trace_id, source=source,
                                  existing_execution_id=execution_id)
    except Exception:
        # Error status is recorded inside workflow_executor.execute(); swallow here.
        pass


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


@router.post("/{workflow_id}/execute", response_model=WorkflowExecuteResponse, status_code=202)
def execute_workflow_endpoint(workflow_id: UUID, payload: ExecuteRequest,
                              request: Request, background_tasks: BackgroundTasks,
                              db: Session = Depends(get_db)):
    workflow_row = get_workflow(db, workflow_id)
    if workflow_row is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    validation_errors = validate_workflow_definition(db, workflow_row.definition)
    if validation_errors:
        raise HTTPException(status_code=422, detail={"errors": validation_errors})

    trace_id = request.state.trace_id
    logger.bind(trace_id=trace_id).info("workflow_execute_queued",
                                        workflow_id=str(workflow_id), task=payload.task)

    # Create the execution record immediately (status="queued") so the client
    # can poll GET /executions/{id} for the result.
    exec_row = create_execution_queued(db, workflow_id=workflow_id, task=payload.task)
    background_tasks.add_task(
        _run_workflow_bg, exec_row.id, workflow_id, payload.task, trace_id, "ui"
    )

    return WorkflowExecuteResponse(
        workflow_id=workflow_id,
        task=payload.task,
        trace_id=trace_id,
        execution_id=exec_row.id,
        status="queued",
    )


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    if not delete_workflow(db, workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    logger.info("workflow_deleted", workflow_id=str(workflow_id))


@router.get("/{workflow_id}/checkpoints", response_model=List[CheckpointResponse])
def list_checkpoints_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return [CheckpointResponse.model_validate(r) for r in list_checkpoints(db, workflow_id)]
