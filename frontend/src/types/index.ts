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
  type: 'AGENT' | 'CONDITION' | 'HUMAN_APPROVAL' | 'TOOL'
  agent_id?: string
  tool_id?: string
  config: Record<string, unknown>
}

export type ConditionType = 'always' | 'contains' | 'not_contains' | 'equals' | 'not_equals'

export interface EdgeCondition {
  type: ConditionType
  value: string
}

export interface WorkflowEdge {
  source_node_id: string
  target_node_id: string
  connection_type?: 'agent_sequence' | 'tool_to_agent' | 'agent_to_tool' | 'tool_chain'
  condition?: EdgeCondition
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
  status: string
}

export interface AgentConfig {
  temperature?: number
  max_tokens?: number
  max_iterations?: number
  memory_type?: 'none' | 'buffer'
  memory_window?: number
  max_output_words?: number
}

export interface ExecutionRecord {
  id: string
  workflow_id?: string
  workflow_name?: string
  task: string
  result: string
  status: 'success' | 'error' | 'queued' | 'running'
  tokens_used: number
  cost: number
  execution_time_seconds: number
  source: string
  created_at: string
  node_outputs?: Record<string, string>
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

export interface Tool {
  id: string
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
  created_at: string
}

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

export interface ToolUpdate extends Partial<ToolCreate> {}

export interface ToolTestRequest {
  variables: Record<string, string>
  body_override?: string
  params: Record<string, string>
}

export interface ToolTestResponse {
  status_code: number
  response_body: string
  response_headers: Record<string, string>
  duration_ms: number
  error?: string
}
