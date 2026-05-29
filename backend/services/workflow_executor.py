"""
Workflow executor: builds a LangGraph StateGraph dynamically from a saved
workflow definition, then invokes it.  Each AGENT node delegates to
agent_executor (which itself runs a per-agent LangGraph); each TOOL node
makes an HTTP call.  Edge conditions are wired through LangGraph's
add_conditional_edges so routing is handled by the graph, not by a
hand-rolled BFS loop.
"""
from __future__ import annotations

import time
import requests as http_requests
from typing import Any, Dict, List, Optional, TypedDict
from uuid import UUID

from langgraph.graph import END, StateGraph
from opentelemetry import trace as otel_trace

from core.logging_config import get_logger
from db.db import (SessionLocal, get_agent, get_tool, get_workflow,
                   save_checkpoint, save_execution, update_execution)
from instrumentation import record_workflow_execution
from services.executor import agent_executor

logger = get_logger(__name__)
_tracer = otel_trace.get_tracer(__name__)


# ── Shared state that flows through every node in the graph ───────────────────

class WorkflowState(TypedDict):
    task: str                    # original user task — never mutated
    current_output: str          # output of the most-recent node; next node's input
    node_outputs: Dict[str, str] # accumulated per-node results
    tokens_used: int             # running total across all agent nodes
    cost: float                  # running total


# ── Edge condition evaluator ──────────────────────────────────────────────────

def _eval_condition(condition: Optional[dict], text: str) -> bool:
    if not condition or condition.get("type") == "always":
        return True
    ct  = condition.get("type", "always")
    val = (condition.get("value") or "").lower().strip()
    out = text.lower().strip()
    if ct == "contains":     return val in out
    if ct == "not_contains": return val not in out
    if ct == "equals":       return out == val
    if ct == "not_equals":   return out != val
    return True


# ── Node factories ────────────────────────────────────────────────────────────

def _make_agent_node(node_id: str, agent_id: UUID, trace_id: str, workflow_id: UUID):
    """
    Returns a LangGraph node function that runs an agent.
    The node reads current_output as its task and writes the agent's
    response back to current_output so the next node picks it up.
    """
    def _run(state: WorkflowState) -> dict:
        log = logger.bind(trace_id=trace_id, node_id=node_id, agent_id=str(agent_id))
        log.info("agent_node_executing", input_preview=state["current_output"][:120])

        outcome = agent_executor.execute(agent_id, state["current_output"], trace_id)

        # Persist a checkpoint for this node
        db = SessionLocal()
        try:
            save_checkpoint(db, workflow_id=workflow_id, node_id=node_id,
                            state={"input":        state["current_output"],
                                   "output":       outcome["result"],
                                   "tokens_used":  outcome["tokens_used"],
                                   "cost":         outcome["cost"]})
        finally:
            db.close()

        log.info("agent_node_done", tokens=outcome["tokens_used"], cost=outcome["cost"],
                 output_preview=outcome["result"][:120])

        return {
            "current_output": outcome["result"],
            "node_outputs":   {**state["node_outputs"], node_id: outcome["result"]},
            "tokens_used":    state["tokens_used"] + outcome["tokens_used"],
            "cost":           state["cost"] + outcome["cost"],
        }

    _run.__name__ = f"agent__{node_id}"
    return _run


def _make_tool_node(node_id: str, tool, trace_id: str):
    """
    Returns a LangGraph node function that executes an HTTP tool.
    The tool's response becomes current_output for the next node.
    {{input}} in the body template is replaced with current_output.
    """
    def _run(state: WorkflowState) -> dict:
        log = logger.bind(trace_id=trace_id, node_id=node_id, tool=tool.name)
        log.info("tool_node_executing", method=tool.method, url=tool.url)

        body = (tool.body_template or "").replace("{{input}}", state["current_output"])
        headers = dict(tool.headers or {})
        if tool.api_key:
            headers[tool.api_key_header] = f"{tool.api_key_prefix} {tool.api_key}"

        try:
            resp = http_requests.request(
                method=tool.method,
                url=tool.url,
                headers=headers,
                data=body if tool.method not in ("GET", "DELETE") else None,
                timeout=tool.timeout_seconds or 30,
            )
            result = f"[HTTP {resp.status_code}] {resp.text[:2000]}"
            log.info("tool_node_done", status=resp.status_code)
        except Exception as exc:
            result = f"[Tool error: {exc}]"
            log.warning("tool_node_error", error=str(exc))

        return {
            "current_output": result,
            "node_outputs":   {**state["node_outputs"], node_id: result},
        }

    _run.__name__ = f"tool__{node_id}"
    return _run


