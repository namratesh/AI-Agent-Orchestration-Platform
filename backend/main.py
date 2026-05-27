from __future__ import annotations
import uuid
from typing import List
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from db import create_agent, get_agent, get_db, list_agents
from executor import agent_executor
from logging_config import get_logger, setup_logging
from models import Agent, AgentCreate, ExecuteRequest, ExecuteResponse

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
    rows = list_agents(db)
    return [Agent.model_validate(r) for r in rows]


@app.get("/agents/{agent_id}", response_model=Agent)
def get_agent_endpoint(agent_id: UUID, db: Session = Depends(get_db)):
    row = get_agent(db, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return Agent.model_validate(row)


# ── Execute ───────────────────────────────────────────────────────────────────

@app.post("/agents/{agent_id}/execute", response_model=ExecuteResponse)
def execute_agent_endpoint(
    agent_id: UUID,
    payload: ExecuteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    row = get_agent(db, agent_id)
    if row is None:
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
