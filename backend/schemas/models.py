from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
import uuid
from pydantic import BaseModel, Field


AgentConfig = Dict[str, Any]


# ── Agent ─────────────────────────────────────────────────────────────────────

class Agent(BaseModel):
    id: UUID = Field(default_factory=uuid.uuid4)
    name: str
    role: str
    system_prompt: str
    model: str
    provider: str
    tools: List[str] = Field(default_factory=list)
    config: AgentConfig = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class AgentCreate(BaseModel):
    name: str
    role: str
    system_prompt: str
    model: str
    provider: str
    tools: List[str] = Field(default_factory=list)
    config: AgentConfig = Field(default_factory=dict)


# ── Workflow ──────────────────────────────────────────────────────────────────

class WorkflowNode(BaseModel):
    id: str
    type: Literal["AGENT", "CONDITION", "HUMAN_APPROVAL"]
    agent_id: Optional[UUID] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class WorkflowEdge(BaseModel):
    source_node_id: str
    target_node_id: str
    condition: Optional[str] = None


class WorkflowDefinition(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    start_node_id: str


class Workflow(BaseModel):
    id: UUID = Field(default_factory=uuid.uuid4)
    name: str
    definition: WorkflowDefinition

    model_config = {"from_attributes": True}


class WorkflowCreate(BaseModel):
    name: str
    definition: WorkflowDefinition


# ── Message ───────────────────────────────────────────────────────────────────

class Message(BaseModel):
    id: UUID = Field(default_factory=uuid.uuid4)
    workflow_id: Optional[UUID] = None
    sender_id: Optional[UUID] = None
    receiver_id: Optional[UUID] = None
    content: str
    message_type: str = "text"
    tokens_used: int = 0
    cost: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


# ── Checkpoint ────────────────────────────────────────────────────────────────

class CheckpointResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    node_id: str
    state: Dict[str, Any]
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── Telegram ──────────────────────────────────────────────────────────────────

class TelegramChatMapping(BaseModel):
    chat_id: str
    workflow_id: UUID
    username: Optional[str] = None

    model_config = {"from_attributes": True}


class TelegramChatMappingCreate(BaseModel):
    chat_id: str
    workflow_id: UUID
    username: Optional[str] = None


# ── Requests / Responses ──────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    task: str


class ExecuteResponse(BaseModel):
    agent_id: UUID
    task: str
    result: str
    tokens_used: int
    cost: float
    trace_id: str


class WorkflowExecuteResponse(BaseModel):
    workflow_id: UUID
    task: str
    result: str
    tokens_used: int = 0
    cost: float = 0.0
    trace_id: str
    execution_id: Optional[UUID] = None
    execution_time_seconds: float = 0.0


class ExecutionRecord(BaseModel):
    id: UUID
    workflow_id: Optional[UUID] = None
    workflow_name: Optional[str] = None
    task: str
    result: str
    status: str
    tokens_used: int
    cost: float
    execution_time_seconds: float
    source: str = "ui"
    created_at: datetime

    model_config = {"from_attributes": True}


class StatsResponse(BaseModel):
    total_agents: int
    total_workflows: int
    executions_today: int
    cost_this_month: float
    recent_executions: List[ExecutionRecord]