def _passthrough(_state: WorkflowState) -> dict:
    """No-op node for unsupported/unknown node types."""
    return {}


# ── Dynamic graph builder ─────────────────────────────────────────────────────

def _build_langgraph(definition: dict, trace_id: str,
                     workflow_id: UUID, db) -> Any:
    """
    Converts a workflow definition (nodes + edges from the canvas) into a
    compiled LangGraph StateGraph.

    Routing rules
    ─────────────
    • One outgoing edge, always-condition  → add_edge (simple hop)
    • Multiple edges or condition present  → add_conditional_edges with a
      router function that evaluates conditions against current_output in
      order; first match wins.  Falls through to END if none match.
    • No outgoing edges                    → terminal; connect to END.
    """
    nodes_def  = {n["id"]: n for n in definition["nodes"]}
    edges_def  = definition["edges"]
    start_id   = definition["start_node_id"]

    # Build source → [edge] adjacency
    outgoing: Dict[str, List[dict]] = {}
    for edge in edges_def:
        outgoing.setdefault(edge["source_node_id"], []).append(edge)

    graph = StateGraph(WorkflowState)

    # ── Register nodes ────────────────────────────────────────────────────────
    for nid, ndf in nodes_def.items():
        ntype = ndf.get("type", "AGENT")

        if ntype == "AGENT" and ndf.get("agent_id"):
            fn = _make_agent_node(
                nid, UUID(str(ndf["agent_id"])), trace_id, workflow_id
            )

        elif ntype == "TOOL" and ndf.get("tool_id"):
            tool_row = get_tool(db, UUID(str(ndf["tool_id"])))
            fn = _make_tool_node(nid, tool_row, trace_id) if tool_row else _passthrough

        else:
            fn = _passthrough

        graph.add_node(nid, fn)

    # ── Entry point ───────────────────────────────────────────────────────────
    graph.set_entry_point(start_id)

    # ── Wire edges ────────────────────────────────────────────────────────────
    for nid, out_edges in outgoing.items():
        is_simple = (
            len(out_edges) == 1
            and (not out_edges[0].get("condition")
                 or out_edges[0]["condition"].get("type") == "always")
        )

        if is_simple:
            graph.add_edge(nid, out_edges[0]["target_node_id"])
        else:
            # Conditional routing — build a router closure over this node's edges
            def _make_router(edges: List[dict]):
                def _router(state: WorkflowState) -> str:
                    out = state["current_output"]
                    for e in edges:
                        if _eval_condition(e.get("condition"), out):
                            return e["target_node_id"]
                    return END
                return _router

            target_map = {e["target_node_id"]: e["target_node_id"] for e in out_edges}
            target_map[END] = END
            graph.add_conditional_edges(nid, _make_router(out_edges), target_map)

    # ── Terminal nodes → END ──────────────────────────────────────────────────
    for nid in set(nodes_def) - set(outgoing):
        graph.add_edge(nid, END)

    return graph.compile()


# ── Pre-flight validation ─────────────────────────────────────────────────────

def validate_workflow_definition(db, defn: dict) -> list[str]:
    """Return a list of error strings; empty list means the definition is valid."""
    errors: list[str] = []
    nodes = defn.get("nodes", [])
    edges = defn.get("edges", [])
    start = defn.get("start_node_id", "")

    node_ids = {n["id"] for n in nodes}

    if not nodes:
        errors.append("Workflow has no nodes.")
        return errors

    if start not in node_ids:
        errors.append(f"start_node_id '{start}' does not match any node.")

    for node in nodes:
        ntype = node.get("type", "AGENT")
        nid   = node.get("id", "<unknown>")
        if ntype == "AGENT":
            agent_id = node.get("agent_id")
            if not agent_id:
                errors.append(f"Node '{nid}': AGENT node is missing agent_id.")
            else:
                try:
                    if get_agent(db, UUID(str(agent_id))) is None:
                        errors.append(f"Node '{nid}': agent {agent_id} not found.")
                except Exception:
                    errors.append(f"Node '{nid}': invalid agent_id '{agent_id}'.")
        elif ntype == "TOOL":
            tool_id = node.get("tool_id")
            if not tool_id:
                errors.append(f"Node '{nid}': TOOL node is missing tool_id.")
            else:
                try:
                    if get_tool(db, UUID(str(tool_id))) is None:
                        errors.append(f"Node '{nid}': tool {tool_id} not found.")
                except Exception:
                    errors.append(f"Node '{nid}': invalid tool_id '{tool_id}'.")

    for edge in edges:
        src = edge.get("source_node_id", "")
        tgt = edge.get("target_node_id", "")
        if src not in node_ids:
            errors.append(f"Edge references unknown source node '{src}'.")
        if tgt not in node_ids:
            errors.append(f"Edge references unknown target node '{tgt}'.")

    return errors


