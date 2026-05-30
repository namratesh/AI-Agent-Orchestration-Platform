"""
Slack Events API receiver.

Inbound message flow:
  1. Admin creates a Named Slack Bot in Settings, providing ``bot_token`` and
     ``signing_secret``.
  2. Admin registers ``{host}/slack/events`` as the Events API URL in the
     Slack app's Event Subscriptions settings.
  3. Admin adds ``channel_id → workflow`` mappings for the bot via
     ``POST /bots/{bot_id}/slack-mappings``.
  4. End users post messages in the mapped Slack channel.
  5. Slack POSTs to this endpoint with an HMAC-signed payload.
  6. Signature is verified, the workflow is dispatched in the background, and
     the result is posted back to the channel via ``chat.postMessage``.

Security:
  - HMAC-SHA256 signature verification guards against spoofed requests.
  - Requests with a timestamp older than 5 minutes are rejected to prevent
    replay attacks.
  - The ``bot_id`` header check is omitted (Slack doesn't send one); instead
    the channel_id is used to identify the correct bot and its signing secret.
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
    """Verify the Slack request signature using HMAC-SHA256.

    Rejects requests whose timestamp differs from the server clock by more than
    5 minutes to protect against replay attacks.

    Args:
        body_bytes: Raw request body bytes.
        timestamp: Value of the ``X-Slack-Request-Timestamp`` header.
        signature: Value of the ``X-Slack-Signature`` header.
        signing_secret: Bot signing secret from the Slack app settings.

    Returns:
        True if the signature is valid and fresh, False otherwise.
    """
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
    """Execute a workflow and post the result back to Slack.

    Runs in a FastAPI BackgroundTask so the Events endpoint can return 200
    immediately (Slack requires a response within 3 seconds).  Any workflow
    error is caught and reported to the channel so the user receives feedback.

    Args:
        workflow_id: UUID string of the workflow to execute.
        task: The message text from the Slack user, used as the workflow input.
        channel_id: Slack channel to reply to.
        bot_token: ``xoxb-…`` token for ``chat.postMessage`` calls.
        thread_ts: Thread timestamp to keep the reply in the same thread.
    """
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
    """Post a message to a Slack channel via the Web API.

    Truncates text to 40 000 characters (Slack's per-message limit).
    Errors are logged as warnings but not re-raised so a send failure does not
    propagate back to the caller.

    Args:
        bot_token: ``xoxb-…`` bearer token.
        channel_id: Target Slack channel.
        text: Message body.
        thread_ts: If set, the reply is posted within this thread.
    """
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
    """Receive and process Slack Events API payloads.

    Handles:
      - URL verification challenge (``type: url_verification``) sent once when
        the Events URL is registered in the Slack app settings.
      - ``message`` events for channels that have a bot mapping configured.

    Bot messages, message edits with subtypes, and messages without a channel
    mapping are silently acknowledged (returning ``{"ok": True}``) so Slack
    does not retry them.

    Returns 400 on malformed JSON, 403 on invalid HMAC signature.
    """
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

    # Verify HMAC signature — skip only if no signing_secret is configured.
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
