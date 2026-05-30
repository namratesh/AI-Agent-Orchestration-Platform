"""
Workflow management and asynchronous execution API router.

Workflows are directed graphs of AGENT and TOOL nodes connected by conditional
edges.  They are stored as JSON definitions and compiled at runtime into a
LangGraph StateGraph.

Execution is asynchronous (HTTP 202):
  - If Redis/RQ is available, the job is enqueued for a dedicated worker process
    with retry logic (up to 3 attempts with exponential back-off).
  - Otherwise it falls back to FastAPI BackgroundTasks (same process, no retry).

In both cases an execution record is created immediately with status="queued"
so clients can poll GET /executions/{id} or subscribe to
/ws/executions/{id} for real-time progress.
"""
from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import (create_execution_queued, create_workflow, delete_workflow,
                   get_db, get_workflow, list_checkpoints, list_workflows)
from schemas.models import (CheckpointResponse, ExecuteRequest, Workflow,
                            WorkflowCreate, WorkflowExecuteResponse)
from rq import Retry

from services.queue import QUEUE_AVAILABLE, execution_queue
from services.tasks import run_workflow
from services.workflow_executor import validate_workflow_definition, workflow_executor

router = APIRouter(prefix="/workflows", tags=["workflows"])
logger = get_logger(__name__)


def _run_workflow_bg(execution_id: UUID, workflow_id: UUID, task: str,
                     trace_id: str, source: str) -> None:
    """FastAPI BackgroundTasks shim — runs the workflow when RQ is unavailable.

    Errors are swallowed here because ``workflow_executor.execute`` persists
    the error status to the database internally before raising.
    """
    try:
        workflow_executor.execute(workflow_id, task, trace_id, source=source,
                                  existing_execution_id=execution_id)
    except Exception:
        pass


@router.post("", response_model=Workflow, status_code=201)
def create_workflow_endpoint(payload: WorkflowCreate, db: Session = Depends(get_db)):
    """Create a new workflow with its node/edge definition.

    Returns 409 if a workflow with the same name already exists.
    """
    try:
        row = create_workflow(db, name=payload.name,
                              definition=payload.definition.model_dump(mode="json"))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A workflow named '{payload.name}' already exists.")
    logger.info("workflow_created", workflow_id=str(row.id), name=row.name)
    return Workflow.model_validate(row)


@router.get("", response_model=List[Workflow])
def list_workflows_endpoint(db: Session = Depends(get_db)):
    """Return all workflows ordered by creation date."""
    return [Workflow.model_validate(r) for r in list_workflows(db)]


@router.get("/{workflow_id}", response_model=Workflow)
def get_workflow_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    """Return a single workflow by ID.

    Returns 404 if not found.
    """
    row = get_workflow(db, workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return Workflow.model_validate(row)


@router.post("/{workflow_id}/execute", response_model=WorkflowExecuteResponse, status_code=202)
def execute_workflow_endpoint(workflow_id: UUID, payload: ExecuteRequest,
                              request: Request, background_tasks: BackgroundTasks,
                              db: Session = Depends(get_db)):
    """Dispatch a workflow execution and return the execution ID immediately (202).

    Pre-validates the workflow definition against the database before dispatching
    to catch misconfigured agent/tool references early rather than failing inside
    the worker.

    Returns:
        WorkflowExecuteResponse with ``status="queued"`` and an ``execution_id``
        that clients can use to poll or stream results.

    Raises:
        HTTPException 404: Workflow not found.
        HTTPException 422: Workflow definition contains validation errors.
    """
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

    if QUEUE_AVAILABLE and execution_queue is not None:
        execution_queue.enqueue(
            run_workflow,
            str(exec_row.id), str(workflow_id), payload.task, trace_id, "ui",
            job_timeout=600,
            retry=Retry(max=3, interval=[10, 30, 60]),
        )
        dispatch = "rq"
    else:
        background_tasks.add_task(
            _run_workflow_bg, exec_row.id, workflow_id, payload.task, trace_id, "ui"
        )
        dispatch = "background_task"

    logger.bind(trace_id=trace_id).info("workflow_dispatched",
                                        dispatch=dispatch,
                                        execution_id=str(exec_row.id))

    return WorkflowExecuteResponse(
        workflow_id=workflow_id,
        task=payload.task,
        trace_id=trace_id,
        execution_id=exec_row.id,
        status="queued",
    )


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    """Delete a workflow and its associated data.

    Returns 404 if not found.
    """
    if not delete_workflow(db, workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    logger.info("workflow_deleted", workflow_id=str(workflow_id))


@router.get("/{workflow_id}/checkpoints", response_model=List[CheckpointResponse])
def list_checkpoints_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    """Return all node-level execution checkpoints for a workflow.

    Checkpoints are written after each node completes and can be used to
    inspect intermediate outputs or resume a failed run.

    Returns 404 if the workflow is not found.
    """
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return [CheckpointResponse.model_validate(r) for r in list_checkpoints(db, workflow_id)]
