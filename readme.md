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
