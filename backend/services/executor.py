from __future__ import annotations
import time
from typing import Any, Dict, List, Optional, TypedDict
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from opentelemetry import trace as otel_trace

from core.config import settings
from core.logging_config import get_logger
from db.db import SessionLocal, get_agent, save_message
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
    def get_llm(model: str, provider: str):
        if provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(model=model, openai_api_key=settings.OPENAI_API_KEY)

        if provider == "openrouter":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model or settings.OPENROUTER_MODEL,
                openai_api_key=settings.OPENROUTER_API_KEY,
                openai_api_base="https://openrouter.ai/api/v1",
            )

        if provider == "groq":
            from langchain_groq import ChatGroq
            return ChatGroq(model=model, groq_api_key=settings.GROQ_API_KEY)

        if provider == "ollama":
            from langchain_community.chat_models import ChatOllama
            return ChatOllama(model=model, base_url=settings.OLLAMA_BASE_URL)

        raise ValueError(f"Unknown provider: {provider}")


@_tracer.start_as_current_span("tool_call")
def web_search(query: str) -> str:
    span = otel_trace.get_current_span()
    span.set_attribute("tool.name", "web_search")
    span.set_attribute("query", query[:200])

    from tavily import TavilyClient
    api_key = settings.TAVILY_API_KEY
    if not api_key or api_key.startswith("tvly-..."):
        return "Web search is not configured. Set TAVILY_API_KEY in .env to enable it."

    client = TavilyClient(api_key=api_key)
    response = client.search(query, max_results=5)
    results: List[Dict] = response.get("results", [])
    if not results:
        return f"No results found for: {query}"

    lines = [
        f"{i}. {r.get('title', '')}: {r.get('content', '')} ({r.get('url', '')})"
        for i, r in enumerate(results, 1)
    ]
    return "\n".join(lines)


class AgentState(TypedDict):
    task: str
    system_prompt: str
    result: str
    search_results: Optional[str]
    tool_names: list
    tokens_used: int


def tool_node(state: AgentState) -> AgentState:
    if "web_search" not in state.get("tool_names", []):
        return state
    results = web_search(state["task"])
    return {**state, "search_results": results}


def call_llm_node(llm, state: AgentState) -> AgentState:
    search_results = state.get("search_results")
    if search_results:
        user_content = (
            f"Search results for context:\n{search_results}\n\n"
            f"Using the above search results, answer the following:\n{state['task']}"
        )
    else:
        user_content = state["task"]

    messages = [
        SystemMessage(content=state["system_prompt"]),
        HumanMessage(content=user_content),
    ]
    response = llm.invoke(messages)
    content = response.content

    tokens = 0
    if hasattr(response, "response_metadata"):
        usage = response.response_metadata.get("token_usage") or {}
        tokens = usage.get("total_tokens", 0)
    if not tokens:
        tokens = len(content.split()) * 2

    return {**state, "result": content, "tokens_used": tokens}


def build_graph(llm, has_web_search: bool):
    graph = StateGraph(AgentState)
    graph.add_node("llm", lambda s: call_llm_node(llm, s))

    if has_web_search:
        # search first → feed results to LLM
        graph.add_node("tool", tool_node)
        graph.set_entry_point("tool")
        graph.add_edge("tool", "llm")
        graph.add_edge("llm", END)
    else:
        graph.set_entry_point("llm")
        graph.add_edge("llm", END)

    return graph.compile()


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

            has_web_search = "web_search" in (agent_row.tools or [])
            llm = LLMFactory.get_llm(agent_row.model, agent_row.provider)
            graph = build_graph(llm, has_web_search)

            if has_web_search:
                log.info("tool_call", tool="web_search", query=task)

            initial_state: AgentState = {
                "task": task,
                "system_prompt": agent_row.system_prompt,
                "result": "",
                "search_results": None,
                "tool_names": agent_row.tools or [],
                "tokens_used": 0,
            }

            final_state = graph.invoke(initial_state)

            if has_web_search:
                log.info("tool_result", tool="web_search",
                         result=(final_state.get("search_results") or "")[:200])

            tokens = final_state["tokens_used"]
            cost = round((tokens / 1000) * COST_PER_1K.get(agent_row.provider, 0.002), 8)
            duration = time.perf_counter() - t0

            span.set_attribute("tokens_used", tokens)
            span.set_attribute("cost_usd", cost)

            save_message(db, sender_id=agent_id, content=final_state["result"],
                         message_type="agent_response", tokens_used=tokens, cost=cost)

            log.info("agent_execute_end", tokens=tokens, cost=cost,
                     result_preview=final_state["result"][:120])

            record_agent_execution(provider=agent_row.provider, tokens=tokens,
                                   cost=cost, duration=duration, status="success")

            return {"result": final_state["result"], "tokens_used": tokens, "cost": cost}

        except Exception as exc:
            span.record_exception(exc)
            span.set_status(otel_trace.StatusCode.ERROR, str(exc))
            record_agent_execution(provider="unknown", tokens=0, cost=0.0,
                                   duration=time.perf_counter() - t0, status="error")
            raise
        finally:
            db.close()


agent_executor = AgentExecutor()
