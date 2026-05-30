"""
RQ (Redis Queue) connection and execution queue setup.

Provides a single ``execution_queue`` instance used by the workflow execution
API to dispatch long-running workflow jobs to a dedicated worker process.

Graceful degradation:
  If Redis is unreachable at startup (e.g. local development without Docker),
  ``QUEUE_AVAILABLE`` is set to False and ``execution_queue`` is None.  The
  workflow API detects this and falls back to FastAPI BackgroundTasks, which
  runs the workflow in the same process without retry guarantees.
"""
from __future__ import annotations

from core.config import settings
from core.logging_config import get_logger

logger = get_logger(__name__)

try:
    import redis
    from rq import Queue

    _conn = redis.Redis.from_url(settings.REDIS_URL)
    _conn.ping()
    execution_queue: Queue | None = Queue("executions", connection=_conn)
    QUEUE_AVAILABLE = True
    logger.info("rq_queue_ready", queue="executions")
except Exception as exc:
    execution_queue = None
    QUEUE_AVAILABLE = False
    logger.warning("rq_queue_unavailable", error=str(exc))
