from __future__ import annotations
from uuid import UUID

from core.logging_config import get_logger
from services.workflow_executor import workflow_executor

logger = get_logger(__name__)


def run_workflow(execution_id: str, workflow_id: str, task: str,
                 trace_id: str, source: str) -> None:
    """RQ task: executes a workflow inside the worker process."""
    try:
        workflow_executor.execute(
            UUID(workflow_id), task, trace_id,
            source=source, existing_execution_id=UUID(execution_id),
        )
    except Exception as exc:
        logger.error("rq_task_failed", execution_id=execution_id, error=str(exc))
