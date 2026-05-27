import { useState, useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Node, Edge, Background, BackgroundVariant, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, Connection,
  NodeProps, Handle, Position, NodeTypes, useReactFlow, ReactFlowProvider,
  ConnectionMode, MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Link } from 'react-router-dom'
import {
  Bot, Wrench, Save, X, Network, RefreshCw, Plus, ExternalLink, Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import { listTools, listAgents, createWorkflow } from '../api'
import type { Tool, Agent, ConditionType, EdgeCondition } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentNodeData {
  name: string
  role: string
  model: string
  provider: string
}

interface ToolNodeData {
  name: string
  method: string
  description: string
  url: string
}

interface EdgePopupState {
  edgeId: string
  x: number
  y: number
  condition: EdgeCondition | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'always',       label: 'Always'       },
  { value: 'contains',     label: 'Contains'     },
  { value: 'not_contains', label: 'Not Contains' },
  { value: 'equals',       label: 'Equals'       },
  { value: 'not_equals',   label: 'Not Equals'   },
]

const METHOD_COLOR: Record<string, string> = {
  GET:    'bg-emerald-900/70 text-emerald-300',
  POST:   'bg-blue-900/70    text-blue-300',
  PUT:    'bg-amber-900/70   text-amber-300',
  PATCH:  'bg-purple-900/70  text-purple-300',
  DELETE: 'bg-red-900/70     text-red-300',
}

// ─── Agent Node ───────────────────────────────────────────────────────────────
function AgentNode({ id, data, selected }: NodeProps<AgentNodeData>) {
  const { setNodes, setEdges } = useReactFlow()

  const onDelete = useCallback(() => {
    setNodes(nds => nds.filter(n => n.id !== id))
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id))
  }, [id, setNodes, setEdges])

  return (
    <div className={clsx(
      'bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 w-52 select-none transition-all',
      selected
        ? 'border-indigo-500 shadow-xl shadow-indigo-200/30 dark:shadow-indigo-900/40'
        : 'border-gray-200 dark:border-gray-600',
    )}>
      {/* 4-sided handles — any point to any point */}
      <Handle id="top"    type="source" position={Position.Top}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800" />
      <Handle id="left"   type="source" position={Position.Left}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800" />
      <Handle id="right"  type="source" position={Position.Right}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800" />
      <Handle id="bottom" type="source" position={Position.Bottom}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800" />

      <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-t-[10px] px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
            <Bot size={13} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-xs truncate leading-tight">{data.name}</p>
            <p className="text-indigo-200 text-[10px] truncate leading-tight">{data.role || '—'}</p>
          </div>
        </div>
        <button onClick={onDelete} className="text-white/50 hover:text-white transition-colors shrink-0 nodrag">
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2 flex flex-wrap gap-1">
        <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded">
          {data.provider}
        </span>
        <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded truncate max-w-[110px]">
          {data.model}
        </span>
      </div>
    </div>
  )
}

