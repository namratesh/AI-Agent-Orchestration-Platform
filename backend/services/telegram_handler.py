from __future__ import annotations
import httpx
from typing import Any, Dict, Optional
from uuid import UUID

from core.logging_config import get_logger
from db.db import SessionLocal, get_chat_mapping
from services.workflow_executor import workflow_executor

logger = get_logger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


class TelegramBot:
    def __init__(self, token: str) -> None:
        self.token = token

    def send_message(self, chat_id: str | int, text: str) -> None:
        url = TELEGRAM_API.format(token=self.token, method="sendMessage")
        try:
            resp = httpx.post(url, json={"chat_id": chat_id, "text": text[:4096]}, timeout=10)
            resp.raise_for_status()
            logger.info("telegram_reply_sent", chat_id=str(chat_id), chars=len(text))
        except Exception as exc:
            logger.error("telegram_send_failed", chat_id=str(chat_id), error=str(exc))

    def webhook(self, update: Dict[str, Any], trace_id: str,
                bot_id: Optional[UUID] = None) -> None:
        message = update.get("message") or update.get("edited_message")
        if not message:
            return

        chat_id = str(message["chat"]["id"])
        text: Optional[str] = message.get("text", "").strip()
        if not text:
            return

        logger.info("telegram_message_received", chat_id=chat_id,
                    text_preview=text[:80], trace_id=trace_id)

        db = SessionLocal()
        try:
            mapping = get_chat_mapping(db, chat_id)
        finally:
            db.close()

        if mapping is None:
            self.send_message(chat_id,
                              "No workflow is connected to this chat yet. "
                              "Ask your admin to add a mapping in the platform.")
            return

        # If bot_id is set, only honour mappings belonging to this bot
        if bot_id is not None and getattr(mapping, "bot_id", None) != bot_id:
            self.send_message(chat_id,
                              "This chat is mapped to a different bot. "
                              "Ask your admin to update the mapping.")
            return

        workflow_id: UUID = mapping.workflow_id
        try:
            outcome = workflow_executor.execute(workflow_id, text, trace_id,
                                               source="telegram")
            result_text = outcome["result"]
        except Exception as exc:
            logger.error("workflow_execute_failed", chat_id=chat_id,
                         workflow_id=str(workflow_id), error=str(exc), trace_id=trace_id)
            self.send_message(chat_id, "Sorry, the workflow failed. Please try again.")
            return

        logger.info("workflow_executed", chat_id=chat_id,
                    workflow_id=str(workflow_id), trace_id=trace_id)
        self.send_message(chat_id, result_text)
