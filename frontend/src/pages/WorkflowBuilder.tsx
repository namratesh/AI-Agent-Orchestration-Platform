import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GitBranch, Plus, Play, Bot, Wrench, Clock,
  RefreshCw, ChevronRight, Layers, Trash2, X, ArrowRight,
  Calendar, ToggleLeft, ToggleRight, AlarmClock,
  CheckCircle, XCircle, Loader2, Copy, DollarSign, Zap, History,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import {
  listWorkflows, executeWorkflow, deleteWorkflow,
  listSchedules, createSchedule, updateScheduleApi, deleteScheduleApi,
  listAgents, getExecution,
} from '../api'
import type { Workflow, WorkflowSchedule, Agent, ExecutionRecord } from '../types'
import { PageSpinner } from '../components/LoadingSpinner'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDur(s: number) { return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s` }
function fmtCost(n: number) { return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}` }

// ─── Node pipeline traversal ──────────────────────────────────────────────────
function getOrderedNodes(def: Workflow['definition']): Workflow['definition']['nodes'] {
  const nodeMap = new Map(def.nodes.map(n => [n.id, n]))
  const edgeMap = new Map(def.edges.map(e => [e.source_node_id, e.target_node_id]))
  const visited = new Set<string>()
  const ordered: Workflow['definition']['nodes'] = []
  let cur = def.start_node_id
  while (cur && !visited.has(cur)) {
    visited.add(cur); const node = nodeMap.get(cur); if (node) ordered.push(node)
    cur = edgeMap.get(cur) ?? ''
  }
  for (const n of def.nodes) { if (!visited.has(n.id)) ordered.push(n) }
  return ordered
}

// ─── Preset intervals ─────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Every 30 min',  interval_minutes: 30 },
  { label: 'Every hour',    interval_minutes: 60 },
  { label: 'Every 6 hours', interval_minutes: 360 },
  { label: 'Daily (9 am)',  cron_expression: '0 9 * * *' },
  { label: 'Weekly (Mon)',  cron_expression: '0 9 * * 1' },
  { label: 'Custom cron',   cron_expression: '' },
]

