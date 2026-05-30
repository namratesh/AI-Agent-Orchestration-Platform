"""
Redis pub/sub bridge for real-time workflow execution streaming.

Architecture:
  - The RQ worker process calls ``publish()`` (synchronous) after each node
    completes and when the execution finishes.
  - FastAPI WebSocket handlers call ``subscribe_execution()`` (async generator)
    to forward those events to connected browser clients.

Both paths use separate Redis clients: a synchronous ``redis.Redis`` for the
worker (which runs outside the asyncio event loop) and an async
``redis.asyncio.Redis`` for the FastAPI side (which must not block the loop).

Graceful degradation:
  - If Redis is unavailable at startup, ``_PUBLISH_AVAILABLE`` is set to False
    and ``publish()`` becomes a no-op.  The WebSocket endpoint falls back to a
    final DB read to deliver the terminal event.
  - If ``redis.asyncio`` is not installed, ``subscribe_execution()`` yields
    nothing and the same DB fallback applies.
"""
from __future__ import annotations
import asyncio
import json

from core.config import settings
from core.logging_config import get_logger

logger = get_logger(__name__)

# ── Synchronous client — used by the RQ worker process ────────────────────────
try:
    import redis as sync_redis
    _sync = sync_redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    _sync.ping()
    _PUBLISH_AVAILABLE = True
except Exception as exc:
    _sync = None  # type: ignore[assignment]
    _PUBLISH_AVAILABLE = False
    logger.warning("stream_publisher_unavailable", error=str(exc))


def publish(execution_id: str, event: dict) -> None:
    """Publish a workflow event to the execution's Redis pub/sub channel.

    Fire-and-forget: errors are logged as warnings and swallowed so a Redis
    hiccup does not propagate into the workflow execution path.

    Args:
        execution_id: UUID string identifying the execution.
        event: Event dict to publish (must be JSON-serialisable).
    """
    if not _PUBLISH_AVAILABLE or _sync is None:
        return
    try:
        _sync.publish(
            f"execution:{execution_id}",
            json.dumps(event, default=str),
        )
    except Exception as exc:
        logger.warning("stream_publish_failed", execution_id=execution_id, error=str(exc))


# ── Async client — used by the FastAPI WebSocket handler ──────────────────────

async def subscribe_execution(execution_id: str, timeout: float = 600.0):
    """Async generator that yields events for a specific workflow execution.

    Subscribes to the Redis channel before yielding so events published after
    the caller connects are never missed.  Exits when a ``done`` event arrives
    or the ``timeout`` elapses.

    The caller is responsible for delivering a terminal event to the WebSocket
    client if this generator exits without receiving ``done`` (e.g. by reading
    the final status from the database).

    Args:
        execution_id: UUID string identifying the execution to subscribe to.
        timeout: Maximum seconds to wait for a ``done`` event before returning.

    Yields:
        Decoded event dicts as published by the RQ worker.
    """
    try:
        import redis.asyncio as aioredis
    except ImportError:
        logger.warning("aioredis_unavailable")
        return

    client = aioredis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = client.pubsub()
    channel = f"execution:{execution_id}"

    try:
        await pubsub.subscribe(channel)
        deadline = asyncio.get_event_loop().time() + timeout

        async for message in pubsub.listen():
            if asyncio.get_event_loop().time() > deadline:
                break
            if message["type"] != "message":
                continue
            try:
                event = json.loads(message["data"])
            except Exception:
                continue
            yield event
            if event.get("type") == "done":
                break
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await client.aclose()
        except Exception:
            pass
