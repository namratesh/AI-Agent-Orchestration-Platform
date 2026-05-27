from __future__ import annotations
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from core.config import settings
from core.logging_config import get_logger
from db.db import delete_chat_mapping, get_db, get_workflow, list_chat_mappings, set_chat_mapping
from schemas.models import TelegramChatMapping, TelegramChatMappingCreate
from services.telegram_handler import get_bot

router = APIRouter(prefix="/telegram", tags=["telegram"])
logger = get_logger(__name__)


@router.post("/webhook", status_code=200)
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(default=""),
):
    if (settings.TELEGRAM_BOT_TOKEN
            and x_telegram_bot_api_secret_token != settings.TELEGRAM_BOT_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid token")

    update = await request.json()
    trace_id = request.state.trace_id
    logger.info("telegram_webhook_received", trace_id=trace_id,
                update_id=update.get("update_id"))

    get_bot().webhook(update, trace_id)
    return {"ok": True}


@router.post("/mappings", response_model=TelegramChatMapping, status_code=201)
def create_mapping_endpoint(payload: TelegramChatMappingCreate, db: Session = Depends(get_db)):
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
