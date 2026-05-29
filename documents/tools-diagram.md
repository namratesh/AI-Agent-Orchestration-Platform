# Tool Architecture — AI Agent Orchestration Platform

Every tool and integration component: what it is, how it works, and how it connects.
Organized into four categories: Agent Tools · Workflow Tools · Trigger Integrations · Infrastructure.

---

## Overview — All Tools

```mermaid
graph TB
    subgraph AGENT_T["Agent Tools  run inside create_react_agent"]
        WS_T["web_search\n@tool — Tavily API"]
    end

    subgraph WF_T["Workflow Node Tools  run as canvas nodes"]
        HTTP_T["HTTP Tool Node\nexternal API call\nwith template substitution"]
    end

    subgraph TRIG_T["Trigger Integrations  how workflows start"]
        MANUAL_T["Manual UI\nPOST /workflows/:id/execute"]
        TG_T["Telegram Bot\nwebhook → workflow"]
        SL_T["Slack Events\nwebhook → workflow"]
        SCHED_T["APScheduler\ncron + interval"]
    end

    subgraph INFRA_T["Infrastructure Tools"]
        RQ_T["RQ Task Queue\ndurable job execution"]
        STREAM_T["Redis Pub/Sub\nreal-time streaming"]
        LLM_T["LLMFactory\nprovider routing"]
        ENC_T["Fernet Encryption\ntool API key storage"]
    end
```

---

## 1. `web_search` — Tavily Search Tool

### 1a. Definition and internals

`@tool` gives the function a name and docstring the LLM reads to decide *when* to call it.
The raw `_do_web_search` function is separated so tests can call it directly without LangChain.

```mermaid
graph TD
    subgraph DEF["services/executor.py"]
        RAW["_do_web_search(query: str) → str\nCore logic — no LangChain dependency\nImported by tests directly"]
        WRAP["@tool  web_search(query: str) → str\nDocstring: Search the web for current\nreal-time information on a topic\nWraps _do_web_search\nReturns StructuredTool for create_react_agent"]
        RAW --> WRAP
    end

    subgraph TRIM["Query trimming — inside _do_web_search"]
        T1["strip whitespace"]
        T2["find first sentence boundary\n'.  '  '.\\n'  or  '\\n'\nwithin first 400 chars"]
        T3["hard-truncate to 400 chars\nTavily rejects longer queries"]
        T1 --> T2 --> T3
    end

    subgraph CALL["Tavily call"]
        KEY_CHK{"TAVILY_API_KEY\nset?"}
        NOT_CFG["return 'not configured' string\nnever raises"]
        TAV_CALL["TavilyClient(api_key)\n.search(trimmed, max_results=5)"]
        FORMAT["format: '1. Title: content (url)\\n2. ...'"]
        EXC["except Exception\nreturn 'Web search error: ...'"]
        KEY_CHK -->|"missing"| NOT_CFG
        KEY_CHK -->|"valid"| TAV_CALL
        TAV_CALL --> FORMAT
        TAV_CALL --> EXC
    end

    TRIM --> CALL
```

### 1b. Inside the ReAct loop

The LLM decides when to call `web_search` and may call it multiple times per task.

```mermaid
sequenceDiagram
    participant LLM as LLM
    participant LG  as LangGraph tool node
    participant TAV as Tavily API

    LLM ->> LLM  : reason about task
    LLM ->> LG   : tool_call: web_search("query 1")
    LG  ->> TAV  : TavilyClient.search("query 1")
    TAV -->> LG  : [{title, content, url}, ...]
    LG  -->> LLM : ToolMessage with results
    LLM ->> LLM  : need more info?
    LLM ->> LG   : tool_call: web_search("query 2")
    LG  ->> TAV  : TavilyClient.search("query 2")
    TAV -->> LG  : [{title, content, url}, ...]
    LG  -->> LLM : ToolMessage with results
    LLM ->> LLM  : enough info — write answer
    LLM -->> LG  : AIMessage (no tool_calls)
    Note over LG : graph exits ReAct loop
```

Token usage is summed across **all** LLM calls in the loop, not just the final one.

---

## 2. HTTP Tool Nodes — External API Calls

### 2a. Lifecycle

