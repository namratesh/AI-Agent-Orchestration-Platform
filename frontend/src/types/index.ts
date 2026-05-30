/**
 * Shared TypeScript types for the AI Agent Orchestration Platform frontend.
 *
 * These interfaces mirror the Pydantic models defined in `backend/schemas/models.py`.
 * Keep them in sync when the API contract changes.
 */

// ── Agent ─────────────────────────────────────────────────────────────────────

/** A configured AI agent returned by the API. */
export interface Agent {
  id: string
  name: string
  role: string
  system_prompt: string
  model: string
  provider: string
  tools: string[]
  config: Record<string, unknown>
}

/** Payload for creating a new agent. */
export interface AgentCreate {
  name: string
  role: string
  system_prompt: string
  model: string
  provider: string
  tools: string[]
  config: Record<string, unknown>
}

// ── Workflow ──────────────────────────────────────────────────────────────────

/** A single node in the workflow canvas. */
export interface WorkflowNode {
  id: string
  /** AGENT and TOOL are executable; CONDITION and HUMAN_APPROVAL are reserved for future use. */
  type: 'AGENT' | 'CONDITION' | 'HUMAN_APPROVAL' | 'TOOL'
  agent_id?: string
  tool_id?: string
  config: Record<string, unknown>
}

/**
 * Supported edge condition types.
 * Evaluation semantics are documented in `workflow_executor._eval_condition`.
 */
export type ConditionType = 'always' | 'contains' | 'not_contains' | 'equals' | 'not_equals'

/** Routing condition attached to a workflow edge. */
export interface EdgeCondition {
  type: ConditionType
  /** Keyword list (comma-separated) for `contains`/`not_contains`, or exact value for `equals`/`not_equals`. */
  value: string
}

/** A directed edge connecting two workflow nodes. */
export interface WorkflowEdge {
  source_node_id: string
  target_node_id: string
  connection_type?: 'agent_sequence' | 'tool_to_agent' | 'agent_to_tool' | 'tool_chain'
  condition?: EdgeCondition
}

/** The complete graph definition for a workflow (nodes + edges). */
export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  start_node_id: string
}

/** A workflow returned by the API. */
export interface Workflow {
  id: string
  name: string
  definition: WorkflowDefinition
}

/** Payload for creating a new workflow. */
export interface WorkflowCreate {
  name: string
  definition: WorkflowDefinition
}

/**
 * Response from the asynchronous workflow execution endpoint (HTTP 202).
 *
 * `status` is always `"queued"` at response time.  Use `execution_id` to poll
 * `GET /executions/{id}` or subscribe to `/ws/executions/{id}` for updates.
 */
export interface WorkflowExecuteResponse {
  workflow_id: string
  task: string
  result: string
  tokens_used: number
  cost: number
  trace_id: string
  execution_id?: string
  execution_time_seconds: number
  status: string
}

// ── Agent config ──────────────────────────────────────────────────────────────

/** Per-agent runtime configuration stored in `agent.config`. */
export interface AgentConfig {
  /** Sampling temperature (0–2). Higher values produce more varied output. */
  temperature?: number
  /** Maximum tokens to generate per LLM call. */
  max_tokens?: number
  /** Maximum ReAct loop iterations before the agent stops. */
  max_iterations?: number
  /** Memory strategy: `"buffer"` loads recent history; `"none"` disables memory. */
  memory_type?: 'none' | 'buffer'
  /** Number of past conversation turns to include in each call. */
  memory_window?: number
  max_output_words?: number
}

// ── Execution ─────────────────────────────────────────────────────────────────

