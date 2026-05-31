"""
AI Agent Orchestration Platform — FastAPI application entry point.

Responsibilities:
  - Assemble all API routers with optional Bearer-token auth.
  - Mount Prometheus metrics endpoint (/metrics).
  - Bootstrap structured logging, OpenTelemetry, APScheduler, and demo seed data
    on startup.
  - Inject a per-request X-Trace-ID header for distributed tracing correlation.

Webhook/WebSocket routers (Slack, Telegram, /ws/*) are intentionally excluded
from API-key enforcement because HTTP clients cannot attach Authorization headers
to WebSocket upgrades, and Slack/Telegram authenticate via their own mechanisms.
"""
from __future__ import annotations
import asyncio
import json
import uuid

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app
import redis.asyncio as aioredis

from api import agents, bots, execution_stream, executions, integrations, logs, schedules, seed, slack, stats, telegram, tools, workflows
from core.auth import require_api_key
from core.config import settings
from core.logging_config import _LOG_CHANNEL, get_logger, setup_logging
from db.db import engine
from db.seed import seed_demo_data
from instrumentation import setup_otel
from services import scheduler as svc_scheduler
from services.log_broadcaster import log_broadcaster

app = FastAPI(
    title="AI Agent Orchestration Platform",
    description="Multi-agent workflow orchestration with LangGraph, APScheduler, and real-time streaming.",
    version="1.0.0",
)
logger = get_logger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(require_api_key)]

# Prometheus metrics endpoint — populated by OTel PrometheusMetricReader
app.mount("/metrics", make_asgi_app())

# Webhooks and WebSocket endpoints cannot carry Authorization headers — no API key.
app.include_router(slack.router)
app.include_router(telegram.router)
app.include_router(logs.router)              # /ws/logs — live structured log stream
app.include_router(execution_stream.router)  # /ws/executions/{id} — per-execution stream

# All UI-facing routers require a valid API key when API_SECRET_KEY is set.
app.include_router(agents.router,       dependencies=_auth)
app.include_router(workflows.router,    dependencies=_auth)
app.include_router(schedules.router,    dependencies=_auth)
app.include_router(integrations.router, dependencies=_auth)
app.include_router(bots.router,         dependencies=_auth)
app.include_router(executions.router,   dependencies=_auth)
app.include_router(stats.router,        dependencies=_auth)
app.include_router(tools.router,        dependencies=_auth)
app.include_router(seed.router,         dependencies=_auth)


_redis_relay_task: asyncio.Task | None = None


async def _redis_log_relay() -> None:
    """Subscribe to the Redis log pub/sub channel and relay worker logs to WebSocket clients."""
    r = aioredis.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()
    await pubsub.subscribe(_LOG_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                event = json.loads(message["data"])
                log_broadcaster.broadcast(event)
            except Exception:
                pass
    finally:
        await pubsub.unsubscribe(_LOG_CHANNEL)
        await r.aclose()


@app.on_event("startup")
async def startup() -> None:
    """Initialize all platform services on application startup.

    Order matters: logging must be configured first so that all subsequent
    service startup messages are captured and broadcast correctly.
    """
    global _redis_relay_task
    setup_logging()
    setup_otel(app=app, engine=engine)
    log_broadcaster.set_loop(asyncio.get_event_loop())
    _redis_relay_task = asyncio.create_task(_redis_log_relay())
    svc_scheduler.start()
    seed_demo_data()
    logger.info("app_startup", message="AI Agent Orchestration Platform starting")


@app.on_event("shutdown")
async def shutdown() -> None:
    """Gracefully stop background services on application shutdown."""
    global _redis_relay_task
    if _redis_relay_task:
        _redis_relay_task.cancel()
    svc_scheduler.stop()


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next) -> Response:
    """Attach a unique trace ID to every request and expose it in the response.

    The trace ID is stored on ``request.state.trace_id`` so that route handlers
    and downstream services can include it in log entries and OTel spans for
    end-to-end correlation across service boundaries.
    """
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    response: Response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    return response