```mermaid
graph TD
    subgraph CREATE["Create — UI /tools page"]
        FIELDS["name · method · URL\nheaders · body_template\napi_key · api_key_header\napi_key_prefix · timeout_seconds"]
        ENCRYPT["crypto.encrypt_api_key\nFernet.encrypt → stored in DB\nplaintext never persisted"]
        FIELDS --> ENCRYPT
    end

    subgraph TEST["Test — live test panel"]
        VAR_IN["user provides variables\ne.g. city=London"]
        RENDER["render URL template\n{{city}} → London"]
        DECRYPT_T["crypto.decrypt_api_key\nin memory only"]
        HTTP_TEST["requests.request\nreturn status + body"]
        VAR_IN --> RENDER --> DECRYPT_T --> HTTP_TEST
    end

    subgraph EXECUTE["Execute — inside workflow"]
        PREV["previous node output\ncurrent_output"]
        BODY_SUB["body_template\n.replace('{{input}}', current_output)"]
        HDR_BUILD["build headers:\napi_key_header: prefix + decrypted_key\n+ custom headers"]
        HTTP_EXEC["requests.request\nmethod · url · headers · body\ntimeout=timeout_seconds"]
        RESULT["result = response.text\n→ next node's current_output"]
        PUB_NC["stream_publisher.publish\nnode_complete event → Redis"]
        PREV --> BODY_SUB --> HDR_BUILD --> HTTP_EXEC --> RESULT --> PUB_NC
    end

    CREATE --> TEST
    CREATE --> EXECUTE
```

### 2b. API key masking rules

| Operation | What the API returns |
|---|---|
| `GET /tools` | `"••••••"` — always masked |
| `PUT /tools/:id` with `"••••••"` | existing key unchanged |
| `PUT /tools/:id` with new value | encrypt and overwrite |
| Test or workflow execution | decrypt in memory, inject into headers |

---

## 3. Trigger Integrations

### 3a. All four trigger sources

```mermaid
graph LR
    subgraph TRIGGERS["Execution Triggers"]
        MANUAL2["Manual UI\nPOST /workflows/:id/execute\nsource = ui"]
        TG2["Telegram Message\nPOST /telegram/webhook\nsource = telegram"]
        SL2["Slack Message\nPOST /slack/events\nsource = slack"]
        SCHED2["APScheduler job\nfires on cron or interval\nsource = scheduled"]
    end

    subgraph QUEUE_PATH["Common path — all triggers"]
        CREATE_EX["create_execution_queued\nstatus = queued"]
        ENQUEUE["execution_queue.enqueue\nrun_workflow job\nor BackgroundTasks fallback"]
        WORKER2["worker picks up job\nWorkflowExecutor.execute"]
    end

    MANUAL2 --> CREATE_EX
    TG2     --> CREATE_EX
    SL2     --> CREATE_EX
    SCHED2  --> CREATE_EX
    CREATE_EX --> ENQUEUE --> WORKER2
```

### 3b. Telegram Bot

```mermaid
graph TD
    subgraph SETUP_TG["Setup"]
        BOT_F["@BotFather → bot token"]
        SET_WH["curl setWebhook\nurl=host/telegram/webhook\nsecret_token=WEBHOOK_SECRET"]
        MAP_TG["Settings UI\nmap chat_id → workflow_id"]
        BOT_F --> SET_WH --> MAP_TG
    end

    subgraph RECV_TG["Incoming message"]
        TG_POST["POST /telegram/webhook\nX-Telegram-Bot-Api-Secret-Token"]
        VALID_TG{"token\nvalid?"}
        REJECT_TG["403 Forbidden"]
        PARSE_TG["extract chat_id + text"]
        LOOKUP_TG["telegram_chat_mappings\nSELECT workflow_id WHERE chat_id=?"]
        TG_POST --> VALID_TG
        VALID_TG -->|"no"| REJECT_TG
        VALID_TG -->|"yes"| PARSE_TG --> LOOKUP_TG
    end

    subgraph RUN_TG["Execute + reply"]
        EXEC_TG["enqueue run_workflow"]
        RESP_TG["await result"]
        REPLY_TG["POST api.telegram.org\n/sendMessage\nchat_id · text=result"]
        EXEC_TG --> RESP_TG --> REPLY_TG
    end

    SETUP_TG --> RECV_TG --> RUN_TG
```

### 3c. Slack Events

```mermaid
graph TD
    subgraph SETUP_SL["Setup"]
        APP_SL["Create Slack app\napi.slack.com/apps"]
        SUB_SL["Event Subscriptions\nrequest URL = host/slack/events\nsubscribe: message.channels"]
        ENV_SL["SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET in .env"]
        APP_SL --> SUB_SL --> ENV_SL
    end

    subgraph RECV_SL["Incoming event"]
        SL_POST["POST /slack/events\nX-Slack-Signature header"]
        VALID_SL{"HMAC-SHA256\nsignature valid?"}
        REJECT_SL["403 Forbidden"]
        URL_VER{"url_verification\nchallenge?"}
        ECHO["echo challenge → 200\nSlack confirms endpoint"]
        PARSE_SL["extract channel_id + text"]
        LOOKUP_SL["slack_channel_mappings\nSELECT workflow_id WHERE channel_id=?"]
        SL_POST --> VALID_SL
        VALID_SL -->|"no"| REJECT_SL
        VALID_SL -->|"yes"| URL_VER
        URL_VER -->|"yes"| ECHO
        URL_VER -->|"no"| PARSE_SL --> LOOKUP_SL
    end

    subgraph RUN_SL["Execute + reply"]
        EXEC_SL["enqueue run_workflow"]
        RESP_SL["await result"]
        REPLY_SL["POST slack.com/api\n/chat.postMessage\nchannel · text=result\nBearer SLACK_BOT_TOKEN"]
        EXEC_SL --> RESP_SL --> REPLY_SL
    end

    SETUP_SL --> RECV_SL --> RUN_SL
```

