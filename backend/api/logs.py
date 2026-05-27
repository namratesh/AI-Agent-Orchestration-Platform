from __future__ import annotations
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.log_broadcaster import log_broadcaster

router = APIRouter(tags=["logs"])


@router.websocket("/ws/logs")
async def logs_websocket(websocket: WebSocket) -> None:
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
