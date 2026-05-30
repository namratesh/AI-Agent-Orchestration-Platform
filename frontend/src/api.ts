/**
 * Typed API client for the AI Agent Orchestration Platform backend.
 *
 * All functions return bare data (not the Axios response wrapper) so callers
 * don't need to unwrap `.data` at every call site.
 *
 * Authentication:
 *   When `VITE_API_KEY` is set in the environment, every request includes an
 *   `Authorization: Bearer <key>` header automatically.  Leave unset for local
 *   development deployments that don't require auth.
 *
 * Base URL:
 *   Empty string — all paths are relative to the current origin so the dev
 *   Vite proxy (vite.config.ts) transparently forwards API calls to the
 *   FastAPI backend without CORS issues.
 */
import axios from 'axios'
import type {
  Agent, AgentCreate, BotCreate, BotUpdate, ChannelBot, ExecutionRecord,
  IntegrationCreate, IntegrationUpdate, ScheduleCreate, ScheduleUpdate, SlackChannelMapping,
  SlackMappingCreate, StatsResponse, TelegramMapping, Tool, ToolCreate, ToolTemplate,
  ToolTestRequest, ToolTestResponse, ToolUpdate, Workflow, WorkflowCreate, WorkflowDefinition,
  WorkflowExecuteResponse, WorkflowIntegration, WorkflowSchedule,
} from './types'

export type { Agent, AgentCreate, BotCreate, BotUpdate, ChannelBot, ExecutionRecord,
  IntegrationCreate, IntegrationUpdate, ScheduleCreate, ScheduleUpdate, SlackChannelMapping,
  SlackMappingCreate, StatsResponse, TelegramMapping, Tool, ToolCreate, ToolTemplate,
  ToolTestRequest, ToolTestResponse, ToolUpdate, Workflow, WorkflowCreate, WorkflowDefinition,
  WorkflowExecuteResponse, WorkflowIntegration, WorkflowSchedule }

export const api = axios.create({ baseURL: '' })

// Attach API key when configured (set VITE_API_KEY in .env).
const _apiKey = import.meta.env.VITE_API_KEY as string | undefined
if (_apiKey) {
  api.defaults.headers.common['Authorization'] = `Bearer ${_apiKey}`
}

// ── Agents ────────────────────────────────────────────────────────────────────

/** Return all configured agents. */
export const listAgents    = () => api.get<Agent[]>('/agents').then(r => r.data)

/** Return a single agent by UUID. */
export const getAgent      = (id: string) => api.get<Agent>(`/agents/${id}`).then(r => r.data)

/** Create a new agent. */
export const createAgent   = (data: AgentCreate) => api.post<Agent>('/agents', data).then(r => r.data)

/** Partially update an agent — only non-null fields are applied. */
export const updateAgent   = (id: string, data: Partial<AgentCreate>) => api.put<Agent>(`/agents/${id}`, data).then(r => r.data)

/** Delete an agent by UUID. */
export const deleteAgent   = (id: string) => api.delete(`/agents/${id}`)

/** Execute a task against a single agent synchronously. */
export const executeAgent  = (id: string, task: string) =>
  api.post(`/agents/${id}/execute`, { task }).then(r => r.data)

// ── Workflows ────────────────────────────────────────────────────────────────

/** Return all workflows. */
export const listWorkflows    = () => api.get<Workflow[]>('/workflows').then(r => r.data)

/** Return a single workflow by UUID. */
export const getWorkflow      = (id: string) => api.get<Workflow>(`/workflows/${id}`).then(r => r.data)

/** Create a new workflow with a node/edge definition. */
export const createWorkflow   = (data: WorkflowCreate) =>
  api.post<Workflow>('/workflows', data).then(r => r.data)

/**
 * Dispatch a workflow execution asynchronously (HTTP 202).
 * Returns immediately with an `execution_id` — poll or stream for the result.
 */
export const executeWorkflow  = (id: string, task: string) =>
  api.post<WorkflowExecuteResponse>(`/workflows/${id}/execute`, { task }).then(r => r.data)

/** Delete a workflow by UUID. */
export const deleteWorkflow   = (id: string) => api.delete(`/workflows/${id}`)

/** Return all node-level execution checkpoints for a workflow. */
export const listCheckpoints  = (id: string) =>
  api.get(`/workflows/${id}/checkpoints`).then(r => r.data)

// ── Executions ───────────────────────────────────────────────────────────────

/** Return a paginated list of execution records, newest first. */
export const listExecutions   = (limit = 50, offset = 0) =>
  api.get<ExecutionRecord[]>('/executions', { params: { limit, offset } }).then(r => r.data)

/** Return a single execution record by UUID. */
export const getExecution     = (id: string) =>
  api.get<ExecutionRecord>(`/executions/${id}`).then(r => r.data)

/** Delete an execution record by UUID. */
export const deleteExecution  = (id: string) => api.delete(`/executions/${id}`)

// ── Stats ─────────────────────────────────────────────────────────────────────

/** Return aggregated platform statistics for the dashboard. */
export const getStats = () => api.get<StatsResponse>('/stats').then(r => r.data)

// ── Telegram ──────────────────────────────────────────────────────────────────

/** Return all global Telegram chat → workflow mappings (legacy path). */
export const listMappings   = () => api.get<TelegramMapping[]>('/telegram/mappings').then(r => r.data)

/** Create or replace a global Telegram chat mapping (legacy path). */
export const createMapping  = (data: TelegramMapping) =>
  api.post<TelegramMapping>('/telegram/mappings', data).then(r => r.data)

