"""
Live structured log streaming WebSocket endpoint.

Clients connect to ``/ws/logs`` to receive a real-time stream of all log events
emitted by the platform.  New subscribers immediately receive up to 200 buffered
recent entries so the log panel is not blank on first load.

A 30-second ping is sent when no log events are produced, keeping the connection
alive through proxies and load balancers that close idle WebSocket connections.
"""
from __future__ import annotations
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.log_broadcaster import log_broadcaster

router = APIRouter(tags=["logs"])


@router.websocket("/ws/logs")
async def logs_websocket(websocket: WebSocket) -> None:
    """Stream structured log events to a connected WebSocket client.

    Subscribes to the ``LogBroadcaster`` on connect and unsubscribes on
    disconnect or error.  Sends a ``{"type": "ping"}`` heartbeat every 30
    seconds to prevent idle connection timeouts.
    """
    await websocket.accept()
    q = log_broadcaster.subscribe()
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=30.0)
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        log_broadcaster.unsubscribe(q)
