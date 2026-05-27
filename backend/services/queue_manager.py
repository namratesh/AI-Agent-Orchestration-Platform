from __future__ import annotations
import json
from typing import Optional

import redis

from core.config import settings
from core.logging_config import get_logger

logger = get_logger(__name__)

_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def publish_task(queue_name: str, message: dict) -> None:
    _client.lpush(queue_name, json.dumps(message))
    logger.info("task_published", queue=queue_name, keys=list(message.keys()))


def consume_task(queue_name: str, timeout: int = 60) -> Optional[dict]:
    result = _client.brpop(queue_name, timeout=timeout)
    if result is None:
        logger.info("task_consume_timeout", queue=queue_name, timeout=timeout)
        return None
    _, payload = result
    data = json.loads(payload)
    logger.info("task_consumed", queue=queue_name, keys=list(data.keys()))
    return data


def publish_result(queue_name: str, result: dict) -> None:
    _client.lpush(queue_name, json.dumps(result))
    logger.info("result_published", queue=queue_name, keys=list(result.keys()))
