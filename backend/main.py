from __future__ import annotations
import asyncio
import uuid

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from api import agents, bots, executions, integrations, logs, schedules, seed, slack, stats, telegram, tools, workflows
from core.auth import require_api_key
from core.config import settings
from core.logging_config import get_logger, setup_logging
from db.db import engine
from db.seed import seed_demo_data
from instrumentation import setup_otel
from services import scheduler as svc_scheduler
from services.log_broadcaster import log_broadcaster

app = FastAPI(title="AI Agent Orchestration Platform")
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

# Webhooks are authenticated by their own HMAC/token mechanisms — no API key.
app.include_router(slack.router)
app.include_router(telegram.router)

# All UI-facing routers require a valid API key when API_SECRET_KEY is set.
app.include_router(agents.router,       dependencies=_auth)
app.include_router(workflows.router,    dependencies=_auth)
app.include_router(schedules.router,    dependencies=_auth)
app.include_router(integrations.router, dependencies=_auth)
app.include_router(bots.router,         dependencies=_auth)
app.include_router(logs.router,         dependencies=_auth)
app.include_router(executions.router,   dependencies=_auth)
app.include_router(stats.router,        dependencies=_auth)
app.include_router(tools.router,        dependencies=_auth)
app.include_router(seed.router,         dependencies=_auth)


@app.on_event("startup")
async def startup():
    setup_logging()
    setup_otel(app=app, engine=engine)
    log_broadcaster.set_loop(asyncio.get_event_loop())
    svc_scheduler.start()
    seed_demo_data()
    logger.info("app_startup", message="AI Agent Orchestration Platform starting")


@app.on_event("shutdown")
async def shutdown():
    svc_scheduler.stop()


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    response: Response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    return response
