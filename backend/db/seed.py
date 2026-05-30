"""Seed demo agents, tool, and workflow.

`seed_demo_data()` is called at startup and is idempotent — it skips
when agents already exist.

`run_seed(db)` is the reusable core used by both startup and the
POST /seed API endpoint.
"""
from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import (
    SessionLocal,
    create_agent,
    create_tool,
    create_workflow,
    list_agents,
)

logger = get_logger(__name__)

_DEMO_CONFIG = {
    "temperature": 0.7,
    "max_tokens": 2048,
    "max_iterations": 10,
    "memory_type": "buffer",
    "memory_window": 10,
    "max_output_words": 0,
}


def run_seed(db: Session) -> Dict[str, Any]:
    """Create demo data and return a summary dict.

    Returns {"seeded": False} when agents already exist.
    """
    if list_agents(db):
        return {"seeded": False, "reason": "agents already exist"}

    logger.info("seed_start", message="Creating demo agents, tool, and workflow")

    # ── 1. Tavily Web Search tool ─────────────────────────────────────────────
    tool = create_tool(
        db,
        name="Tavily Web Search",
        description=(
            "Real-time web search powered by Tavily AI. "
            "Returns top results with titles, snippets, and URLs. "
            "Use {{query}} as a placeholder for the search term."
        ),
        method="POST",
        url="https://api.tavily.com/search",
        headers={"Content-Type": "application/json"},
        body_template='{"query": "{{query}}", "max_results": 5, "search_depth": "basic"}',
        api_key="",
        api_key_header="Authorization",
        api_key_prefix="Bearer",
        timeout_seconds=30,
    )

    # ── 2. Research Agent ─────────────────────────────────────────────────────
    researcher = create_agent(
        db,
        name="Research Agent",
        role="researcher",
        system_prompt=(
            "You are a thorough research assistant. "
            "Search the web and gather accurate, up-to-date information on the given topic. "
            "Summarise key facts, statistics, and source URLs in a structured format."
        ),
        model="openai/gpt-3.5-turbo",
        provider="openrouter",
        tools=["web_search"],
        config={**_DEMO_CONFIG, "temperature": 0.3},
    )

    # ── 3. Writer Agent ───────────────────────────────────────────────────────
    writer = create_agent(
        db,
        name="Writer Agent",
        role="writer",
        system_prompt=(
            "You are a professional content writer. "
            "Given research notes and facts, produce a clear, engaging, well-structured article. "
            "Use headings, bullet points where appropriate, and a professional tone."
        ),
        model="openai/gpt-3.5-turbo",
        provider="openrouter",
        tools=[],
        config={**_DEMO_CONFIG, "temperature": 0.7, "max_tokens": 4096},
    )

    # ── 4. Analyzer Agent ─────────────────────────────────────────────────────
    analyzer = create_agent(
        db,
        name="Analyzer Agent",
        role="analyst",
        system_prompt=(
            "You are an analytical assistant. "
            "Given raw research notes, extract the key themes, "
            "assess their significance, and produce a structured "
            "analysis with bullet points for each major finding."
        ),
        model="openai/gpt-3.5-turbo",
        provider="openrouter",
        tools=[],
        config={**_DEMO_CONFIG, "temperature": 0.4},
    )

    # ── 5. Research → Write workflow ──────────────────────────────────────────
    workflow = create_workflow(
        db,
        name="Research & Write",
        definition={
            "nodes": [
                {"id": "research", "type": "AGENT", "agent_id": str(researcher.id), "config": {}},
                {"id": "write",    "type": "AGENT", "agent_id": str(writer.id),     "config": {}},
            ],
            "edges": [
                {
                    "source_node_id": "research",
                    "target_node_id": "write",
                    "connection_type": "agent_sequence",
                },
            ],
            "start_node_id": "research",
        },
    )

    # ── 6. Content Pipeline workflow (3 nodes) ───────────────────────────────
    pipeline = create_workflow(
        db,
        name="Content Pipeline",
        definition={
            "nodes": [
                {"id": "research", "type": "AGENT", "agent_id": str(researcher.id), "config": {}},
                {"id": "analyze",  "type": "AGENT", "agent_id": str(analyzer.id),   "config": {}},
                {"id": "write",    "type": "AGENT", "agent_id": str(writer.id),      "config": {}},
            ],
            "edges": [
                {
                    "source_node_id": "research",
                    "target_node_id": "analyze",
                    "connection_type": "agent_sequence",
                },
                {
                    "source_node_id": "analyze",
                    "target_node_id": "write",
                    "connection_type": "agent_sequence",
                },
            ],
            "start_node_id": "research",
        },
    )

    result = {
        "seeded": True,
        "tool_id":        str(tool.id),
        "researcher_id":  str(researcher.id),
        "analyzer_id":    str(analyzer.id),
        "writer_id":      str(writer.id),
        "workflow_id":    str(workflow.id),
        "pipeline_id":    str(pipeline.id),
    }
    logger.info("seed_complete", **result)
    return result


def seed_demo_data() -> None:
    """Called at startup — swallows all errors so a bad DB state never prevents boot."""
    db = SessionLocal()
    try:
        run_seed(db)
    except Exception as exc:
        logger.warning("seed_failed", error=str(exc))
    finally:
        db.close()
