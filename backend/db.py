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


# ── Session dependency ────────────────────────────────────────────────────────

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Agent helpers ─────────────────────────────────────────────────────────────

def create_agent(db: Session, *, name: str, role: str, system_prompt: str,
                 model: str, provider: str, tools: list, config: dict) -> AgentORM:
    agent = AgentORM(
        name=name, role=role, system_prompt=system_prompt,
        model=model, provider=provider, tools=tools, config=config,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def get_agent(db: Session, agent_id: UUID) -> Optional[AgentORM]:
    return db.query(AgentORM).filter(AgentORM.id == agent_id).first()


def list_agents(db: Session) -> List[AgentORM]:
    return db.query(AgentORM).order_by(AgentORM.created_at.desc()).all()


# ── Workflow helpers ──────────────────────────────────────────────────────────

def create_workflow(db: Session, *, name: str, definition: Dict[str, Any]) -> WorkflowORM:
    workflow = WorkflowORM(name=name, definition=definition)
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


def get_workflow(db: Session, workflow_id: UUID) -> Optional[WorkflowORM]:
    return db.query(WorkflowORM).filter(WorkflowORM.id == workflow_id).first()


def list_workflows(db: Session) -> List[WorkflowORM]:
    return db.query(WorkflowORM).order_by(WorkflowORM.created_at.desc()).all()


# ── Message helpers ───────────────────────────────────────────────────────────

def save_message(db: Session, *, workflow_id: Optional[UUID] = None,
                 sender_id: Optional[UUID] = None, receiver_id: Optional[UUID] = None,
                 content: str, message_type: str = "text",
                 tokens_used: int = 0, cost: float = 0.0) -> MessageORM:
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
    q = db.query(MessageORM)
    if workflow_id:
        q = q.filter(MessageORM.workflow_id == workflow_id)
    return q.order_by(MessageORM.timestamp.desc()).limit(limit).all()


# ── Checkpoint helpers ────────────────────────────────────────────────────────

def save_checkpoint(db: Session, *, workflow_id: UUID, node_id: str,
                    state: Dict[str, Any]) -> WorkflowExecutionCheckpointORM:
    cp = WorkflowExecutionCheckpointORM(
        workflow_id=workflow_id, node_id=node_id, state=state,
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp


def get_checkpoint(db: Session, workflow_id: UUID) -> Optional[WorkflowExecutionCheckpointORM]:
    return (
        db.query(WorkflowExecutionCheckpointORM)
        .filter(WorkflowExecutionCheckpointORM.workflow_id == workflow_id)
        .order_by(WorkflowExecutionCheckpointORM.timestamp.desc())
        .first()
    )


def list_checkpoints(db: Session, workflow_id: UUID) -> List[WorkflowExecutionCheckpointORM]:
    return (
        db.query(WorkflowExecutionCheckpointORM)
        .filter(WorkflowExecutionCheckpointORM.workflow_id == workflow_id)
        .order_by(WorkflowExecutionCheckpointORM.timestamp.asc())
        .all()
    )
