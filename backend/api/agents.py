from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import create_agent, delete_agent, get_agent, get_db, list_agents
from schemas.models import Agent, AgentCreate, ExecuteRequest, ExecuteResponse
from services.executor import agent_executor

router = APIRouter(prefix="/agents", tags=["agents"])
logger = get_logger(__name__)


@router.post("", response_model=Agent, status_code=201)
def create_agent_endpoint(payload: AgentCreate, db: Session = Depends(get_db)):
    try:
        row = create_agent(db, name=payload.name, role=payload.role,
                           system_prompt=payload.system_prompt, model=payload.model,
                           provider=payload.provider, tools=payload.tools, config=payload.config)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"An agent named '{payload.name}' already exists.")
    logger.info("agent_created", agent_id=str(row.id), name=row.name, provider=row.provider)
    return Agent.model_validate(row)


@router.get("", response_model=List[Agent])
def list_agents_endpoint(db: Session = Depends(get_db)):
    return [Agent.model_validate(r) for r in list_agents(db)]


@router.get("/{agent_id}", response_model=Agent)
def get_agent_endpoint(agent_id: UUID, db: Session = Depends(get_db)):
    row = get_agent(db, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return Agent.model_validate(row)


@router.delete("/{agent_id}", status_code=204)
def delete_agent_endpoint(agent_id: UUID, db: Session = Depends(get_db)):
    if not delete_agent(db, agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    logger.info("agent_deleted", agent_id=str(agent_id))


@router.post("/{agent_id}/execute", response_model=ExecuteResponse)
def execute_agent_endpoint(agent_id: UUID, payload: ExecuteRequest,
                           request: Request, db: Session = Depends(get_db)):
    if get_agent(db, agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    trace_id = request.state.trace_id
    outcome = agent_executor.execute(agent_id, payload.task, trace_id)
    return ExecuteResponse(agent_id=agent_id, task=payload.task,
                           result=outcome["result"], tokens_used=outcome["tokens_used"],
                           cost=outcome["cost"], trace_id=trace_id)
