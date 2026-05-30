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
import logging
import structlog
from core.config import settings


def _ws_broadcast(logger, method, event_dict):
    """structlog processor — forward every log event to the WebSocket broadcaster.

    Imported lazily to avoid a circular import at module load time (logging_config
    is imported by many modules; log_broadcaster imports nothing from core).
    """
    from services.log_broadcaster import log_broadcaster
    log_broadcaster.broadcast(dict(event_dict))
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
