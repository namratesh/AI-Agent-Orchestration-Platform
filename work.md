# AI Agent Orchestration Platform — Technical Documentation

This document provides a comprehensive explanation of the architecture, files, classes, functions, and tools used in the AI Agent Orchestration Platform.

---

## 1. Directory & File Structure

```text
AI Agent Orchestration Platform/
├── docker-compose.yml       # Docker container definitions (PostgreSQL, Redis, Backend)
├── backend/
│   ├── Dockerfile           # Backend application container config
│   ├── requirements.txt     # Python backend dependencies
│   ├── main.py              # FastAPI application & HTTP endpoint routing
│   ├── config.py            # Environment-based configuration settings
│   ├── db.py                # Database connection, SQLAlchemy ORM models & helper CRUD functions
│   ├── models.py            # Pydantic schemas for data validation and serialization
│   ├── executor.py          # StateGraph agent executor and LLM integration
│   ├── workflow_executor.py # Multi-agent workflow execution engine
│   ├── queue_manager.py     # Redis message queue helpers for task handling
│   └── logging_config.py    # Structured logging configuration (structlog)
```

---

## 2. File-by-File Detailed Explanation

### 2.1. [config.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/config.py)
* **Purpose**: Manages configuration settings loaded from environment variables (using a `.env` file via `pydantic-settings`).
* **Classes**:
  * `Settings` (inherits from `BaseSettings`): Loads configurations such as database URL, Redis URL, logging level, LLM provider settings, and credentials for OpenAI, OpenRouter, and Groq.
* **Objects**:
  * `settings`: An instantiated singleton object of `Settings` to be imported throughout the project.

---

### 2.2. [db.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/db.py)
* **Purpose**: Coordinates connection pooling, database session initialization, SQLAlchemy ORM models, and CRUD helper operations.
* **ORM Models**:
  * `Base` (inherits from `DeclarativeBase`): Core class for model mapping.
  * `AgentORM`: Maps to the `agents` table. Stores agent names, system prompts, config options, LLM parameters, and list of tools.
  * `WorkflowORM`: Maps to the `workflows` table. Holds the schema/DAG definition for multi-agent workflows.
  * `MessageORM`: Maps to the `messages` table. Stores sender/receiver IDs, transaction costs, tokens used, and the text payload.
  * `WorkflowExecutionCheckpointORM`: Maps to the `workflow_execution_checkpoints` table. Records execution states at individual graph nodes.
* **Functions**:
  * `get_db()`: Generator function yielding active SQLAlchemy db sessions.
  * `create_agent()`, `get_agent()`, `list_agents()`: Create and query agents.
  * `create_workflow()`, `get_workflow()`, `list_workflows()`: Manage workflow templates.
  * `save_message()`, `get_messages()`: Persist and load execution messages.
  * `save_checkpoint()`, `get_checkpoint()`, `list_checkpoints()`: Handle checkpoint operations to track workflow execution progress.

---

### 2.3. [models.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/models.py)
* **Purpose**: Declares Pydantic schema validation structures for request body validation and responses.
* **Key Classes**:
  * `Agent` & `AgentCreate`: Validation for registering and returning agents.
  * `WorkflowNode` & `WorkflowEdge` & `WorkflowDefinition`: Schema configuration for workflow templates.
  * `Workflow` & `WorkflowCreate`: Serialization structures for multi-agent workflows.
  * `Message`: Format of conversation payloads.
  * `CheckpointResponse`: Represents workflow step checkpoint details.
  * `ExecuteRequest` & `ExecuteResponse`: Parameters for starting task executions and receiving outcomes.
  * `WorkflowExecuteResponse`: Execution return status for multi-agent workflows.

---

### 2.4. [executor.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/executor.py)
* **Purpose**: Manages single-agent state machines, LLM client connections, and tool execution using LangGraph.
* **Classes**:
  * `LLMFactory`: Contains a static method `get_llm()` to instantiate a LangChain `ChatOpenAI`, `ChatGroq`, or `ChatOllama` model based on model/provider specifications.
  * `AgentExecutor`: Manages individual agent graph invocations and tracks input/output state records, token counts, and execution costs.
* **State Graph Helpers**:
  * `AgentState` (`TypedDict`): Tracks context (task, system prompt, output result, pending tools, token counts).
  * `call_llm_node()`: LangGraph node that packages system/user prompt arrays and invokes the LLM.
  * `tool_node()`: Executes registered tools inside the graph runtime.
  * `should_use_tool()`: Routing edge conditional checking if any tool invocations are requested.
  * `build_graph()`: Constructs the execution graph logic and returns the compiled state machine.
