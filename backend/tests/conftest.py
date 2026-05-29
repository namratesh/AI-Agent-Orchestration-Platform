"""Shared fixtures for the test suite.

Uses SQLite in-memory so tests run without a live PostgreSQL instance.
SQLite doesn't support JSONB; we register a custom compilation rule so that
JSONB columns are rendered as JSON when the SQLite dialect is used.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import JSON, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.db import Base, get_db

# Teach SQLite to render JSONB columns as JSON.
SQLiteTypeCompiler.visit_JSONB = SQLiteTypeCompiler.visit_JSON  # type: ignore[attr-defined]

# SQLite in-memory engine with a single connection (required by StaticPool).
_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# SQLite doesn't enforce FK constraints by default; enable them so cascade
# deletes are exercised during tests.
@event.listens_for(_engine, "connect")
def _set_sqlite_pragma(connection, _record):
    connection.execute("PRAGMA foreign_keys=ON")


_TestingSessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture()
def db():
    """Yield a DB session that rolls back after each test."""
    connection = _engine.connect()
    transaction = connection.begin()
    session = _TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db):
    """FastAPI TestClient with the DB dependency overridden to the test session."""
    # Import app here to avoid importing before tables are created.
    from main import app  # noqa: PLC0415

    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
