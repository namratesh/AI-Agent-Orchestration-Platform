from __future__ import annotations
from typing import Any, Dict, TypedDict
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from core.config import settings
from core.logging_config import get_logger
from db.db import SessionLocal, get_agent, save_message

logger = get_logger(__name__)

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


def web_search(query: str) -> str:
    return (
        f"[mock search results for '{query}'] "
        "1. Example result: AI agents are autonomous software entities. "
        "2. LangGraph enables stateful multi-actor applications. "
        "3. OpenRouter provides unified LLM access."
    )


class AgentState(TypedDict):
    task: str
    system_prompt: str
    result: str
    tool_calls: list
    tokens_used: int


def call_llm_node(llm, state: AgentState) -> AgentState:
    messages = [
        SystemMessage(content=state["system_prompt"]),
        HumanMessage(content=state["task"]),
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


def tool_node(state: AgentState) -> AgentState:
    results = []
    for call in state.get("tool_calls", []):
        if call.get("name") == "web_search":
            results.append(web_search(call.get("args", {}).get("query", "")))
    return {**state, "tool_calls": results}


def should_use_tool(state: AgentState) -> str:
    return "tool" if state.get("tool_calls") else END


def build_graph(llm):
    graph = StateGraph(AgentState)
    graph.add_node("llm", lambda s: call_llm_node(llm, s))
    graph.add_node("tool", tool_node)
    graph.set_entry_point("llm")
    graph.add_conditional_edges("llm", should_use_tool, {"tool": "tool", END: END})
    graph.add_edge("tool", END)
    return graph.compile()


class AgentExecutor:
    def execute(self, agent_id: UUID, task: str, trace_id: str) -> Dict[str, Any]:
        log = logger.bind(trace_id=trace_id, agent_id=str(agent_id))
        log.info("agent_execute_start", task=task)

        db = SessionLocal()
        try:
            agent_row = get_agent(db, agent_id)
            if agent_row is None:
                raise ValueError(f"Agent {agent_id} not found")

            llm = LLMFactory.get_llm(agent_row.model, agent_row.provider)
            graph = build_graph(llm)

            tool_calls = []
            if "web_search" in (agent_row.tools or []):
                tool_calls = [{"name": "web_search", "args": {"query": task}}]
                log.info("tool_call", tool="web_search", query=task)

            initial_state: AgentState = {
                "task": task,
                "system_prompt": agent_row.system_prompt,
                "result": "",
                "tool_calls": tool_calls,
                "tokens_used": 0,
            }

            final_state = graph.invoke(initial_state)

            if tool_calls:
                log.info("tool_result", tool="web_search",
                         result=final_state.get("tool_calls", []))

            tokens = final_state["tokens_used"]
            cost = round((tokens / 1000) * COST_PER_1K.get(agent_row.provider, 0.002), 8)

            save_message(db, sender_id=agent_id, content=final_state["result"],
                         message_type="agent_response", tokens_used=tokens, cost=cost)

            log.info("agent_execute_end", tokens=tokens, cost=cost,
                     result_preview=final_state["result"][:120])

            return {"result": final_state["result"], "tokens_used": tokens, "cost": cost}
        finally:
            db.close()


agent_executor = AgentExecutor()
