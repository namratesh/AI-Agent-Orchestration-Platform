import axios from 'axios'
import type {
  Agent, AgentCreate, ExecutionRecord, StatsResponse,
  TelegramMapping, Tool, ToolCreate, ToolTestRequest, ToolTestResponse, ToolUpdate,
  Workflow, WorkflowCreate, WorkflowDefinition, WorkflowExecuteResponse,
} from './types'

export type { Agent, AgentCreate, ExecutionRecord, StatsResponse,
  TelegramMapping, Tool, ToolCreate, ToolTestRequest, ToolTestResponse, ToolUpdate,
  Workflow, WorkflowCreate, WorkflowDefinition, WorkflowExecuteResponse }

export const api = axios.create({ baseURL: '' })

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
