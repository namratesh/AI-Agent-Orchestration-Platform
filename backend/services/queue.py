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