# ── Public executor class ─────────────────────────────────────────────────────

class WorkflowExecutor:
    @_tracer.start_as_current_span("workflow_execute")
    def execute(self, workflow_id: UUID, task: str, trace_id: str,
                source: str = "ui",
                existing_execution_id: Optional[UUID] = None) -> Dict[str, Any]:
        span = otel_trace.get_current_span()
        span.set_attribute("workflow_id", str(workflow_id))
        span.set_attribute("trace_id", trace_id)

        log = logger.bind(trace_id=trace_id, workflow_id=str(workflow_id))
        log.info("workflow_start", task=task)
        t0 = time.perf_counter()

        db = SessionLocal()
        try:
            workflow_row = get_workflow(db, workflow_id)
            if workflow_row is None:
                raise ValueError(f"Workflow {workflow_id} not found")

            defn        = workflow_row.definition
            agent_count = sum(1 for n in defn["nodes"] if n.get("type") == "AGENT")
            tool_count  = sum(1 for n in defn["nodes"] if n.get("type") == "TOOL")
            log.info("workflow_graph_building",
                     total_nodes=len(defn["nodes"]),
                     agent_nodes=agent_count,
                     tool_nodes=tool_count,
                     edges=len(defn["edges"]))

            # Build and compile the LangGraph for this workflow
            compiled = _build_langgraph(defn, trace_id, workflow_id, db)

            initial_state: WorkflowState = {
                "task":           task,
                "current_output": task,
                "node_outputs":   {},
                "tokens_used":    0,
                "cost":           0.0,
            }

            log.info("workflow_graph_invoking")
            final_state = compiled.invoke(
                initial_state,
                config={"recursion_limit": 50},
            )

            result       = final_state["current_output"]
            tokens       = final_state["tokens_used"]
            cost         = final_state["cost"]
            node_outputs = final_state["node_outputs"]
            elapsed      = time.perf_counter() - t0

            span.set_attribute("total_tokens", tokens)
            span.set_attribute("total_cost_usd", cost)
            span.set_attribute("execution_time_s", elapsed)

            if existing_execution_id:
                row = update_execution(
                    db, existing_execution_id, status="success", result=result,
                    tokens_used=tokens, cost=cost,
                    execution_time_seconds=elapsed, node_outputs=node_outputs,
                )
                exec_id = existing_execution_id
            else:
                row = save_execution(
                    db, workflow_id=workflow_id, task=task, result=result,
                    status="success", tokens_used=tokens, cost=cost,
                    execution_time_seconds=elapsed, source=source,
                    node_outputs=node_outputs,
                )
                exec_id = row.id

            log.info("workflow_complete",
                     tokens=tokens, cost=cost, elapsed=round(elapsed, 3),
                     result_preview=result[:120],
                     node_outputs_count=len(node_outputs))

            record_workflow_execution(status="success")

            return {
                "result":                 result,
                "workflow_id":            str(workflow_id),
                "tokens_used":            tokens,
                "cost":                   cost,
                "execution_id":           exec_id,
                "execution_time_seconds": elapsed,
                "node_outputs":           node_outputs,
            }

        except Exception as exc:
            elapsed = time.perf_counter() - t0
            err_msg = str(exc)
            span.record_exception(exc)
            span.set_status(otel_trace.StatusCode.ERROR, err_msg)
            if existing_execution_id:
                update_execution(
                    db, existing_execution_id, status="error", result="",
                    execution_time_seconds=elapsed, error_message=err_msg,
                )
            else:
                save_execution(
                    db, workflow_id=workflow_id, task=task, result="",
                    status="error", tokens_used=0, cost=0.0,
                    execution_time_seconds=elapsed, source=source,
                    error_message=err_msg,
                )
            record_workflow_execution(status="error")
            log.error("workflow_failed", error=err_msg)
            raise
        finally:
            db.close()


workflow_executor = WorkflowExecutor()
