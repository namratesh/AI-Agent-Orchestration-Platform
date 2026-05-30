"""
Named Bot CRUD and channel mapping endpoints.

Bots are globally configured messaging gateways.  Each bot has a name,
credentials stored in the database, and a set of channel → workflow mappings
that determine which workflow handles incoming messages.

  Telegram bots  →  unique webhook URL: /telegram/webhook/{bot_id}
  Slack bots     →  shared events URL: /slack/events (differentiated by channel_id)

Sensitive credential fields (``bot_token``, ``signing_secret``) are masked in
all read responses so they are never exposed to the frontend after creation.
"""
from __future__ import annotations
import copy
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.db import (
    create_bot, create_slack_mapping, delete_bot, delete_slack_mapping,
    delete_chat_mapping, get_bot_by_id, get_db, get_workflow,
    list_bots, list_slack_mappings_for_bot, list_telegram_mappings_for_bot,
    set_chat_mapping_for_bot, update_bot,
)
from schemas.models import (
    BotCreate, BotUpdate, ChannelBot, SlackChannelMapping, SlackMappingCreate,
    TelegramChatMapping, TelegramChatMappingCreate,
)

router = APIRouter(prefix="/bots", tags=["bots"])

_MASKED = "••••••••••••••••"


def _mask_config(config: dict) -> dict:
    """Return a deep copy of ``config`` with sensitive credential fields replaced by a mask.

    Masking is applied to ``bot_token`` and ``signing_secret`` so that read
    responses never leak credentials that were submitted at create/update time.
    """
    masked = copy.deepcopy(config)
    for field in ("bot_token", "signing_secret"):
        if masked.get(field):
            masked[field] = _MASKED
    return masked


def _bot_response(row) -> ChannelBot:
    """Convert an ORM bot row to a masked Pydantic response model."""
    return ChannelBot(
        id=row.id, name=row.name, channel_type=row.channel_type,
        config=_mask_config(row.config or {}),
        enabled=row.enabled, created_at=row.created_at,
    )


# ── Bot CRUD ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ChannelBot])
def list_bots_endpoint(db: Session = Depends(get_db)):
    """Return all configured bots with credentials masked."""
    return [_bot_response(r) for r in list_bots(db)]


@router.post("", response_model=ChannelBot, status_code=201)
def create_bot_endpoint(payload: BotCreate, db: Session = Depends(get_db)):
    """Create a new messaging bot.

    Validates that required credentials are present for the given channel type
    before persisting.  Returns 409 on name collision, 422 on config validation
    failure.
    """
    try:
        payload.validate_config()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    try:
        row = create_bot(db, name=payload.name, channel_type=payload.channel_type,
                         config=payload.config)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A bot named '{payload.name}' already exists.")
    return _bot_response(row)


@router.put("/{bot_id}", response_model=ChannelBot)
def update_bot_endpoint(bot_id: UUID, payload: BotUpdate, db: Session = Depends(get_db)):
    """Update a bot's name, config, or enabled state.

    Returns 404 if not found, 409 on name collision.
    """
    if get_bot_by_id(db, bot_id) is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    kwargs = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        row = update_bot(db, bot_id, **kwargs)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail=f"A bot named '{kwargs.get('name')}' already exists.")
    return _bot_response(row)


@router.delete("/{bot_id}", status_code=204)
def delete_bot_endpoint(bot_id: UUID, db: Session = Depends(get_db)):
    """Delete a bot and all its channel mappings.

    Returns 404 if not found.
    """
    if not delete_bot(db, bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")


# ── Telegram mappings ─────────────────────────────────────────────────────────

@router.get("/{bot_id}/telegram-mappings", response_model=List[TelegramChatMapping])
def list_telegram_mappings(bot_id: UUID, db: Session = Depends(get_db)):
    """List all Telegram chat → workflow mappings for a bot."""
    if get_bot_by_id(db, bot_id) is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    return [TelegramChatMapping.model_validate(r)
            for r in list_telegram_mappings_for_bot(db, bot_id)]


@router.post("/{bot_id}/telegram-mappings",
             response_model=TelegramChatMapping, status_code=201)
def add_telegram_mapping(bot_id: UUID, payload: TelegramChatMappingCreate,
                         db: Session = Depends(get_db)):
    """Map a Telegram chat ID to a workflow for a specific bot.

    Upserts: if a mapping for ``chat_id`` already exists it is replaced.
    Returns 404 if the bot or workflow is not found.
    """
    if get_bot_by_id(db, bot_id) is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    if get_workflow(db, payload.workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    row = set_chat_mapping_for_bot(db, chat_id=payload.chat_id,
                                   workflow_id=payload.workflow_id,
                                   bot_id=bot_id, username=payload.username)
    return TelegramChatMapping.model_validate(row)


@router.delete("/telegram-mappings/{chat_id}", status_code=204)
def remove_telegram_mapping(chat_id: str, db: Session = Depends(get_db)):
    """Remove a Telegram chat mapping by chat ID.

    Returns 404 if not found.
    """
    if not delete_chat_mapping(db, chat_id):
        raise HTTPException(status_code=404, detail="Mapping not found")


# ── Slack mappings ────────────────────────────────────────────────────────────

@router.get("/{bot_id}/slack-mappings", response_model=List[SlackChannelMapping])
def list_slack_mappings(bot_id: UUID, db: Session = Depends(get_db)):
    """List all Slack channel → workflow mappings for a bot."""
    if get_bot_by_id(db, bot_id) is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    return [SlackChannelMapping.model_validate(r)
            for r in list_slack_mappings_for_bot(db, bot_id)]


@router.post("/{bot_id}/slack-mappings",
             response_model=SlackChannelMapping, status_code=201)
def add_slack_mapping(bot_id: UUID, payload: SlackMappingCreate,
                      db: Session = Depends(get_db)):
    """Map a Slack channel to a workflow for a specific bot.

    Returns 404 if the bot or workflow is not found.
    """
    bot = get_bot_by_id(db, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    if get_workflow(db, payload.workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    row = create_slack_mapping(db, bot_id=bot_id, channel_id=payload.channel_id,
                               workflow_id=payload.workflow_id,
                               channel_name=payload.channel_name)
    return SlackChannelMapping.model_validate(row)


@router.delete("/slack-mappings/{mapping_id}", status_code=204)
def remove_slack_mapping(mapping_id: UUID, db: Session = Depends(get_db)):
    """Remove a Slack channel mapping by mapping ID.

    Returns 404 if not found.
    """
    if not delete_slack_mapping(db, mapping_id):
        raise HTTPException(status_code=404, detail="Mapping not found")
