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
    if get_workflow(db, payload.workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    row = set_chat_mapping(db, chat_id=payload.chat_id,
                           workflow_id=payload.workflow_id, username=payload.username)
    logger.info("chat_mapping_set", chat_id=payload.chat_id,
                workflow_id=str(payload.workflow_id))
    return TelegramChatMapping.model_validate(row)


@router.get("/mappings", response_model=List[TelegramChatMapping])
def list_mappings_endpoint(db: Session = Depends(get_db)):
    return [TelegramChatMapping.model_validate(r) for r in list_chat_mappings(db)]


@router.delete("/mappings/{chat_id}", status_code=204)
def delete_mapping_endpoint(chat_id: str, db: Session = Depends(get_db)):
    if not delete_chat_mapping(db, chat_id):
        raise HTTPException(status_code=404, detail="Mapping not found")
    logger.info("chat_mapping_deleted", chat_id=chat_id)
