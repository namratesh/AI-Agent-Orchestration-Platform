"""
Redis pub/sub bridge for real-time execution streaming.

The RQ worker calls publish() (synchronous) after each node completes.
FastAPI WebSocket handlers call subscribe_execution() (async generator) to
forward those events to connected clients.
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
    """Publish a workflow event to the execution's Redis channel (fire-and-forget)."""
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
    """
    Async generator that yields events for a specific execution.

    Subscribes to Redis before yielding so events published after the caller
    connects are never missed.  Exits when a 'done' event arrives or timeout
    elapses.
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
