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

export interface AgentCreate {
  name: string
  role: string
  system_prompt: string
  model: string
  provider: string
  tools: string[]
  config: Record<string, unknown>
}

export interface WorkflowNode {
  id: string
  type: 'AGENT' | 'CONDITION' | 'HUMAN_APPROVAL'
  agent_id?: string
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  source_node_id: string
  target_node_id: string
  condition?: string
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  start_node_id: string
}

export interface Workflow {
  id: string
  name: string
  definition: WorkflowDefinition
}

export interface WorkflowCreate {
  name: string
  definition: WorkflowDefinition
}

export interface WorkflowExecuteResponse {
  workflow_id: string
  task: string
  result: string
  tokens_used: number
  cost: number
  trace_id: string
  execution_id?: string
  execution_time_seconds: number
}

export interface ExecutionRecord {
  id: string
  workflow_id?: string
  workflow_name?: string
  task: string
  result: string
  status: 'success' | 'error'
  tokens_used: number
  cost: number
  execution_time_seconds: number
  source: string
  created_at: string
}

export interface StatsResponse {
  total_agents: number
  total_workflows: number
  executions_today: number
  cost_this_month: number
  recent_executions: ExecutionRecord[]
}

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

export interface TelegramMapping {
  chat_id: string
  workflow_id: string
  username?: string
}