### 3d. APScheduler

```mermaid
graph TD
    subgraph BOOT["App startup — main.py"]
        SCHED_START2["scheduler.start()"]
    end

    subgraph LOAD_SCHED["Load from DB"]
        LIST_S["list_all_enabled_schedules\nSELECT * WHERE enabled = true"]
        REG_CRON["CronTrigger.from_crontab\ne.g. 0 9 * * *"]
        REG_INT["IntervalTrigger(minutes=N)\ne.g. every 30 min"]
        LIST_S --> REG_CRON
        LIST_S --> REG_INT
    end

    subgraph FIRE["When job fires — _run_schedule()"]
        CR_EX["create_execution_queued\nsource = scheduled"]
        UPD_LAST["update schedule.last_run_at"]
        WF_RUN2["WorkflowExecutor.execute"]
        CR_EX --> UPD_LAST --> WF_RUN2
    end

    subgraph LIVE["Live management — via API"]
        ADD_J["POST /schedules → add_or_update_job()"]
        TOG_J["PUT /schedules/:id enabled=false → toggle"]
        DEL_J["DELETE /schedules/:id → remove_job()"]
    end

    BOOT --> LOAD_SCHED --> FIRE
    LIVE --> LOAD_SCHED
```

---

## 4. Infrastructure

### 4a. RQ Task Queue

```mermaid
graph TD
    subgraph INIT_Q["queue.py — startup"]
        PING_R["redis.Redis.from_url(REDIS_URL).ping()"]
        Q_AVAIL["QUEUE_AVAILABLE = True\nexecution_queue = Queue('executions')"]
        Q_FAIL2["QUEUE_AVAILABLE = False\nexecution_queue = None\nplatform still works"]
        PING_R -->|"success"| Q_AVAIL
        PING_R -->|"exception"| Q_FAIL2
    end

    subgraph ENQ["api/workflows.py — POST /execute"]
        CHK_Q{"QUEUE_AVAILABLE?"}
        ENQ_RQ["execution_queue.enqueue\nrun_workflow\njob_timeout=600\nRetry(max=3, interval=[10,30,60])"]
        ENQ_BG["BackgroundTasks.add_task\n_run_workflow_bg"]
        CHK_Q -->|"yes"| ENQ_RQ
        CHK_Q -->|"no"| ENQ_BG
    end

    subgraph TASK["services/tasks.py — the RQ task"]
        FN["run_workflow(\n  execution_id, workflow_id,\n  task, trace_id, source\n)"]
        CALL_WE2["workflow_executor.execute(...)"]
        FN --> CALL_WE2
    end

    subgraph WRKR["worker container"]
        LISTEN2["rq worker executions\n--url redis://redis:6379"]
        DEQUEUE["BRPOP executions queue\ndeserialize + invoke run_workflow"]
        RETRY_RQ["on exception:\nre-enqueue after 10s / 30s / 60s\nmax 3 attempts then → failed queue"]
        LISTEN2 --> DEQUEUE
        DEQUEUE -->|"exception"| RETRY_RQ
    end

    INIT_Q --> ENQ --> TASK --> WRKR
```

### 4b. Redis Pub/Sub — Streaming

```mermaid
graph LR
    subgraph WORKER_SIDE["worker process  sync"]
        W_CODE["after each node completes:\nstream_publisher.publish(\n  execution_id, event_dict\n)"]
        SYNC_CLI["sync redis.Redis\n.publish('execution:{id}', json)"]
        W_CODE --> SYNC_CLI
    end

    subgraph REDIS_SIDE["Redis channel"]
        CH3["execution:{uuid}\nall subscribers receive every PUBLISH"]
    end

    subgraph BACKEND_SIDE["backend process  async"]
        ASYNC_CLI["redis.asyncio.Redis\n.pubsub().subscribe(channel)"]
        GEN["async generator\nyields each event dict\nbreaks on type == done\nor timeout 600s"]
        WS_FWD["WebSocket handler\nsend_json(event) to browser"]
        ASYNC_CLI --> GEN --> WS_FWD
    end

    SYNC_CLI -->|"PUBLISH"| CH3
    CH3      -->|"message"| ASYNC_CLI
```

