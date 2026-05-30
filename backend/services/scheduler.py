"""
APScheduler-based workflow scheduler.

Loads all enabled ``workflow_schedules`` rows on startup and registers each as
an APScheduler job using either a cron trigger or an interval trigger.  When a
job fires, it:
  1. Creates a queued execution record in PostgreSQL.
  2. Updates the schedule's ``last_run_at`` timestamp.
  3. Invokes ``WorkflowExecutor.execute`` directly (no RQ dependency) so
     schedules work even when Redis is unavailable.

Jobs are registered with ``replace_existing=True`` so that calling
``add_or_update_job`` is idempotent — the API layer calls it on every create
and update without checking whether the job already exists.

A ``misfire_grace_time`` of 60 seconds is set so that jobs missed during a
brief restart or maintenance window are still executed if they fall within the
grace period.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from db.db import (
    SessionLocal,
    WorkflowScheduleORM,
    create_execution_queued,
    list_all_enabled_schedules,
    update_schedule,
)
from services.workflow_executor import WorkflowExecutor

log = structlog.get_logger()

_scheduler: Optional[BackgroundScheduler] = None
_executor = WorkflowExecutor()


def _job_id(schedule_id: uuid.UUID) -> str:
    """Return the APScheduler job ID for a given schedule UUID."""
    return f"schedule_{schedule_id}"


def _run_schedule(schedule_id: str, workflow_id: str, task: str) -> None:
    """APScheduler job entry point — creates an execution and runs the workflow.

    Creates a queued execution record first so the execution is visible in the
    UI immediately even if the workflow takes a long time.  The ``last_run_at``
    timestamp is updated atomically with the execution creation so dashboards
    reflect the most recent fire time accurately.

    Args:
        schedule_id: UUID string of the schedule row that triggered this run.
        workflow_id: UUID string of the workflow to execute.
        task: Task description passed to the workflow as the initial input.
    """
    wf_uuid = uuid.UUID(workflow_id)
    sched_uuid = uuid.UUID(schedule_id)
    trace_id = str(uuid.uuid4())

    db = SessionLocal()
    try:
        exec_row = create_execution_queued(db, workflow_id=wf_uuid,
                                           task=task, source="scheduled")
        update_schedule(db, sched_uuid, last_run_at=datetime.now(timezone.utc))
        exec_id = exec_row.id
        log.info("schedule_triggered", schedule_id=schedule_id,
                 workflow_id=workflow_id, execution_id=str(exec_id))
    finally:
        db.close()

    # WorkflowExecutor.execute() manages its own DB session internally.
    try:
        _executor.execute(
            workflow_id=wf_uuid,
            task=task,
            trace_id=trace_id,
            source="scheduled",
            existing_execution_id=exec_id,
        )
    except Exception:
        log.exception("schedule_execution_error", schedule_id=schedule_id)


def _register(sched: BackgroundScheduler, row: WorkflowScheduleORM) -> None:
    """Add or replace a single APScheduler job from a schedule ORM row.

    Skips registration silently if neither ``cron_expression`` nor
    ``interval_minutes`` is set (invalid state that should be caught at the API
    layer).

    Args:
        sched: The running BackgroundScheduler instance.
        row: Schedule ORM row with trigger configuration.
    """
    job_id = _job_id(row.id)
    kwargs = dict(
        func=_run_schedule,
        kwargs={
            "schedule_id": str(row.id),
            "workflow_id": str(row.workflow_id),
            "task": row.task,
        },
        id=job_id,
        replace_existing=True,
        misfire_grace_time=60,
    )
    if row.cron_expression:
        sched.add_job(trigger=CronTrigger.from_crontab(row.cron_expression), **kwargs)
    elif row.interval_minutes:
        sched.add_job(trigger=IntervalTrigger(minutes=row.interval_minutes), **kwargs)


def start() -> None:
    """Start the background scheduler and register all enabled schedule jobs.

    Initialises a UTC-timezone BackgroundScheduler, loads all enabled schedules
    from the database, and registers each as an APScheduler job.  Individual
    registration failures are logged but do not prevent other schedules from
    being registered.
    """
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")

    db = SessionLocal()
    try:
        rows = list_all_enabled_schedules(db)
        for row in rows:
            try:
                _register(_scheduler, row)
            except Exception:
                log.exception("schedule_register_error", schedule_id=str(row.id))
        log.info("scheduler_started", jobs=len(rows))
    finally:
        db.close()

    _scheduler.start()


def stop() -> None:
    """Shut down the background scheduler without waiting for running jobs."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("scheduler_stopped")


def add_or_update_job(schedule_id: uuid.UUID, workflow_id: uuid.UUID,
                      task: str, cron_expression: Optional[str] = None,
                      interval_minutes: Optional[int] = None) -> None:
    """Register or replace a schedule job without a database lookup.

    Called by the API layer after create/update operations so the scheduler
    reflects changes immediately without requiring a restart.  A no-op if the
    scheduler has not been started yet (e.g. during tests).

    Args:
        schedule_id: UUID of the schedule row.
        workflow_id: UUID of the workflow to execute.
        task: Task description for the scheduled run.
        cron_expression: Cron string (e.g. ``"0 9 * * 1-5"``).
        interval_minutes: Fixed interval in minutes.
    """
    if _scheduler is None:
        return
    row = WorkflowScheduleORM()
    row.id = schedule_id
    row.workflow_id = workflow_id
    row.task = task
    row.cron_expression = cron_expression
    row.interval_minutes = interval_minutes
    _register(_scheduler, row)


def remove_job(schedule_id: uuid.UUID) -> None:
    """Remove a schedule job from the scheduler by schedule ID.

    A no-op if the scheduler has not started or the job does not exist.

    Args:
        schedule_id: UUID of the schedule whose job should be removed.
    """
    if _scheduler is None:
        return
    job_id = _job_id(schedule_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
