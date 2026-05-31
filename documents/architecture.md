# System Architecture — AI Agent Orchestration Platform

Structured as four C4 levels: Context → Containers → Components → Key Flows.
Each diagram covers one topic and stays under 20 nodes.

---

## Level 1 — System Context

Who uses the platform and what external systems it depends on.

```mermaid
graph LR
    BROWSER["Browser User"]
    TG_USER["Telegram User"]
    SL_USER["Slack User"]

    subgraph PLATFORM["AI Agent Orchestration Platform"]
        P["Build · Run · Observe\nAI agent workflows"]
    end

    OR["OpenRouter"]
    OAI["OpenAI"]
    GROQ["Groq"]
    OLLAMA["Ollama"]
    TAV["Tavily Search API"]
    TG_API["Telegram Bot API"]
    SL_API["Slack Events API"]

    BROWSER  -->|"HTTP REST + WebSocket"| PLATFORM
    TG_USER  -->|"bot message"| TG_API
    SL_USER  -->|"channel message"| SL_API
    TG_API   -->|"POST /telegram/webhook"| PLATFORM
    SL_API   -->|"POST /slack/events"| PLATFORM

    PLATFORM -->|"LLM inference"| OR
    PLATFORM -->|"LLM inference"| OAI
    PLATFORM -->|"LLM inference"| GROQ
    PLATFORM -->|"LLM inference"| OLLAMA
    PLATFORM -->|"web search"| TAV
    PLATFORM -->|"send reply"| TG_API
    PLATFORM -->|"post message"| SL_API
```

---

## Level 2 — Container Map

Eight Docker containers and their primary connections.

```mermaid
graph TB
    BROWSER["Browser"]

    subgraph COMPOSE["docker-compose network"]
        FRONT["frontend :3000\nnginx + React SPA"]
        BACK["backend :8000\nFastAPI + Uvicorn"]
        WORK["worker\nRQ Worker"]
        PG[("postgres :5432\nPostgreSQL + pgvector")]
        RED[("redis :6379\nRedis 7")]
        JAE["jaeger :16686\nDistributed Traces"]
        PROM["prometheus :9090\nMetrics Storage"]
        GRAF["grafana :3001\nDashboards"]
    end

    BROWSER -->|"HTTP / WebSocket"| FRONT
    FRONT   -->|"proxy /api/* and /ws/*"| BACK
    BACK    -->|"read / write"| PG
    BACK    -->|"enqueue jobs"| RED
    BACK    -->|"subscribe pub/sub"| RED
    BACK    -->|"OTLP traces"| JAE
    BACK    -->|"expose /metrics"| PROM
    RED     -->|"dequeue jobs"| WORK
    WORK    -->|"read / write"| PG
    WORK    -->|"PUBLISH events"| RED
    PROM    -->|"data source"| GRAF
```

---

## Level 3 — Backend Components

What lives inside the `backend` container.

```mermaid
graph TD
    subgraph BACK["backend — FastAPI :8000"]
        MW["Middleware\nTrace ID header · API key auth"]

        subgraph ROUTERS["Routers — 13 total"]
            CRUD_R["CRUD\n/agents /workflows /tools /executions\n/schedules /stats /bots /integrations /seed"]
            HOOK_R["Webhooks  no auth\n/telegram/webhook/{bot_id}\n/slack/events"]
            WS_R["WebSocket  no auth\n/ws/executions/:id\n/ws/logs"]
        end

        subgraph SERVICES["Services"]
            SCHED_S["scheduler.py\nAPScheduler cron + interval"]
            QUEUE_S["queue.py\nRQ Queue + fallback flag"]
            STREAM_S["stream_publisher.py\nasync Redis subscribe"]
            CRYPTO_S["crypto.py\nFernet encrypt / decrypt"]
        end

        DB_H["db/db.py\nSQLAlchemy ORM + query helpers"]
        INSTR["instrumentation.py\nOTLP exporter · Prometheus reader"]
    end

    MW       --> ROUTERS
    ROUTERS  --> SERVICES
    SERVICES --> DB_H
    SERVICES --> INSTR
```

---

## Level 3 — Worker Components

What the `worker` container does when it picks up a job.