**Events published by the worker:**

| Event | Fields | When |
|---|---|---|
| `node_complete` | `node_id · output · tokens` | after each node finishes |
| `done` (success) | `result · node_outputs · tokens_used · cost · elapsed` | workflow complete |
| `done` (error) | `error` | workflow failed |

### 4c. LLM Provider Routing

```mermaid
graph LR
    subgraph FACTORY["LLMFactory.get_llm(model, provider, temperature, max_tokens)"]
        OR_B["openrouter\nChatOpenAI\nbase=openrouter.ai/api/v1\nkey=OPENROUTER_API_KEY"]
        OAI_B["openai\nChatOpenAI\nkey=OPENAI_API_KEY"]
        GROQ_B["groq\nChatGroq\nkey=GROQ_API_KEY"]
        OLL_B["ollama\nChatOllama\nbase=OLLAMA_BASE_URL\nnum_predict=max_tokens"]
        ERR_B["else\nraise ValueError\nUnknown provider"]
    end

    subgraph COST["Cost rate — COST_PER_1K"]
        C_OR2["openrouter  $0.002 / 1K tokens"]
        C_OAI2["openai      $0.030 / 1K tokens"]
        C_GROQ2["groq        $0.0001 / 1K tokens"]
        C_OLL2["ollama      $0.000  free local"]
    end

    OR_B   --- C_OR2
    OAI_B  --- C_OAI2
    GROQ_B --- C_GROQ2
    OLL_B  --- C_OLL2
```

Token cost is computed after the ReAct loop ends by summing `token_usage.total_tokens` across every `AIMessage` in `response["messages"]`.

### 4d. Fernet Encryption — Tool API Keys

```mermaid
graph TD
    subgraph WRITE2["Write — POST or PUT /tools"]
        PT["plaintext key\ne.g. sk-abc123"]
        ENC2["Fernet.encrypt\nAES-128-CBC + HMAC-SHA256\nkey = TOOL_ENCRYPTION_KEY from .env"]
        STORED["encrypted bytes\nstored in tools.api_key column"]
        PT --> ENC2 --> STORED
    end

    subgraph READ2["Read — GET /tools"]
        ALWAYS["always return  '••••••'\nplaintext never in HTTP response"]
    end

    subgraph UPDATE2["Update — PUT /tools/:id"]
        SAME{"new value\n== '••••••'?"}
        KEEP["leave stored key unchanged"]
        REPLACE["encrypt new value → overwrite"]
        SAME -->|"yes"| KEEP
        SAME -->|"no"| REPLACE
    end

    subgraph USE2["Use — test or workflow execution"]
        DEC2["Fernet.decrypt\nin memory only"]
        INJ["inject into header:\napi_key_header: prefix + decrypted_key"]
        DEC2 --> INJ
    end

    subgraph ROTATE["Key rotation"]
        GEN2["python3 -c\n\"from cryptography.fernet import Fernet\nprint(Fernet.generate_key().decode())\""]
        WARN2["set TOOL_ENCRYPTION_KEY in .env\n⚠ existing stored keys become unreadable\nre-enter all tool API keys after rotation"]
        GEN2 --> WARN2
    end

    WRITE2 --> READ2
    WRITE2 --> UPDATE2
    WRITE2 --> USE2
```

---

## Quick Reference — Where Each Tool Lives

| Tool | File | Type |
|---|---|---|
| `web_search` | `services/executor.py` | `@tool` — LangChain StructuredTool |
| `_do_web_search` | `services/executor.py` | raw function — used by tests |
| HTTP Tool Node | `services/workflow_executor.py` → `_make_tool_node` | workflow canvas node |
| Telegram webhook | `api/telegram.py` + `services/telegram_handler.py` | FastAPI router |
| Slack webhook | `api/slack.py` | FastAPI router |
| APScheduler | `services/scheduler.py` | background thread in `backend` |
| RQ task | `services/tasks.py` + `services/queue.py` | executed by `worker` container |
| Redis streaming — publish | `services/stream_publisher.py` → `publish()` | sync — called from `worker` |
| Redis streaming — subscribe | `services/stream_publisher.py` → `subscribe_execution()` | async — called from `backend` |
| WebSocket endpoint | `api/execution_stream.py` | FastAPI WebSocket router |
| LLM routing | `services/executor.py` → `LLMFactory` | called from `AgentExecutor` |
| Fernet encryption | `services/crypto.py` | called from `api/tools.py` |
