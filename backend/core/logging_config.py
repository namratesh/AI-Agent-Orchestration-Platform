"""
Structured logging configuration using structlog.

All log entries are emitted as JSON, which makes them machine-parseable by log
aggregators (Loki, Datadog, CloudWatch, etc.).  A custom processor
``_ws_broadcast`` intercepts every log event and forwards it to the
``LogBroadcaster`` so the frontend ``/ws/logs`` WebSocket receives live log
streams without polling.

Processor chain (applied in order):
  1. Add log level string.
  2. Add logger name.
  3. Timestamp in ISO-8601 format.
  4. Render stack traces and exception chains.
  5. Broadcast to WebSocket subscribers.
  6. Serialize to JSON.
"""
import json
import logging
import os
import structlog
from core.config import settings

_LOG_CHANNEL = "platform:logs"

# Lazy Redis client used only in the worker process (no asyncio loop).
_redis_pub = None


def _get_redis_pub():
    global _redis_pub
    if _redis_pub is None:
        import redis as _redis
        _redis_pub = _redis.Redis.from_url(os.getenv("REDIS_URL", settings.REDIS_URL))
    return _redis_pub


def _ws_broadcast(logger, method, event_dict):
    """structlog processor — forward every log event to the WebSocket broadcaster.

    In the backend process (asyncio loop available): broadcasts directly via
    LogBroadcaster so WebSocket clients receive the event in-process.

    In the worker process (no asyncio loop): publishes the event to the Redis
    pub/sub channel ``platform:logs`` so the backend relay task picks it up.
    """
    from services.log_broadcaster import log_broadcaster
    if log_broadcaster._loop is not None:
        # Backend process — broadcast directly.
        log_broadcaster.broadcast(dict(event_dict))
    else:
        # Worker process — publish to Redis for the backend relay.
        try:
            _get_redis_pub().publish(
                _LOG_CHANNEL, json.dumps(dict(event_dict), default=str)
            )
        except Exception:
            pass
    return event_dict


def setup_logging() -> None:
    """Configure structlog with JSON output and WebSocket broadcasting.

    Must be called once during application startup before any log messages are
    emitted.  Calling it multiple times is safe but redundant.
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    logging.basicConfig(format="%(message)s", level=log_level)

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            _ws_broadcast,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """Return a structlog bound logger for the given module name.

    Usage::

        logger = get_logger(__name__)
        logger.info("event_name", key="value")
    """
    return structlog.get_logger(name)
