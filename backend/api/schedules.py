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
    if not get_workflow(db, workflow_id):
        raise HTTPException(404, "Workflow not found")
    return list_schedules_for_workflow(db, workflow_id)


@router.post("/workflows/{workflow_id}/schedules", response_model=WorkflowSchedule, status_code=201)
def create_schedule_endpoint(workflow_id: UUID, body: ScheduleCreate,
                              db: Session = Depends(get_db)):
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
    if not delete_schedule(db, schedule_id):
        raise HTTPException(404, "Schedule not found")
    svc.remove_job(schedule_id)