```mermaid
graph TD
    RQW["RQ Worker\nlistens on executions queue"]

    subgraph WE["WorkflowExecutor  services/workflow_executor.py"]
        LOAD_WF["load workflow definition\nfrom PostgreSQL"]
        BUILD_SG["build LangGraph StateGraph\nnodes + edges from definition"]
        AGENT_N["_make_agent_node\nper AGENT node in canvas"]
        TOOL_N["_make_tool_node\nper TOOL node in canvas"]
        COND_R["add_conditional_edges\nrouting logic per edge condition"]
    end

    subgraph AE["AgentExecutor  services/executor.py"]
        REACT["create_react_agent\nmodel=LLM  tools=web_search"]
        LLM_F["LLMFactory.get_llm\nprovider + model + temperature"]
        MEM["load history from PostgreSQL\nSystemMessage + HumanMessage pairs"]
    end

    PUB["stream_publisher.publish\nsync PUBLISH to Redis channel"]

    RQW     --> LOAD_WF
    LOAD_WF --> BUILD_SG
    BUILD_SG --> AGENT_N
    BUILD_SG --> TOOL_N
    BUILD_SG --> COND_R
    AGENT_N --> AE
    AE      --> REACT
    REACT   --> LLM_F
    REACT   --> MEM
    AGENT_N --> PUB
    TOOL_N  --> PUB
```

---

## Execution Lifecycle

Full journey from browser click to result displayed.

```mermaid
sequenceDiagram
    participant B   as Browser
    participant API as FastAPI
    participant DB  as PostgreSQL
    participant RQ  as Redis Queue
    participant W   as Worker
    participant LLM as LLM Provider
    participant PB  as Redis pub/sub
    participant WS  as WebSocket /ws/executions/:id

    B   ->> API : POST /workflows/:id/execute {task}
    API ->> DB  : create_execution_queued (status=queued)
    API ->> RQ  : enqueue run_workflow(exec_id, wf_id, task)
    API -->> B  : 202 {execution_id}

    B   ->> WS  : connect /ws/executions/:id
    WS  ->> PB  : SUBSCRIBE execution:{id}
    WS  ->> DB  : check status — still queued, keep listening

    W   ->> RQ  : dequeue job
    W   ->> DB  : load workflow definition
    W   ->> DB  : update status = running

    loop For each node in the StateGraph
        W   ->> LLM : create_react_agent.invoke
        LLM -->> W  : result after ReAct loop
        W   ->> DB  : save_checkpoint + patch_execution_progress
        W   ->> PB  : PUBLISH node_complete {node_id, output, tokens}
        PB  -->> WS : message frame
        WS  -->> B  : {"type":"node_complete","node_id":"...","output":"..."}
    end

    W   ->> DB  : update_execution (status=success, result, tokens, cost)
    W   ->> PB  : PUBLISH done {status, result, node_outputs, tokens, cost, elapsed}
    PB  -->> WS : message frame
    WS  -->> B  : {"type":"done","status":"success","result":"..."}
    WS  ->> WS  : close connection
```

---

## Real-Time Streaming

How events travel from worker to browser without polling.

```mermaid
graph LR
    subgraph WORKER["worker process"]
        W_PUB["stream_publisher.publish\nexecution_id + event dict\nsync redis.Redis"]
    end

    subgraph REDIS["Redis :6379"]
        CHANNEL["channel\nexecution:{uuid}"]
    end

    subgraph BACKEND["backend process"]
        W_SUB["stream_publisher\n.subscribe_execution\nasync redis.asyncio"]
        WS_EP["/ws/executions/:id\nWebSocket handler"]
    end

    BROWSER["Browser\nWebSocket client"]

    W_PUB   -->|"PUBLISH"| CHANNEL
    CHANNEL -->|"message"| W_SUB
    W_SUB   -->|"async generator"| WS_EP
    WS_EP   -->|"JSON frame"| BROWSER

    subgraph EVENTS["Event shapes"]
        EV1["node_complete\nnode_id · output · tokens"]
        EV2["done / success\nresult · node_outputs · cost · elapsed"]
        EV3["done / error\nerror message"]
    end
```

**Race-condition safety:** The WebSocket handler subscribes to Redis *before* checking the DB. If the worker finishes between those two steps, the `done` event is still received. If Redis is unavailable, the handler falls back to a final DB read.

---

## Frontend → API Map

Which UI page calls which backend endpoint.

