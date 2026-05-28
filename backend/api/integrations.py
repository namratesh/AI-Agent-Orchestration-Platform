from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.db import (
    create_integration, delete_integration, get_db, get_integration,
    get_workflow, list_integrations_for_workflow, update_integration,
)
from schemas.models import IntegrationCreate, IntegrationUpdate, WorkflowIntegration

router = APIRouter(tags=["integrations"])


@router.get("/workflows/{workflow_id}/integrations", response_model=List[WorkflowIntegration])
def list_integrations(workflow_id: UUID, db: Session = Depends(get_db)):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return [WorkflowIntegration.model_validate(r)
            for r in list_integrations_for_workflow(db, workflow_id)]


@router.post("/workflows/{workflow_id}/integrations",
             response_model=WorkflowIntegration, status_code=201)
def create_integration_endpoint(workflow_id: UUID, payload: IntegrationCreate,
                                 db: Session = Depends(get_db)):
    if get_workflow(db, workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    try:
        payload.validate_config()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    row = create_integration(db, workflow_id=workflow_id,
                             channel_type=payload.channel_type,
                             config=payload.config)
    return WorkflowIntegration.model_validate(row)


@router.put("/integrations/{integration_id}", response_model=WorkflowIntegration)
def update_integration_endpoint(integration_id: UUID, payload: IntegrationUpdate,
                                 db: Session = Depends(get_db)):
    if get_integration(db, integration_id) is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    kwargs = {k: v for k, v in payload.model_dump().items() if v is not None}
    row = update_integration(db, integration_id, **kwargs)
    return WorkflowIntegration.model_validate(row)


@router.delete("/integrations/{integration_id}", status_code=204)
def delete_integration_endpoint(integration_id: UUID, db: Session = Depends(get_db)):
    if not delete_integration(db, integration_id):
        raise HTTPException(status_code=404, detail="Integration not found")
