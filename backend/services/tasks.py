"""
RQ task definitions for the worker process.

Functions in this module are enqueued by the API process and executed by the
``rq worker executions`` process.  They must be importable from both contexts,
so all imports are at the module level (no FastAPI-specific dependencies).

The task receives pre-serialised string arguments rather than UUID objects
because RQ serialises arguments with pickle — using plain strings avoids
cross-version compatibility issues with UUID pickling.
"""
from __future__ import annotations
from uuid import UUID

from core.logging_config import get_logger
from services.workflow_executor import workflow_executor

logger = get_logger(__name__)


def run_workflow(execution_id: str, workflow_id: str, task: str,
                 trace_id: str, source: str) -> None:
    """RQ task entry point — execute a workflow inside the worker process.

    Converts string arguments to UUIDs and delegates to ``WorkflowExecutor``,
    which manages its own database session and publishes streaming events.
    Errors are logged and re-raised so RQ marks the job as failed and can
    apply the configured retry policy.

    Args:
        execution_id: UUID string of the pre-created queued execution record.
        workflow_id: UUID string of the workflow to run.
        task: User-supplied task description passed as the initial graph input.
        trace_id: Correlation ID for OTel spans and structured log entries.
        source: Originating source label (e.g. ``"ui"``, ``"scheduled"``).
    """
    try:
        workflow_executor.execute(
            UUID(workflow_id), task, trace_id,
            source=source, existing_execution_id=UUID(execution_id),
        )
    except Exception as exc:
        logger.error("rq_task_failed", execution_id=execution_id, error=str(exc))
