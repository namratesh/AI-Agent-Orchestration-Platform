# AI Agent Orchestration Platform

A full-stack platform for creating, configuring, and connecting AI agents into collaborative multi-agent workflows. Agents run on a real LangGraph runtime, execute real tools, communicate asynchronously, and are reachable through Telegram. Everything is managed through a visual React web interface.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Quick Start](#quick-start)
4. [LLM Provider Setup](#llm-provider-setup)
5. [Web UI Pages](#web-ui-pages)
6. [Agent Configuration](#agent-configuration)
7. [Building Workflows](#building-workflows)
8. [Workflow Schedules](#workflow-schedules)
9. [Telegram Integration](#telegram-integration)
10. [Web Search (Tavily)](#web-search-tavily)
11. [HTTP Tool Nodes](#http-tool-nodes)
12. [API Reference](#api-reference)
13. [Observability](#observability)
14. [Database Schema](#database-schema)
15. [File Structure](#file-structure)
16. [Why These Technologies](#why-these-technologies)

---

## Features

| Feature | Details |
|---|---|
| Agent builder | Create agents with custom personality, system prompt, LLM provider, model, tools, memory, and output limits |
| Visual workflow builder | Drag-and-drop React Flow canvas — connect agents and HTTP tool nodes into DAG pipelines |
| Conditional routing | Branch workflows based on agent output: `contains`, `equals`, `not_contains`, `not_equals` |
| Async execution | POST returns 202 immediately; frontend polls until complete; status: queued → running → success/error |
| Workflow schedules | Run workflows automatically on a cron expression or interval trigger |
| Pre-built templates | "Research & Summarize" and "Content Pipeline" to start fast |
| Inter-agent message trace | Inspect each node's output in Execution History detail modal |
| Web search | Agents with Tavily search retrieve live context before the LLM call |
| HTTP tool nodes | Call any external API inline in a workflow with `{{input}}` templating |
| Telegram integration | Map a Telegram chat to a workflow — messages trigger executions |
| Conversation memory | Sliding-window buffer loads prior turns from PostgreSQL before each execution |
| Live logs | WebSocket stream of structured JSON logs with level filter and pause/resume |
| Observability | Prometheus metrics, Jaeger distributed traces, Grafana dashboards |
| Token & cost tracking | Every execution records tokens used and USD cost |
| API key encryption | Tool API keys encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Flow v11, Zustand, Recharts |
| Backend | Python 3.11, FastAPI, Pydantic V2, Uvicorn |
| AI runtime | LangGraph `StateGraph` (single-agent and multi-agent) |
| LLM providers | OpenRouter, OpenAI, Groq, Ollama |
| Web search | Tavily Search API |
| Database | PostgreSQL 15 + pgvector extension |
| Cache / queues | Redis 7 + RQ (task queue) |
| Scheduler | APScheduler 3 (BackgroundScheduler) |
| Observability | OpenTelemetry → Jaeger, Prometheus, Grafana |
| Messenger | Telegram Bot API (webhook) |

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url>
cd "AI Agent Orchestration Platform"
cp .env.example .env
# Edit .env — set LLM_PROVIDER and the matching API key (see LLM Provider Setup)
```

### 2. Start all services

```bash
docker compose up --build
```

Eight containers start: `backend`, `worker`, `frontend`, `postgres`, `redis`, `jaeger`, `prometheus`, `grafana`.

Wait for:
```
backend  | INFO:     Application startup complete.
```

### 3. Apply migrations (existing installs only)

On a **fresh** volume, migrations run automatically. On an existing volume apply them manually in order:

```bash
docker exec -i postgres psql -U postgres -d agent_db < migrations/002_executions.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/003_tools.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/004_node_outputs.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/005_schedules.sql
```

All migrations use `IF NOT EXISTS` — safe to re-run.

For a clean slate:

```bash
docker compose down -v && docker compose up --build
```

### 4. Open the UI

| Service | URL | Notes |
|---|---|---|
| Web UI | http://localhost:3000 | Main interface |
| API docs | http://localhost:8000/docs | Swagger / OpenAPI |
| Grafana | http://localhost:3001 | Login: `admin` / `admin` |
| Jaeger | http://localhost:16686 | Distributed traces |
| Prometheus | http://localhost:9090 | Metrics storage |

---

## LLM Provider Setup

Edit `.env` before starting the stack:

| Provider | Set this key | Set this model variable |
|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (e.g. `openai/gpt-4o-mini`) |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` (e.g. `gpt-4o`) |
| `groq` | `GROQ_API_KEY` | *(model is set per agent in the UI)* |
| `ollama` | *(none)* | `OLLAMA_BASE_URL` (e.g. `http://host.docker.internal:11434`) |

Set `LLM_PROVIDER` to one of `openrouter`, `openai`, `groq`, or `ollama`.

After changing `.env`:

```bash
docker compose restart backend
```

---

## Web UI Pages

The sidebar follows the natural build → run → observe journey:

| Route | Page | What you can do |
|---|---|---|
| `/dashboard` | Dashboard | Live stats cards, 7-day cost chart, recent execution timeline, quick-start shortcuts |
| `/agents` | Agents | Create agents with personality, tools, and advanced config; search; delete |
| `/tools` | Tools | Create HTTP API tool nodes with auth headers, body templates, `{{variable}}` placeholders, live test panel |
| `/workspace` | Workspace | Three-panel drag-and-drop canvas — agents left, canvas center, tools right. Save to `/workflows` |
| `/workflows` | Workflows | List of saved workflows — templates, inline run, schedule manager, delete |
| `/executor` | Executor | Pick a workflow, enter a task, watch async execution with progress bar and status transitions |
| `/history` | Execution History | Sortable/filterable table, inter-agent message trace in detail modal, CSV export |
| `/logs` | Live Logs | Real-time WebSocket JSON log stream — level filter, click to expand, pause/resume |
| `/settings` | Settings | API key viewer, Telegram chat-to-workflow mapping, links to Grafana / Jaeger / Prometheus |

---

## Agent Configuration

### Basic fields

| Field | Description |
|---|---|
| Name | Display name |
| Role | Short role label (e.g. `researcher`, `writer`) |
| System Prompt | Personality and behavioral instructions |
| LLM Provider | `openrouter`, `openai`, `groq`, or `ollama` |
| Model | Model identifier (e.g. `openai/gpt-4o-mini`) |
| Tools | Enable `web_search` for Tavily-powered live search |

### Advanced configuration (collapsible section in the UI)

| Field | Effect | Default | Range |
|---|---|---|---|
| Temperature | LLM sampling randomness | 0.7 | 0.0 – 2.0 |
| Max Tokens | Maximum output tokens per call | 2048 | 256 – 8192 |
| Max Iterations | LangGraph recursion limit | 10 | 1 – 20 |
| Memory Type | `buffer` loads history; `none` disables it | buffer | — |
| Memory Window | Prior turns to inject (each turn = 2 messages) | 10 | 1 – 50 |
| Max Output Words | Guardrail — truncates output to N words (`0` = unlimited) | 0 | 0 – 5000 |

### How memory works

1. Before execution: loads the last `memory_window × 2` messages from the `messages` table (ordered oldest → newest)
2. Injects them as `HumanMessage` / `AIMessage` pairs before the current task
3. After execution: saves the new user message and agent response back to the `messages` table

Verify memory is working:

```bash
curl -s -X POST http://localhost:8000/agents/<id>/execute \
  -H "Content-Type: application/json" -d '{"task": "My name is Alice"}' | jq .result

curl -s -X POST http://localhost:8000/agents/<id>/execute \
  -H "Content-Type: application/json" -d '{"task": "What is my name?"}' | jq .result
# Expected: agent mentions "Alice"
```

---

## Building Workflows

### Using the Workspace canvas

1. Go to **Workspace** (`/workspace`)
2. Drag **agents** from the left panel onto the canvas
3. Drag **tools** from the right panel onto the canvas
4. Draw edges between nodes by dragging from any handle (top / left / right / bottom)
5. Click an edge to add a **routing condition**
6. Edit the workflow name by clicking it in the toolbar
7. Click **Save Workflow** — requires at least one agent node

### Edge colors

| Color | Connection type |
|---|---|
| Indigo | Agent → Agent |
| Emerald | Tool → Agent |
| Amber | Agent → Tool |
| Purple | Tool → Tool |

### Conditional routing

Click any edge to open the condition popup:

| Condition | Passes when the previous node's output… |
|---|---|
| `always` | always (default) |
| `contains` | contains a given string |
| `not_contains` | does not contain a given string |
| `equals` | exactly matches a given string |
| `not_equals` | does not exactly match a given string |

If no outgoing condition matches, the workflow routes to `END` at that node. Add an `always` fallback edge for exhaustive routing.

### Pre-built templates

Click **Templates** on the Workflows page (`/workflows`):

| Template | Structure |
|---|---|
| Research & Summarize | Research Agent → Summarizer Agent (2 nodes, 1 edge) |
| Content Pipeline | Data Collector → Analyzer Agent → Report Writer (3 nodes, 2 edges) |

"Use Template" opens the Workspace with pre-placed placeholder nodes. Drag real agents onto the canvas or into existing node positions, then save.

### How LangGraph builds the graph at runtime

`workflow_executor.py` compiles a fresh `StateGraph` for every execution:

1. Each `AGENT` node → `_make_agent_node()` — runs the agent's own sub-graph, saves checkpoint
2. Each `TOOL` node → `_make_tool_node()` — fires the HTTP request with `current_output` substituted
3. Edges with one outgoing `always` condition → `graph.add_edge()`
4. Edges with conditions or multiple outgoing edges → `graph.add_conditional_edges()` with a router closure
5. Terminal nodes (no outgoing edges) → `graph.add_edge(node, END)`

Shared state across all nodes:

```python
class WorkflowState(TypedDict):
    task:           str              # original user task — never mutated
    current_output: str              # output of the last node; next node's input
    node_outputs:   Dict[str, str]   # accumulates per-node results
    tokens_used:    int
    cost:           float
```

---

## Workflow Schedules

Click the **alarm clock icon** on any workflow card in `/workflows` to open the Schedule modal.

### Preset triggers

| Preset | Trigger |
|---|---|
| Every 30 min | Interval — 30 minutes |
| Every hour | Interval — 60 minutes |
| Every 6 hours | Interval — 360 minutes |
| Daily (9 am) | Cron `0 9 * * *` |
| Weekly (Mon) | Cron `0 9 * * 1` |
| Custom cron | Any 5-field cron expression (e.g. `0 8 * * 1-5`) |

Set a default task text, then click **Create Schedule**. Toggle schedules on/off with the toggle switch. Delete individual schedules with the trash icon.

Scheduled executions appear in Execution History with `source: scheduled`.

### How it works

On startup, APScheduler loads all enabled `workflow_schedules` rows from the database and registers each as a job. When a job fires, it:

1. Creates a queued execution record (`status: "queued"`, `source: "scheduled"`)
2. Updates `last_run_at` on the schedule row
3. Runs `WorkflowExecutor.execute()` — identical path to the HTTP execute endpoint

### Schedule API

```bash
BASE=http://localhost:8000

# List schedules for a workflow
curl -s $BASE/workflows/<wf-id>/schedules | jq .

# Create a schedule
curl -s -X POST $BASE/workflows/<wf-id>/schedules \
  -H "Content-Type: application/json" \
  -d '{"task": "Daily briefing", "cron_expression": "0 9 * * *"}' | jq .

# Disable a schedule
curl -s -X PUT $BASE/schedules/<sched-id> \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' | jq .

# Delete a schedule
curl -s -X DELETE $BASE/schedules/<sched-id>
```

---

## Telegram Integration

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token
2. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your-token-here
   TELEGRAM_WEBHOOK_SECRET=any-random-string
   ```
3. Register your webhook URL with Telegram:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-host>/telegram/webhook&secret_token=<SECRET>"
   ```
4. In the UI (`/settings`) map a Telegram chat ID to a workflow

### How it works

Any message sent to the bot fires the mapped workflow with the message text as the task. The agent's response is sent back to the chat. The webhook is validated using `X-Telegram-Bot-Api-Secret-Token`.

### Mapping API

```bash
BASE=http://localhost:8000

# Create mapping
curl -s -X POST $BASE/telegram/mappings \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "123456789", "workflow_id": "<wf-id>", "username": "alice"}' | jq .

# List mappings
curl -s $BASE/telegram/mappings | jq .

# Delete mapping
curl -s -X DELETE $BASE/telegram/mappings/123456789
```

---

## Web Search (Tavily)

### Setup

Add your Tavily key to `.env`:

```
TAVILY_API_KEY=tvly-your-key-here
```

Get a free key at [app.tavily.com](https://app.tavily.com).

Restart the backend:

```bash
docker compose restart backend
```

### Usage

Enable `web_search` when creating an agent in the UI. The agent's LangGraph sub-graph becomes:

```
tool_node (Tavily search) → llm_node (answer with search context) → END
```

Without the tool, the sub-graph is just:

```
llm_node → END
```

If the key is missing or still set to the placeholder, the agent returns a clear "not configured" message.

---

## HTTP Tool Nodes

Create a tool at `/tools` and drag it onto the workflow canvas.

### Tool fields

| Field | Purpose |
|---|---|
| Method | GET / POST / PUT / DELETE / PATCH |
| URL | Endpoint URL — supports `{{variable}}` placeholders |
| Headers | Custom request headers |
| Body Template | JSON body — `{{input}}` is replaced with the previous node's output at runtime |
| API Key | Stored encrypted; never returned in API responses |
| API Key Header | Header name for the key (default: `Authorization`) |
| API Key Prefix | Prefix prepended to the key (default: `Bearer`) |
| Timeout | Request timeout in seconds (default: 30) |

### Testing a tool

Use the **live test panel** in the UI or:

```bash
curl -s -X POST http://localhost:8000/tools/<id>/test \
  -H "Content-Type: application/json" \
  -d '{"variables": {"city": "London"}, "params": {}, "body_override": ""}' | jq .
```

### API key security

Keys are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before being written to the database. `GET /tools` always returns `"••••••"` — plaintext never leaves the server. Sending `"••••••"` in a PUT request leaves the stored key unchanged.

Generate a new encryption key:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set it as `TOOL_ENCRYPTION_KEY` in `.env`. Rotating this key makes existing stored keys unreadable — re-enter API keys for each tool after rotating.

---

## API Reference

```bash
BASE=http://localhost:8000

# ── Agents ────────────────────────────────────────────────────────────────────

curl -s $BASE/agents | jq .

curl -s -X POST $BASE/agents -H "Content-Type: application/json" -d '{
  "name": "Researcher",
  "role": "researcher",
  "system_prompt": "You are a research assistant.",
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "tools": ["web_search"],
  "config": {
    "temperature": 0.7,
    "max_tokens": 2048,
    "max_iterations": 10,
    "memory_type": "buffer",
    "memory_window": 10,
    "max_output_words": 0
  }
}' | jq .

curl -s $BASE/agents/<id> | jq .
curl -s -X DELETE $BASE/agents/<id>

curl -s -X POST $BASE/agents/<id>/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What is LangGraph?"}' | jq .

# ── Tools ─────────────────────────────────────────────────────────────────────

curl -s $BASE/tools | jq .

curl -s -X POST $BASE/tools -H "Content-Type: application/json" -d '{
  "name": "Weather API",
  "description": "Fetch current weather",
  "method": "GET",
  "url": "https://api.openweathermap.org/data/2.5/weather?q={{city}}&appid={{API_KEY}}",
  "headers": {},
  "body_template": "",
  "api_key": "your-key",
  "api_key_header": "Authorization",
  "api_key_prefix": "Bearer",
  "timeout_seconds": 10
}' | jq .

curl -s -X PUT $BASE/tools/<id> -H "Content-Type: application/json" \
  -d '{"timeout_seconds": 15}' | jq .
curl -s -X DELETE $BASE/tools/<id>

curl -s -X POST $BASE/tools/<id>/test -H "Content-Type: application/json" \
  -d '{"variables": {"city": "London"}, "params": {}, "body_override": ""}' | jq .

# ── Workflows ─────────────────────────────────────────────────────────────────

curl -s $BASE/workflows | jq .

curl -s -X POST $BASE/workflows -H "Content-Type: application/json" -d '{
  "name": "Research → Summary",
  "definition": {
    "nodes": [
      {"id": "n1", "type": "AGENT", "agent_id": "<researcher-id>", "config": {}},
      {"id": "n2", "type": "AGENT", "agent_id": "<writer-id>",     "config": {}}
    ],
    "edges": [
      {"source_node_id": "n1", "target_node_id": "n2", "connection_type": "agent_sequence"}
    ],
    "start_node_id": "n1"
  }
}' | jq .

curl -s -X DELETE $BASE/workflows/<id>

# Execute — returns 202 immediately
RESP=$(curl -s -X POST $BASE/workflows/<id>/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "Summarise AI news"}')
echo $RESP | jq .
EXEC_ID=$(echo $RESP | jq -r .execution_id)

# Poll until done
until [[ "$(curl -s $BASE/executions/$EXEC_ID | jq -r .status)" =~ ^(success|error)$ ]]; do
  sleep 2
done
curl -s $BASE/executions/$EXEC_ID | jq '{status, result, tokens_used, cost, node_outputs}'

# Conditional workflow example
curl -s -X POST $BASE/workflows -H "Content-Type: application/json" -d '{
  "name": "Branching",
  "definition": {
    "nodes": [
      {"id": "classifier", "type": "AGENT", "agent_id": "<id1>", "config": {}},
      {"id": "path-yes",   "type": "AGENT", "agent_id": "<id2>", "config": {}},
      {"id": "path-no",    "type": "AGENT", "agent_id": "<id3>", "config": {}}
    ],
    "edges": [
      {"source_node_id": "classifier", "target_node_id": "path-yes",
       "condition": {"type": "contains", "value": "yes"}, "connection_type": "agent_sequence"},
      {"source_node_id": "classifier", "target_node_id": "path-no",
       "condition": {"type": "not_contains", "value": "yes"}, "connection_type": "agent_sequence"}
    ],
    "start_node_id": "classifier"
  }
}' | jq .

# ── Schedules ────────────────────────────────────────────────────────────────

curl -s $BASE/workflows/<wf-id>/schedules | jq .

curl -s -X POST $BASE/workflows/<wf-id>/schedules \
  -H "Content-Type: application/json" \
  -d '{"task": "Daily briefing", "cron_expression": "0 9 * * *"}' | jq .

curl -s -X POST $BASE/workflows/<wf-id>/schedules \
  -H "Content-Type: application/json" \
  -d '{"task": "Ping every 30 min", "interval_minutes": 30}' | jq .

curl -s -X PUT $BASE/schedules/<sched-id> \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' | jq .

curl -s -X DELETE $BASE/schedules/<sched-id>

# ── Executions ───────────────────────────────────────────────────────────────

curl -s "$BASE/executions?limit=20&offset=0" | jq .
curl -s $BASE/executions/<id> | jq .
curl -s -X DELETE $BASE/executions/<id>

# ── Stats ─────────────────────────────────────────────────────────────────────

curl -s $BASE/stats | jq .

# ── Telegram ──────────────────────────────────────────────────────────────────

curl -s $BASE/telegram/mappings | jq .
curl -s -X POST $BASE/telegram/mappings -H "Content-Type: application/json" \
  -d '{"chat_id": "123456789", "workflow_id": "<wf-id>", "username": "alice"}' | jq .
curl -s -X DELETE $BASE/telegram/mappings/123456789

# ── Checkpoints ───────────────────────────────────────────────────────────────

curl -s $BASE/workflows/<wf-id>/checkpoints | jq .
```

---

## Observability

### Prometheus metrics

```bash
# Verify scrape endpoint (trailing slash required)
curl -sL http://localhost:8000/metrics/ | grep -E "^agent_|^workflow_"

# Query via Prometheus API
curl -s "http://localhost:9090/api/v1/query?query=agent_executions_total" | jq .
```

Emitted metrics:

| Metric | Type | Labels |
|---|---|---|
| `agent_executions_total` | Counter | `provider`, `status` |
| `agent_tokens_total` | Counter | `provider` |
| `agent_cost_total` | Counter | `provider` |
| `agent_execution_duration_seconds` | Histogram | — |
| `workflow_executions_total` | Counter | `status` |

Metrics only appear after the first execution (counters are registered lazily).

### Grafana dashboards

```
http://localhost:3001   →   login: admin / admin
```

The "AI Agent Orchestration Platform" dashboard is auto-provisioned on startup. It shows execution rates, error percentages, token usage, and cost over time.

### Jaeger traces

```
http://localhost:16686   →   service: ai-agent-orchestration
```

Every execution propagates a single `trace_id` across containers. Named spans:
- `agent_execute` — single-agent LangGraph run
- `tool_call` — Tavily search invocation
- `workflow_execute` — full multi-agent workflow
- `workflow_node_execute` — individual node within a workflow

### Live logs (WebSocket)

```bash
# Terminal — requires wscat: npm i -g wscat
wscat -c ws://localhost:8000/ws/logs
```

Or use the **Live Logs** page in the UI (`/logs`). Logs are emitted as structured JSON (structlog) and broadcast in real time.

Log format:
```json
{
  "timestamp": "2025-05-28T09:00:00.000Z",
  "level": "info",
  "event": "workflow_complete",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "workflow_id": "123e4567-e89b-12d3-a456-426614174000",
  "tokens": 847,
  "cost": 0.00042,
  "elapsed": 3.21
}
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `agents` | Agent config: name, role, system\_prompt, model, provider, tools, `config` JSONB |
| `workflows` | Workflow definition DAG: `definition` JSONB (nodes + edges) |
| `tools` | HTTP API tool definitions with encrypted `api_key` |
| `messages` | Agent conversation history (`user_message` / `agent_response` per turn) |
| `workflow_executions` | Execution metadata: status, cost, tokens, elapsed, `node_outputs` JSONB, result |
| `workflow_execution_checkpoints` | Per-step state snapshots for each node in a workflow run |
| `telegram_chat_mappings` | Maps Telegram `chat_id` to a `workflow_id` |
| `workflow_schedules` | Schedule config: cron expression or interval, task text, enabled flag, last/next run time |

Useful queries:

```bash
# Recent executions with cost
docker exec postgres psql -U postgres -d agent_db \
  -c "SELECT status, tokens_used, cost::float, execution_time_seconds::float, source FROM workflow_executions ORDER BY created_at DESC LIMIT 10;"

# Inter-agent node outputs
docker exec postgres psql -U postgres -d agent_db \
  -c "SELECT id, node_outputs FROM workflow_executions ORDER BY created_at DESC LIMIT 3;"

# Agent conversation history
docker exec postgres psql -U postgres -d agent_db \
  -c "SELECT message_type, tokens_used, cost::float FROM messages ORDER BY timestamp DESC LIMIT 10;"

# Active schedules
docker exec postgres psql -U postgres -d agent_db \
  -c "SELECT workflow_id, cron_expression, interval_minutes, enabled, last_run_at FROM workflow_schedules;"

# LangGraph node checkpoints
docker exec postgres psql -U postgres -d agent_db \
  -c "SELECT workflow_id, node_id, state->>'tokens_used' AS tokens FROM workflow_execution_checkpoints ORDER BY timestamp DESC LIMIT 5;"
```

---

## File Structure

```
.
├── docker-compose.yml
├── .env.example
├── prometheus.yml
├── architecture.md              # Mermaid system diagram + sequence diagram
├── migrations/
│   ├── 001_init.sql             # agents, workflows, messages, checkpoints, telegram
│   ├── 002_executions.sql       # workflow_executions table
│   ├── 003_tools.sql            # tools table
│   ├── 004_node_outputs.sql     # node_outputs JSONB column
│   └── 005_schedules.sql        # workflow_schedules table
├── grafana/
│   └── provisioning/            # auto-provisioned datasource + dashboard
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                  # FastAPI app, routers, startup/shutdown hooks
│   ├── core/
│   │   ├── config.py            # Pydantic settings (reads .env)
│   │   └── logging_config.py    # structlog + WebSocket broadcaster setup
│   ├── db/
│   │   └── db.py                # SQLAlchemy ORM models + all DB helper functions
│   ├── schemas/
│   │   └── models.py            # Pydantic request/response schemas
│   ├── api/
│   │   ├── agents.py            # GET/POST/DELETE /agents, POST /agents/:id/execute
│   │   ├── workflows.py         # GET/POST/DELETE /workflows, POST /execute (202 + BackgroundTasks)
│   │   ├── schedules.py         # GET/POST /workflows/:id/schedules, PUT/DELETE /schedules/:id
│   │   ├── executions.py        # GET/DELETE /executions
│   │   ├── tools.py             # CRUD /tools, POST /tools/:id/test
│   │   ├── telegram.py          # POST /telegram/webhook, CRUD /telegram/mappings
│   │   ├── logs.py              # WebSocket /ws/logs
│   │   └── stats.py             # GET /stats
│   ├── services/
│   │   ├── executor.py          # Single-agent LangGraph executor (LLMFactory + sub-graph)
│   │   ├── workflow_executor.py # Multi-agent LangGraph executor (dynamic StateGraph)
│   │   ├── tasks.py             # RQ task: run_workflow() executed by the worker container
│   │   ├── queue.py             # Redis connection + RQ Queue with graceful fallback
│   │   ├── scheduler.py         # APScheduler BackgroundScheduler service
│   │   ├── log_broadcaster.py   # WebSocket log broadcasting
│   │   ├── crypto.py            # Fernet encryption for tool API keys
│   │   └── telegram_handler.py  # Telegram webhook handler
│   └── instrumentation.py       # OpenTelemetry setup (OTLP → Jaeger, Prometheus)
└── frontend/
    ├── Dockerfile
    ├── nginx.conf               # Static file serving + backend proxy rules
    └── src/
        ├── api.ts               # All API calls (axios)
        ├── types/
        │   └── index.ts         # Shared TypeScript interfaces
        ├── components/
        │   ├── LoadingSpinner.tsx
        │   ├── Modal.tsx
        │   ├── Sidebar.tsx
        │   ├── WorkflowCard.tsx
        │   └── ...
        └── pages/
            ├── Dashboard.tsx         # Stats + charts
            ├── AgentBuilder.tsx      # Agent CRUD with advanced config
            ├── Tools.tsx             # HTTP tool builder with live test panel
            ├── Workspace.tsx         # React Flow drag-and-drop canvas
            ├── WorkflowBuilder.tsx   # Workflow list + schedule modal + templates
            ├── WorkflowExecutor.tsx  # Async execution with polling
            ├── ExecutionHistory.tsx  # Table + inter-agent trace modal + CSV export
            ├── LiveLogs.tsx          # WebSocket log stream
            └── Settings.tsx         # API keys + Telegram mapping + monitoring links
```

---

## Why These Technologies

### LangGraph

LangGraph was chosen over CrewAI, AutoGen, and a custom runtime because it exposes first-class `StateGraph` primitives that map directly onto the visual workflow canvas. Each canvas node becomes a LangGraph node; each edge becomes `add_edge()` or `add_conditional_edges()`. The `WorkflowState` TypedDict is the shared message bus — agents communicate asynchronously by writing `current_output`, which the next node reads as its input. This is graph-native async message passing, not direct agent-to-agent RPC calls.

Additional benefits:
- **Conditional routing built-in** — `add_conditional_edges` with a router closure enables branching without a hand-rolled scheduler
- **Checkpointing** — each node's input/output is saved to `workflow_execution_checkpoints` for debugging
- **Per-agent sub-graphs** — each agent runs its own `StateGraph` (`tool_node → llm_node → END`) inside the workflow graph

### FastAPI

Async-first: `BackgroundTasks` makes `POST /execute` return 202 immediately while the graph runs in a background thread. Pydantic V2 catches malformed workflow definitions at the API boundary before they reach LangGraph. Auto-generated OpenAPI docs at `/docs` eliminate the need for a separate API client.

### React + React Flow

React Flow v11 provides drag-and-drop, `ConnectionMode.Loose`, `MarkerType` arrowheads, and `useReactFlow().project()` out of the box — no custom canvas math. Zustand for sidebar collapse state (persisted to `localStorage`). Recharts for animated cost/token charts on the Dashboard.

### PostgreSQL + pgvector

Relational structure for all persistent entities. JSONB columns (`config`, `definition`, `node_outputs`, `state`) allow schema-flexible data without a separate document store. The `pgvector` extension is available for future semantic memory and embedding features without adding a second database.

### APScheduler

`BackgroundScheduler` starts with the FastAPI process, loads all enabled `workflow_schedules` rows, and registers each as an interval or cron job. When a job fires it follows the exact same code path as the HTTP execute endpoint (`create_execution_queued` → `WorkflowExecutor.execute()`) — no separate worker process, no Celery, no message broker required.

### Redis + RQ

Redis is used as the task queue broker via **RQ (Redis Queue)**. When a workflow is triggered, the API server enqueues a `run_workflow` job (with `job_timeout=600` and `retry=Retry(max=3, interval=[10,30,60])`) and returns 202 immediately. The dedicated `worker` container picks up jobs from the `executions` queue and runs them independently of the API process — workflows survive a backend restart. If Redis is unavailable, execution falls back to FastAPI `BackgroundTasks` automatically, so the platform degrades gracefully.

### Prometheus + Jaeger + Grafana

Full distributed tracing from HTTP request through LangGraph node execution to database write (OTLP → Jaeger). Per-provider token and cost counters available as Prometheus metrics, dashboarded in Grafana. Structured JSON logs (structlog) broadcast over WebSocket to the Live Logs page in real time.

---

## Stop

```bash
docker compose down        # stop containers, keep volumes (data preserved)
docker compose down -v     # stop containers + wipe all data volumes
```

## Frontend rebuild

The frontend is built into nginx at compose build time. After editing React source:

```bash
docker compose build frontend && docker compose up -d frontend
```

For hot-reload during development:

```bash
cd frontend && npm install && npm run dev   # served at http://localhost:5173
```
