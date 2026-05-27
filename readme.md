# AI Agent Orchestration Platform

Minimal multi-LLM agent platform — FastAPI + LangGraph + PostgreSQL + Redis.

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and set your LLM_PROVIDER + matching API key
```

### 2. Start all services

```bash
docker-compose up --build
```

### 3. Run database migrations

Migrations run automatically on first `docker-compose up` via the
`/docker-entrypoint-initdb.d` mount. To run manually:

```bash
docker exec -i postgres psql -U postgres -d agent_db < migrations/001_init.sql
```

---

## Setting the LLM Provider

Edit `.env`:

| Provider | Key to set | Model var |
|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| `groq` | `GROQ_API_KEY` | *(model passed per agent)* |
| `ollama` | *(none)* | `OLLAMA_BASE_URL` |

---

## API Examples

### Create an agent

```bash
curl -s -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Research Agent",
    "role": "researcher",
    "system_prompt": "You are a helpful research assistant.",
    "model": "openai/gpt-3.5-turbo",
    "provider": "openrouter",
    "tools": ["web_search"]
  }' | jq .
```

### List all agents

```bash
curl -s http://localhost:8000/agents | jq .
```

### Get a specific agent

```bash
curl -s http://localhost:8000/agents/<agent_id> | jq .
```

### Execute an agent

```bash
curl -s -X POST http://localhost:8000/agents/<agent_id>/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What are the latest trends in AI agents?"}' | jq .
```

### Run the same agent twice (logs show both trace_ids)

```bash
for i in 1 2; do
  curl -s -X POST http://localhost:8000/agents/<agent_id>/execute \
    -H "Content-Type: application/json" \
    -d "{\"task\": \"Run #$i: Summarize LangGraph\"}" | jq .trace_id
done
```

### Check saved messages in PostgreSQL

```bash
docker exec -it postgres psql -U postgres -d agent_db \
  -c "SELECT id, message_type, tokens_used, cost, timestamp FROM messages ORDER BY timestamp DESC LIMIT 10;"
```

---

## Why These Technologies?

### AI Framework — LangGraph

LangGraph was chosen over CrewAI, AutoGen, and a custom runtime because it exposes **first-class `StateGraph` primitives** that map directly onto the visual workflow canvas. Each node in the UI becomes a LangGraph node; each edge becomes a `add_edge()` or `add_conditional_edges()` call. The `WorkflowState` TypedDict is the message bus — agents communicate asynchronously by writing `current_output`, which the next node reads as its input. This is graph-native async message passing, not direct agent-to-agent calls.

Additional reasons:
- **Conditional routing built-in** (`add_conditional_edges` with a router closure) — enables feedback loops and branching without a hand-rolled BFS scheduler
- **Checkpointing** — LangGraph supports node-level state persistence; this project saves each node's input/output to `workflow_execution_checkpoints`
- **Per-agent sub-graphs** — each agent itself runs a LangGraph `StateGraph` (`llm_node → tool_node → END`) inside the workflow graph

### Backend — Python + FastAPI

- **Async-first**: FastAPI's `BackgroundTasks` enables non-blocking workflow execution — the POST `/execute` endpoint returns 202 immediately while the graph runs in the background
- **Type safety**: Pydantic schemas catch malformed workflow definitions at the API boundary before they reach LangGraph
- **Auto-generated OpenAPI docs** at `/docs` — usable without a separate client

### Frontend — React + React Flow

- **React Flow v11** is the standard library for node-graph UIs; it provides drag-and-drop, `ConnectionMode.Loose`, `MarkerType` arrowheads, and `useReactFlow().project()` out of the box — no custom canvas math needed
- **Zustand** for lightweight sidebar state (persisted to `localStorage`)
- **Recharts** for live cost/token charts on the Dashboard

### Persistence — PostgreSQL + pgvector

- **Relational structure** for agents, workflows, executions, messages, and tool definitions
- **JSONB columns** (`config`, `definition`, `node_outputs`) for schema-flexible data without a separate document store
- **pgvector extension** available for future semantic memory/embedding features without adding a second database

### Messaging — Redis

Redis provides the pub/sub infrastructure for future async task handoff between agents. The `QueueManager` (`backend/services/queue_manager.py`) is wired but acts as an extension point — Telegram webhook processing already routes through it.

### Observability — Prometheus + Jaeger + Grafana

- Full distributed tracing from HTTP request through LangGraph node execution to database write (OTLP → Jaeger)
- Per-provider token and cost counters available as Prometheus metrics, dashboarded in Grafana
- Structured JSON logs (structlog) broadcast over WebSocket to the Live Logs page in real time

---

## Architecture

```
+-------------------------------------------------+
|  Client (curl / frontend)                       |
+----------------------+--------------------------+
                       | HTTP
+----------------------v--------------------------+
|  FastAPI (main.py)                              |
|  * trace_id middleware (UUID per request)       |
|  * POST /agents  GET /agents  GET /agents/:id   |
|  * POST /agents/:id/execute                     |
+----------------------+--------------------------+
                       |
+----------------------v--------------------------+
|  AgentExecutor (executor.py)                    |
|  * LLMFactory -> OpenAI / OpenRouter / Groq /   |
|    Ollama                                       |
|  * LangGraph state machine                      |
|    llm_node -> (tool_node) -> END               |
|  * web_search tool (mock)                       |
|  * structlog: start / tool_call / result / end  |
+----------+-------------------+-----------------+
           |                   |
+----------v----------+ +------v----------+
|  PostgreSQL 15      | |  Redis 7         |
|  + pgvector         | |  (available for  |
|  agents / workflows | |   caching/queues)|
|  messages           | +-----------------+
+---------------------+
```

### Log format (stdout, one JSON object per line)

```json
{
  "timestamp": "2024-01-15T10:23:45.123456Z",
  "level": "info",
  "message": "agent_execute_start",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": "123e4567-e89b-12d3-a456-426614174000",
  "task": "What are AI agents?"
}
```

---

## File Structure

```
.
+-- docker-compose.yml
+-- .env.example
+-- migrations/
|   +-- 001_init.sql
+-- backend/
    +-- Dockerfile
    +-- requirements.txt
    +-- config.py          # Pydantic settings
    +-- logging_config.py  # structlog setup
    +-- models.py          # Pydantic schemas
    +-- db.py              # SQLAlchemy ORM + helpers
    +-- executor.py        # LLMFactory + LangGraph + AgentExecutor
    +-- main.py            # FastAPI app + routes
```