/** A workflow execution record as stored in the database. */
export interface ExecutionRecord {
  id: string
  workflow_id?: string
  workflow_name?: string
  task: string
  result: string
  /** Lifecycle: queued → running → success | error */
  status: 'success' | 'error' | 'queued' | 'running'
  tokens_used: number
  cost: number
  execution_time_seconds: number
  /** Originating source: `"ui"`, `"slack"`, `"telegram"`, `"scheduled"`. */
  source: string
  created_at: string
  /** Per-node outputs keyed by node ID. */
  node_outputs?: Record<string, string>
  error_message?: string
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/** Aggregated platform statistics returned by `GET /stats`. */
export interface StatsResponse {
  total_agents: number
  total_workflows: number
  executions_today: number
  cost_this_month: number
  recent_executions: ExecutionRecord[]
}

// ── Logs ──────────────────────────────────────────────────────────────────────

/**
 * A structured log event received from the `/ws/logs` WebSocket.
 *
 * The `type: "ping"` variant has no other fields — used as a keepalive.
 * All other variants are structlog JSON entries with variable keys.
 */
export interface LogEntry {
  type?: string
  event?: string
  message?: string
  level?: string
  logger?: string
  timestamp?: string
  agent_id?: string
  trace_id?: string
  tokens?: number
  tokens_used?: number
  cost?: number
  [key: string]: unknown
}

// ── Telegram ──────────────────────────────────────────────────────────────────

/** A Telegram chat_id → workflow mapping. */
export interface TelegramMapping {
  chat_id: string
  workflow_id: string
  username?: string
}

// ── Tools ─────────────────────────────────────────────────────────────────────

/** An HTTP tool returned by the API (api_key is always masked). */
export interface Tool {
  id: string
  name: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers: Record<string, string>
  body_template: string
  /** Always returned as a mask string — never the real key. */
  api_key: string
  api_key_header: string
  api_key_prefix: string
  timeout_seconds: number
  created_at: string
}

/** Payload for creating a new tool. */
export interface ToolCreate {
  name: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers: Record<string, string>
  body_template: string
  api_key: string
  api_key_header: string
  api_key_prefix: string
  timeout_seconds: number
}

/** Partial update payload for a tool. */
export interface ToolUpdate extends Partial<ToolCreate> {}

/**
 * Payload for the tool test endpoint.
 *
 * `variables` are substituted into `{{variable}}` placeholders in the tool's
 * URL, headers, and body template before the request is sent.
 */
export interface ToolTestRequest {
  variables: Record<string, string>
  body_override?: string
  params: Record<string, string>
}

/** A prebuilt tool template from `GET /tools/templates`. */
export interface ToolTemplate {
  slug: string
  name: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers: Record<string, string>
  body_template: string
  api_key: string
  api_key_header: string
  api_key_prefix: string
  timeout_seconds: number
  /** Short guidance text displayed in the UI to help users set up the tool. */
  setup_hint: string
  docs_url?: string
}

/** Result from a live tool test call. */
export interface ToolTestResponse {
  status_code: number
  response_body: string
  response_headers: Record<string, string>
  duration_ms: number
  error?: string
}

// ── Schedules ─────────────────────────────────────────────────────────────────

/** A time-based workflow trigger. */
export interface WorkflowSchedule {
  id: string
  workflow_id: string
  task: string
  /** Standard cron expression (e.g. `"0 9 * * 1-5"`). Mutually exclusive with `interval_minutes`. */
  cron_expression?: string
  /** Fixed interval in minutes. Mutually exclusive with `cron_expression`. */
  interval_minutes?: number
  enabled: boolean
  last_run_at?: string
  next_run_at?: string
  created_at: string
}

/** Payload for creating a new schedule. Exactly one trigger field must be set. */
export interface ScheduleCreate {
  task: string
  cron_expression?: string
  interval_minutes?: number
}

/** Partial update payload for a schedule. */
export interface ScheduleUpdate {
  task?: string
  cron_expression?: string
  interval_minutes?: number
  enabled?: boolean
}

// ── Integrations ──────────────────────────────────────────────────────────────

/** An outbound channel integration attached to a workflow (legacy). */
export interface WorkflowIntegration {
  id: string
  workflow_id: string
  channel_type: 'telegram' | 'slack'
  config: Record<string, string>
  enabled: boolean
  created_at: string
}

/** Payload for creating an outbound integration. */
export interface IntegrationCreate {
  channel_type: 'telegram' | 'slack'
  config: Record<string, string>
}

/** Partial update payload for an integration. */
export interface IntegrationUpdate {
  config?: Record<string, string>
  enabled?: boolean
}

// ── Named Bots ────────────────────────────────────────────────────────────────

/**
 * A named inbound messaging bot returned by the API.
 *
 * Sensitive config fields (`bot_token`, `signing_secret`) are replaced with
 * a mask string (`"••••••••••••••••"`) in all read responses.
 */
export interface ChannelBot {
  id: string
  name: string
  channel_type: 'telegram' | 'slack'
  config: Record<string, string>
  enabled: boolean
  created_at: string
}

/** Payload for creating a named bot. Must include channel-specific credentials. */
export interface BotCreate {
  name: string
  channel_type: 'telegram' | 'slack'
  config: Record<string, string>
}

/** Partial update payload for a named bot. */
export interface BotUpdate {
  name?: string
  config?: Record<string, string>
  enabled?: boolean
}

/** A Slack channel → workflow mapping scoped to a named bot. */
export interface SlackChannelMapping {
  id: string
  bot_id: string
  channel_id: string
  channel_name?: string
  workflow_id: string
  created_at: string
}

/** Payload for creating a Slack channel mapping. */
export interface SlackMappingCreate {
  channel_id: string
  workflow_id: string
  channel_name?: string
}
