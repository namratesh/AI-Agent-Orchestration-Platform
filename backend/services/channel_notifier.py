"""
Outbound channel notification service.

Sends workflow execution results to external channels (Telegram, Slack) after
execution completes.  This is the outbound counterpart to the inbound webhook
handlers — it pushes results rather than receiving commands.

Used by the post-execution pipeline when a workflow has channel integrations
configured (see ``WorkflowIntegrationORM``).

Telegram: Sends via the ``sendMessage`` Bot API method.
Slack:    Sends via ``chat.postMessage`` Web API using an ``xoxb-…`` token.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

import httpx

from core.logging_config import get_logger

if TYPE_CHECKING:
    from db.db import WorkflowIntegrationORM

logger = get_logger(__name__)


def notify(integration: "WorkflowIntegrationORM", message: str) -> None:
    """Dispatch a notification to the channel configured in ``integration``.

    Errors are caught and logged as warnings rather than re-raised so that a
    notification failure does not cause the caller's transaction to roll back
    or the workflow result to be reported as an error.

    Args:
        integration: ORM row with ``channel_type`` and ``config`` fields.
        message: The message text to deliver (typically the workflow result).
    """
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
    """Send a message to a Telegram chat via the Bot API.

    Truncates the message to 4 096 characters (Telegram's per-message limit).
    Raises ``httpx.HTTPStatusError`` if the API returns a non-2xx response.

    Args:
        cfg: Integration config dict with ``bot_token`` and ``chat_id`` keys.
        message: Text to send.
    """
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
    """Post a message to a Slack channel via the Web API.

    Truncates the message to 40 000 characters (Slack's per-message limit).
    Raises ``RuntimeError`` if the Slack API returns ``ok: false``.

    Args:
        cfg: Integration config dict with ``bot_token`` and ``channel_id`` keys.
        message: Text to send.
    """
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
