"""
Agent executor — agent-first implementation using LangGraph's create_react_agent.

Each agent is a proper ReAct graph: the LLM reasons, decides which tools to call,
observes results, and loops until it has an answer.  This replaces the old
one-shot tool_node → llm_node pipeline.
"""
from __future__ import annotations
import time
from typing import Any, Dict, List, Optional
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from opentelemetry import trace as otel_trace

from core.config import settings
from core.logging_config import get_logger
from db.db import SessionLocal, get_agent, get_agent_history, save_message
from instrumentation import record_agent_execution

logger = get_logger(__name__)
_tracer = otel_trace.get_tracer(__name__)

COST_PER_1K: Dict[str, float] = {
    "openai": 0.03,
    "openrouter": 0.002,
    "groq": 0.0001,
    "ollama": 0.0,
}


class LLMFactory:
    @staticmethod
    def get_llm(model: str, provider: str, temperature: float = 0.7, max_tokens: int = 2048):
        if provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                openai_api_key=settings.OPENAI_API_KEY,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        if provider == "openrouter":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model or settings.OPENROUTER_MODEL,
                openai_api_key=settings.OPENROUTER_API_KEY,
                openai_api_base="https://openrouter.ai/api/v1",
                temperature=temperature,
                max_tokens=max_tokens,
            )

        if provider == "groq":
            from langchain_groq import ChatGroq
            return ChatGroq(
                model=model,
                groq_api_key=settings.GROQ_API_KEY,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        if provider == "ollama":
            from langchain_community.chat_models import ChatOllama
            return ChatOllama(
                model=model,
                base_url=settings.OLLAMA_BASE_URL,
                temperature=temperature,
                num_predict=max_tokens,
            )

        raise ValueError(f"Unknown provider: {provider}")


# ── Tools ─────────────────────────────────────────────────────────────────────

def _do_web_search(query: str) -> str:
    """Core search logic — testable without the LangChain tool wrapper."""
    span = otel_trace.get_current_span()
    span.set_attribute("tool.name", "web_search")

    # Trim to first sentence or 400 chars — Tavily rejects longer queries.
    trimmed = query.strip()
    for sep in (".\n", "\n", ". "):
        idx = trimmed.find(sep)
        if 0 < idx <= 400:
            trimmed = trimmed[:idx].strip()
            break
    trimmed = trimmed[:400]
    span.set_attribute("query", trimmed)

    from tavily import TavilyClient
    api_key = settings.TAVILY_API_KEY
    if not api_key or api_key.startswith("tvly-..."):
        return "Web search is not configured. Set TAVILY_API_KEY in .env to enable it."

    try:
        client = TavilyClient(api_key=api_key)
        response = client.search(trimmed, max_results=5)
    except Exception as exc:
        return f"[Web search error: {exc}]"

    results = response.get("results", [])
    if not results:
        return f"No results found for: {trimmed}"

    return "\n".join(
        f"{i}. {r.get('title', '')}: {r.get('content', '')} ({r.get('url', '')})"
        for i, r in enumerate(results, 1)
    )


@tool
def web_search(query: str) -> str:
    """Search the web for current, real-time information on a topic or question.

    Use this when you need up-to-date facts, recent events, or information
    that may not be in your training data.
    """
    return _do_web_search(query)


# ── Agent builder ─────────────────────────────────────────────────────────────

def _build_tools(tool_names: list) -> list:
    available = {"web_search": web_search}
    return [available[t] for t in (tool_names or []) if t in available]


# ── Executor ──────────────────────────────────────────────────────────────────

class AgentExecutor:
    @_tracer.start_as_current_span("agent_execute")
    def execute(self, agent_id: UUID, task: str, trace_id: str) -> Dict[str, Any]:
        span = otel_trace.get_current_span()
        span.set_attribute("agent_id", str(agent_id))
        span.set_attribute("trace_id", trace_id)

        log = logger.bind(trace_id=trace_id, agent_id=str(agent_id))
        log.info("agent_execute_start", task=task)

        t0 = time.perf_counter()
        db = SessionLocal()
        try:
            agent_row = get_agent(db, agent_id)
            if agent_row is None:
                raise ValueError(f"Agent {agent_id} not found")

            span.set_attribute("provider", agent_row.provider)
            span.set_attribute("model", agent_row.model)

            cfg            = agent_row.config or {}
            temperature    = float(cfg.get("temperature", 0.7))
            max_tokens     = int(cfg.get("max_tokens", 2048))
            max_iterations = int(cfg.get("max_iterations", 10))
            memory_type    = str(cfg.get("memory_type", "buffer"))
            memory_window  = int(cfg.get("memory_window", 10))

            log.info("agent_config_applied",
                     temperature=temperature, max_tokens=max_tokens,
                     max_iterations=max_iterations,
                     memory_type=memory_type, memory_window=memory_window)

            # Load conversation history from PostgreSQL
            if memory_type == "none":
                history: List[BaseMessage] = []
                log.info("agent_memory_disabled")
            else:
                history_rows = get_agent_history(db, agent_id, limit=memory_window * 2)
                history = [
                    HumanMessage(content=row.content)
                    if row.message_type == "user_message"
                    else AIMessage(content=row.content)
                    for row in history_rows
                ]
                log.info("agent_memory_loaded", turns=len(history))

            # Build LangGraph ReAct agent
            tools   = _build_tools(agent_row.tools or [])
            llm     = LLMFactory.get_llm(
                agent_row.model, agent_row.provider,
                temperature=temperature, max_tokens=max_tokens,
            )
            agent_graph = create_react_agent(model=llm, tools=tools)

            if tools:
                log.info("agent_tools_enabled", tools=[t.name for t in tools])

            # Persist the user's task before execution
            save_message(db, receiver_id=agent_id, content=task,
                         message_type="user_message")

            # Build message list: system prompt + history + current task
            messages: List[BaseMessage] = (
                [SystemMessage(content=agent_row.system_prompt)]
                + history
                + [HumanMessage(content=task)]
            )

            # Invoke the ReAct graph — the LLM will reason and call tools in a loop
            response = agent_graph.invoke(
                {"messages": messages},
                config={"recursion_limit": max_iterations},
            )

            # Extract final answer (last AI message)
            ai_messages = [m for m in response["messages"] if isinstance(m, AIMessage)]
            result = ai_messages[-1].content if ai_messages else ""

            # Count tool call rounds for logging
            tool_calls = sum(
                1 for m in response["messages"]
                if isinstance(m, AIMessage) and getattr(m, "tool_calls", None)
            )
            if tool_calls:
                log.info("agent_tool_calls", rounds=tool_calls)

            # Sum token usage across all LLM calls in the ReAct loop
            tokens = 0
            for msg in response["messages"]:
                if isinstance(msg, AIMessage) and hasattr(msg, "response_metadata"):
                    usage = (msg.response_metadata or {}).get("token_usage") or {}
                    tokens += usage.get("total_tokens", 0)
            if not tokens:
                tokens = len(result.split()) * 2

            cost     = round((tokens / 1000) * COST_PER_1K.get(agent_row.provider, 0.002), 8)
            duration = time.perf_counter() - t0

            span.set_attribute("tokens_used", tokens)
            span.set_attribute("cost_usd", cost)

            save_message(db, sender_id=agent_id, content=result,
                         message_type="agent_response", tokens_used=tokens, cost=cost)

            log.info("agent_execute_end", tokens=tokens, cost=cost,
                     result_preview=result[:120])

            record_agent_execution(provider=agent_row.provider, tokens=tokens,
                                   cost=cost, duration=duration, status="success")

            return {"result": result, "tokens_used": tokens, "cost": cost}

        except Exception as exc:
            span.record_exception(exc)
            span.set_status(otel_trace.StatusCode.ERROR, str(exc))
            record_agent_execution(provider="unknown", tokens=0, cost=0.0,
                                   duration=time.perf_counter() - t0, status="error")
            raise
        finally:
            db.close()


agent_executor = AgentExecutor()
