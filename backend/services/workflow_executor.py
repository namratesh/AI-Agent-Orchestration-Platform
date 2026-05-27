from __future__ import annotations
from typing import Any, Dict, Optional
from uuid import UUID

from core.logging_config import get_logger
from db.db import SessionLocal, get_workflow, save_checkpoint
from services.executor import agent_executor
from services.queue_manager import publish_result, consume_task

logger = get_logger(__name__)


class WorkflowExecutor:
    def execute(self, workflow_id: UUID, task: str, trace_id: str) -> Dict[str, Any]:
        log = logger.bind(trace_id=trace_id, workflow_id=str(workflow_id))
        log.info("workflow_start", task=task)

        db = SessionLocal()
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
                outcome = agent_executor.execute(node_agent_id, current_input, trace_id)

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

            log.info("workflow_complete", workflow_id=str(workflow_id))
            return {"result": final_result, "workflow_id": str(workflow_id)}
        finally:
            db.close()


def _next_node(edges: list, current_node_id: str) -> Optional[str]:
    for edge in edges:
        if edge["source_node_id"] == current_node_id:
            return edge["target_node_id"]
    return None


workflow_executor = WorkflowExecutor()
