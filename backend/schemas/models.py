"""
Pydantic request/response models for the AI Agent Orchestration Platform API.

All models use ``from_attributes=True`` (ORM mode) where they represent database
entities, allowing them to be constructed directly from SQLAlchemy ORM objects
via ``Model.model_validate(orm_row)``.

Model categories:
  - Agent: LLM agent configuration (provider, model, tools, system prompt).
  - Workflow: Graph definition (nodes + directed edges with optional conditions).
  - Message: Conversation history entries for agent memory.
  - Checkpoint: Per-node execution state snapshots for resumability.
  - Execution: Workflow run records with status, result, and cost tracking.
  - Tool: HTTP tool definitions with encrypted API key handling.
  - Schedule: Time-based workflow triggers (cron or interval).
  - Integration: Outbound channel push integrations (Telegram, Slack).
  - Bot: Named inbound messaging bots with channel-to-workflow mappings.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
import uuid
from pydantic import BaseModel, Field


AgentConfig = Dict[str, Any]


# ── Agent ─────────────────────────────────────────────────────────────────────

class Agent(BaseModel):
    """Full agent representation returned by the API."""
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
    """Payload for creating a new agent."""
    name: str
    role: str
    system_prompt: str
    model: str
    provider: str
    tools: List[str] = Field(default_factory=list)
    config: AgentConfig = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    """Partial update payload for an agent — all fields are optional."""
    name: Optional[str] = None
    role: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    tools: Optional[List[str]] = None
    config: Optional[AgentConfig] = None


# ── Workflow ──────────────────────────────────────────────────────────────────

class WorkflowNode(BaseModel):
    """A single node in the workflow canvas.

    ``agent_id`` is required for AGENT nodes; ``tool_id`` is required for TOOL nodes.
    """
    id: str
    type: Literal["AGENT", "CONDITION", "HUMAN_APPROVAL", "TOOL"]
    agent_id: Optional[UUID] = None
    tool_id: Optional[UUID] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class EdgeConditionSchema(BaseModel):
    """Routing condition on a workflow edge.

    Supported types: ``always``, ``contains``, ``not_contains``, ``equals``,
    ``not_equals``.  See ``_eval_condition`` in ``workflow_executor.py`` for
    evaluation semantics.
    """
    type: str
    value: str = ""


class WorkflowEdge(BaseModel):
    """A directed edge connecting two workflow nodes."""
    source_node_id: str
    target_node_id: str
    connection_type: Optional[str] = None
    condition: Optional[EdgeConditionSchema] = None


class WorkflowDefinition(BaseModel):
    """The complete graph definition for a workflow."""
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    start_node_id: str


class Workflow(BaseModel):
    """Full workflow representation returned by the API."""
    id: UUID = Field(default_factory=uuid.uuid4)
    name: str
    definition: WorkflowDefinition

    model_config = {"from_attributes": True}


class WorkflowCreate(BaseModel):
    """Payload for creating a new workflow."""
    name: str
    definition: WorkflowDefinition


# ── Message ───────────────────────────────────────────────────────────────────

class Message(BaseModel):
    """A single conversation message stored for agent memory."""
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
    """Snapshot of node-level state captured during workflow execution."""
    id: UUID
    workflow_id: UUID
    node_id: str
    state: Dict[str, Any]
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── Telegram ──────────────────────────────────────────────────────────────────

class TelegramChatMapping(BaseModel):
    """Mapping from a Telegram chat ID to a workflow."""
    chat_id: str
    workflow_id: UUID
    username: Optional[str] = None

    model_config = {"from_attributes": True}


class TelegramChatMappingCreate(BaseModel):
    """Payload for creating or replacing a Telegram chat mapping."""
    chat_id: str
    workflow_id: UUID
    username: Optional[str] = None


# ── Requests / Responses ──────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    """Payload for agent or workflow execution endpoints."""
    task: str


class ExecuteResponse(BaseModel):
    """Result returned by the synchronous agent execution endpoint."""
    agent_id: UUID
    task: str
    result: str
    tokens_used: int
    cost: float
    trace_id: str


class WorkflowExecuteResponse(BaseModel):
    """Response from the asynchronous workflow execution endpoint (202 Accepted).

    ``status`` is always ``"queued"`` at response time.  Clients should poll
    ``GET /executions/{execution_id}`` or subscribe to
    ``/ws/executions/{execution_id}`` for the final result.
    """
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
    """A workflow execution record as stored in the database."""
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
    """Aggregated platform statistics for the dashboard."""
    total_agents: int
    total_workflows: int
    executions_today: int
    cost_this_month: float
    recent_executions: List[ExecutionRecord]


# ── Tool ─────────────────────────────────────────────────────────────────────

class Tool(BaseModel):
    """HTTP tool definition returned by the API (api_key is masked)."""
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
    """Payload for creating a new tool."""
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
    """Partial update payload for a tool — all fields are optional."""
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
    """Payload for the tool test endpoint.

    ``variables`` are substituted into ``{{variable}}`` placeholders in the
    tool's URL, headers, and body template.  ``body_override`` replaces the
    stored body template entirely for this test run.
    """
    variables: Dict[str, str] = Field(default_factory=dict)
    body_override: Optional[str] = None
    params: Dict[str, str] = Field(default_factory=dict)


class ToolTestResponse(BaseModel):
    """Result from a live tool test call."""
    status_code: int
    response_body: str
    response_headers: Dict[str, str]
    duration_ms: float
    error: Optional[str] = None


# ── Workflow schedules ────────────────────────────────────────────────────────

class WorkflowSchedule(BaseModel):
    """A time-based workflow trigger record."""
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
    """Payload for creating a new workflow schedule.

    Exactly one of ``cron_expression`` or ``interval_minutes`` must be provided.
    """
    task: str = ""
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None

    def validate_trigger(self) -> None:
        """Raise ValueError if neither trigger field is set."""
        if not self.cron_expression and not self.interval_minutes:
            raise ValueError("Provide either cron_expression or interval_minutes")


class ScheduleUpdate(BaseModel):
    """Partial update payload for a schedule — all fields are optional."""
    task: Optional[str] = None
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    enabled: Optional[bool] = None


# ── Channel integrations ──────────────────────────────────────────────────────

class WorkflowIntegration(BaseModel):
    """An outbound channel integration attached to a workflow."""
    id: UUID
    workflow_id: UUID
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IntegrationCreate(BaseModel):
    """Payload for creating a new workflow integration."""
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)

    def validate_config(self) -> None:
        """Validate that channel-specific required fields are present in config.

        Raises:
            ValueError: If required credentials are missing or the channel type
                is unsupported.
        """
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
    """Partial update payload for an integration."""
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


# ── Named channel bots ────────────────────────────────────────────────────────

class ChannelBot(BaseModel):
    """A named messaging bot (Telegram or Slack) returned by the API.

    Credentials in ``config`` are masked before returning.
    """
    id: UUID
    name: str
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class BotCreate(BaseModel):
    """Payload for creating a new named bot."""
    name: str
    channel_type: str
    config: Dict[str, Any] = Field(default_factory=dict)

    def validate_config(self) -> None:
        """Validate that channel-specific required credentials are present.

        Raises:
            ValueError: If required fields are missing or the channel type is
                unsupported.
        """
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
    """Partial update payload for a named bot."""
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class SlackChannelMapping(BaseModel):
    """A Slack channel-to-workflow mapping scoped to a named bot."""
    id: UUID
    bot_id: UUID
    channel_id: str
    channel_name: Optional[str] = None
    workflow_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class SlackMappingCreate(BaseModel):
    """Payload for creating a Slack channel mapping."""
    channel_id: str
    workflow_id: UUID
    channel_name: Optional[str] = None
