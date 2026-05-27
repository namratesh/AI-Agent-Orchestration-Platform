import { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, useEdgesState, useNodesState,
  type Connection, type Edge, type EdgeProps, type Node, type NodeProps,
  Handle, Position, MarkerType, BackgroundVariant,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Bot, Plus, Save, Trash2, GitBranch, AlertCircle, Check, GitMerge } from 'lucide-react'
import { createWorkflow, listAgents, listWorkflows } from '../api'
import type { Agent, ConditionType, EdgeCondition, Workflow } from '../types'
import Modal from '../components/Modal'
import { PageSpinner } from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

/* ── Custom edge with condition label ────────────────────────────────────── */
function ConditionEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, label }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY })
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="absolute nodrag bg-amber-50 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-[10px] font-mono px-1.5 py-0.5 rounded-md shadow-sm"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/* ── Custom node ─────────────────────────────────────────────────────────── */
function AgentNode({ data, selected }: NodeProps) {
  return (
    <div className={clsx(
      'min-w-[180px] rounded-xl border-2 bg-white dark:bg-gray-800 shadow-card transition-all',
      selected ? 'border-primary-500 shadow-lg' : 'border-gray-200 dark:border-gray-600',
    )}>
      {/* Target (input) handle — top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-4 !h-4 !bg-primary-500 !border-2 !border-white"
      />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 shrink-0">
            <Bot size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 dark:text-white truncate leading-tight">{data.label}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{data.role}</p>
          </div>
        </div>
        {data.isStart && (
          <span className="mt-1.5 inline-block text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
            START
          </span>
        )}
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 truncate font-mono">{data.provider}</p>
      </div>

      {/* Source (output) handle — bottom. No isConnectable limit so one node can fan-out to many */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !bg-indigo-500 !border-2 !border-white"
        isConnectable
      />
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode }
const edgeTypes = { condition: ConditionEdge }

const defaultEdgeOpts = {
  type: 'condition',
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
  style: { stroke: '#6366f1', strokeWidth: 2 },
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
let _nodeId = 0
const nextId = () => `n${++_nodeId}`

function buildRFNode(agent: Agent, position: { x: number; y: number }, isStart: boolean): Node {
  return {
    id: nextId(),
    type: 'agentNode',
    position,
    data: { label: agent.name, role: agent.role, provider: agent.provider, agentId: agent.id, isStart },
  }
}

function conditionLabel(c?: EdgeCondition): string {
  if (!c || c.type === 'always') return ''
  const map: Record<ConditionType, string> = {
    always: '',
    contains: `if contains "${c.value}"`,
    not_contains: `if NOT "${c.value}"`,
    equals: `if == "${c.value}"`,
    not_equals: `if != "${c.value}"`,
  }
  return map[c.type] ?? ''
}

const BLANK_COND: EdgeCondition = { type: 'always', value: '' }

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function WorkflowBuilder() {
  const [agents, setAgents]           = useState<Agent[]>([])
  const [workflows, setWorkflows]     = useState<Workflow[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [wfName, setWfName]           = useState('')
  const [saveModal, setSaveModal]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [loadWfId, setLoadWfId]       = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Condition editor
  const [condModal, setCondModal]     = useState(false)
  const [condEdgeId, setCondEdgeId]   = useState<string | null>(null)
  const [condType, setCondType]       = useState<ConditionType>('always')
  const [condValue, setCondValue]     = useState('')

  useEffect(() => {
    Promise.all([listAgents(), listWorkflows()])
      .then(([a, w]) => { setAgents(a); setWorkflows(w) })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoadingInit(false))
  }, [])

  // Allow one node to connect to many targets; prevent self-loops and exact duplicates
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return
      const newEdge: Edge = {
        id: `e-${conn.source}-${conn.target}-${Date.now()}`,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle ?? null,
        targetHandle: conn.targetHandle ?? null,
        ...defaultEdgeOpts,
        data: { condition: BLANK_COND },
      }
      setEdges(eds => [
        ...eds.filter(e => !(e.source === conn.source && e.target === conn.target)),
        newEdge,
      ])
    },
    [setEdges],
  )

  // Functional updater → always reads latest node count, fixes stale-closure bug
  const addAgentNode = useCallback((agent: Agent) => {
    setNodes(ns => {
      const isStart = ns.length === 0
      const col = ns.length % 3
      const row = Math.floor(ns.length / 3)
      const pos = { x: 60 + col * 240, y: 60 + row * 160 }
      return [...ns, buildRFNode(agent, pos, isStart)]
    })
  }, [])

  const removeSelected = () => {
    if (!selectedNode) return
    setNodes(ns => ns.filter(n => n.id !== selectedNode.id))
    setEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  // Click an edge → open condition modal pre-filled with current condition
  const onEdgeClick = useCallback((_evt: React.MouseEvent, edge: Edge) => {
    setCondEdgeId(edge.id)
    const cond = (edge.data?.condition ?? BLANK_COND) as EdgeCondition
    setCondType(cond.type)
    setCondValue(cond.value)
    setCondModal(true)
  }, [])

  const applyCondition = () => {
    if (!condEdgeId) return
    const cond: EdgeCondition = { type: condType, value: condValue }
    const label = conditionLabel(cond)
    setEdges(eds => eds.map(e =>
      e.id === condEdgeId
        ? { ...e, label, data: { ...e.data, condition: cond }, animated: cond.type === 'always' }
        : e,
    ))
    setCondModal(false)
  }

  const validate = () => {
    if (nodes.length === 0) { toast.error('Add at least one agent node'); return false }
    return true
  }

  const handleSave = async () => {
    if (!wfName.trim()) { toast.error('Workflow name is required'); return }
    if (!validate()) return
    setSaving(true)
    try {
      const startNode = nodes.find(n => n.data.isStart) ?? nodes[0]
      const rfNodes = nodes.map(n => ({
        id: n.id, type: 'AGENT' as const,
        agent_id: n.data.agentId as string, config: {},
      }))
      const rfEdges = edges.map(e => ({
        source_node_id: e.source,
        target_node_id: e.target,
        condition: (e.data?.condition ?? BLANK_COND) as EdgeCondition,
      }))
      const wf = await createWorkflow({
        name: wfName,
        definition: { nodes: rfNodes, edges: rfEdges, start_node_id: startNode.id },
      })
      toast.success(`Workflow "${wf.name}" saved!`)
      setWorkflows(prev => [wf, ...prev])
      setSaveModal(false); setWfName('')
    } catch {
      toast.error('Failed to save workflow')
    } finally {
      setSaving(false)
    }
  }

  const loadWorkflow = (id: string) => {
    const wf = workflows.find(w => w.id === id)
    if (!wf) return
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))
    const rfNodes: Node[] = wf.definition.nodes.map((n, i) => {
      const agent = agentMap[n.agent_id ?? '']
      return {
        id: n.id, type: 'agentNode',
        position: { x: 60 + (i % 3) * 240, y: 60 + Math.floor(i / 3) * 160 },
        data: {
          label: agent?.name ?? n.id, role: agent?.role ?? '',
          provider: agent?.provider ?? '', agentId: n.agent_id,
          isStart: n.id === wf.definition.start_node_id,
        },
      }
    })
    const rfEdges: Edge[] = wf.definition.edges.map((e, i) => {
      const cond = e.condition as EdgeCondition | undefined
      return {
        id: `e${i}`, source: e.source_node_id, target: e.target_node_id,
        ...defaultEdgeOpts,
        label: conditionLabel(cond),
        data: { condition: cond ?? BLANK_COND },
        animated: !cond || cond.type === 'always',
      }
    })
    setNodes(rfNodes); setEdges(rfEdges); setSelectedNode(null)
    toast.success(`Loaded "${wf.name}"`)
  }

  if (loadingInit) return <PageSpinner />

  const startNodeId = nodes.find(n => n.data.isStart)?.id ?? nodes[0]?.id ?? null
  const hasConditions = edges.some(e => e.data?.condition?.type !== 'always')

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-120px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="page-header mb-0 flex-1">
          <h1 className="page-title">Workflow Builder</h1>
        </div>
        {workflows.length > 0 && (
          <select
            className="input max-w-[200px] text-sm"
            value={loadWfId}
            onChange={e => { setLoadWfId(e.target.value); if (e.target.value) loadWorkflow(e.target.value) }}
          >
            <option value="">Load workflow…</option>
            {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <button className="btn-secondary text-sm" onClick={() => { setNodes([]); setEdges([]); setSelectedNode(null) }}>
          Clear
        </button>
        <button className="btn-primary text-sm" onClick={() => { if (validate()) setSaveModal(true) }}>
          <Save size={15} />Save
        </button>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Agent panel */}
        <aside className="w-52 shrink-0 card p-3 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Agents</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 leading-snug">
            Click to add a node. The same agent can be added multiple times.
          </p>
          {agents.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No agents — create one first</p>
          ) : agents.map(a => (
            <button
              key={a.id}
              onClick={() => addAgentNode(a)}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all group text-left"
            >
              <Bot size={14} className="text-primary-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{a.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{a.provider}</p>
              </div>
              <Plus size={12} className="ml-auto text-gray-300 dark:text-gray-500 group-hover:text-primary-500 shrink-0" />
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div className="flex-1 card overflow-hidden relative" ref={containerRef}>
          <div className="absolute top-2 right-2 z-10 text-[10px] text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded px-2 py-1 pointer-events-none">
            Drag the <span className="font-semibold text-indigo-500">blue bottom handle</span> to connect · Click any edge to add a condition
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => { setSelectedNode(node) }}
            onPaneClick={() => setSelectedNode(null)}
            isValidConnection={conn => conn.source !== conn.target}
            deleteKeyCode="Delete"
            fitView
            className="dark:bg-gray-900"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#94a3b820" />
            <Controls className="!bottom-4 !left-4" />
            <MiniMap
              nodeColor="#6366f1"
              className="!bottom-4 !right-4 !bg-gray-100 dark:!bg-gray-800 !border !border-gray-200 dark:!border-gray-700 !rounded-lg"
            />
          </ReactFlow>
        </div>

        {/* Inspector panel */}
        <aside className={clsx('w-52 shrink-0 transition-all duration-300', selectedNode ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
          {selectedNode && (
            <div className="card p-4 animate-slide-in-r space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Node Inspector</p>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedNode.data.label as string}</p>
                <p className="text-xs text-gray-500 mt-0.5">{selectedNode.data.role as string}</p>
              </div>
              <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <p><span className="font-medium">Provider:</span> {selectedNode.data.provider as string}</p>
                <p><span className="font-medium">Node ID:</span> <span className="font-mono">{selectedNode.id}</span></p>
                {selectedNode.id === startNodeId && (
                  <span className="badge-green text-[10px]"><Check size={10} />Start node</span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-600 rounded-lg p-2 leading-relaxed">
                Drag the <span className="font-medium text-indigo-500">blue handle</span> at the bottom to connect this node to one or more nodes.
              </div>
              {selectedNode.id !== startNodeId && (
                <button
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  onClick={() => setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, isStart: n.id === selectedNode.id } })))}
                >
                  Set as start node
                </button>
              )}
              <button className="btn-danger w-full text-xs py-1.5" onClick={removeSelected}>
                <Trash2 size={13} />Remove Node
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Status bar */}
      {nodes.length > 0 && (
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <GitBranch size={12} />
          <span>{nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge{edges.length !== 1 ? 's' : ''}</span>
          {hasConditions && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <GitMerge size={11} />Conditional routing active
            </span>
          )}
          {!startNodeId && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertCircle size={11} />No start node set
            </span>
          )}
        </div>
      )}

      {/* ── Condition modal ── */}
      <Modal
        open={condModal}
        onClose={() => setCondModal(false)}
        title="Edge Condition"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCondModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={applyCondition}>Apply</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Condition type</label>
            <select
              className="input text-sm"
              value={condType}
              onChange={e => setCondType(e.target.value as ConditionType)}
            >
              <option value="always">Always — always follow this edge</option>
              <option value="contains">Contains — follow if output contains…</option>
              <option value="not_contains">Not contains — follow if output does NOT contain…</option>
              <option value="equals">Equals — follow if output exactly equals…</option>
              <option value="not_equals">Not equals — follow if output does not equal…</option>
            </select>
          </div>

          {condType !== 'always' && (
            <div>
              <label className="label">Match value</label>
              <input
                className="input text-sm"
                placeholder="e.g. error, success, yes…"
                value={condValue}
                onChange={e => setCondValue(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            {condType === 'always'       && 'This edge is always followed, regardless of node output.'}
            {condType === 'contains'     && `Follow only if the node output contains "${condValue || '…'}".`}
            {condType === 'not_contains' && `Follow only if the node output does NOT contain "${condValue || '…'}".`}
            {condType === 'equals'       && `Follow only if the node output exactly equals "${condValue || '…'}".`}
            {condType === 'not_equals'   && `Follow only if the node output does not equal "${condValue || '…'}".`}
          </p>
        </div>
      </Modal>

      {/* ── Save modal ── */}
      <Modal
        open={saveModal}
        onClose={() => setSaveModal(false)}
        title="Save Workflow"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSaveModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div>
          <label className="label">Workflow Name *</label>
          <input
            className="input"
            autoFocus
            placeholder="Research → Writer pipeline"
            value={wfName}
            onChange={e => setWfName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge{edges.length !== 1 ? 's' : ''}
          </p>
        </div>
      </Modal>
    </div>
  )
}