// ─── Tool Node ────────────────────────────────────────────────────────────────
function ToolNode({ id, data, selected }: NodeProps<ToolNodeData>) {
  const { setNodes, setEdges } = useReactFlow()
  const onDelete = useCallback(() => {
    setNodes(nds => nds.filter(n => n.id !== id))
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id))
  }, [id, setNodes, setEdges])

  return (
    <div className={clsx(
      'bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 w-48 select-none transition-all',
      selected
        ? 'border-emerald-500 shadow-xl shadow-emerald-200/30 dark:shadow-emerald-900/40'
        : 'border-gray-200 dark:border-gray-600',
    )}>
      {/* 4-sided handles — any point to any point */}
      <Handle id="top"    type="source" position={Position.Top}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-gray-800" />
      <Handle id="left"   type="source" position={Position.Left}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-gray-800" />
      <Handle id="right"  type="source" position={Position.Right}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-gray-800" />
      <Handle id="bottom" type="source" position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-gray-800" />

      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-t-[10px] px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-white/20 rounded-md flex items-center justify-center shrink-0">
            <Wrench size={11} className="text-white" />
          </div>
          <p className="text-white font-semibold text-xs truncate">{data.name}</p>
        </div>
        <button onClick={onDelete} className="text-white/50 hover:text-white transition-colors shrink-0 nodrag">
          <X size={10} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-1">
        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded uppercase', METHOD_COLOR[data.method] ?? METHOD_COLOR.GET)}>
          {data.method}
        </span>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{data.description || data.url}</p>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = { agentNode: AgentNode, toolNode: ToolNode }

// ─── Edge Condition Popup ─────────────────────────────────────────────────────
function EdgeConditionPopup({ popup, onSave, onClose }: {
  popup: EdgePopupState
  onSave: (c: EdgeCondition | null) => void
  onClose: () => void
}) {
  const [type, setType]   = useState<ConditionType>(popup.condition?.type ?? 'always')
  const [value, setValue] = useState(popup.condition?.value ?? '')

  return (
    <div className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 w-60"
      style={{ left: popup.x, top: popup.y, transform: 'translate(-50%, -110%)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Edge Condition</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={14} /></button>
      </div>
      <div className="space-y-2.5">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value as ConditionType)}
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {CONDITION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {type !== 'always' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Value</label>
            <input type="text" value={value} onChange={e => setValue(e.target.value)} placeholder='"error"'
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ type, value: type === 'always' ? '' : value })}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors">Apply</button>
        <button onClick={() => onSave(null)}
          className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Clear</button>
      </div>
    </div>
  )
}

// ─── Agents Panel (left) ──────────────────────────────────────────────────────
function AgentsPanel({ agents, loading, onRefresh }: {
  agents: Agent[]
  loading: boolean
  onRefresh: () => void
}) {
  const onDragStart = (e: React.DragEvent, agent: Agent) => {
    e.dataTransfer.setData('node-type', 'agent')
    e.dataTransfer.setData('node-data', JSON.stringify(agent))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-[22%] min-w-[210px] max-w-[280px] flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
            <Bot size={13} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-100">Agents</p>
            <p className="text-[10px] text-gray-500">{agents.length} available</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onRefresh} title="Refresh"
            className={clsx('w-7 h-7 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center transition-colors', loading && 'animate-spin')}>
            <RefreshCw size={13} />
          </button>
          <Link to="/agents" title="New Agent"
            className="w-7 h-7 rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-gray-800 flex items-center justify-center transition-colors">
            <Plus size={14} />
          </Link>
        </div>
      </div>

      {/* Drag hint */}
      <div className="mx-3 my-2.5 px-3 py-2 bg-indigo-500/8 border border-indigo-500/20 rounded-lg">
        <p className="text-[10px] text-indigo-400 text-center font-medium">Drag agents onto the canvas →</p>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-4 space-y-2">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mb-3">
              <Bot size={20} className="text-gray-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">No agents yet</p>
            <Link to="/agents" className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors">
              <ExternalLink size={11} /> Create Agent
            </Link>
          </div>
        ) : agents.map(agent => (
          <div
            key={agent.id}
            draggable
            onDragStart={e => onDragStart(e, agent)}
            className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-indigo-500/40 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all duration-150 select-none"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                <Bot size={14} className="text-indigo-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-100 truncate group-hover:text-white">{agent.name}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{agent.role || 'No role'}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{agent.provider}</span>
                  <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded truncate max-w-[90px]">{agent.model}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer link */}
      <div className="shrink-0 border-t border-gray-800 p-3">
        <Link to="/agents" className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-indigo-400 transition-colors py-1">
          <ExternalLink size={11} /> Manage Agents
        </Link>
      </div>
    </aside>
  )
}

