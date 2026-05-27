"""Pydantic schemas and data validation models for the API."""

from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
import uuid
from pydantic import BaseModel, Field

AgentConfig = Dict[str, Any]


# ── Agent ─────────────────────────────────────────────────────────────────────

class Agent(BaseModel):
    """Pydantic model representing a registered agent."""
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
    """Pydantic schema for creating a new agent."""
    name: str
    role: str
    system_prompt: str
    model: str
    provider: str
    tools: List[str] = Field(default_factory=list)
    config: AgentConfig = Field(default_factory=dict)


# ── Workflow ──────────────────────────────────────────────────────────────────

class WorkflowNode(BaseModel):
    """Schema representing a single node in a workflow graph."""
    id: str
    type: Literal["AGENT", "CONDITION", "HUMAN_APPROVAL"]
    agent_id: Optional[UUID] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class WorkflowEdge(BaseModel):
    """Schema representing a directed edge connecting nodes in a workflow."""
    source_node_id: str
    target_node_id: str
    condition: Optional[str] = None  # Python expression — not evaluated yet


class WorkflowDefinition(BaseModel):
    """Schema representing the full structure of a workflow's nodes and edges."""
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    start_node_id: str


class Workflow(BaseModel):
    """Pydantic model representing a defined multi-agent workflow."""
    id: UUID = Field(default_factory=uuid.uuid4)
    name: str
    definition: WorkflowDefinition

    model_config = {"from_attributes": True}


class WorkflowCreate(BaseModel):
    """Pydantic schema for creating a new workflow."""
    name: str
    definition: WorkflowDefinition


# ── Message ───────────────────────────────────────────────────────────────────

class Message(BaseModel):
    """Pydantic model representing a captured execution log message."""
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
    """Pydantic schema for representing a saved workflow node checkpoint."""
    id: UUID
    workflow_id: UUID
    node_id: str
    state: Dict[str, Any]
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── Requests / Responses ──────────────────────────────────────────────────────

class TelegramChatMapping(BaseModel):
    chat_id: str
    workflow_id: UUID
    username: Optional[str] = None

    model_config = {"from_attributes": True}


class TelegramChatMappingCreate(BaseModel):
    chat_id: str
    workflow_id: UUID
    username: Optional[str] = None


class ExecuteRequest(BaseModel):
    """Request payload for executing a single agent task or a workflow."""
    task: str


class ExecuteResponse(BaseModel):
    """Response returned after running a single agent execution."""
    agent_id: UUID
    task: str
    result: str
    tokens_used: int
    cost: float
    trace_id: str


class WorkflowExecuteResponse(BaseModel):
    """Response returned after running a multi-agent workflow execution."""
    workflow_id: UUID
    task: str
    result: str
    trace_id: str
