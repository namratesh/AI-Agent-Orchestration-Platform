"""
Platform statistics API router.

Provides a single aggregated endpoint that the dashboard uses to populate
summary cards and the recent executions list.  All values are computed from
live database queries — there is no caching layer — so the dashboard always
reflects the current state.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.db import (count_executions_today, get_db, list_agents, list_executions,
                   list_workflows, sum_cost_this_month)
from schemas.models import ExecutionRecord, StatsResponse

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """Return aggregated platform statistics for the dashboard.

    Returns:
        StatsResponse containing:
          - ``total_agents``: number of configured agents.
          - ``total_workflows``: number of configured workflows.
          - ``executions_today``: count of executions started since UTC midnight.
          - ``cost_this_month``: total LLM cost (USD) accumulated this calendar month.
          - ``recent_executions``: the 5 most recent execution records.
    """
    agents = list_agents(db)
    workflows = list_workflows(db)
    executions_today = count_executions_today(db)
    cost_this_month = sum_cost_this_month(db)
    recent_rows = list_executions(db, limit=5)
    recent = [ExecutionRecord.model_validate(r) for r in recent_rows]
    return StatsResponse(
        total_agents=len(agents),
        total_workflows=len(workflows),
        executions_today=executions_today,
        cost_this_month=cost_this_month,
        recent_executions=recent,
    )