```mermaid
graph LR
    subgraph PAGES["Frontend Pages"]
        DASH["Dashboard"]
        AGENTS_P["AgentBuilder"]
        TOOLS_P["Tools"]
        WORK_P["Workspace"]
        WFB_P["WorkflowBuilder"]
        EXEC_P["WorkflowExecutor"]
        HIST_P["ExecutionHistory"]
        LOGS_P["ExecutionLogs"]
        SET_P["Settings"]
    end

    subgraph ENDPOINTS["Backend Endpoints"]
        STATS_EP["GET /stats"]
        AG_EP["GET POST PUT DELETE /agents"]
        AG_RUN["POST /agents/:id/execute"]
        TL_EP["GET POST PUT DELETE /tools"]
        TL_TEST["POST /tools/:id/test"]
        WF_EP["GET POST DELETE /workflows"]
        WF_RUN["POST /workflows/:id/execute"]
        EX_EP["GET DELETE /executions"]
        SCHED_EP["GET POST PUT DELETE /schedules"]
        WS_EP2["WS /ws/executions/:id"]
        WS_LOGS["WS /ws/logs"]
        BOT_EP["CRUD /bots\n/bots/:id/telegram-mappings\n/bots/:id/slack-mappings"]
        INT_EP["CRUD /workflows/:id/integrations"]
        SEED_EP["POST /seed"]
    end

    DASH    --> STATS_EP
    DASH    --> EX_EP
    AGENTS_P --> AG_EP
    AGENTS_P --> AG_RUN
    TOOLS_P --> TL_EP
    TOOLS_P --> TL_TEST
    WORK_P  --> AG_EP
    WORK_P  --> TL_EP
    WORK_P  --> WF_EP
    WFB_P   --> WF_EP
    WFB_P   --> AG_EP
    WFB_P   --> WF_RUN
    WFB_P   --> SCHED_EP
    WFB_P   --> WS_EP2
    EXEC_P  --> WF_RUN
    EXEC_P  --> WS_EP2
    HIST_P  --> EX_EP
    LOGS_P  --> WS_LOGS
    SET_P   --> BOT_EP
    SET_P   --> INT_EP
```

---

## Conversation Memory Flow

How agent history is loaded before and saved after each execution.

```mermaid
graph TD
    subgraph CONFIG["Agent config"]
        MT["memory_type: buffer or none"]
        MW2["memory_window: N turns"]
    end

    subgraph LOAD["Before execution — load history"]
        CHECK{"memory_type\n== none?"}
        SKIP["history = empty list\nno DB read"]
        QUERY["SELECT last N×2 messages\nfor this agent\nORDER BY timestamp ASC"]
        BUILD_H["build list:\nHumanMessage + AIMessage pairs"]
    end

    subgraph INVOKE["Invoke create_react_agent"]
        MSGS["messages =\nSystemMessage system_prompt\n+ history pairs\n+ HumanMessage current task"]
        INVOKE2["agent_graph.invoke\n{messages: msgs}\nrecursion_limit=max_iterations"]
    end

    subgraph SAVE["After execution — persist"]
        SAVE_U["save_message\ntype=user_message  content=task"]
        SAVE_A["save_message\ntype=agent_response  content=result\ntokens_used  cost"]
    end

    CONFIG  --> CHECK
    CHECK   -->|"yes"| SKIP
    CHECK   -->|"no"| QUERY
    QUERY   --> BUILD_H
    BUILD_H --> MSGS
    SKIP    --> MSGS
    MSGS    --> INVOKE2
    INVOKE2 --> SAVE_U
    INVOKE2 --> SAVE_A
```

---

## Error & Retry Flow

What happens when a node fails or Redis is unavailable.