// ─── Tools Panel (right) ──────────────────────────────────────────────────────
function ToolsPanel({ tools, loading, onRefresh }: {
  tools: Tool[]
  loading: boolean
  onRefresh: () => void
}) {
  const onDragStart = (e: React.DragEvent, tool: Tool) => {
    e.dataTransfer.setData('node-type', 'tool')
    e.dataTransfer.setData('node-data', JSON.stringify(tool))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-[22%] min-w-[210px] max-w-[280px] flex flex-col bg-gray-900 border-l border-gray-800 shrink-0">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center">
            <Wrench size={13} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-100">Tools</p>
            <p className="text-[10px] text-gray-500">{tools.length} available</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onRefresh} title="Refresh"
            className={clsx('w-7 h-7 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center transition-colors', loading && 'animate-spin')}>
            <RefreshCw size={13} />
          </button>
          <Link to="/tools" title="New Tool"
            className="w-7 h-7 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-gray-800 flex items-center justify-center transition-colors">
            <Plus size={14} />
          </Link>
        </div>
      </div>

      {/* Drag hint */}
      <div className="mx-3 my-2.5 px-3 py-2 bg-emerald-500/8 border border-emerald-500/20 rounded-lg">
        <p className="text-[10px] text-emerald-400 text-center font-medium">← Drag tools onto the canvas</p>
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-4 space-y-2">
        {tools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mb-3">
              <Wrench size={20} className="text-gray-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">No tools yet</p>
            <Link to="/tools" className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors">
              <ExternalLink size={11} /> Create Tool
            </Link>
          </div>
        ) : tools.map(tool => (
          <div
            key={tool.id}
            draggable
            onDragStart={e => onDragStart(e, tool)}
            className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-emerald-500/40 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all duration-150 select-none"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Wrench size={13} className="text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <p className="text-sm font-semibold text-gray-100 truncate group-hover:text-white">{tool.name}</p>
                  <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0', METHOD_COLOR[tool.method] ?? METHOD_COLOR.GET)}>
                    {tool.method}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{tool.description || tool.url || '—'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer link */}
      <div className="shrink-0 border-t border-gray-800 p-3">
        <Link to="/tools" className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-emerald-400 transition-colors py-1">
          <ExternalLink size={11} /> Manage Tools
        </Link>
      </div>
    </aside>
  )
}

// ─── Canvas (inner — needs ReactFlowProvider context) ─────────────────────────
function CanvasInner({
  nodes, edges, onNodesChange, onEdgesChange, setNodes, setEdges,
  workflowName, setWorkflowName, isSaving, onSave,
}: {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: any) => void
  onEdgesChange: (changes: any) => void
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  workflowName: string
  setWorkflowName: (v: string) => void
  isSaving: boolean
  onSave: () => void
}) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { project }      = useReactFlow()
  const [edgePopup, setEdgePopup] = useState<EdgePopupState | null>(null)

  // Color + arrow marker based on source→target node types
  const getEdgeProps = useCallback((c: Connection) => {
    const src = nodes.find(n => n.id === c.source)?.type
    const tgt = nodes.find(n => n.id === c.target)?.type
    let stroke = '#6366f1' // indigo default: agent→agent
    if (src === 'toolNode'  && tgt === 'agentNode') stroke = '#10b981' // emerald: tool→agent
    if (src === 'agentNode' && tgt === 'toolNode')  stroke = '#f59e0b' // amber:   agent→tool
    if (src === 'toolNode'  && tgt === 'toolNode')  stroke = '#a855f7' // purple:  tool→tool
    return {
      style:     { stroke, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 },
      data:      { srcType: src, tgtType: tgt },
    }
  }, [nodes])

  const onConnect = useCallback(
    (c: Connection) => {
      // Prevent duplicate: same source node → same target node (any handle)
      const duplicate = edges.some(e => e.source === c.source && e.target === c.target)
      if (duplicate) {
        toast.error('Connection already exists between these two nodes')
        return
      }
      setEdges(eds => addEdge({ ...c, animated: true, ...getEdgeProps(c) }, eds))
    },
    [setEdges, getEdgeProps, edges],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const bounds  = reactFlowWrapper.current?.getBoundingClientRect()
    if (!bounds) return

    const nodeType = e.dataTransfer.getData('node-type')
    const dataStr  = e.dataTransfer.getData('node-data')
    if (!dataStr || !nodeType) return

    const data = JSON.parse(dataStr)
    const uid  = `${nodeType}-${data.id}-${Date.now()}`

    // Center the node under the cursor (agent: w-52=208px ~h90, tool: w-48=192px ~h80)
    const nodeW = nodeType === 'agent' ? 208 : 192
    const nodeH = nodeType === 'agent' ? 90  : 80
    const position = project({
      x: e.clientX - bounds.left - nodeW / 2,
      y: e.clientY - bounds.top  - nodeH / 2,
    })

    if (nodeType === 'agent') {
      setNodes(nds => [
        ...nds,
        {
          id:       uid,
          type:     'agentNode',
          position,
          data:     { name: data.name, role: data.role, model: data.model, provider: data.provider },
        } as Node<AgentNodeData>,
      ])
    } else if (nodeType === 'tool') {
      setNodes(nds => [
        ...nds,
        {
          id:       uid,
          type:     'toolNode',
          position,
          data:     { name: data.name, method: data.method, description: data.description, url: data.url },
        } as Node<ToolNodeData>,
      ])
    }
  }, [project, setNodes])

  const onEdgeClick = useCallback((evt: React.MouseEvent, edge: Edge) => {
    setEdgePopup({ edgeId: edge.id, x: evt.clientX, y: evt.clientY, condition: (edge.data?.condition as EdgeCondition) ?? null })
  }, [])

  const saveCondition = useCallback((condition: EdgeCondition | null) => {
    if (!edgePopup) return
    setEdges(eds => eds.map(e => {
      if (e.id !== edgePopup.edgeId) return e
      const label = condition
        ? condition.type === 'always' ? 'always' : `${condition.type}: "${condition.value}"`
        : undefined
      return { ...e, data: { condition }, label, labelStyle: { fontSize: 9 }, labelBgPadding: [4, 2] as [number, number] }
    }))
    setEdgePopup(null)
  }, [edgePopup, setEdges])

  const agentCount = nodes.filter(n => n.type === 'agentNode').length
  const toolCount  = nodes.filter(n => n.type === 'toolNode').length

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      {/* Canvas toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-10">
        <Network size={16} className="text-indigo-400 shrink-0" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0 group">
          <input
            value={workflowName}
            onChange={e => setWorkflowName(e.target.value)}
            className="flex-1 bg-transparent text-base font-bold text-gray-800 dark:text-gray-100 focus:outline-none placeholder-gray-400 min-w-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors pb-0.5"
            placeholder="Untitled Workflow"
          />
          <Pencil size={12} className="text-gray-400 group-hover:text-indigo-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100" />
        </div>

        {/* Edge legend */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-gray-400 shrink-0 border-l border-gray-200 dark:border-gray-700 pl-3">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" />Agent→Agent</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500 inline-block rounded" />Tool→Agent</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 inline-block rounded" />Agent→Tool</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-500 inline-block rounded" />Tool→Tool</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0 border-l border-gray-200 dark:border-gray-700 pl-3">
          {agentCount > 0 && <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>}
          {toolCount  > 0 && <span>{toolCount} tool{toolCount !== 1 ? 's' : ''}</span>}
          {edges.length > 0 && <span>{edges.length} link{edges.length !== 1 ? 's' : ''}</span>}
        </div>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Save size={14} />
          {isSaving ? 'Saving…' : 'Save Workflow'}
        </button>
      </div>

      {/* Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 relative">
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800/80 flex items-center justify-center mb-5 opacity-40">
              <Network size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-400 font-semibold">Drop agents and tools here</p>
            <p className="text-gray-500 text-sm mt-1 text-center">Connect any node to any node — agent→agent, tool→agent, agent→tool</p>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 18, height: 18 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#94a3b8" className="opacity-20" />
          <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !shadow-md !rounded-xl overflow-hidden" />
          <MiniMap nodeColor={n => n.type === 'toolNode' ? '#10b981' : '#6366f1'}
            className="!bg-white dark:!bg-gray-800 !border !border-gray-200 dark:!border-gray-700 !rounded-xl !shadow-md" />
        </ReactFlow>

        {edgePopup && (
          <EdgeConditionPopup popup={edgePopup} onSave={saveCondition} onClose={() => setEdgePopup(null)} />
        )}
      </div>
    </div>
  )
}

// ─── Workspace (root) ─────────────────────────────────────────────────────────
export default function Workspace() {
  const [agents, setAgents]         = useState<Agent[]>([])
  const [tools, setTools]           = useState<Tool[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [toolsLoading, setToolsLoading]   = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [workflowName, setWorkflowName] = useState('My Workflow')
  const [isSaving, setIsSaving]         = useState(false)

  const fetchAgents = useCallback(() => {
    setAgentsLoading(true)
    listAgents().then(setAgents).catch(() => toast.error('Failed to load agents')).finally(() => setAgentsLoading(false))
  }, [])

  const fetchTools = useCallback(() => {
    setToolsLoading(true)
    listTools().then(setTools).catch(() => toast.error('Failed to load tools')).finally(() => setToolsLoading(false))
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchTools()
  }, [fetchAgents, fetchTools])

  const saveWorkflow = async () => {
    if (!workflowName.trim()) { toast.error('Workflow name is required'); return }
    const agentNodes = nodes.filter(n => n.type === 'agentNode')
    if (agentNodes.length === 0) { toast.error('Add at least one agent to the canvas'); return }
    setIsSaving(true)
    try {
      const targetIds = new Set(edges.map(e => e.target))
      const startNode = agentNodes.find(n => !targetIds.has(n.id)) ?? agentNodes[0]

      // Include both agent and tool nodes; edges capture all connection types
      await createWorkflow({
        name: workflowName,
        definition: {
          nodes: nodes.map(n => {
            const parts = n.id.split('-')
            const rawId = parts.slice(1, parts.length - 1).join('-') // strip prefix + timestamp
            return {
              id:       n.id,
              type:     n.type === 'agentNode' ? 'AGENT' as const : 'TOOL' as const,
              ...(n.type === 'agentNode' ? { agent_id: rawId } : { tool_id: rawId }),
              config:   {},
            }
          }),
          edges: edges.map(e => {
            const connType = e.data?.srcType === 'agentNode' && e.data?.tgtType === 'agentNode'
              ? 'agent_sequence'
              : e.data?.srcType === 'toolNode' && e.data?.tgtType === 'agentNode'
              ? 'tool_to_agent'
              : e.data?.srcType === 'agentNode' && e.data?.tgtType === 'toolNode'
              ? 'agent_to_tool'
              : 'tool_chain'
            const cond = e.data?.condition as EdgeCondition | undefined
            return {
              source_node_id:  e.source,
              target_node_id:  e.target,
              connection_type: connType,
              ...(cond ? { condition: { type: cond.type, value: cond.value ?? '' } } : {}),
            }
          }),
          start_node_id: startNode.id,
        },
      })
      toast.success('Workflow saved!')
    } catch {
      toast.error('Failed to save workflow')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex overflow-hidden bg-gray-50 dark:bg-gray-950" style={{ height: 'calc(100vh - 60px)' }}>
      <AgentsPanel agents={agents} loading={agentsLoading} onRefresh={fetchAgents} />

      <ReactFlowProvider>
        <CanvasInner
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          setNodes={setNodes} setEdges={setEdges}
          workflowName={workflowName} setWorkflowName={setWorkflowName}
          isSaving={isSaving} onSave={saveWorkflow}
        />
      </ReactFlowProvider>

      <ToolsPanel tools={tools} loading={toolsLoading} onRefresh={fetchTools} />
    </div>
  )
}
