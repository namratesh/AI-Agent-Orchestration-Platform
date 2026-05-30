"""
Workflow schedule management API router.

Schedules trigger workflow executions automatically on a time-based cadence.
Each schedule supports either a cron expression (e.g. ``"0 9 * * 1-5"``) or a
fixed interval in minutes — mutually exclusive.

When a schedule is created or updated, the corresponding APScheduler job is
registered or replaced immediately so the change takes effect without requiring
a restart.  Disabling a schedule removes its APScheduler job while preserving
the database record for auditing and future re-enablement.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.db import (
    create_schedule,
    delete_schedule,
    get_db,
    get_schedule,
    get_workflow,
    list_schedules_for_workflow,
    update_schedule,
)
from schemas.models import ScheduleCreate, ScheduleUpdate, WorkflowSchedule
from services import scheduler as svc

router = APIRouter(tags=["schedules"])


@router.get("/workflows/{workflow_id}/schedules", response_model=list[WorkflowSchedule])
def list_schedules(workflow_id: UUID, db: Session = Depends(get_db)):
    """Return all schedules configured for a workflow.

    Returns 404 if the workflow does not exist.
    """
    if not get_workflow(db, workflow_id):
        raise HTTPException(404, "Workflow not found")
    return list_schedules_for_workflow(db, workflow_id)


@router.post("/workflows/{workflow_id}/schedules", response_model=WorkflowSchedule, status_code=201)
def create_schedule_endpoint(workflow_id: UUID, body: ScheduleCreate,
                              db: Session = Depends(get_db)):
    """Create a new schedule and register it with APScheduler immediately.

    Exactly one of ``cron_expression`` or ``interval_minutes`` must be provided.

    Returns 404 if the workflow does not exist, 422 if the trigger is invalid.
    """
    if not get_workflow(db, workflow_id):
        raise HTTPException(404, "Workflow not found")
    try:
        body.validate_trigger()
    except ValueError as e:
        raise HTTPException(422, str(e))

    row = create_schedule(db, workflow_id=workflow_id, task=body.task,
                          cron_expression=body.cron_expression,
                          interval_minutes=body.interval_minutes)
    svc.add_or_update_job(row.id, workflow_id, row.task,
                          cron_expression=row.cron_expression,
                          interval_minutes=row.interval_minutes)
    return row


@router.put("/schedules/{schedule_id}", response_model=WorkflowSchedule)
def update_schedule_endpoint(schedule_id: UUID, body: ScheduleUpdate,
                              db: Session = Depends(get_db)):
    """Update a schedule's trigger, task, or enabled state.

    If the schedule is being disabled, its APScheduler job is removed.
    If it is being re-enabled or its trigger is changed, the job is replaced.

    Returns 404 if the schedule does not exist.
    """
    row = get_schedule(db, schedule_id)
    if row is None:
        raise HTTPException(404, "Schedule not found")

    updates = body.model_dump(exclude_none=True)
    row = update_schedule(db, schedule_id, **updates)

    if row.enabled:
        svc.add_or_update_job(row.id, row.workflow_id, row.task,
                              cron_expression=row.cron_expression,
                              interval_minutes=row.interval_minutes)
    else:
        svc.remove_job(row.id)

    return row


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule_endpoint(schedule_id: UUID, db: Session = Depends(get_db)):
    """Delete a schedule and remove its APScheduler job.

    Returns 404 if not found.
    """
    if not delete_schedule(db, schedule_id):
        raise HTTPException(404, "Schedule not found")
    svc.remove_job(schedule_id)