* **Tools**:
  * `web_search(query: str)`: Mock search engine simulation. Returns a list of structured mock details relevant to the query to simulate web integration.

---

### 2.5. [workflow_executor.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/workflow_executor.py)
* **Purpose**: Handles multi-agent workflow sequence execution. It routes information sequentially between agent nodes using Redis lists as transmission queues.
* **Classes**:
  * `WorkflowExecutor`: Reads the workflow DAG schema, iterates over the execution graph, triggers target agents via the `AgentExecutor`, saves state checkpoints, and handles queue updates.
* **Functions**:
  * `_next_node(edges: list, current_node_id: str)`: Traverses graph edges to find the successor node connected to the active node.

---

### 2.6. [queue_manager.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/queue_manager.py)
* **Purpose**: Connects to the Redis container to manage task distribution queues.
* **Functions**:
  * `publish_task(queue_name: str, message: dict)`: Pushes a new execution request payload into a Redis list.
  * `consume_task(queue_name: str, timeout: int)`: Performs blocking pop (`brpop`) on a Redis list to read and process incoming task items.
  * `publish_result(queue_name: str, result: dict)`: Pushes execution outcome payloads back to Redis.

---

### 2.7. [main.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/main.py)
* **Purpose**: Exposes FastAPI endpoints for interacting with the platform.
* **Key Endpoints**:
  * `POST /agents`: Create an agent.
  * `GET /agents`: Retrieve all agents.
  * `POST /agents/{agent_id}/execute`: Run a task on an individual agent.
  * `POST /workflows`: Register a new multi-agent workflow.
  * `GET /workflows`: Get all workflows.
  * `POST /workflows/{workflow_id}/execute`: Execute a multi-agent workflow.
  * `GET /workflows/{workflow_id}/checkpoints`: Fetch execution checkpoints.
* **Middlewares**:
  * `trace_id_middleware()`: Assigns a unique trace UUID to HTTP headers and requests to trace logs across operations.

---

### 2.8. [logging_config.py](file:///Users/namratesh/Desktop/project/AI%20Agent%20Orchestration%20Platform/backend/logging_config.py)
* **Purpose**: Sets up structured logging with JSON serialization format utilizing the `structlog` framework.
* **Functions**:
  * `setup_logging()`: Initializes base logging parameters and applies rendering processors.
  * `get_logger(name: str)`: Provides a formatted JSON logger to write traces.

---

## 3. How the Tools Functionality Works

The platform supports executing tools inside the agent's LangGraph process:
1. **Tool Registration**: Agents can list tools (e.g. `"web_search"`) inside their `tools` array parameter when created via `POST /agents`.
2. **Tool Execution Edge**: During agent execution in `AgentExecutor.execute()`, if `"web_search"` is registered, the executor generates a tool request state payload.
3. **Graph Execution**:
   * The compiled LangGraph triggers the `llm` node.
   * After the `llm` node, the execution routes to `should_use_tool()`.
   * If a tool call is queued, it transitions to `tool_node()`, which calls the `web_search()` function.
   * `web_search()` executes, collects the mock information, and returns it to update the context state.
   * Finally, the updated context returns to the main execution line to produce the final agent answer.

---

## 4. Multi-Agent Workflow Handoff & Synchronization

Multi-agent execution sequences work as follows:
1. **DAG Parsing**: The `WorkflowExecutor` resolves nodes and edges starting at `start_node_id`.
2. **Node Traversal**:
   * For an `AGENT` node, the `WorkflowExecutor` executes the associated agent using `AgentExecutor.execute()`.
   * The node output is serialized and stored in `WorkflowExecutionCheckpointORM` to log the current step.
3. **Redis Synchronization Queue**:
   * If there is a successor node, the executor calls `queue_manager.publish_result()` to publish the output payload onto a Redis list named `workflow:<workflow_id>`.
   * It then calls `queue_manager.consume_task()` to blockingly pop the payload from the same list. This pattern models a decoupled handoff system ready to integrate with separate async worker daemons.
   * The returned message content updates the execution input for the next agent node.
4. **Termination**: When `_next_node()` returns `None`, the final node's result is returned as the overall workflow execution response.
