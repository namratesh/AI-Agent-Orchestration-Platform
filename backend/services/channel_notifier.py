"""
Sends workflow results to external channels (Telegram, Slack) after execution.

Telegram: uses sendMessage with the stored bot_token + chat_id.
Slack:    uses chat.postMessage with the stored bot_token (xoxb-...).
"""
from __future__ import annotations
from typing import TYPE_CHECKING

import httpx

from core.logging_config import get_logger

if TYPE_CHECKING:
    from db.db import WorkflowIntegrationORM

logger = get_logger(__name__)


def notify(integration: "WorkflowIntegrationORM", message: str) -> None:
    cfg = integration.config or {}
    try:
        if integration.channel_type == "telegram":
            _send_telegram(cfg, message)
        elif integration.channel_type == "slack":
            _send_slack(cfg, message)
    except Exception as exc:
        logger.warning("channel_notify_failed",
                       channel=integration.channel_type,
                       integration_id=str(integration.id),
                       error=str(exc))


def _send_telegram(cfg: dict, message: str) -> None:
    token   = cfg.get("bot_token", "")
    chat_id = cfg.get("chat_id", "")
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    with httpx.Client(timeout=10) as client:
        resp = client.post(url, json={"chat_id": chat_id, "text": message[:4096]})
        resp.raise_for_status()
    logger.info("telegram_notify_sent", chat_id=chat_id)


def _send_slack(cfg: dict, message: str) -> None:
    bot_token  = cfg.get("bot_token", "")
    channel_id = cfg.get("channel_id", "")
    if not bot_token or not channel_id:
        return
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {bot_token}",
                     "Content-Type": "application/json; charset=utf-8"},
            json={"channel": channel_id, "text": message[:40000]},
        )
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(f"Slack API error: {data.get('error')}")
    logger.info("slack_notify_sent", channel_id=channel_id)