function fmtNext(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ScheduleModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const [schedules, setSchedules]       = useState<WorkflowSchedule[]>([])
  const [loading, setLoading]           = useState(true)
  const [presetIdx, setPresetIdx]       = useState(0)
  const [customCron, setCustomCron]     = useState('')
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    listSchedules(workflow.id)
      .then(setSchedules)
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false))
  }, [workflow.id])

  const preset = PRESETS[presetIdx]

  const handleCreate = async () => {
    const payload = preset.cron_expression !== undefined
      ? { cron_expression: preset.label === 'Custom cron' ? customCron : preset.cron_expression }
      : { interval_minutes: preset.interval_minutes }
    setSaving(true)
    try {
      const s = await createSchedule(workflow.id, payload as WorkflowSchedule)
      setSchedules(prev => [...prev, s])
      toast.success('Schedule created')
    } catch { toast.error('Failed to create schedule') }
    finally { setSaving(false) }
  }

  const handleToggle = async (s: WorkflowSchedule) => {
    try {
      const updated = await updateScheduleApi(s.id, { enabled: !s.enabled })
      setSchedules(prev => prev.map(x => x.id === s.id ? updated : x))
    } catch { toast.error('Failed to update schedule') }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteScheduleApi(id)
      setSchedules(prev => prev.filter(x => x.id !== id))
      toast.success('Schedule deleted')
    } catch { toast.error('Failed to delete schedule') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <AlarmClock size={18} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Schedules — {workflow.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Existing schedules */}
          {loading ? <p className="text-sm text-gray-400 text-center py-4">Loading…</p> : schedules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No schedules yet</p>
          ) : (
            <div className="space-y-2">
              {schedules.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {s.cron_expression || `Every ${s.interval_minutes} min`}
                    </p>
                    <p className="text-xs text-gray-400">Next: {fmtNext(s.next_run_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleToggle(s)} className="text-gray-400 hover:text-indigo-500 transition-colors" title={s.enabled ? 'Disable' : 'Enable'}>
                      {s.enabled ? <ToggleRight size={20} className="text-indigo-500" /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New schedule */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Schedule</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPresetIdx(i)}
                  className={clsx(
                    'text-xs px-3 py-2 rounded-lg border text-left font-medium transition-colors',
                    presetIdx === i
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-400'
                  )}
                >
                  <Calendar size={11} className="inline mr-1.5" />{p.label}
                </button>
              ))}
            </div>
            {preset.label === 'Custom cron' && (
              <input
                value={customCron}
                onChange={e => setCustomCron(e.target.value)}
                placeholder="0 9 * * *  (min hr dom mon dow)"
                className="input text-sm font-mono"
              />
            )}
            <button onClick={handleCreate} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Creating…' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Execution panel ──────────────────────────────────────────────────────────
type RunStatus = 'idle' | 'queued' | 'running' | 'success' | 'error'

function ExecutionPanel({ workflow, agentMap }: { workflow: Workflow; agentMap: Map<string, string> }) {
  const [task, setTask]           = useState('')
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [execId, setExecId]       = useState<string | null>(null)
  const [liveRec, setLiveRec]     = useState<ExecutionRecord | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderedNodes              = getOrderedNodes(workflow.definition)

  // Reset when workflow changes
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    setTask(''); setRunStatus('idle'); setExecId(null); setLiveRec(null); setError(null)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [workflow.id])

  const run = async () => {
    if (!task.trim()) { toast.error('Enter a task'); return }
    if (pollRef.current) clearInterval(pollRef.current)
    setRunStatus('queued'); setLiveRec(null); setError(null)

    try {
      const resp = await executeWorkflow(workflow.id, task.trim())
      const id = resp.execution_id
      if (!id) throw new Error('No execution ID')
      setExecId(id); setRunStatus('running')

      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const rec = await getExecution(id)
          setLiveRec(rec)
          if (rec.status === 'success') {
            clearInterval(pollRef.current!); setRunStatus('success'); toast.success('Done!')
          } else if (rec.status === 'error') {
            clearInterval(pollRef.current!); setRunStatus('error')
            setError(rec.error_message || 'Execution failed')
            toast.error('Execution failed')
          } else if (attempts >= 120) {
            clearInterval(pollRef.current!); setRunStatus('error'); setError('Timed out after 4 minutes')
          }
        } catch { /* transient — keep polling */ }
      }, 2000)
    } catch (e) {
      setRunStatus('error')
      setError(e instanceof Error ? e.message : 'Failed to start')
      toast.error('Failed to start execution')
    }
  }

  const copy = () => {
    if (liveRec?.result) { navigator.clipboard.writeText(liveRec.result); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  const isRunning = runStatus === 'queued' || runStatus === 'running'

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Workflow name + pipeline */}
      <div className="card p-4 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <GitBranch size={14} className="text-indigo-500" />
          </div>
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">{workflow.name}</h2>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {orderedNodes.map((node, idx) => {
            const isTool = node.type === 'TOOL'
            const Icon = isTool ? Wrench : Bot
            const label = !isTool && node.agent_id && agentMap.has(node.agent_id)
              ? agentMap.get(node.agent_id)! : node.id
            const colors = isTool
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
            return (
              <div key={node.id} className="flex items-center gap-1">
                <span className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${colors}`}>
                  <Icon size={8} />{label}
                </span>
                {idx < orderedNodes.length - 1 && <ArrowRight size={9} className="text-gray-300 dark:text-gray-600" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Task input */}
      <div className="card p-4 shrink-0">
        <label className="label">Task</label>
        <textarea
          className="input h-24 resize-none"
          placeholder="Describe the task for this workflow…"
          value={task}
          onChange={e => setTask(e.target.value)}
          disabled={isRunning}
        />
        <button
          onClick={run}
          disabled={isRunning || !task.trim()}
          className={clsx(
            'mt-3 w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all',
            isRunning || !task.trim()
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm hover:shadow-md'
          )}
        >
          {isRunning ? <><Loader2 size={15} className="animate-spin" />Executing…</> : <><Play size={15} />Execute</>}
        </button>
      </div>

      {/* Live progress */}
      <div className="card p-4 flex-1 overflow-y-auto min-h-0">
        {runStatus === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 text-gray-400">
            <Play size={28} className="mb-2 opacity-30" />
            <p className="text-sm">Enter a task and hit Execute to run this workflow</p>
          </div>
        )}

        {isRunning && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
              <Loader2 size={14} className="animate-spin shrink-0" />
              {runStatus === 'queued' ? 'Queued — waiting to start…' : 'Pipeline running…'}
            </div>
            {/* All nodes shown immediately — spinner turns to check as each completes */}
            <div className="space-y-2">
              {orderedNodes.map((node, idx) => {
                const doneOutput = liveRec?.node_outputs?.[node.id]
                const isDone = doneOutput !== undefined
                const isTool = node.type === 'TOOL'
                const Icon = isTool ? Wrench : Bot
                const color = isTool ? 'text-emerald-500' : 'text-indigo-500'
                const bg = isDone
                  ? (isTool
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                      : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800')
                  : 'border-dashed border-gray-200 dark:border-gray-700 opacity-50'
                return (
                  <div key={node.id} className={`rounded-xl border p-3 ${bg}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isDone
                        ? <CheckCircle size={10} className="text-emerald-500" />
                        : <Loader2 size={10} className="animate-spin text-gray-400" />
                      }
                      <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                      <Icon size={10} className={color} />
                      <span className={`text-[10px] font-semibold font-mono ${color}`}>{node.id}</span>
                    </div>
                    {isDone && (
                      <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3 mt-1">{String(doneOutput)}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {runStatus === 'error' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                <XCircle size={14} className="text-red-500" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-400">Execution Failed</span>
              </div>
              <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
            </div>
            <button onClick={run} className="btn-secondary text-sm w-full">Retry</button>
          </div>
        )}

        {runStatus === 'success' && liveRec && (
          <div className="space-y-3">
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <Clock size={11} />, label: 'Duration', value: fmtDur(liveRec.execution_time_seconds) },
                { icon: <Zap size={11} />,   label: 'Tokens',   value: liveRec.tokens_used.toLocaleString() },
                { icon: <DollarSign size={11} />, label: 'Cost', value: fmtCost(liveRec.cost) },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">{m.icon}<span className="text-[9px] uppercase tracking-wide">{m.label}</span></div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Node outputs */}
            {Object.keys(liveRec.node_outputs ?? {}).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Steps</p>
                {Object.entries(liveRec.node_outputs ?? {}).map(([nodeId, output], idx) => {
                  const isTool = nodeId.startsWith('tool')
                  const Icon = isTool ? Wrench : Bot
                  const color = isTool ? 'text-emerald-500' : 'text-indigo-500'
                  const bg = isTool
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                  return (
                    <div key={nodeId} className={`rounded-xl border p-3 ${bg}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                        <Icon size={10} className={color} />
                        <span className={`text-[10px] font-semibold font-mono ${color}`}>{nodeId}</span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{String(output)}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Final result */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Final Result</span>
                </div>
                <button onClick={copy} className="btn-ghost text-xs py-0.5 px-1.5">
                  {copied ? <><CheckCircle size={11} />Copied</> : <><Copy size={11} />Copy</>}
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-3 max-h-64 overflow-y-auto">
                <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{liveRec.result}</p>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 font-mono">ID: {liveRec.id}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Workflow list card ───────────────────────────────────────────────────────
function WorkflowListCard({
  workflow, agentMap, selected, onSelect, onDelete,
}: {
  workflow: Workflow; agentMap: Map<string, string>
  selected: boolean; onSelect: () => void; onDelete: (id: string) => void
}) {
  const [showSchedule, setShowSchedule] = useState(false)
  const orderedNodes = getOrderedNodes(workflow.definition)

  return (
    <>
      {showSchedule && <ScheduleModal workflow={workflow} onClose={() => setShowSchedule(false)} />}
      <div
        onClick={onSelect}
        className={clsx(
          'bg-white dark:bg-gray-800 rounded-2xl border shadow-sm transition-all duration-200 cursor-pointer overflow-hidden',
          selected
            ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-indigo-100 dark:shadow-indigo-900/30'
            : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md'
        )}
      >
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                <GitBranch size={13} className="text-indigo-500" />
              </div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{workflow.name}</h3>
            </div>
            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              <Link
                to={`/history?workflow=${workflow.id}`}
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="View run history"
              >
                <History size={13} />
              </Link>
              <button
                onClick={() => setShowSchedule(v => !v)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Schedules"
              >
                <AlarmClock size={13} />
              </button>
              <button
                onClick={() => onDelete(workflow.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Pipeline flow */}
          <div className="flex items-center gap-1 flex-wrap mb-2">
            {orderedNodes.map((node, idx) => {
              const isTool = node.type === 'TOOL'
              const Icon = isTool ? Wrench : Bot
              const label = !isTool && node.agent_id && agentMap.has(node.agent_id)
                ? agentMap.get(node.agent_id)! : node.id
              const colors = isTool
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
              return (
                <div key={node.id} className="flex items-center gap-0.5">
                  <span className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${colors}`}>
                    <Icon size={8} />{label}
                  </span>
                  {idx < orderedNodes.length - 1 && <ArrowRight size={8} className="text-gray-300 dark:text-gray-600" />}
                </div>
              )
            })}
            {orderedNodes.length === 0 && <span className="text-xs text-gray-400 italic">Empty</span>}
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Clock size={9} /> {(workflow as any).created_at ? fmtDate((workflow as any).created_at) : 'Saved'}
            </span>
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full',
              selected
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            )}>
              {selected ? 'Selected' : 'Click to run'}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WorkflowBuilder() {
  const [workflows, setWorkflows]         = useState<Workflow[]>([])
  const [agents, setAgents]               = useState<Agent[]>([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const navigate = useNavigate()

  const agentMap = new Map(agents.map(a => [a.id, a.name]))

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([listWorkflows(), listAgents()])
      .then(([wfs, ags]) => { setWorkflows(wfs); setAgents(ags) })
      .catch(() => toast.error('Failed to load workflows'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    const wf = workflows.find(w => w.id === id)
    if (!confirm(`Delete "${wf?.name}"?`)) return
    try {
      await deleteWorkflow(id)
      toast.success('Workflow deleted')
      setWorkflows(prev => prev.filter(w => w.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch {
      toast.error('Failed to delete workflow')
    }
  }

  const filtered = workflows.filter(w =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )
  const selected = workflows.find(w => w.id === selectedId) ?? null

  return (
    <div className="animate-fade-in flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers size={20} className="text-indigo-500" />Workflows
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Select a workflow to run it · Build new ones in the{' '}
            <Link to="/workspace" className="text-indigo-400 hover:text-indigo-300 font-medium">Workspace</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36 hidden sm:block"
          />
          <button onClick={load} className="w-8 h-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center justify-center transition-colors" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => navigate('/workspace')} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors">
            <Plus size={15} />New
          </button>
        </div>
      </div>

      {/* Body: split layout */}
      {loading ? <PageSpinner /> : (
        <div className="flex gap-5 flex-1 min-h-0">
          {/* Left: workflow list */}
          <div className="w-80 shrink-0 flex flex-col min-h-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
                <GitBranch size={28} className="text-indigo-400 mb-3 opacity-50" />
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  {search ? 'No workflows match' : 'No workflows yet'}
                </p>
                {!search && (
                  <Link to="/workspace" className="mt-3 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors">
                    <Plus size={13} />Open Workspace
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {filtered.map(wf => (
                  <WorkflowListCard
                    key={wf.id}
                    workflow={wf}
                    agentMap={agentMap}
                    selected={selectedId === wf.id}
                    onSelect={() => setSelectedId(wf.id === selectedId ? null : wf.id)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: execution panel */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selected ? (
              <ExecutionPanel key={selected.id} workflow={selected} agentMap={agentMap} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 card">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
                  <Play size={24} className="text-indigo-400" />
                </div>
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300 mb-1">Select a workflow to run</h3>
                <p className="text-sm text-gray-400 max-w-xs">
                  Click any workflow on the left to open the execution panel and start a run.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
