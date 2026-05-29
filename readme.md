# AI Agent Orchestration Platform

A full-stack platform for creating, configuring, and connecting AI agents into collaborative multi-agent workflows. Agents run on LangGraph's `create_react_agent` — a proper ReAct loop where the LLM reasons, calls tools, observes results, and iterates until it has an answer. Workflows are built visually, execute durably via Redis Queue, and stream real-time progress to the browser over WebSocket. Everything is accessible through a React web interface or the REST API.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Architecture Overview](#architecture-overview)
4. [Quick Start](#quick-start)
5. [LLM Provider Setup](#llm-provider-setup)
6. [Web UI Pages](#web-ui-pages)
7. [Agent Configuration](#agent-configuration)
8. [Building Workflows](#building-workflows)
9. [Real-Time Execution Streaming](#real-time-execution-streaming)
10. [Workflow Schedules](#workflow-schedules)
11. [Telegram Integration](#telegram-integration)
12. [Slack Integration](#slack-integration)
13. [Web Search (Tavily)](#web-search-tavily)
14. [HTTP Tool Nodes](#http-tool-nodes)
15. [API Reference](#api-reference)
16. [Observability](#observability)
17. [Database Schema](#database-schema)
18. [File Structure](#file-structure)
19. [Why These Technologies](#why-these-technologies)

---

## Features

| Feature | Details |
|---|---|
| Agent-first ReAct loop | Every agent runs `create_react_agent` — the LLM reasons, calls tools in a loop, observes results, and decides when to stop. Not a one-shot pipeline |
| Visual workflow builder | Drag-and-drop React Flow canvas — connect agents and HTTP tool nodes into DAG pipelines |
| Conditional routing | Branch workflows based on agent output: `contains`, `equals`, `not_contains`, `not_equals` |
| Durable async execution | POST returns 202 immediately; RQ worker runs the job independently; retries on failure (3 attempts, exponential backoff) |
| Real-time streaming | WebSocket `/ws/executions/{id}` pushes `node_complete` events as each node finishes and a `done` event when the workflow ends |
| Parallel node support | `WorkflowState` uses Annotated reducers so parallel branches can merge state without conflicts |
| Workflow schedules | Run workflows automatically on a cron expression or interval trigger via APScheduler |
| Pre-built templates | "Research & Summarize" and "Content Pipeline" to start fast |
| Inter-agent message trace | Inspect each node's output in the Execution History detail modal |
| Web search | Agents with Tavily search retrieve live context — the LLM decides when to search and may search multiple times per task |
| HTTP tool nodes | Call any external API inline in a workflow with `{{input}}` templating |
| Telegram integration | Map a Telegram chat to a workflow — messages trigger executions |
| Slack integration | Map a Slack channel to a workflow via slash command or event subscription |
| Conversation memory | Sliding-window buffer loads prior turns from PostgreSQL before each agent execution |
| Observability | Prometheus metrics, Jaeger distributed traces, Grafana dashboards |
| Token & cost tracking | Every execution records tokens used and USD cost across all LLM calls in the ReAct loop |
| API key encryption | Tool API keys encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Flow v11, Zustand, Recharts |
| Backend | Python 3.11, FastAPI, Pydantic V2, Uvicorn |
| AI runtime | LangGraph `create_react_agent` (single-agent ReAct) + `StateGraph` (multi-agent workflow) |
| LLM providers | OpenRouter, OpenAI, Groq, Ollama |
| Tool definition | LangChain `@tool` decorator with docstrings the LLM reads to decide when to call each tool |
| Web search | Tavily Search API |
| Database | PostgreSQL 15 + pgvector extension |
| Task queue | Redis 7 + RQ (durable job queue, dedicated worker container) |
| Real-time streaming | Redis pub/sub → WebSocket (per-execution event stream) |
| Scheduler | APScheduler 3 (BackgroundScheduler) |
| Observability | OpenTelemetry → Jaeger, Prometheus, Grafana |
| Messengers | Telegram Bot API (webhook), Slack Events API |

---

## Architecture Overview

```
Browser ──HTTP──► FastAPI (backend:8000)
                     │
                     ├── POST /workflows/:id/execute
                     │       │
                     │       ├── creates execution record (status: queued)
                     │       └── enqueues job ──► Redis (executions queue)
                     │
                     └── WebSocket /ws/executions/:id
                             │
                             └── subscribes to Redis pub/sub channel
                                         │
                                         ▼
                             Worker container (rq worker)
                                 │
                                 ├── picks up job from Redis
                                 ├── runs WorkflowExecutor (LangGraph StateGraph)
                                 │       │
                                 │       ├── each node runs create_react_agent
                                 │       │   (LLM → tool call loop → final answer)
                                 │       │
                                 │       └── publishes node_complete event to Redis pub/sub
                                 │
                                 └── publishes done event to Redis pub/sub
                                         │
                                         ▼
                             FastAPI forwards events over WebSocket to Browser
```

**Graceful fallback**: If Redis is unavailable, `POST /execute` falls back to FastAPI `BackgroundTasks` and the frontend falls back to polling. The platform never hard-fails due to Redis being down.

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
worker   | 18:00:00 Listening on executions...
```

### 3. Apply migrations (existing installs only)

On a **fresh** volume, migrations run automatically at startup. On an existing volume, apply them manually in order:

```bash
docker exec -i postgres psql -U postgres -d agent_db < migrations/002_executions.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/003_tools.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/004_node_outputs.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/005_schedules.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/006_slack.sql
docker exec -i postgres psql -U postgres -d agent_db < migrations/007_channel_bots.sql
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
docker compose restart backend worker
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
| `/workflows` | Workflows | List of saved workflows — templates, inline run with real-time streaming panel, schedule manager, delete |
| `/executor` | Executor | Pick a workflow, enter a task, watch execution with live node-by-node progress over WebSocket |
| `/history` | Execution History | Sortable/filterable table, inter-agent message trace in detail modal, CSV export |
| `/settings` | Settings | API key viewer, Telegram/Slack mappings, links to Grafana / Jaeger / Prometheus |

---

## Agent Configuration

### Basic fields

| Field | Description |
|---|---|
| Name | Display name |
| Role | Short role label (e.g. `researcher`, `writer`) |
| System Prompt | Personality and behavioral instructions injected as the first `SystemMessage` |
| LLM Provider | `openrouter`, `openai`, `groq`, or `ollama` |
| Model | Model identifier (e.g. `openai/gpt-4o-mini`) |
| Tools | Enable `web_search` for Tavily-powered live search |

### Advanced configuration (collapsible section in the UI)

| Field | Effect | Default | Range |
|---|---|---|---|
| Temperature | LLM sampling randomness | 0.7 | 0.0 – 2.0 |
| Max Tokens | Maximum output tokens per call | 2048 | 256 – 8192 |
| Max Iterations | LangGraph recursion limit (caps the ReAct loop) | 10 | 1 – 20 |
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

"Use Template" opens the Workspace with pre-placed placeholder nodes. Drag real agents onto the canvas, then save.

### How LangGraph builds the graph at runtime

`workflow_executor.py` compiles a fresh `StateGraph` for every execution:

1. Each `AGENT` node → `_make_agent_node()` — calls `AgentExecutor`, which runs `create_react_agent` inside
2. Each `TOOL` node → `_make_tool_node()` — fires the HTTP request with `current_output` substituted
3. Edges with one outgoing `always` condition → `graph.add_edge()`
4. Edges with conditions or multiple outgoing edges → `graph.add_conditional_edges()` with a router closure
5. Terminal nodes (no outgoing edges) → `graph.add_edge(node, END)`

After each node completes, a `node_complete` event is published to Redis pub/sub. After the entire workflow completes (or fails), a `done` event is published. These events are forwarded to connected WebSocket clients in real time.

**Shared workflow state** — `Annotated` reducers allow parallel branches to merge state without overwriting each other:

```python
class WorkflowState(TypedDict):
    task:           str                               # original user task — never mutated
    current_output: str                               # output of the last node; next node's input
    node_outputs:   Annotated[Dict[str, str],
                       lambda a, b: {**a, **b}]       # dict-merge: parallel branches accumulate
    tokens_used:    Annotated[int, add]               # sum across all nodes
    cost:           Annotated[float, add]             # sum across all nodes
```

---

## Real-Time Execution Streaming

When you run a workflow, the frontend opens a WebSocket connection to `/ws/executions/{execution_id}` instead of polling. Events arrive as JSON frames:

### Event types

| Event | When emitted | Fields |
|---|---|---|
| `node_complete` | After each node finishes | `node_id`, `output`, `tokens` (agent nodes only) |
| `done` | After the full workflow succeeds | `status: "success"`, `result`, `node_outputs`, `tokens_used`, `cost`, `elapsed` |
| `done` | After the full workflow fails | `status: "error"`, `error` |
| `error` | Invalid execution ID | `message` |

### Race-condition safety

The WebSocket handler subscribes to Redis **before** checking the database. If the worker finishes between the DB check and the subscribe, the completion is still caught:

```
Client connects
    │
    ├─ subscribe to Redis channel  ← subscribe first
    ├─ check DB status
    │     if already success/error → send done from DB, close
    │     else → wait for Redis events
    │
Worker finishes
    └─ publishes done event → forwarded to client
```

If Redis is unavailable or the connection times out (600 s), the handler performs a final DB read and sends the stored result.

### Testing the WebSocket stream manually

```bash
# Requires wscat: npm i -g wscat
EXEC_ID="<execution-id>"
wscat -c ws://localhost:8000/ws/executions/$EXEC_ID
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
2. Enqueues a `run_workflow` job to Redis Queue (same path as the HTTP endpoint)
3. Updates `last_run_at` on the schedule row

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

## Slack Integration

### Setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Event Subscriptions** and set the request URL to `https://<your-host>/slack/events`
3. Subscribe to `message.channels` (or `app_mention`) bot events
4. Add to `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-your-token
   SLACK_SIGNING_SECRET=your-signing-secret
   ```
5. In the UI (`/settings`) map a Slack channel ID to a workflow

### How it works

Incoming Slack events are verified with HMAC-SHA256 using `SLACK_SIGNING_SECRET`. When a message arrives in a mapped channel, the workflow fires with the message text as the task. The agent response is posted back to the same channel via the Slack Web API.

### Mapping API

```bash
BASE=http://localhost:8000

# Create mapping
curl -s -X POST $BASE/slack/mappings \
  -H "Content-Type: application/json" \
  -d '{"channel_id": "C01234567", "workflow_id": "<wf-id>"}' | jq .

# List mappings
curl -s $BASE/slack/mappings | jq .

# Delete mapping
curl -s -X DELETE $BASE/slack/mappings/C01234567
```

---

## Web Search (Tavily)

### Setup

Add your Tavily key to `.env`:

```
TAVILY_API_KEY=tvly-your-key-here
```

Get a free key at [app.tavily.com](https://app.tavily.com). Restart after adding the key:

```bash
docker compose restart backend worker
```

### How it works

Enable `web_search` on an agent in the UI. The tool is defined with the `@tool` decorator and a docstring the LLM reads to decide when to use it:

```python
@tool
def web_search(query: str) -> str:
    """Search the web for current, real-time information on a topic or question.
    Use this when you need up-to-date facts, recent events, or information
    that may not be in your training data.
    """
    return _do_web_search(query)
```

Because agents use `create_react_agent`, the LLM can call `web_search` **multiple times** in a single execution — it searches, reads the results, decides whether it needs more context, searches again, and only answers when it has enough information. Token usage across all calls in the ReAct loop is summed and recorded.

**Query trimming**: Tavily rejects queries over 400 characters. The implementation trims to the first sentence boundary (`. `, `.\n`, or `\n`) found within 400 characters, or hard-truncates to 400 characters if no sentence boundary exists.

If `TAVILY_API_KEY` is missing or still set to the placeholder, the agent returns a clear "not configured" message instead of raising an exception.

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

# Execute — returns 202 immediately; job runs in worker container
RESP=$(curl -s -X POST $BASE/workflows/<id>/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "Summarise AI news"}')
echo $RESP | jq .
EXEC_ID=$(echo $RESP | jq -r .execution_id)

# Stream results over WebSocket (preferred)
# wscat -c ws://localhost:8000/ws/executions/$EXEC_ID

# Or poll until done (fallback)
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

# ── Execution streaming (WebSocket) ──────────────────────────────────────────

# Connect after triggering an execution:
# wscat -c ws://localhost:8000/ws/executions/<execution-id>
#
# Frames received:
# {"type": "node_complete", "node_id": "n1", "output": "...", "tokens": 342}
# {"type": "node_complete", "node_id": "n2", "output": "..."}
# {"type": "done", "status": "success", "result": "...", "tokens_used": 847, "cost": 0.00169, "elapsed": 5.2}

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

# ── Slack ─────────────────────────────────────────────────────────────────────

curl -s $BASE/slack/mappings | jq .
curl -s -X POST $BASE/slack/mappings -H "Content-Type: application/json" \
  -d '{"channel_id": "C01234567", "workflow_id": "<wf-id>"}' | jq .
curl -s -X DELETE $BASE/slack/mappings/C01234567
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

- `agent_execute` — single-agent ReAct loop (`create_react_agent` invocation)
- `tool_call` — individual Tavily search invocation within the ReAct loop
- `workflow_execute` — full multi-agent workflow
- `workflow_node_execute` — individual node within a workflow

### Structured logs

All backend logs are emitted as structured JSON (structlog) to stdout, captured by Docker:

```bash
docker logs backend -f   # stream backend logs
docker logs worker -f    # stream worker logs
```

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
| `slack_channel_mappings` | Maps Slack `channel_id` to a `workflow_id` |
| `workflow_schedules` | Schedule config: cron expression or interval, task text, enabled flag, last/next run time |
| `channel_bots` | Bot-to-channel routing config for multi-bot setups |

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
│   ├── 005_schedules.sql        # workflow_schedules table
│   ├── 006_slack.sql            # slack_channel_mappings table
│   └── 007_channel_bots.sql     # channel_bots table
├── grafana/
│   └── provisioning/            # auto-provisioned datasource + dashboard JSON
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                  # FastAPI app, routers, startup/shutdown hooks
│   ├── core/
│   │   ├── config.py            # Pydantic settings (reads .env)
│   │   ├── auth.py              # API key auth dependency
│   │   └── logging_config.py    # structlog JSON stdout setup
│   ├── db/
│   │   ├── db.py                # SQLAlchemy ORM models + all DB helper functions
│   │   └── seed.py              # Demo data seeder (runs on startup)
│   ├── schemas/
│   │   └── models.py            # Pydantic request/response schemas
│   ├── api/
│   │   ├── agents.py            # GET/POST/DELETE /agents, POST /agents/:id/execute
│   │   ├── workflows.py         # GET/POST/DELETE /workflows, POST /execute (202 + RQ)
│   │   ├── schedules.py         # GET/POST /workflows/:id/schedules, PUT/DELETE /schedules/:id
│   │   ├── executions.py        # GET/DELETE /executions
│   │   ├── execution_stream.py  # WebSocket /ws/executions/:id (real-time streaming)
│   │   ├── tools.py             # CRUD /tools, POST /tools/:id/test
│   │   ├── telegram.py          # POST /telegram/webhook, CRUD /telegram/mappings
│   │   ├── slack.py             # POST /slack/events, CRUD /slack/mappings
│   │   ├── bots.py              # Bot routing config
│   │   └── stats.py             # GET /stats
│   ├── services/
│   │   ├── executor.py          # Single-agent ReAct executor (create_react_agent + @tool)
│   │   ├── workflow_executor.py # Multi-agent workflow executor (dynamic StateGraph)
│   │   ├── stream_publisher.py  # Redis pub/sub: sync publish (worker) + async subscribe (WS)
│   │   ├── tasks.py             # RQ task: run_workflow() executed by the worker container
│   │   ├── queue.py             # Redis connection + RQ Queue with graceful fallback
│   │   ├── scheduler.py         # APScheduler BackgroundScheduler service
│   │   ├── crypto.py            # Fernet encryption for tool API keys
│   │   ├── telegram_handler.py  # Telegram webhook handler
│   │   └── log_broadcaster.py   # WebSocket log broadcasting
│   ├── instrumentation.py       # OpenTelemetry setup (OTLP → Jaeger, Prometheus)
│   └── tests/
│       ├── conftest.py          # SQLite fixtures + startup patches (no real DB needed)
│       ├── test_agents.py       # Agent CRUD + execute endpoint tests
│       ├── test_workflows.py    # Workflow CRUD + execute endpoint tests
│       ├── test_queue_dispatch.py   # RQ dispatch, retry config, BackgroundTasks fallback
│       └── test_tavily_trim.py      # Query trimming and Tavily error handling
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
            ├── WorkflowBuilder.tsx   # Workflow list + WebSocket execution panel + templates
            ├── WorkflowExecutor.tsx  # Async execution with progress bar
            ├── ExecutionHistory.tsx  # Table + inter-agent trace modal + CSV export
            └── Settings.tsx         # API keys + Telegram/Slack mappings + monitoring links
```

---

## Why These Technologies

### LangGraph — `create_react_agent`

Agents use `create_react_agent` from `langgraph.prebuilt` instead of a manually wired `StateGraph`. This gives each agent a proper ReAct loop:

```
LLM reasons about the task
    → decides to call web_search
    → observes the search results
    → decides to search again or answer
    → emits final answer
```

The LLM sees the `@tool` docstring and decides **when** and **how many times** to call each tool — the agent's behavior is emergent from the LLM's reasoning, not hardcoded. `max_iterations` (the LangGraph `recursion_limit`) caps runaway loops.

For multi-agent workflows, a separate `StateGraph` wraps multiple `create_react_agent` calls:

- Each canvas node becomes a LangGraph node with `add_edge()` or `add_conditional_edges()`
- `WorkflowState` with `Annotated` reducers is the shared message bus — nodes pass context via `current_output` and accumulate token/cost totals via `add` reducers
- Parallel branches (fan-out graphs) merge state safely without race conditions

### FastAPI + Redis pub/sub streaming

`POST /execute` returns 202 immediately — the RQ worker runs the job independently of the API process. As each node completes, `stream_publisher.publish()` sends a `node_complete` event to a Redis channel keyed by `execution:{id}`. The WebSocket handler (`/ws/executions/{id}`) subscribes to that channel via `redis.asyncio` and forwards events to the browser in real time. The result is push-based streaming with no polling latency and no busy-wait on the API server.

### RQ (Redis Queue)

When a workflow is triggered, the API enqueues a `run_workflow` job with:
- `job_timeout=600` — 10-minute ceiling for long workflows
- `retry=Retry(max=3, interval=[10, 30, 60])` — exponential backoff on transient failures

The dedicated `worker` container runs `rq worker executions` and picks up jobs independently. Workflows survive an API server restart mid-execution. If Redis is unavailable, the API falls back to `BackgroundTasks` automatically — no hard dependency.

### React Flow + WebSocket

React Flow v11 provides drag-and-drop, connection mode, and edge routing out of the box. The execution panel in `WorkflowBuilder.tsx` opens a `WebSocket` on the `execution_id` returned by `POST /execute`. Each `node_complete` frame updates a running panel live. The `done` frame sets the final result — no `setInterval`, no polling lag, no unnecessary requests.

### PostgreSQL + pgvector

Relational structure for all persistent entities. JSONB columns (`config`, `definition`, `node_outputs`, `state`) allow schema-flexible data without a separate document store. The `pgvector` extension is available for future semantic memory and embedding features without adding a second database.

### APScheduler

`BackgroundScheduler` starts with the FastAPI process, loads all enabled `workflow_schedules` rows, and registers each as an interval or cron job. When a job fires it enqueues a `run_workflow` RQ job — identical to the HTTP execute endpoint — so scheduled and on-demand executions go through the same durable queue path.

### Prometheus + Jaeger + Grafana

Full distributed tracing from HTTP request through LangGraph node execution to database write (OTLP → Jaeger). Per-provider token and cost counters are available as Prometheus metrics, dashboarded in Grafana. All backend logs are structured JSON (structlog) written to stdout — ready to ship to any aggregation system (Loki, Datadog, CloudWatch) without code changes.

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

## Running tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

Tests run against SQLite in-memory — no PostgreSQL or Redis required. All external services (Tavily, LLM providers) are mocked.
