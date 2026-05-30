"""
Telegram webhook API router.

Inbound message flow (Named Bot path — preferred):
  1. Admin creates a Named Telegram Bot in Settings with a ``bot_token``.
  2. Admin registers the per-bot webhook URL with Telegram:
       POST https://api.telegram.org/bot{token}/setWebhook
       with url = {host}/telegram/webhook/{bot_id}
  3. Admin adds ``chat_id → workflow`` mappings via
       ``POST /bots/{bot_id}/telegram-mappings``.
  4. End users send messages in the mapped Telegram chat.
  5. Telegram POSTs the update to the per-bot webhook endpoint.
  6. The message is dispatched synchronously to the workflow executor and
     the result is replied to the chat.

Legacy path (``/telegram/webhook``):
  Uses the global ``TELEGRAM_BOT_TOKEN`` environment variable.  Kept for
  backward compatibility with single-bot deployments configured before the
  Named Bots system was introduced.
"""
from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from core.config import settings
from core.logging_config import get_logger
from db.db import (
    delete_chat_mapping, get_bot_by_id, get_db, get_workflow,
    list_chat_mappings, set_chat_mapping,
)
from schemas.models import TelegramChatMapping, TelegramChatMappingCreate
from services.telegram_handler import TelegramBot

router = APIRouter(prefix="/telegram", tags=["telegram"])
logger = get_logger(__name__)


# ── Per-bot webhook: /telegram/webhook/{bot_id} ───────────────────────────────

@router.post("/webhook/{bot_id}", status_code=200)
async def telegram_webhook_for_bot(
    bot_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    """Receive a Telegram update for a specific named bot.

    Looks up the bot by ``bot_id``, extracts its ``bot_token`` from the
    stored config, and delegates the update to ``TelegramBot.webhook()``.

    Returns 404 if the bot is not found or disabled, 500 if ``bot_token``
    is missing from the bot's configuration.
    """
    bot_row = get_bot_by_id(db, bot_id)
    if bot_row is None or not bot_row.enabled:
        raise HTTPException(status_code=404, detail="Bot not found")

    token = (bot_row.config or {}).get("bot_token", "")
    if not token:
        raise HTTPException(status_code=500, detail="Bot token not configured")

    update = await request.json()
    trace_id = request.state.trace_id
    logger.info("telegram_webhook_received", bot_id=str(bot_id),
                update_id=update.get("update_id"), trace_id=trace_id)

    TelegramBot(token).webhook(update, trace_id, bot_id=bot_id)
    return {"ok": True}


# ── Legacy global webhook (env-based token, backward compat) ──────────────────

@router.post("/webhook", status_code=200)
async def telegram_webhook_legacy(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(default=""),
):
    """Receive a Telegram update via the legacy single-bot webhook.

    Authenticates using the ``TELEGRAM_BOT_TOKEN`` environment variable.
    Chat-to-workflow mappings are looked up from the global mapping table
    (not bot-scoped).

    Returns 403 if a token is configured but the header value does not match.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if token and x_telegram_bot_api_secret_token != token:
        raise HTTPException(status_code=403, detail="Invalid token")

    update = await request.json()
    trace_id = request.state.trace_id
    logger.info("telegram_webhook_received_legacy", update_id=update.get("update_id"))

    TelegramBot(token).webhook(update, trace_id, bot_id=None)
    return {"ok": True}


# ── Global chat mapping endpoints (legacy, kept for backward compat) ──────────

@router.post("/mappings", response_model=TelegramChatMapping, status_code=201)
def create_mapping_endpoint(payload: TelegramChatMappingCreate,
                            db: Session = Depends(get_db)):
    """Create or replace a global chat_id → workflow mapping.

    Used with the legacy single-bot webhook path.  For Named Bot deployments,
    use ``POST /bots/{bot_id}/telegram-mappings`` instead.

    Returns 404 if the workflow does not exist.
    """
    if get_workflow(db, payload.workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    row = set_chat_mapping(db, chat_id=payload.chat_id,
                           workflow_id=payload.workflow_id, username=payload.username)
    logger.info("chat_mapping_set", chat_id=payload.chat_id,
                workflow_id=str(payload.workflow_id))
    return TelegramChatMapping.model_validate(row)


@router.get("/mappings", response_model=List[TelegramChatMapping])
def list_mappings_endpoint(db: Session = Depends(get_db)):
    """Return all global chat_id → workflow mappings."""
    return [TelegramChatMapping.model_validate(r) for r in list_chat_mappings(db)]


@router.delete("/mappings/{chat_id}", status_code=204)
def delete_mapping_endpoint(chat_id: str, db: Session = Depends(get_db)):
    """Delete a global chat mapping by chat ID.

    Returns 404 if not found.
    """
    if not delete_chat_mapping(db, chat_id):
        raise HTTPException(status_code=404, detail="Mapping not found")
    logger.info("chat_mapping_deleted", chat_id=chat_id)
