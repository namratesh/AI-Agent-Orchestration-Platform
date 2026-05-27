from __future__ import annotations
import time
from typing import Any, Dict, Optional
from uuid import UUID

from opentelemetry import trace as otel_trace

from core.logging_config import get_logger
from db.db import SessionLocal, get_workflow, save_checkpoint, save_execution
from instrumentation import record_workflow_execution
from services.executor import agent_executor
from services.queue_manager import publish_result, consume_task

logger = get_logger(__name__)
_tracer = otel_trace.get_tracer(__name__)


class WorkflowExecutor:
    @_tracer.start_as_current_span("workflow_execute")
    def execute(self, workflow_id: UUID, task: str, trace_id: str,
                source: str = "ui") -> Dict[str, Any]:
        span = otel_trace.get_current_span()
        span.set_attribute("workflow_id", str(workflow_id))
        span.set_attribute("trace_id", trace_id)

        log = logger.bind(trace_id=trace_id, workflow_id=str(workflow_id))
        log.info("workflow_start", task=task)

        start_time = time.perf_counter()
        db = SessionLocal()
        execution_id: Optional[UUID] = None

        try:
            workflow_row = get_workflow(db, workflow_id)
            if workflow_row is None:
                raise ValueError(f"Workflow {workflow_id} not found")

            definition: dict = workflow_row.definition
            nodes: Dict[str, dict] = {n["id"]: n for n in definition["nodes"]}
            edges: list = definition["edges"]
            current_node_id: Optional[str] = definition["start_node_id"]
            current_input: str = task
            final_result: str = task
            total_tokens: int = 0
            total_cost: float = 0.0

            while current_node_id:
                node = nodes[current_node_id]
                node_type = node.get("type", "AGENT")
                log.info("node_executing", node_id=current_node_id, node_type=node_type)

                if node_type != "AGENT" or not node.get("agent_id"):
                    log.info("node_skipped", node_id=current_node_id,
                             reason="non_agent_or_no_agent_id")
                    final_result = current_input
                    current_node_id = _next_node(edges, current_node_id)
                    continue

                node_agent_id = UUID(str(node["agent_id"]))

                with _tracer.start_as_current_span("workflow_node_execute") as node_span:
                    node_span.set_attribute("node_id", current_node_id)
                    node_span.set_attribute("agent_id", str(node_agent_id))

                    outcome = agent_executor.execute(node_agent_id, current_input, trace_id)
                    total_tokens += outcome["tokens_used"]
                    total_cost += outcome["cost"]

                save_checkpoint(db, workflow_id=workflow_id, node_id=current_node_id,
                                state={"input": current_input, "output": outcome["result"],
                                       "tokens_used": outcome["tokens_used"],
                                       "cost": outcome["cost"]})

                log.info("node_executed", node_id=current_node_id,
                         agent_id=str(node_agent_id),
                         tokens=outcome["tokens_used"], cost=outcome["cost"])

                next_node_id = _next_node(edges, current_node_id)

                if next_node_id:
                    publish_result(f"workflow:{workflow_id}",
                                   {"node_id": current_node_id,
                                    "next_node_id": next_node_id,
                                    "result": outcome["result"]})
                    consumed = consume_task(f"workflow:{workflow_id}", timeout=30)
                    current_input = consumed["result"] if consumed else outcome["result"]
                    log.info("node_result", node_id=current_node_id, next_node=next_node_id)
                else:
                    final_result = outcome["result"]

                current_node_id = next_node_id

            elapsed = time.perf_counter() - start_time
            span.set_attribute("total_tokens", total_tokens)
            span.set_attribute("total_cost_usd", total_cost)
            span.set_attribute("execution_time_s", elapsed)

            execution_row = save_execution(
                db, workflow_id=workflow_id, task=task, result=final_result,
                status="success", tokens_used=total_tokens, cost=total_cost,
                execution_time_seconds=elapsed, source=source,
            )
            execution_id = execution_row.id

            log.info("workflow_complete", workflow_id=str(workflow_id),
                     total_tokens=total_tokens, total_cost=total_cost,
                     execution_time=round(elapsed, 3))

            record_workflow_execution(status="success")

            return {"result": final_result, "workflow_id": str(workflow_id),
                    "tokens_used": total_tokens, "cost": total_cost,
                    "execution_id": execution_id, "execution_time_seconds": elapsed}

        except Exception as exc:
            elapsed = time.perf_counter() - start_time
            span.record_exception(exc)
            span.set_status(otel_trace.StatusCode.ERROR, str(exc))
            save_execution(
                db, workflow_id=workflow_id, task=task, result=str(exc),
                status="error", tokens_used=0, cost=0.0,
                execution_time_seconds=elapsed, source=source,
            )
            record_workflow_execution(status="error")
            raise
        finally:
            db.close()


def _next_node(edges: list, current_node_id: str) -> Optional[str]:
    for edge in edges:
        if edge["source_node_id"] == current_node_id:
            return edge["target_node_id"]
    return None


workflow_executor = WorkflowExecutor()
