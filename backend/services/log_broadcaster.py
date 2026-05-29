from __future__ import annotations
import asyncio
import json
from collections import deque
from typing import Any, Dict, Optional, Set


class LogBroadcaster:
    def __init__(self, buffer_size: int = 200) -> None:
        self._queues: Set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        # Rolling buffer so new subscribers get recent history immediately.
        self._buffer: deque[Dict[str, Any]] = deque(maxlen=buffer_size)

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        # Pre-fill with buffered entries so the client sees recent history.
        for entry in self._buffer:
            try:
                q.put_nowait(entry)
            except asyncio.QueueFull:
                break
        self._queues.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._queues.discard(q)

    def broadcast(self, event: Dict[str, Any]) -> None:
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
