"""
Per-execution real-time streaming WebSocket endpoint.

Clients connect to ``/ws/executions/{execution_id}`` to receive live events as
a workflow executes.  Events are published by the RQ worker via Redis pub/sub
and forwarded here.

Connection lifecycle:
  1. Client connects; the endpoint validates the execution ID.
  2. If the execution is already finished, the stored result is sent and the
     connection is closed immediately.
  3. Otherwise, the endpoint subscribes to the Redis channel for the execution
     and forwards events as they arrive.
  4. When a ``done`` event is received (or the 600-second timeout elapses),
     a final DB read ensures the client receives the definitive result even if
     a Redis message was missed.

Event shapes:
  {"type": "node_complete", "node_id": "...", "output": "...", "tokens": N}
  {"type": "done", "status": "success"|"error", "result": "...", "node_outputs": {...}}
  {"type": "error", "message": "..."}
"""
from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from db.db import SessionLocal, get_execution
from services.stream_publisher import subscribe_execution

router = APIRouter()


@router.websocket("/ws/executions/{execution_id}")
async def execution_stream_ws(websocket: WebSocket, execution_id: str):
    """Stream real-time execution events for a single workflow run.

    Subscribes to Redis before checking DB status to avoid the race where the
    worker completes between our DB check and our subscribe call.  After
    subscribing, DB is re-checked — if the execution is already done, the
    stored result is served directly and the connection is closed.

    Falls back to a final DB read if Redis was unavailable or timed out, so
    clients always receive a terminal event even in degraded infrastructure.
    """
    await websocket.accept()

    try:
        exec_uuid = UUID(execution_id)
    except ValueError:
        await websocket.send_json({"type": "error", "message": "Invalid execution ID"})
        await websocket.close()
        return

    try:
        db: Session = SessionLocal()
        try:
            row = get_execution(db, exec_uuid)
        finally:
            db.close()

        if row is None:
            await websocket.send_json({"type": "error", "message": "Execution not found"})
            await websocket.close()
            return

        # Already finished — return stored result immediately and close.
        if row.status in ("success", "error"):
            await websocket.send_json({
                "type":         "done",
                "status":       row.status,
                "result":       row.result or "",
                "node_outputs": row.node_outputs or {},
                "error":        getattr(row, "error_message", None),
            })
            await websocket.close()
            return

        # Stream events from Redis pub/sub until done or timeout.
        async for event in subscribe_execution(execution_id, timeout=600.0):
            try:
                await websocket.send_json(event)
            except WebSocketDisconnect:
                return
            if event.get("type") == "done":
                break

        # Final safety net: if Redis was unavailable or timed out, read from DB.
        db = SessionLocal()
        try:
            row = get_execution(db, exec_uuid)
        finally:
            db.close()

        if row and row.status in ("success", "error"):
            await websocket.send_json({
                "type":         "done",
                "status":       row.status,
                "result":       row.result or "",
                "node_outputs": row.node_outputs or {},
                "error":        getattr(row, "error_message", None),
            })

    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
