from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, create_engine, func, or_, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


class AgentORM(Base):
    __tablename__ = "agents"

    id            = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(Text, nullable=False)
    role          = Column(Text, nullable=False)
    system_prompt = Column(Text, nullable=False)
    model         = Column(Text, nullable=False)
    provider      = Column(Text, nullable=False)
    tools         = Column(JSONB, nullable=False, default=list)
    config        = Column(JSONB, nullable=False, default=dict)
    created_at    = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class WorkflowORM(Base):
    __tablename__ = "workflows"

    id         = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(Text, nullable=False)
    definition = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class MessageORM(Base):
    __tablename__ = "messages"

    id           = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id  = Column(PG_UUID(as_uuid=True), nullable=True)
    sender_id    = Column(PG_UUID(as_uuid=True), nullable=True)
    receiver_id  = Column(PG_UUID(as_uuid=True), nullable=True)
    content      = Column(Text, nullable=False)
    message_type = Column(String(64), nullable=False, default="text")
    tokens_used  = Column(Integer, nullable=False, default=0)
    cost         = Column(Numeric(12, 8), nullable=False, default=0)
    timestamp    = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class WorkflowExecutionCheckpointORM(Base):
    __tablename__ = "workflow_execution_checkpoints"

    id          = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(PG_UUID(as_uuid=True), nullable=False)
    node_id     = Column(Text, nullable=False)
    state       = Column(JSONB, nullable=False, default=dict)
    timestamp   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class TelegramChatMappingORM(Base):
    __tablename__ = "telegram_chat_mappings"

    chat_id     = Column(Text, primary_key=True)
    workflow_id = Column(PG_UUID(as_uuid=True), nullable=False)
    username    = Column(Text, nullable=True)
    bot_id      = Column(PG_UUID(as_uuid=True), ForeignKey("channel_bots.id", ondelete="SET NULL"), nullable=True)
    created_at  = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ChannelBotORM(Base):
    __tablename__ = "channel_bots"

    id           = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name         = Column(Text, nullable=False)
    channel_type = Column(Text, nullable=False)
    config       = Column(JSONB, nullable=False, default=dict)
    enabled      = Column(Boolean, nullable=False, default=True)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class SlackChannelMappingORM(Base):
    __tablename__ = "slack_channel_mappings"

    id           = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bot_id       = Column(PG_UUID(as_uuid=True), ForeignKey("channel_bots.id", ondelete="CASCADE"), nullable=False)
    channel_id   = Column(Text, nullable=False)
    channel_name = Column(Text, nullable=True)
    workflow_id  = Column(PG_UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ToolORM(Base):
    __tablename__ = "tools"

    id              = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(Text, nullable=False)
    description     = Column(Text, nullable=False, default="")
    method          = Column(String(10), nullable=False, default="GET")
    url             = Column(Text, nullable=False, default="")
    headers         = Column(JSONB, nullable=False, default=dict)
    body_template   = Column(Text, nullable=False, default="")
    api_key         = Column(Text, nullable=False, default="")
    api_key_header  = Column(String(255), nullable=False, default="Authorization")
    api_key_prefix  = Column(String(50), nullable=False, default="Bearer")
    timeout_seconds = Column(Integer, nullable=False, default=30)
    created_at      = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class WorkflowExecutionORM(Base):
    __tablename__ = "workflow_executions"

    id                    = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id           = Column(PG_UUID(as_uuid=True), nullable=True)
    task                  = Column(Text, nullable=False)
    result                = Column(Text, nullable=False, default="")
    status                = Column(String(32), nullable=False, default="success")
    tokens_used           = Column(Integer, nullable=False, default=0)
    cost                  = Column(Numeric(12, 8), nullable=False, default=0)
    execution_time_seconds = Column(Numeric(10, 3), nullable=False, default=0)
    source                = Column(String(32), nullable=False, default="ui")
    node_outputs          = Column(JSONB, nullable=False, default=dict)
    error_message         = Column(Text, nullable=True)
    created_at            = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class WorkflowScheduleORM(Base):
    __tablename__ = "workflow_schedules"

    id               = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id      = Column(PG_UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    task             = Column(Text, nullable=False, default="")
    cron_expression  = Column(Text, nullable=True)
    interval_minutes = Column(Integer, nullable=True)
    enabled          = Column(Boolean, nullable=False, default=True)
    last_run_at      = Column(DateTime(timezone=True), nullable=True)
    next_run_at      = Column(DateTime(timezone=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class WorkflowIntegrationORM(Base):
    __tablename__ = "workflow_integrations"

    id           = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id  = Column(PG_UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    channel_type = Column(Text, nullable=False)
    config       = Column(JSONB, nullable=False, default=dict)
    enabled      = Column(Boolean, nullable=False, default=True)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


# ── Session dependency ────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Agent ─────────────────────────────────────────────────────────────────────

def create_agent(db: Session, *, name: str, role: str, system_prompt: str,
                 model: str, provider: str, tools: list, config: dict) -> AgentORM:
    agent = AgentORM(name=name, role=role, system_prompt=system_prompt,
                     model=model, provider=provider, tools=tools, config=config)
    db.add(agent); db.commit(); db.refresh(agent)
    return agent


def get_agent(db: Session, agent_id: UUID) -> Optional[AgentORM]:
    return db.query(AgentORM).filter(AgentORM.id == agent_id).first()


def list_agents(db: Session) -> List[AgentORM]:
    return db.query(AgentORM).order_by(AgentORM.created_at.desc()).all()


def delete_agent(db: Session, agent_id: UUID) -> bool:
    row = db.query(AgentORM).filter(AgentORM.id == agent_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


# ── Workflow ──────────────────────────────────────────────────────────────────

def create_workflow(db: Session, *, name: str, definition: Dict[str, Any]) -> WorkflowORM:
    wf = WorkflowORM(name=name, definition=definition)
    db.add(wf); db.commit(); db.refresh(wf)
    return wf


def get_workflow(db: Session, workflow_id: UUID) -> Optional[WorkflowORM]:
    return db.query(WorkflowORM).filter(WorkflowORM.id == workflow_id).first()


def list_workflows(db: Session) -> List[WorkflowORM]:
    return db.query(WorkflowORM).order_by(WorkflowORM.created_at.desc()).all()


# ── Message ───────────────────────────────────────────────────────────────────

def save_message(db: Session, *, workflow_id: Optional[UUID] = None,
                 sender_id: Optional[UUID] = None, receiver_id: Optional[UUID] = None,
                 content: str, message_type: str = "text",
                 tokens_used: int = 0, cost: float = 0.0) -> MessageORM:
    msg = MessageORM(workflow_id=workflow_id, sender_id=sender_id,
                     receiver_id=receiver_id, content=content,
                     message_type=message_type, tokens_used=tokens_used, cost=cost)
    db.add(msg); db.commit(); db.refresh(msg)
    return msg


def get_messages(db: Session, workflow_id: Optional[UUID] = None,
                 limit: int = 100) -> List[MessageORM]:
    q = db.query(MessageORM)
    if workflow_id:
        q = q.filter(MessageORM.workflow_id == workflow_id)
    return q.order_by(MessageORM.timestamp.desc()).limit(limit).all()


def get_agent_history(db: Session, agent_id: UUID, limit: int = 20) -> List[MessageORM]:
    """Return the last `limit` human+AI messages for an agent, oldest first."""
    return (
        db.query(MessageORM)
        .filter(
            or_(MessageORM.sender_id == agent_id, MessageORM.receiver_id == agent_id),
            MessageORM.message_type.in_(["user_message", "agent_response"]),
        )
        .order_by(MessageORM.timestamp.asc())
        .limit(limit)
        .all()
    )


# ── Checkpoint ────────────────────────────────────────────────────────────────

def save_checkpoint(db: Session, *, workflow_id: UUID, node_id: str,
                    state: Dict[str, Any]) -> WorkflowExecutionCheckpointORM:
    cp = WorkflowExecutionCheckpointORM(workflow_id=workflow_id, node_id=node_id, state=state)
    db.add(cp); db.commit(); db.refresh(cp)
    return cp


def get_checkpoint(db: Session, workflow_id: UUID) -> Optional[WorkflowExecutionCheckpointORM]:
    return (db.query(WorkflowExecutionCheckpointORM)
            .filter(WorkflowExecutionCheckpointORM.workflow_id == workflow_id)
            .order_by(WorkflowExecutionCheckpointORM.timestamp.desc()).first())


def list_checkpoints(db: Session, workflow_id: UUID) -> List[WorkflowExecutionCheckpointORM]:
    return (db.query(WorkflowExecutionCheckpointORM)
            .filter(WorkflowExecutionCheckpointORM.workflow_id == workflow_id)
            .order_by(WorkflowExecutionCheckpointORM.timestamp.asc()).all())


# ── Telegram chat mapping ─────────────────────────────────────────────────────

def set_chat_mapping(db: Session, *, chat_id: str, workflow_id: UUID,
                     username: Optional[str] = None) -> TelegramChatMappingORM:
    existing = db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id).first()
    if existing:
        existing.workflow_id = workflow_id
        existing.username = username
    else:
        existing = TelegramChatMappingORM(chat_id=chat_id, workflow_id=workflow_id, username=username)
        db.add(existing)
    db.commit(); db.refresh(existing)
    return existing


def get_chat_mapping(db: Session, chat_id: str) -> Optional[TelegramChatMappingORM]:
    return db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id).first()


def list_chat_mappings(db: Session) -> List[TelegramChatMappingORM]:
    return db.query(TelegramChatMappingORM).order_by(
        TelegramChatMappingORM.created_at.desc()).all()


def delete_chat_mapping(db: Session, chat_id: str) -> bool:
    row = db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


# ── Workflow execution history ────────────────────────────────────────────────

def save_execution(db: Session, *, workflow_id: Optional[UUID], task: str, result: str,
                   status: str = "success", tokens_used: int = 0, cost: float = 0.0,
                   execution_time_seconds: float = 0.0,
                   source: str = "ui",
                   node_outputs: Optional[Dict[str, Any]] = None,
                   error_message: Optional[str] = None) -> WorkflowExecutionORM:
    row = WorkflowExecutionORM(workflow_id=workflow_id, task=task, result=result,
                               status=status, tokens_used=tokens_used, cost=cost,
                               execution_time_seconds=execution_time_seconds, source=source,
                               node_outputs=node_outputs or {},
                               error_message=error_message)
    db.add(row); db.commit(); db.refresh(row)
    return row


def create_execution_queued(db: Session, *, workflow_id: Optional[UUID], task: str,
                             source: str = "ui") -> WorkflowExecutionORM:
    row = WorkflowExecutionORM(workflow_id=workflow_id, task=task, result="",
                               status="queued", source=source, node_outputs={})
    db.add(row); db.commit(); db.refresh(row)
    return row


def update_execution(db: Session, execution_id: UUID, *, status: str, result: str = "",
                     tokens_used: int = 0, cost: float = 0.0,
                     execution_time_seconds: float = 0.0,
                     node_outputs: Optional[Dict[str, Any]] = None,
                     error_message: Optional[str] = None) -> Optional[WorkflowExecutionORM]:
    row = db.query(WorkflowExecutionORM).filter(WorkflowExecutionORM.id == execution_id).first()
    if row is None:
        return None
    row.status = status
    row.result = result
    row.tokens_used = tokens_used
    row.cost = cost
    row.execution_time_seconds = execution_time_seconds
    if node_outputs is not None:
        row.node_outputs = node_outputs
    if error_message is not None:
        row.error_message = error_message
    db.commit()
    db.refresh(row)
    return row


def list_executions(db: Session, limit: int = 50, offset: int = 0) -> List[WorkflowExecutionORM]:
    return (db.query(WorkflowExecutionORM)
            .order_by(WorkflowExecutionORM.created_at.desc())
            .offset(offset).limit(limit).all())


def get_execution(db: Session, execution_id: UUID) -> Optional[WorkflowExecutionORM]:
    return db.query(WorkflowExecutionORM).filter(WorkflowExecutionORM.id == execution_id).first()


def delete_execution(db: Session, execution_id: UUID) -> bool:
    row = db.query(WorkflowExecutionORM).filter(WorkflowExecutionORM.id == execution_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


def count_executions_today(db: Session) -> int:
    return db.query(WorkflowExecutionORM).filter(
        WorkflowExecutionORM.created_at >= func.now() - text("INTERVAL '1 day'")
    ).count()


def sum_cost_this_month(db: Session) -> float:
    result = db.query(func.sum(WorkflowExecutionORM.cost)).filter(
        WorkflowExecutionORM.created_at >= func.now() - text("INTERVAL '30 days'")
    ).scalar()
    return float(result or 0.0)


# ── Tool ──────────────────────────────────────────────────────────────────────

def create_tool(db: Session, *, name: str, description: str, method: str,
                url: str, headers: dict, body_template: str, api_key: str,
                api_key_header: str, api_key_prefix: str,
                timeout_seconds: int) -> ToolORM:
    tool = ToolORM(name=name, description=description, method=method,
                   url=url, headers=headers, body_template=body_template,
                   api_key=api_key, api_key_header=api_key_header,
                   api_key_prefix=api_key_prefix, timeout_seconds=timeout_seconds)
    db.add(tool); db.commit(); db.refresh(tool)
    return tool


def get_tool(db: Session, tool_id: UUID) -> Optional[ToolORM]:
    return db.query(ToolORM).filter(ToolORM.id == tool_id).first()


def list_tools(db: Session) -> List[ToolORM]:
    return db.query(ToolORM).order_by(ToolORM.created_at.desc()).all()


def update_tool(db: Session, tool_id: UUID, **kwargs) -> Optional[ToolORM]:
    row = db.query(ToolORM).filter(ToolORM.id == tool_id).first()
    if row is None:
        return None
    for key, value in kwargs.items():
        setattr(row, key, value)
    db.commit(); db.refresh(row)
    return row


def delete_tool(db: Session, tool_id: UUID) -> bool:
    row = db.query(ToolORM).filter(ToolORM.id == tool_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


def delete_workflow(db: Session, workflow_id: UUID) -> bool:
    row = db.query(WorkflowORM).filter(WorkflowORM.id == workflow_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


# ── Workflow schedules ────────────────────────────────────────────────────────

def create_schedule(db: Session, *, workflow_id: UUID, task: str,
                    cron_expression: Optional[str] = None,
                    interval_minutes: Optional[int] = None) -> WorkflowScheduleORM:
    row = WorkflowScheduleORM(workflow_id=workflow_id, task=task,
                               cron_expression=cron_expression,
                               interval_minutes=interval_minutes)
    db.add(row); db.commit(); db.refresh(row)
    return row


def get_schedule(db: Session, schedule_id: UUID) -> Optional[WorkflowScheduleORM]:
    return db.query(WorkflowScheduleORM).filter(WorkflowScheduleORM.id == schedule_id).first()


def list_schedules_for_workflow(db: Session, workflow_id: UUID) -> List[WorkflowScheduleORM]:
    return (db.query(WorkflowScheduleORM)
            .filter(WorkflowScheduleORM.workflow_id == workflow_id)
            .order_by(WorkflowScheduleORM.created_at.asc()).all())


def list_all_enabled_schedules(db: Session) -> List[WorkflowScheduleORM]:
    return (db.query(WorkflowScheduleORM)
            .filter(WorkflowScheduleORM.enabled.is_(True)).all())


def update_schedule(db: Session, schedule_id: UUID, **kwargs) -> Optional[WorkflowScheduleORM]:
    row = db.query(WorkflowScheduleORM).filter(WorkflowScheduleORM.id == schedule_id).first()
    if row is None:
        return None
    for key, value in kwargs.items():
        setattr(row, key, value)
    db.commit(); db.refresh(row)
    return row


def delete_schedule(db: Session, schedule_id: UUID) -> bool:
    row = db.query(WorkflowScheduleORM).filter(WorkflowScheduleORM.id == schedule_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


# ── Workflow channel integrations ─────────────────────────────────────────────

def create_integration(db: Session, *, workflow_id: UUID, channel_type: str,
                       config: dict) -> WorkflowIntegrationORM:
    row = WorkflowIntegrationORM(workflow_id=workflow_id, channel_type=channel_type, config=config)
    db.add(row); db.commit(); db.refresh(row)
    return row


def get_integration(db: Session, integration_id: UUID) -> Optional[WorkflowIntegrationORM]:
    return db.query(WorkflowIntegrationORM).filter(WorkflowIntegrationORM.id == integration_id).first()


def list_integrations_for_workflow(db: Session, workflow_id: UUID) -> List[WorkflowIntegrationORM]:
    return (db.query(WorkflowIntegrationORM)
            .filter(WorkflowIntegrationORM.workflow_id == workflow_id)
            .order_by(WorkflowIntegrationORM.created_at.asc()).all())


def list_enabled_integrations_for_workflow(db: Session, workflow_id: UUID) -> List[WorkflowIntegrationORM]:
    return (db.query(WorkflowIntegrationORM)
            .filter(WorkflowIntegrationORM.workflow_id == workflow_id,
                    WorkflowIntegrationORM.enabled.is_(True)).all())


def find_slack_integration_by_channel(db: Session, channel_id: str) -> Optional[WorkflowIntegrationORM]:
    """Find the first enabled Slack integration whose config contains the given channel_id."""
    rows = (db.query(WorkflowIntegrationORM)
              .filter(WorkflowIntegrationORM.channel_type == "slack",
                      WorkflowIntegrationORM.enabled.is_(True)).all())
    for row in rows:
        if (row.config or {}).get("channel_id") == channel_id:
            return row
    return None


# ── Channel bots ──────────────────────────────────────────────────────────────

def create_bot(db: Session, *, name: str, channel_type: str, config: dict) -> ChannelBotORM:
    row = ChannelBotORM(name=name, channel_type=channel_type, config=config)
    db.add(row); db.commit(); db.refresh(row)
    return row


def get_bot_by_id(db: Session, bot_id: UUID) -> Optional[ChannelBotORM]:
    return db.query(ChannelBotORM).filter(ChannelBotORM.id == bot_id).first()


def list_bots(db: Session) -> List[ChannelBotORM]:
    return db.query(ChannelBotORM).order_by(ChannelBotORM.created_at.asc()).all()


def update_bot(db: Session, bot_id: UUID, **kwargs) -> Optional[ChannelBotORM]:
    row = db.query(ChannelBotORM).filter(ChannelBotORM.id == bot_id).first()
    if row is None:
        return None
    for k, v in kwargs.items():
        setattr(row, k, v)
    db.commit(); db.refresh(row)
    return row


def delete_bot(db: Session, bot_id: UUID) -> bool:
    row = db.query(ChannelBotORM).filter(ChannelBotORM.id == bot_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


# ── Slack channel mappings ────────────────────────────────────────────────────

def create_slack_mapping(db: Session, *, bot_id: UUID, channel_id: str,
                         workflow_id: UUID, channel_name: Optional[str] = None) -> SlackChannelMappingORM:
    row = SlackChannelMappingORM(bot_id=bot_id, channel_id=channel_id,
                                  workflow_id=workflow_id, channel_name=channel_name)
    db.add(row); db.commit(); db.refresh(row)
    return row


def list_slack_mappings_for_bot(db: Session, bot_id: UUID) -> List[SlackChannelMappingORM]:
    return (db.query(SlackChannelMappingORM)
              .filter(SlackChannelMappingORM.bot_id == bot_id)
              .order_by(SlackChannelMappingORM.created_at.asc()).all())


def find_slack_mapping_by_channel(db: Session, channel_id: str) -> Optional[SlackChannelMappingORM]:
    """Return the first Slack mapping for a channel_id (across all enabled bots)."""
    return (db.query(SlackChannelMappingORM)
              .join(ChannelBotORM, SlackChannelMappingORM.bot_id == ChannelBotORM.id)
              .filter(SlackChannelMappingORM.channel_id == channel_id,
                      ChannelBotORM.enabled.is_(True))
              .first())


def delete_slack_mapping(db: Session, mapping_id: UUID) -> bool:
    row = db.query(SlackChannelMappingORM).filter(SlackChannelMappingORM.id == mapping_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True


# ── Telegram mappings scoped to a bot ─────────────────────────────────────────

def list_telegram_mappings_for_bot(db: Session, bot_id: UUID) -> List[TelegramChatMappingORM]:
    return (db.query(TelegramChatMappingORM)
              .filter(TelegramChatMappingORM.bot_id == bot_id)
              .order_by(TelegramChatMappingORM.created_at.asc()).all())


def set_chat_mapping_for_bot(db: Session, *, chat_id: str, workflow_id: UUID,
                              bot_id: UUID, username: Optional[str] = None) -> TelegramChatMappingORM:
    existing = db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id).first()
    if existing:
        existing.workflow_id = workflow_id
        existing.bot_id = bot_id
        existing.username = username
    else:
        existing = TelegramChatMappingORM(chat_id=chat_id, workflow_id=workflow_id,
                                           bot_id=bot_id, username=username)
        db.add(existing)
    db.commit(); db.refresh(existing)
    return existing


def update_integration(db: Session, integration_id: UUID, **kwargs) -> Optional[WorkflowIntegrationORM]:
    row = db.query(WorkflowIntegrationORM).filter(WorkflowIntegrationORM.id == integration_id).first()
    if row is None:
        return None
    for key, value in kwargs.items():
        setattr(row, key, value)
    db.commit(); db.refresh(row)
    return row


def delete_integration(db: Session, integration_id: UUID) -> bool:
    row = db.query(WorkflowIntegrationORM).filter(WorkflowIntegrationORM.id == integration_id).first()
    if row is None:
        return False
    db.delete(row); db.commit()
    return True
