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
    type: Literal["AGENT", "CONDITION", "HUMAN_APPROVAL", "TOOL"]
    agent_id: Optional[UUID] = None
    tool_id: Optional[UUID] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class EdgeConditionSchema(BaseModel):
    type: str
    value: str = ""


class WorkflowEdge(BaseModel):
    source_node_id: str
    target_node_id: str
    connection_type: Optional[str] = None
    condition: Optional[EdgeConditionSchema] = None


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
    result: str = ""
    tokens_used: int = 0
    cost: float = 0.0
    trace_id: str
    execution_id: Optional[UUID] = None
    execution_time_seconds: float = 0.0
    status: str = "queued"


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
    node_outputs: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class StatsResponse(BaseModel):
    total_agents: int
    total_workflows: int
    executions_today: int
    cost_this_month: float
    recent_executions: List[ExecutionRecord]


# ── Tool ─────────────────────────────────────────────────────────────────────

class Tool(BaseModel):
    id: UUID = Field(default_factory=uuid.uuid4)
    name: str
    description: str = ""
    method: str = "GET"
    url: str = ""
    headers: Dict[str, str] = Field(default_factory=dict)
    body_template: str = ""
    api_key: str = ""
    api_key_header: str = "Authorization"
    api_key_prefix: str = "Bearer"
    timeout_seconds: int = 30
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class ToolCreate(BaseModel):
    name: str
    description: str = ""
    method: str = "GET"
    url: str
    headers: Dict[str, str] = Field(default_factory=dict)
    body_template: str = ""
    api_key: str = ""
    api_key_header: str = "Authorization"
    api_key_prefix: str = "Bearer"
    timeout_seconds: int = 30


class ToolUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    method: Optional[str] = None
    url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    body_template: Optional[str] = None
    api_key: Optional[str] = None
    api_key_header: Optional[str] = None
    api_key_prefix: Optional[str] = None
    timeout_seconds: Optional[int] = None


class ToolTestRequest(BaseModel):
    variables: Dict[str, str] = Field(default_factory=dict)
    body_override: Optional[str] = None
    params: Dict[str, str] = Field(default_factory=dict)


class ToolTestResponse(BaseModel):
    status_code: int
    response_body: str
    response_headers: Dict[str, str]
    duration_ms: float
    error: Optional[str] = None


# ── Workflow schedules ────────────────────────────────────────────────────────

class WorkflowSchedule(BaseModel):
    id: UUID
    workflow_id: UUID
    task: str
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    enabled: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScheduleCreate(BaseModel):
    task: str = ""
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None

    def validate_trigger(self) -> None:
        if not self.cron_expression and not self.interval_minutes:
            raise ValueError("Provide either cron_expression or interval_minutes")


class ScheduleUpdate(BaseModel):
    task: Optional[str] = None
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    enabled: Optional[bool] = None


# ── Channel integrations ──────────────────────────────────────────────────────

class WorkflowIntegration(BaseModel):
    id: UUID
    workflow_id: UUID
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IntegrationCreate(BaseModel):
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)

    def validate_config(self) -> None:
        if self.channel_type == "telegram":
            if not self.config.get("bot_token") or not self.config.get("chat_id"):
                raise ValueError("Telegram requires bot_token and chat_id")
        elif self.channel_type == "slack":
            missing = [f for f in ("bot_token", "signing_secret", "channel_id")
                       if not self.config.get(f)]
            if missing:
                raise ValueError(f"Slack requires: {', '.join(missing)}")
        else:
            raise ValueError(f"Unsupported channel_type: {self.channel_type!r}")


class IntegrationUpdate(BaseModel):
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


# ── Named channel bots ────────────────────────────────────────────────────────

class ChannelBot(BaseModel):
    id: UUID
    name: str
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class BotCreate(BaseModel):
    name: str
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)

    def validate_config(self) -> None:
        if self.channel_type == "telegram":
            if not self.config.get("bot_token"):
                raise ValueError("Telegram bot requires bot_token")
        elif self.channel_type == "slack":
            missing = [f for f in ("bot_token", "signing_secret")
                       if not self.config.get(f)]
            if missing:
                raise ValueError(f"Slack bot requires: {', '.join(missing)}")
        else:
            raise ValueError(f"Unsupported channel_type: {self.channel_type!r}")


class BotUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class SlackChannelMapping(BaseModel):
    id: UUID
    bot_id: UUID
    channel_id: str
    channel_name: Optional[str] = None
    workflow_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class SlackMappingCreate(BaseModel):
    channel_id: str
    workflow_id: UUID
    channel_name: Optional[str] = None
