from __future__ import annotations
import asyncio
import json
from typing import Any, Dict, Optional, Set


class LogBroadcaster:
    def __init__(self) -> None:
        self._queues: Set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._queues.discard(q)

    def broadcast(self, event: Dict[str, Any]) -> None:
        if self._loop is None or not self._queues:
            return
        try:
            payload = json.loads(json.dumps(event, default=str))
        except Exception:
            return
        for q in list(self._queues):
            try:
                self._loop.call_soon_threadsafe(q.put_nowait, payload)
            except asyncio.QueueFull:
                pass


log_broadcaster = LogBroadcaster()
