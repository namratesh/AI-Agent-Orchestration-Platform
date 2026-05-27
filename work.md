# AI Agent Orchestration Platform — Technical Documentation

This document provides a comprehensive explanation of the architecture, files, classes, functions, and tools used in the AI Agent Orchestration Platform.

---

## 1. Directory & File Structure

```text
AI Agent Orchestration Platform/
├── docker-compose.yml       # Docker definitions (PostgreSQL, Redis, Backend, Frontend, Prometheus, Grafana, Jaeger)
├── migrations/              # Database migration SQL files (001_init.sql, 002_executions.sql, etc.)
├── backend/
│   ├── Dockerfile           # Backend application container configuration
│   ├── requirements.txt     # Python backend dependencies
│   ├── main.py              # FastAPI application entrypoint & middleware setup
│   ├── instrumentation.py   # OpenTelemetry tracing and Prometheus metrics exporter setup
│   ├── api/                 # API endpoint routers
│   │   ├── agents.py        # CRUD & execution endpoints for individual agents
│   │   ├── executions.py    # Querying and deleting execution history records
│   │   ├── logs.py          # WebSocket/SSE streaming endpoints for real-time logs
│   │   ├── stats.py         # Dashboard analytics and metric calculations
│   │   ├── telegram.py      # Webhook callback registration for Telegram chat mapping
│   │   ├── tools.py         # CRUD and testing interfaces for custom HTTP tools
│   │   └── workflows.py     # CRUD and execution triggers for multi-agent workflows
│   ├── core/
│   │   ├── config.py        # Environment variables & key configuration schema (Pydantic Settings)
│   │   └── logging_config.py # Structured logging configuration (structlog framework)
│   ├── db/
│   │   └── db.py            # SQLAlchemy database engine, ORM schemas, and CRUD utilities
│   ├── schemas/
│   │   └── models.py        # Pydantic schemas for data validation and serialization
│   └── services/
│       ├── executor.py      # LangGraph single-agent StateGraph compiler & LLM executor
│       ├── workflow_executor.py # Dynamic LangGraph compiler for multi-agent DAG workflows
│       ├── queue_manager.py # Redis client manager for queue synchronization
│       ├── log_broadcaster.py # WebSocket trace log listener broadcasting helper
│       ├── telegram_handler.py # Incoming Telegram text payload to workflow execution translator
│       └── crypto.py        # Safe credentials encryption/decryption helper
```

---

## 2. Component Explanations

### 2.1. Core Application Entrypoints
* **[main.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/main.py)**: Initializes the [FastAPI](https://fastapi.tiangolo.com) application. Registers middlewares like `trace_id_middleware` (attaches a unique UUID `trace_id` header to requests), handles lifespan startup sequences, and mounts routers for all modules.
* **[instrumentation.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/instrumentation.py)**: Sets up OpenTelemetry (OTel) auto-instrumentation for the engine, shipping trace spans to Jaeger, and registers custom Prometheus metrics tracking agent and workflow executions.

### 2.2. Configuration & Utilities
* **[core/config.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/core/config.py)**: Uses Pydantic V2 `BaseSettings` to load parameters from `.env`. Manages database connection strings (`DATABASE_URL`), Redis URL (`REDIS_URL`), third-party LLM key variables (OpenAI, OpenRouter, Groq, Tavily, Telegram), and encryption credentials.
* **[core/logging_config.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/core/logging_config.py)**: Sets up structured JSON-based console logging using the `structlog` framework.

### 2.3. Persistence & Schemas
* **[db/db.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/db/db.py)**:
  * Manages the database engine with pooling configurations.
  * Declares SQLAlchemy database model classes:
    * `AgentORM`: Registers names, role description definitions, system prompts, models, parameters, and tools list mapping.
    * `WorkflowORM`: Holds the multi-agent DAG graph schema structures.
    * `MessageORM`: Persists session chat histories.
    * `WorkflowExecutionCheckpointORM`: Tracks step progress state snapshots at individual nodes.
    * `ToolORM`: Maps custom HTTP API requests headers, URLs, templates, and credentials.
    * `WorkflowExecutionORM`: Records logs, status reports, execution duration, tokens, cost metrics, and intermediate outputs.
  * Contains helper functions like `create_execution_queued()`, `update_execution()`, and query utilities.
* **[schemas/models.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/schemas/models.py)**: Defines standard Pydantic models for validation and serialization:
  * `Agent`, `WorkflowNode`, `WorkflowEdge`, `WorkflowDefinition`, `ExecutionRecord`, and custom response definitions.

### 2.4. Custom API Routers
* **[api/agents.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/api/agents.py)**: CRUD endpoints and test execution pathways for individual agents.
* **[api/workflows.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/api/workflows.py)**: Creates and retrieves multi-agent workflows, dispatching execution to background threads.
* **[api/tools.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/api/tools.py)**: Manages registration, update, delete, and test request parameters for custom tools.
* **[api/executions.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/api/executions.py)**: Accesses previous workflow execution history records.
* **[api/stats.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/api/stats.py)**: Tallies dashboard KPIs, counts executions, and summarizes total costs.

---

## 3. Dynamic Execution Framework

### 3.1. Single-Agent Executions
The agent execution logic in **[services/executor.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/services/executor.py)** runs inside a LangGraph process:
1. **Model Instantiation**: `LLMFactory.get_llm()` constructs the appropriate LangChain model client (OpenAI, OpenRouter, Groq, or Ollama) with temperature and max token bounds.
2. **Built-in Tools**: If `"web_search"` is enabled in the agent tools collection, it imports and triggers the `web_search()` function, which uses the official `TavilyClient` to retrieve web page results.
3. **LangGraph State Pipeline**:
   * Uses `AgentState` to pass around the task, prompt, search results context, token counts, and conversation history.
   * `build_graph()` constructs the DAG layout:
     * If `web_search` is registered: `tool_node` (performs Tavily query) → `call_llm_node` (submits prompt array + search context context to LLM) → `END`.
     * Without search: `call_llm_node` → `END`.

### 3.2. Multi-Agent Workflows
The multi-agent execution pipeline in **[services/workflow_executor.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/services/workflow_executor.py)** compiles the workflow dynamically into a unified LangGraph:
1. **State Definition**: Tracks execution input text, node responses (`node_outputs` dictionary), and running costs/tokens.
2. **Dynamic Graph Construction**:
   * `_build_langgraph()` converts the canvas nodes and edges schema into a compiled `StateGraph`.
   * For **AGENT** nodes, `_make_agent_node()` creates a node function that delegates execution to `AgentExecutor.execute()`, then persists a execution progress checkpoint via `save_checkpoint()`.
   * For **TOOL** nodes, `_make_tool_node()` makes an HTTP API request (translating standard templates and headers), recording the payload.
3. **Graph Routing Configuration**:
   * Simple linear connections are mapped using `graph.add_edge()`.
   * Conditional branch connections analyze the most recent node's output against criteria (contains, equals, is not empty) using `add_conditional_edges()`.
4. **Output Tracking**:
   * On workflow completion or error, `WorkflowExecutor.execute()` saves the final outcome status and the complete per-node execution map `node_outputs` into the `workflow_executions` table.
