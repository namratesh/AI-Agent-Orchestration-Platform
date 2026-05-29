import axios from 'axios'
import type {
  Agent, AgentCreate, BotCreate, BotUpdate, ChannelBot, ExecutionRecord,
  IntegrationCreate, IntegrationUpdate, ScheduleCreate, ScheduleUpdate, SlackChannelMapping,
  SlackMappingCreate, StatsResponse, TelegramMapping, Tool, ToolCreate, ToolTestRequest,
  ToolTestResponse, ToolUpdate, Workflow, WorkflowCreate, WorkflowDefinition,
  WorkflowExecuteResponse, WorkflowIntegration, WorkflowSchedule,
} from './types'

export type { Agent, AgentCreate, BotCreate, BotUpdate, ChannelBot, ExecutionRecord,
  IntegrationCreate, IntegrationUpdate, ScheduleCreate, ScheduleUpdate, SlackChannelMapping,
  SlackMappingCreate, StatsResponse, TelegramMapping, Tool, ToolCreate, ToolTestRequest,
  ToolTestResponse, ToolUpdate, Workflow, WorkflowCreate, WorkflowDefinition,
  WorkflowExecuteResponse, WorkflowIntegration, WorkflowSchedule }

export const api = axios.create({ baseURL: '' })

// Attach API key when configured (set VITE_API_KEY in .env)
const _apiKey = import.meta.env.VITE_API_KEY as string | undefined
if (_apiKey) {
  api.defaults.headers.common['Authorization'] = `Bearer ${_apiKey}`
}

// ── Agents ────────────────────────────────────────────────────────────────────
export const listAgents    = () => api.get<Agent[]>('/agents').then(r => r.data)
export const getAgent      = (id: string) => api.get<Agent>(`/agents/${id}`).then(r => r.data)
export const createAgent   = (data: AgentCreate) => api.post<Agent>('/agents', data).then(r => r.data)
export const deleteAgent   = (id: string) => api.delete(`/agents/${id}`)
export const executeAgent  = (id: string, task: string) =>
  api.post(`/agents/${id}/execute`, { task }).then(r => r.data)

// ── Workflows ────────────────────────────────────────────────────────────────
export const listWorkflows    = () => api.get<Workflow[]>('/workflows').then(r => r.data)
export const getWorkflow      = (id: string) => api.get<Workflow>(`/workflows/${id}`).then(r => r.data)
export const createWorkflow   = (data: WorkflowCreate) =>
  api.post<Workflow>('/workflows', data).then(r => r.data)
export const executeWorkflow  = (id: string, task: string) =>
  api.post<WorkflowExecuteResponse>(`/workflows/${id}/execute`, { task }).then(r => r.data)
export const deleteWorkflow   = (id: string) => api.delete(`/workflows/${id}`)
export const listCheckpoints  = (id: string) =>
  api.get(`/workflows/${id}/checkpoints`).then(r => r.data)

// ── Executions ───────────────────────────────────────────────────────────────
export const listExecutions   = (limit = 50, offset = 0) =>
  api.get<ExecutionRecord[]>('/executions', { params: { limit, offset } }).then(r => r.data)
export const getExecution     = (id: string) =>
  api.get<ExecutionRecord>(`/executions/${id}`).then(r => r.data)
export const deleteExecution  = (id: string) => api.delete(`/executions/${id}`)

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => api.get<StatsResponse>('/stats').then(r => r.data)

// ── Telegram ──────────────────────────────────────────────────────────────────
export const listMappings   = () => api.get<TelegramMapping[]>('/telegram/mappings').then(r => r.data)
export const createMapping  = (data: TelegramMapping) =>
  api.post<TelegramMapping>('/telegram/mappings', data).then(r => r.data)
export const deleteMapping  = (chatId: string) => api.delete(`/telegram/mappings/${chatId}`)

// ── Tools ─────────────────────────────────────────────────────────────────────
export const listTools    = () => api.get<Tool[]>('/tools').then(r => r.data)
export const getTool      = (id: string) => api.get<Tool>(`/tools/${id}`).then(r => r.data)
export const createTool   = (data: ToolCreate) => api.post<Tool>('/tools', data).then(r => r.data)
export const updateTool   = (id: string, data: ToolUpdate) =>
  api.put<Tool>(`/tools/${id}`, data).then(r => r.data)
export const deleteTool   = (id: string) => api.delete(`/tools/${id}`)
export const testTool     = (id: string, data: ToolTestRequest) =>
  api.post<ToolTestResponse>(`/tools/${id}/test`, data).then(r => r.data)

// ── Schedules ─────────────────────────────────────────────────────────────────
export const listSchedules   = (workflowId: string) =>
  api.get<WorkflowSchedule[]>(`/workflows/${workflowId}/schedules`).then(r => r.data)
export const createSchedule  = (workflowId: string, data: ScheduleCreate) =>
  api.post<WorkflowSchedule>(`/workflows/${workflowId}/schedules`, data).then(r => r.data)
export const updateScheduleApi = (scheduleId: string, data: ScheduleUpdate) =>
  api.put<WorkflowSchedule>(`/schedules/${scheduleId}`, data).then(r => r.data)
export const deleteScheduleApi = (scheduleId: string) =>
  api.delete(`/schedules/${scheduleId}`)

// ── Integrations (legacy per-workflow) ────────────────────────────────────────
export const listIntegrations   = (workflowId: string) =>
  api.get<WorkflowIntegration[]>(`/workflows/${workflowId}/integrations`).then(r => r.data)
export const createIntegration  = (workflowId: string, data: IntegrationCreate) =>
  api.post<WorkflowIntegration>(`/workflows/${workflowId}/integrations`, data).then(r => r.data)
export const updateIntegrationApi = (integrationId: string, data: IntegrationUpdate) =>
  api.put<WorkflowIntegration>(`/integrations/${integrationId}`, data).then(r => r.data)
export const deleteIntegrationApi = (integrationId: string) =>
  api.delete(`/integrations/${integrationId}`)

// ── Named Bots ────────────────────────────────────────────────────────────────
export const listBots    = () => api.get<ChannelBot[]>('/bots').then(r => r.data)
export const createBot   = (data: BotCreate) => api.post<ChannelBot>('/bots', data).then(r => r.data)
export const updateBotApi = (botId: string, data: BotUpdate) =>
  api.put<ChannelBot>(`/bots/${botId}`, data).then(r => r.data)
export const deleteBotApi = (botId: string) => api.delete(`/bots/${botId}`)

// Telegram mappings (scoped to a bot)
export const listTelegramMappingsForBot = (botId: string) =>
  api.get<TelegramMapping[]>(`/bots/${botId}/telegram-mappings`).then(r => r.data)
export const addTelegramMapping = (botId: string, data: { chat_id: string; workflow_id: string; username?: string }) =>
  api.post<TelegramMapping>(`/bots/${botId}/telegram-mappings`, data).then(r => r.data)
export const removeTelegramMapping = (chatId: string) =>
  api.delete(`/bots/telegram-mappings/${chatId}`)

// Slack channel mappings (scoped to a bot)
export const listSlackMappings = (botId: string) =>
  api.get<SlackChannelMapping[]>(`/bots/${botId}/slack-mappings`).then(r => r.data)
export const addSlackMapping = (botId: string, data: SlackMappingCreate) =>
  api.post<SlackChannelMapping>(`/bots/${botId}/slack-mappings`, data).then(r => r.data)
export const removeSlackMapping = (mappingId: string) =>
  api.delete(`/bots/slack-mappings/${mappingId}`)
