"""
Slack Events API receiver.

Flow:
  1. Admin creates a named Slack bot in Settings, enters bot_token + signing_secret.
  2. Admin registers {host}/slack/events as the Events API URL in their Slack app.
  3. Admin adds channel → workflow mappings for the bot.
  4. End users message the Slack channel — Slack POSTs here.
  5. We verify signature, find the mapping, run the workflow, reply via chat.postMessage.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import SessionLocal, find_slack_mapping_by_channel, get_bot_by_id, get_db
from services.workflow_executor import workflow_executor

router = APIRouter(prefix="/slack", tags=["slack"])
logger = get_logger(__name__)


# ── Signature verification ────────────────────────────────────────────────────

def _verify_signature(body_bytes: bytes, timestamp: str, signature: str,
                      signing_secret: str) -> bool:
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except (ValueError, TypeError):
        return False
    sig_base = f"v0:{timestamp}:{body_bytes.decode('utf-8')}"
    expected = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        sig_base.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Background: run workflow and reply ────────────────────────────────────────

def _run_and_reply(workflow_id: str, task: str, channel_id: str,
                   bot_token: str, thread_ts: Optional[str]) -> None:
    trace_id = str(uuid.uuid4())
    try:
        outcome = workflow_executor.execute(
            workflow_id=uuid.UUID(workflow_id),
            task=task, trace_id=trace_id, source="slack",
        )
        reply = outcome["result"]
    except Exception as exc:
        reply = f"Workflow error: {exc}"
    _post_message(bot_token, channel_id, reply, thread_ts)


def _post_message(bot_token: str, channel_id: str, text: str,
                  thread_ts: Optional[str] = None) -> None:
    payload: dict = {"channel": channel_id, "text": text[:40000]}
    if thread_ts:
        payload["thread_ts"] = thread_ts
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {bot_token}",
                         "Content-Type": "application/json; charset=utf-8"},
                json=payload,
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning("slack_post_failed", error=data.get("error"))
    except Exception as exc:
        logger.warning("slack_post_error", error=str(exc))


# ── Events endpoint ───────────────────────────────────────────────────────────

@router.post("/events")
async def slack_events(request: Request, background_tasks: BackgroundTasks,
                       db: Session = Depends(get_db)):
    body_bytes = await request.body()
    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # URL verification challenge (sent once when you register the Events URL)
    if body.get("type") == "url_verification":
        return {"challenge": body["challenge"]}

    event = body.get("event", {})
    if event.get("type") != "message" or event.get("bot_id") or event.get("subtype"):
        return {"ok": True}

    channel_id = event.get("channel", "")
    text       = (event.get("text") or "").strip()
    thread_ts  = event.get("thread_ts") or event.get("ts")

    if not channel_id or not text:
        return {"ok": True}

    # Find the Slack channel mapping (joins to enabled channel_bots)
    mapping = find_slack_mapping_by_channel(db, channel_id)
    if mapping is None:
        logger.info("slack_event_no_mapping", channel_id=channel_id)
        return {"ok": True}

    bot_row = get_bot_by_id(db, mapping.bot_id)
    if bot_row is None:
        return {"ok": True}

    cfg            = bot_row.config or {}
    signing_secret = cfg.get("signing_secret", "")
    bot_token      = cfg.get("bot_token", "")

    # Verify HMAC signature
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    if signing_secret and not _verify_signature(body_bytes, timestamp, signature, signing_secret):
        logger.warning("slack_invalid_signature", channel_id=channel_id)
        raise HTTPException(status_code=403, detail="Invalid Slack signature")

    logger.info("slack_message_received", channel_id=channel_id,
                bot=bot_row.name, workflow_id=str(mapping.workflow_id),
                text_preview=text[:80])

    background_tasks.add_task(
        _run_and_reply,
        workflow_id=str(mapping.workflow_id),
        task=text,
        channel_id=channel_id,
        bot_token=bot_token,
        thread_ts=thread_ts,
    )
    return {"ok": True}
