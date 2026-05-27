from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, create_engine, func, or_, text
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
    created_at  = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


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
    created_at            = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


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
                   source: str = "ui") -> WorkflowExecutionORM:
    row = WorkflowExecutionORM(workflow_id=workflow_id, task=task, result=result,
                               status=status, tokens_used=tokens_used, cost=cost,
                               execution_time_seconds=execution_time_seconds, source=source)
    db.add(row); db.commit(); db.refresh(row)
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
