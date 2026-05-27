"""APScheduler-based workflow scheduler.

Loads all enabled workflow_schedules rows on startup, registers each as an
APScheduler job (cron or interval), and fires them by creating a queued
execution record + running the workflow executor in a thread — identical to
the BackgroundTasks path used by the HTTP execute endpoint.
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
    return f"schedule_{schedule_id}"


def _run_schedule(schedule_id: str, workflow_id: str, task: str) -> None:
    """Fired by APScheduler. Creates a queued execution and runs it."""
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

    # WorkflowExecutor.execute() manages its own DB session internally
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
    """Add or replace a single APScheduler job from a schedule row."""
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
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("scheduler_stopped")


def add_or_update_job(schedule_id: uuid.UUID, workflow_id: uuid.UUID,
                      task: str, cron_expression: Optional[str] = None,
                      interval_minutes: Optional[int] = None) -> None:
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
    if _scheduler is None:
        return
    job_id = _job_id(schedule_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
