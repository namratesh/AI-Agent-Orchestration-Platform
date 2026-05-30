"""
In-process log broadcasting for real-time WebSocket log streaming.

The ``LogBroadcaster`` sits between the structlog processor chain and the
``/ws/logs`` WebSocket endpoint.  Every log event passes through the
``_ws_broadcast`` processor (defined in ``logging_config.py``), which calls
``LogBroadcaster.broadcast()`` to fan out the event to all connected clients.

Design decisions:
  - Uses ``asyncio.Queue`` per subscriber rather than a single shared queue to
    isolate slow clients.  A full queue silently drops new events for that
    client rather than blocking the broadcaster.
  - Maintains a rolling deque buffer of the last ``buffer_size`` events so new
    subscribers receive recent history immediately without needing a separate
    fetch call.
  - ``broadcast()`` uses ``call_soon_threadsafe`` because structlog processors
    run on the main thread (or worker threads), while the asyncio event loop
    runs on the main thread.  The thread-safe call ensures correct behaviour
    when log events are emitted from RQ worker threads or APScheduler threads.
"""
from __future__ import annotations
import asyncio
import json
from collections import deque
from typing import Any, Dict, Optional, Set


class LogBroadcaster:
    """Fan-out broadcaster that distributes log events to all WebSocket subscribers.

    Thread-safe for producers (structlog processors running in any thread);
    subscribers must be coroutines running on the same asyncio event loop.
    """

    def __init__(self, buffer_size: int = 200) -> None:
        """Initialise the broadcaster with an empty subscriber set and ring buffer.

        Args:
            buffer_size: Maximum number of recent events to retain for late
                subscribers.  Older events are dropped when the buffer is full.
        """
        self._queues: Set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._buffer: deque[Dict[str, Any]] = deque(maxlen=buffer_size)

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Register the running asyncio event loop for thread-safe dispatch.

        Must be called once during application startup after the event loop is
        available (i.e. inside an ``async def`` startup handler).

        Args:
            loop: The running asyncio event loop.
        """
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        """Register a new subscriber and return its dedicated queue.

        Pre-fills the queue with buffered events so the subscriber immediately
        sees recent log history.  Stops pre-filling if the queue reaches its
        maximum capacity.

        Returns:
            An ``asyncio.Queue`` that will receive future broadcast events.
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        for entry in self._buffer:
            try:
                q.put_nowait(entry)
            except asyncio.QueueFull:
                break
        self._queues.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Remove a subscriber queue.  A no-op if the queue is not registered.

        Args:
            q: The queue returned by a previous ``subscribe()`` call.
        """
        self._queues.discard(q)

    def broadcast(self, event: Dict[str, Any]) -> None:
        """Fan out a log event to all subscribers.

        Serialises the event through ``json.dumps`` + ``json.loads`` to ensure
        it is JSON-safe before enqueuing.  Non-serialisable values are coerced
        to strings via ``default=str``.

        Full subscriber queues silently drop the event rather than blocking.

        Args:
            event: The structlog event dict to broadcast.
        """
        try:
            payload = json.loads(json.dumps(event, default=str))
        except Exception:
            return
        self._buffer.append(payload)
        if self._loop is None or not self._queues:
            return
        for q in list(self._queues):
            try:
                self._loop.call_soon_threadsafe(q.put_nowait, payload)
            except asyncio.QueueFull:
                pass


log_broadcaster = LogBroadcaster()
