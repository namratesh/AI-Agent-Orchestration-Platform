from __future__ import annotations
import uuid
from typing import List
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from sqlalchemy.orm import Session

from db import (
    create_agent, create_workflow, get_agent, get_db,
    get_workflow, list_agents, list_checkpoints, list_workflows,
)
from executor import agent_executor
from logging_config import get_logger, setup_logging
from models import (
    Agent, AgentCreate,
    CheckpointResponse,
    ExecuteRequest, ExecuteResponse,
    Workflow, WorkflowCreate, WorkflowExecuteResponse,
)
from workflow_executor import workflow_executor

app = FastAPI(title="AI Agent Orchestration Platform")
logger = get_logger(__name__)


@app.on_event("startup")
async def startup():
    setup_logging()
    logger.info("app_startup", message="AI Agent Orchestration Platform starting")


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    response: Response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    return response


# ── Agents ────────────────────────────────────────────────────────────────────

@app.post("/agents", response_model=Agent, status_code=201)
def create_agent_endpoint(payload: AgentCreate, db: Session = Depends(get_db)):
    row = create_agent(
        db,
        name=payload.name,
        role=payload.role,
        system_prompt=payload.system_prompt,
        model=payload.model,
        provider=payload.provider,
        tools=payload.tools,
        config=payload.config,
    )
    logger.info("agent_created", agent_id=str(row.id), name=row.name, provider=row.provider)
    return Agent.model_validate(row)


@app.get("/agents", response_model=List[Agent])
def list_agents_endpoint(db: Session = Depends(get_db)):
    return [Agent.model_validate(r) for r in list_agents(db)]


@app.get("/agents/{agent_id}", response_model=Agent)
def get_agent_endpoint(agent_id: UUID, db: Session = Depends(get_db)):
    row = get_agent(db, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return Agent.model_validate(row)


@app.post("/agents/{agent_id}/execute", response_model=ExecuteResponse)
def execute_agent_endpoint(
    agent_id: UUID,
    payload: ExecuteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if get_agent(db, agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    trace_id = request.state.trace_id
    outcome = agent_executor.execute(agent_id, payload.task, trace_id)
    return ExecuteResponse(
        agent_id=agent_id,
        task=payload.task,
        result=outcome["result"],
        tokens_used=outcome["tokens_used"],
        cost=outcome["cost"],
        trace_id=trace_id,
    )


# ── Workflows ─────────────────────────────────────────────────────────────────

@app.post("/workflows", response_model=Workflow, status_code=201)
def create_workflow_endpoint(payload: WorkflowCreate, db: Session = Depends(get_db)):
    row = create_workflow(
        db,
        name=payload.name,
        definition=payload.definition.model_dump(mode="json"),
    )
    logger.info("workflow_created", workflow_id=str(row.id), name=row.name)
    return Workflow.model_validate(row)


@app.get("/workflows", response_model=List[Workflow])
def list_workflows_endpoint(db: Session = Depends(get_db)):
    return [Workflow.model_validate(r) for r in list_workflows(db)]


@app.get("/workflows/{workflow_id}", response_model=Workflow)
def get_workflow_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    row = get_workflow(db, workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return Workflow.model_validate(row)


@app.post("/workflows/{workflow_id}/execute", response_model=WorkflowExecuteResponse)
def execute_workflow_endpoint(
    workflow_id: UUID,
    payload: ExecuteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    trace_id = request.state.trace_id
    logger.bind(trace_id=trace_id).info(
        "workflow_execute_request", workflow_id=str(workflow_id), task=payload.task
    )
    outcome = workflow_executor.execute(workflow_id, payload.task, trace_id)
    return WorkflowExecuteResponse(
        workflow_id=workflow_id,
        task=payload.task,
        result=outcome["result"],
        trace_id=trace_id,
    )


@app.get("/workflows/{workflow_id}/checkpoints", response_model=List[CheckpointResponse])
def list_checkpoints_endpoint(workflow_id: UUID, db: Session = Depends(get_db)):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    rows = list_checkpoints(db, workflow_id)
    return [CheckpointResponse.model_validate(r) for r in rows]