```mermaid
graph TD
    START2["Workflow execution starts"]

    subgraph NODE_FAIL["Node-level failure"]
        N_ERR["exception inside agent node\nor tool node"]
        LOG_ERR["log exception\nspan.record_exception"]
        UPDATE_ERR["update_execution\nstatus=error\nerror_message=str exc"]
        PUB_ERR["stream_publisher.publish\ntype=done  status=error"]
        N_ERR --> LOG_ERR --> UPDATE_ERR --> PUB_ERR
    end

    subgraph JOB_RETRY["Job-level retry — RQ"]
        JOB_FAIL["job raises exception"]
        REQUEUE["RQ re-enqueues job\nRetry max=3\nintervals: 10s → 30s → 60s"]
        FAILED_Q["after 3 failures\njob moves to failed queue\nno more retries"]
        JOB_FAIL --> REQUEUE --> FAILED_Q
    end

    subgraph NO_REDIS["Redis unavailable — graceful fallback"]
        QFLAG["QUEUE_AVAILABLE = False\nqueue.py on startup ping fails"]
        BG_TASK["execution_queue = None\nuse FastAPI BackgroundTasks"]
        POLL["frontend polls\nGET /executions/:id every 2s\ninstead of WebSocket"]
        QFLAG --> BG_TASK --> POLL
    end

    START2 --> NODE_FAIL
    START2 --> JOB_RETRY
    START2 --> NO_REDIS
```

---

## Database Schema

All nine tables and their foreign-key relationships.

```mermaid
erDiagram
    agents {
        uuid    id           PK
        string  name
        string  role
        text    system_prompt
        string  model
        string  provider
        jsonb   tools
        jsonb   config
    }
    workflows {
        uuid    id           PK
        string  name
        jsonb   definition
    }
    tools {
        uuid    id           PK
        string  name
        string  method
        string  url
        jsonb   headers
        text    body_template
        text    api_key_encrypted
        int     timeout_seconds
    }
    messages {
        uuid    id           PK
        uuid    sender_id    FK
        uuid    receiver_id  FK
        text    content
        string  message_type
        int     tokens_used
        numeric cost
    }
    workflow_executions {
        uuid    id           PK
        uuid    workflow_id  FK
        string  task
        string  status
        text    result
        text    error_message
        int     tokens_used
        numeric cost
        jsonb   node_outputs
        string  source
    }
    workflow_execution_checkpoints {
        uuid    id           PK
        uuid    workflow_id  FK
        uuid    execution_id FK
        string  node_id
        jsonb   state
    }
    workflow_schedules {
        uuid    id           PK
        uuid    workflow_id  FK
        string  task
        string  cron_expression
        int     interval_minutes
        boolean enabled
        timestamp last_run_at
    }
    channel_bots {
        uuid    id           PK
        string  name
        string  channel_type
        jsonb   config
        boolean enabled
    }
    telegram_chat_mappings {
        uuid    id           PK
        string  chat_id
        uuid    workflow_id  FK
        uuid    bot_id       FK
        string  username
    }
    slack_channel_mappings {
        uuid    id           PK
        string  channel_id
        uuid    workflow_id  FK
        uuid    bot_id       FK
    }
    workflow_integrations {
        uuid    id           PK
        uuid    workflow_id  FK
        string  channel_type
        jsonb   config
        boolean enabled
    }

    agents              ||--o{ messages                        : "sends / receives"
    workflows           ||--o{ workflow_executions             : "has many"
    workflows           ||--o{ workflow_execution_checkpoints  : "has many"
    workflows           ||--o{ workflow_schedules              : "scheduled by"
    workflows           ||--o{ telegram_chat_mappings          : "mapped to"
    workflows           ||--o{ slack_channel_mappings          : "mapped to"
    workflow_executions ||--o{ workflow_execution_checkpoints  : "has many"
    channel_bots        ||--o{ telegram_chat_mappings          : "owns"
    channel_bots        ||--o{ slack_channel_mappings          : "owns"
    workflows           ||--o{ workflow_integrations            : "has outbound integrations"
```

---

## Ports Reference

| Container | Internal port | Host port | Protocol | Purpose |
|---|---|---|---|---|
| frontend | 3000 | **3000** | HTTP | React SPA + nginx proxy |
| backend | 8000 | **8000** | HTTP + WS | FastAPI REST + WebSocket |
| postgres | 5432 | 5432 | TCP | PostgreSQL database |
| redis | 6379 | 6379 | TCP | RQ task queue + pub/sub |
| jaeger | 16686 | **16686** | HTTP | Jaeger trace UI |
| jaeger | 4318 | 4318 | HTTP | OTLP trace receiver |
| prometheus | 9090 | **9090** | HTTP | Metrics query + storage |
| grafana | 3000 | **3001** | HTTP | Dashboard UI |
| worker | — | — | — | No exposed port (internal only) |

**Bold** = ports you open in a browser.
