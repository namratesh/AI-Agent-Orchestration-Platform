from __future__ import annotations
import uuid

from fastapi import FastAPI, Request, Response

from api import agents, workflows, telegram
from core.logging_config import get_logger, setup_logging

app = FastAPI(title="AI Agent Orchestration Platform")
logger = get_logger(__name__)

app.include_router(agents.router)
app.include_router(workflows.router)
app.include_router(telegram.router)


@app.on_event("startup")
async def startup():
    setup_logging()
    logger.info("app_startup", message="AI Agent Orchestration Platform starting")


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    response: Response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    return response
