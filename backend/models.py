from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
import uuid
from pydantic import BaseModel, Field


AgentConfig = Dict[str, Any]


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


class Workflow(BaseModel):
    id: UUID = Field(default_factory=uuid.uuid4)
    name: str
    definition: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


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


class ExecuteRequest(BaseModel):
    task: str


class ExecuteResponse(BaseModel):
    agent_id: UUID
    task: str
    result: str
    tokens_used: int
    cost: float
    trace_id: str
