"""Database setup, ORM models, and CRUD helper functions."""

from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import (
    Column, DateTime, Integer, Numeric, String, Text, create_engine
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


class AgentORM(Base):
    """ORM model representing an AI agent."""
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
    """ORM model representing a workflow definition."""
    __tablename__ = "workflows"

    id         = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(Text, nullable=False)
    definition = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class MessageORM(Base):
    """ORM model representing a message exchanged between agents or system."""
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
    """ORM model representing a workflow execution state checkpoint."""
    __tablename__ = "workflow_execution_checkpoints"

    id          = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(PG_UUID(as_uuid=True), nullable=False)
    node_id     = Column(Text, nullable=False)
    state       = Column(JSONB, nullable=False, default=dict)
    timestamp   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class TelegramChatMappingORM(Base):
    """ORM model mapping a Telegram chat_id to a workflow."""
    __tablename__ = "telegram_chat_mappings"

    chat_id     = Column(Text, primary_key=True)
    workflow_id = Column(PG_UUID(as_uuid=True), nullable=False)
    username    = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


# ── Session dependency ────────────────────────────────────────────────────────

def get_db() -> Session:
    """Yield a database session and ensure it is closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Agent helpers ─────────────────────────────────────────────────────────────

def create_agent(db: Session, *, name: str, role: str, system_prompt: str,
                 model: str, provider: str, tools: list, config: dict) -> AgentORM:
    """Create and return a new agent record."""
    agent = AgentORM(
        name=name, role=role, system_prompt=system_prompt,
        model=model, provider=provider, tools=tools, config=config,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def get_agent(db: Session, agent_id: UUID) -> Optional[AgentORM]:
    """Retrieve a single agent by ID."""
    return db.query(AgentORM).filter(AgentORM.id == agent_id).first()


def list_agents(db: Session) -> List[AgentORM]:
    """List all agents ordered by creation date descending."""
    return db.query(AgentORM).order_by(AgentORM.created_at.desc()).all()


# ── Workflow helpers ──────────────────────────────────────────────────────────

def create_workflow(db: Session, *, name: str, definition: Dict[str, Any]) -> WorkflowORM:
    """Create and return a new workflow definition."""
    workflow = WorkflowORM(name=name, definition=definition)
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


def get_workflow(db: Session, workflow_id: UUID) -> Optional[WorkflowORM]:
    """Retrieve a single workflow definition by ID."""
    return db.query(WorkflowORM).filter(WorkflowORM.id == workflow_id).first()


def list_workflows(db: Session) -> List[WorkflowORM]:
    """List all workflow definitions ordered by creation date descending."""
    return db.query(WorkflowORM).order_by(WorkflowORM.created_at.desc()).all()


# ── Message helpers ───────────────────────────────────────────────────────────

def save_message(db: Session, *, workflow_id: Optional[UUID] = None,
                 sender_id: Optional[UUID] = None, receiver_id: Optional[UUID] = None,
                 content: str, message_type: str = "text",
                 tokens_used: int = 0, cost: float = 0.0) -> MessageORM:
    """Save a new chat message to the database."""
    msg = MessageORM(
        workflow_id=workflow_id, sender_id=sender_id, receiver_id=receiver_id,
        content=content, message_type=message_type,
        tokens_used=tokens_used, cost=cost,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_messages(db: Session, workflow_id: Optional[UUID] = None,
                 limit: int = 100) -> List[MessageORM]:
    """Retrieve messages for a workflow up to a given limit."""
    q = db.query(MessageORM)
    if workflow_id:
        q = q.filter(MessageORM.workflow_id == workflow_id)
    return q.order_by(MessageORM.timestamp.desc()).limit(limit).all()


# ── Checkpoint helpers ────────────────────────────────────────────────────────

def save_checkpoint(db: Session, *, workflow_id: UUID, node_id: str,
                    state: Dict[str, Any]) -> WorkflowExecutionCheckpointORM:
    """Save a new state checkpoint for a workflow execution node."""
    cp = WorkflowExecutionCheckpointORM(
        workflow_id=workflow_id, node_id=node_id, state=state,
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp


def get_checkpoint(db: Session, workflow_id: UUID) -> Optional[WorkflowExecutionCheckpointORM]:
    """Get the latest state checkpoint for a workflow."""
    return (
        db.query(WorkflowExecutionCheckpointORM)
        .filter(WorkflowExecutionCheckpointORM.workflow_id == workflow_id)
        .order_by(WorkflowExecutionCheckpointORM.timestamp.desc())
        .first()
    )


# ── Telegram chat mapping helpers ─────────────────────────────────────────────

def set_chat_mapping(db: Session, *, chat_id: str, workflow_id: UUID,
                     username: Optional[str] = None) -> TelegramChatMappingORM:
    """Upsert a chat_id → workflow_id mapping."""
    existing = db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id
    ).first()
    if existing:
        existing.workflow_id = workflow_id
        existing.username = username
    else:
        existing = TelegramChatMappingORM(
            chat_id=chat_id, workflow_id=workflow_id, username=username
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return existing


def get_chat_mapping(db: Session, chat_id: str) -> Optional[TelegramChatMappingORM]:
    """Return the mapping row for a given chat_id, or None."""
    return db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id
    ).first()


def list_chat_mappings(db: Session) -> List[TelegramChatMappingORM]:
    """List all chat_id → workflow_id mappings."""
    return db.query(TelegramChatMappingORM).order_by(
        TelegramChatMappingORM.created_at.desc()
    ).all()


def delete_chat_mapping(db: Session, chat_id: str) -> bool:
    """Delete a mapping; return True if it existed."""
    row = db.query(TelegramChatMappingORM).filter(
        TelegramChatMappingORM.chat_id == chat_id
    ).first()
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def list_checkpoints(db: Session, workflow_id: UUID) -> List[WorkflowExecutionCheckpointORM]:
    """List all checkpoints for a workflow ordered by timestamp ascending."""
    return (
        db.query(WorkflowExecutionCheckpointORM)
        .filter(WorkflowExecutionCheckpointORM.workflow_id == workflow_id)
        .order_by(WorkflowExecutionCheckpointORM.timestamp.asc())
        .all()
    )