/** Delete a global Telegram chat mapping by chat ID (legacy path). */
export const deleteMapping  = (chatId: string) => api.delete(`/telegram/mappings/${chatId}`)

// ── Tools ─────────────────────────────────────────────────────────────────────

/** Return all tools with API keys masked. */
export const listTools         = () => api.get<Tool[]>('/tools').then(r => r.data)

/** Return a single tool by UUID with its API key masked. */
export const getTool           = (id: string) => api.get<Tool>(`/tools/${id}`).then(r => r.data)

/** Create a new tool. The API key is encrypted before storage. */
export const createTool        = (data: ToolCreate) => api.post<Tool>('/tools', data).then(r => r.data)

/** Update a tool. Send the mask string as `api_key` to preserve the existing key. */
export const updateTool        = (id: string, data: ToolUpdate) =>
  api.put<Tool>(`/tools/${id}`, data).then(r => r.data)

/** Delete a tool by UUID. */
export const deleteTool        = (id: string) => api.delete(`/tools/${id}`)

/** Execute a live HTTP test call against a tool. */
export const testTool          = (id: string, data: ToolTestRequest) =>
  api.post<ToolTestResponse>(`/tools/${id}/test`, data).then(r => r.data)

/** Return static prebuilt tool templates. */
export const listToolTemplates = () =>
  api.get<ToolTemplate[]>('/tools/templates').then(r => r.data)

// ── Seed ──────────────────────────────────────────────────────────────────────

/** Seed the database with demo agents and workflows (idempotent). */
export const seedDemo = () =>
  api.post<{ seeded: boolean; reason?: string }>('/seed').then(r => r.data)

// ── Schedules ─────────────────────────────────────────────────────────────────

/** Return all schedules for a workflow. */
export const listSchedules   = (workflowId: string) =>
  api.get<WorkflowSchedule[]>(`/workflows/${workflowId}/schedules`).then(r => r.data)

/** Create a new schedule for a workflow. */
export const createSchedule  = (workflowId: string, data: ScheduleCreate) =>
  api.post<WorkflowSchedule>(`/workflows/${workflowId}/schedules`, data).then(r => r.data)

/** Update an existing schedule's trigger or enabled state. */
export const updateScheduleApi = (scheduleId: string, data: ScheduleUpdate) =>
  api.put<WorkflowSchedule>(`/schedules/${scheduleId}`, data).then(r => r.data)

/** Delete a schedule by UUID. */
export const deleteScheduleApi = (scheduleId: string) =>
  api.delete(`/schedules/${scheduleId}`)

// ── Integrations (legacy per-workflow) ────────────────────────────────────────

/** Return all outbound integrations for a workflow. */
export const listIntegrations   = (workflowId: string) =>
  api.get<WorkflowIntegration[]>(`/workflows/${workflowId}/integrations`).then(r => r.data)

/** Create a new outbound channel integration for a workflow. */
export const createIntegration  = (workflowId: string, data: IntegrationCreate) =>
  api.post<WorkflowIntegration>(`/workflows/${workflowId}/integrations`, data).then(r => r.data)

/** Update an integration's config or enabled state. */
export const updateIntegrationApi = (integrationId: string, data: IntegrationUpdate) =>
  api.put<WorkflowIntegration>(`/integrations/${integrationId}`, data).then(r => r.data)

/** Delete an integration by UUID. */
export const deleteIntegrationApi = (integrationId: string) =>
  api.delete(`/integrations/${integrationId}`)

// ── Named Bots ────────────────────────────────────────────────────────────────

/** Return all named bots with credentials masked. */
export const listBots    = () => api.get<ChannelBot[]>('/bots').then(r => r.data)

/** Create a new named bot. */
export const createBot   = (data: BotCreate) => api.post<ChannelBot>('/bots', data).then(r => r.data)

/** Update a named bot's name, config, or enabled state. */
export const updateBotApi = (botId: string, data: BotUpdate) =>
  api.put<ChannelBot>(`/bots/${botId}`, data).then(r => r.data)

/** Delete a named bot and all its channel mappings. */
export const deleteBotApi = (botId: string) => api.delete(`/bots/${botId}`)

// Telegram mappings scoped to a named bot

/** Return all Telegram chat mappings for a named bot. */
export const listTelegramMappingsForBot = (botId: string) =>
  api.get<TelegramMapping[]>(`/bots/${botId}/telegram-mappings`).then(r => r.data)

/** Map a Telegram chat to a workflow under a specific named bot. */
export const addTelegramMapping = (botId: string, data: { chat_id: string; workflow_id: string; username?: string }) =>
  api.post<TelegramMapping>(`/bots/${botId}/telegram-mappings`, data).then(r => r.data)

/** Remove a Telegram chat mapping by chat ID. */
export const removeTelegramMapping = (chatId: string) =>
  api.delete(`/bots/telegram-mappings/${chatId}`)

// Slack channel mappings scoped to a named bot

/** Return all Slack channel mappings for a named bot. */
export const listSlackMappings = (botId: string) =>
  api.get<SlackChannelMapping[]>(`/bots/${botId}/slack-mappings`).then(r => r.data)

/** Map a Slack channel to a workflow under a specific named bot. */
export const addSlackMapping = (botId: string, data: SlackMappingCreate) =>
  api.post<SlackChannelMapping>(`/bots/${botId}/slack-mappings`, data).then(r => r.data)

/** Remove a Slack channel mapping by mapping UUID. */
export const removeSlackMapping = (mappingId: string) =>
  api.delete(`/bots/slack-mappings/${mappingId}`)
