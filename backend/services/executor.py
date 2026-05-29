from __future__ import annotations
import time
from typing import Any, Dict, List, Optional, TypedDict
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
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


@_tracer.start_as_current_span("tool_call")
def web_search(query: str) -> str:
    span = otel_trace.get_current_span()
    span.set_attribute("tool.name", "web_search")

    # Tavily rejects queries over ~400 chars; trim to the first sentence or 400 chars.
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

    results: List[Dict] = response.get("results", [])
    if not results:
        return f"No results found for: {trimmed}"

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
    # Conversation history: list of {"role": "human"|"ai", "content": str}
    history: List[Dict[str, str]]


def tool_node(state: AgentState) -> AgentState:
    if "web_search" not in state.get("tool_names", []):
        return state
    results = web_search(state["task"])
    return {**state, "search_results": results}


def call_llm_node(llm, state: AgentState) -> AgentState:
    # Build message list: system + history turns + current task
    messages = [SystemMessage(content=state["system_prompt"])]

    for turn in state.get("history", []):
        if turn["role"] == "human":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))

    search_results = state.get("search_results")
    if search_results:
        user_content = (
            f"Search results for context:\n{search_results}\n\n"
            f"Using the above search results, answer the following:\n{state['task']}"
        )
    else:
        user_content = state["task"]

    messages.append(HumanMessage(content=user_content))

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

            # Extract config values — fall back to sensible defaults
            cfg             = agent_row.config or {}
            temperature     = float(cfg.get("temperature", 0.7))
            max_tokens      = int(cfg.get("max_tokens", 2048))
            max_iterations  = int(cfg.get("max_iterations", 10))
            memory_type     = str(cfg.get("memory_type", "buffer"))
            memory_window   = int(cfg.get("memory_window", 10))

            log.info("agent_config_applied",
                     temperature=temperature, max_tokens=max_tokens,
                     max_iterations=max_iterations,
                     memory_type=memory_type, memory_window=memory_window)

            # Load conversation history according to memory settings
            if memory_type == "none":
                history = []
                log.info("agent_memory_disabled")
            else:
                # memory_window = number of turns; each turn = 2 messages (human + ai)
                limit = memory_window * 2
                history_rows = get_agent_history(db, agent_id, limit=limit)
                history = [
                    {
                        "role": "human" if row.message_type == "user_message" else "ai",
                        "content": row.content,
                    }
                    for row in history_rows
                ]
                log.info("agent_memory_loaded",
                         memory_type=memory_type, window=memory_window, turns=len(history))

            # Persist the user's task before execution so it's part of future history
            save_message(db, receiver_id=agent_id, content=task,
                         message_type="user_message")

            has_web_search = "web_search" in (agent_row.tools or [])
            llm = LLMFactory.get_llm(
                agent_row.model, agent_row.provider,
                temperature=temperature, max_tokens=max_tokens,
            )
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
                "history": history,
            }

            final_state = graph.invoke(
                initial_state,
                config={"recursion_limit": max_iterations},
            )

            if has_web_search:
                log.info("tool_result", tool="web_search",
                         result=(final_state.get("search_results") or "")[:200])

            tokens = final_state["tokens_used"]
            cost = round((tokens / 1000) * COST_PER_1K.get(agent_row.provider, 0.002), 8)
            duration = time.perf_counter() - t0

            span.set_attribute("tokens_used", tokens)
            span.set_attribute("cost_usd", cost)

            # Persist the agent's response for future history recall
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
