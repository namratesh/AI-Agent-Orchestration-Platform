import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GitBranch, Plus, Play, Bot, Wrench, Clock,
  RefreshCw, ChevronRight, Layers, Trash2, X, ArrowRight,
  Calendar, ToggleLeft, ToggleRight, AlarmClock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import {
  listWorkflows, executeWorkflow, deleteWorkflow,
  listSchedules, createSchedule, updateScheduleApi, deleteScheduleApi,
  listAgents,
} from '../api'
import type { Workflow, WorkflowSchedule, Agent } from '../types'
import { PageSpinner } from '../components/LoadingSpinner'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
  const [task, setTask]                 = useState('')
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    listSchedules(workflow.id)
      .then(setSchedules)
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false))
  }, [workflow.id])

  const handleCreate = async () => {
    const preset = PRESETS[presetIdx]
    const cronExpr = preset.cron_expression !== undefined
      ? (presetIdx === 5 ? customCron.trim() : preset.cron_expression) || undefined
      : undefined
    const intervalMin = preset.interval_minutes

    if (!cronExpr && !intervalMin) {
      toast.error('Select a valid schedule or enter a cron expression'); return
    }
    setSaving(true)
    try {
      const row = await createSchedule(workflow.id, {
        task: task.trim(),
        cron_expression: cronExpr,
        interval_minutes: intervalMin,
      })
      setSchedules(s => [...s, row])
      setTask('')
      toast.success('Schedule created')
    } catch {
      toast.error('Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (s: WorkflowSchedule) => {
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
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No schedules yet — create one below.</p>
          ) : (
            <div className="space-y-2">
              {schedules.map(s => (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <button onClick={() => toggleEnabled(s)} className="mt-0.5 shrink-0">
                    {s.enabled
                      ? <ToggleRight size={20} className="text-indigo-500" />
                      : <ToggleLeft size={20} className="text-gray-400" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                      {s.cron_expression
                        ? <span className="font-mono">{s.cron_expression}</span>
                        : `Every ${s.interval_minutes} min`}
                    </p>
                    {s.task && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">Task: {s.task}</p>}
                    <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <Clock size={9} /> Next: {fmtNext(s.next_run_at)}
                      {s.last_run_at && <span className="ml-2">Last: {fmtNext(s.last_run_at)}</span>}
                    </p>
                  </div>
                  <button onClick={() => handleDelete(s.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create new schedule */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add Schedule</p>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Trigger</label>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPresetIdx(i)}
                    className={clsx(
                      'text-xs py-1.5 px-2 rounded-lg border transition-colors text-center',
                      presetIdx === i
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-400',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {presetIdx === 5 && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Cron expression</label>
                <input
                  value={customCron}
                  onChange={e => setCustomCron(e.target.value)}
                  placeholder="e.g. 0 8 * * 1-5"
                  className="w-full text-sm font-mono rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Default task (optional)</label>
              <input
                value={task}
                onChange={e => setTask(e.target.value)}
                placeholder="Task text passed to the workflow…"
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Calendar size={14} />}
              {saving ? 'Saving…' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


function getOrderedNodes(def: Workflow['definition']): Workflow['definition']['nodes'] {
  const nodeMap  = new Map(def.nodes.map(n => [n.id, n]))
  const edgeMap  = new Map(def.edges.map(e => [e.source_node_id, e.target_node_id]))
  const visited  = new Set<string>()
  const ordered: Workflow['definition']['nodes'] = []
  let cur = def.start_node_id
  while (cur && !visited.has(cur)) {
    visited.add(cur)
    const node = nodeMap.get(cur)
    if (node) ordered.push(node)
    cur = edgeMap.get(cur) ?? ''
  }
  // append any nodes not reachable via the main path (parallel branches)
  for (const n of def.nodes) { if (!visited.has(n.id)) ordered.push(n) }
  return ordered
}

function WorkflowCard({ workflow, onRun, onDelete, agentMap }: {
  workflow: Workflow
  onRun: (id: string) => void
  onDelete: (id: string) => void
  agentMap: Map<string, string>
}) {
  const [running, setRunning]           = useState(false)
  const [task, setTask]                 = useState('')
  const [showRun, setShowRun]           = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)

  const orderedNodes = getOrderedNodes(workflow.definition)

  const handleRun = async () => {
    if (!task.trim()) { toast.error('Enter a task to run'); return }
    setRunning(true)
    try {
      await onRun(workflow.id)
      await executeWorkflow(workflow.id, task)
      toast.success('Workflow queued!')
      setShowRun(false)
      setTask('')
    } catch {
      toast.error('Failed to run workflow')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      {showSchedule && <ScheduleModal workflow={workflow} onClose={() => setShowSchedule(false)} />}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
            <GitBranch size={18} className="text-indigo-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{workflow.name}</h3>
            {/* Node pipeline: show ordered agent/tool names with arrows */}
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {orderedNodes.map((node, idx) => {
                const isTool   = node.type === 'TOOL'
                const Icon     = isTool ? Wrench : Bot
                const label    = isTool
                  ? (node.tool_id ? `Tool` : 'Tool')
                  : (node.agent_id && agentMap.has(node.agent_id)
                      ? agentMap.get(node.agent_id)!
                      : node.id)
                const colors = isTool
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                return (
                  <div key={node.id} className="flex items-center gap-1">
                    <span className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${colors}`}>
                      <Icon size={8} className="shrink-0" />{label}
                    </span>
                    {idx < orderedNodes.length - 1 && (
                      <ArrowRight size={9} className="text-gray-300 dark:text-gray-600 shrink-0" />
                    )}
                  </div>
                )
              })}
              {orderedNodes.length === 0 && (
                <span className="text-xs text-gray-400 italic">Empty workflow</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onDelete(workflow.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete workflow"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowSchedule(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            title="Manage schedules"
          >
            <AlarmClock size={14} />
          </button>
          <button
            onClick={() => setShowRun(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              showRun
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white',
            )}
          >
            <Play size={12} /> Run
          </button>
        </div>
      </div>

      {/* Inline run panel */}
      {showRun && (
        <div className="px-5 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 flex gap-2">
          <input
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            placeholder="Enter task for this workflow…"
            className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Queuing…' : 'Execute'}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-2.5 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Clock size={10} /> {(workflow as any).created_at ? fmtDate((workflow as any).created_at) : 'Saved'}
        </span>
        <Link
          to="/history"
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View runs <ChevronRight size={12} />
        </Link>
      </div>
    </div>
    </>
  )
}

export default function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [agents, setAgents]       = useState<Agent[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
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
    } catch {
      toast.error('Failed to delete workflow')
    }
  }

  const filtered = workflows.filter(w =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
            <Layers size={22} className="text-indigo-500" />
            Workflows
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Saved workflows — build new ones in the{' '}
            <Link to="/workspace" className="text-indigo-400 hover:text-indigo-300 font-medium">Workspace</Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search workflows…"
            className="text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 hidden sm:block"
          />
          <button
            onClick={load}
            className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center justify-center transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => navigate('/workspace')}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={16} /> New Workflow
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center mb-5">
            <GitBranch size={32} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">
            {search ? 'No workflows match your search' : 'No workflows yet'}
          </h3>
          <p className="text-sm text-gray-400 max-w-xs mb-6">
            {search ? 'Try a different name.' : 'Build your first workflow in the Workspace.'}
          </p>
          {!search && (
            <Link
              to="/workspace"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              <Plus size={15} /> Open Workspace
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(wf => (
            <WorkflowCard key={wf.id} workflow={wf} onRun={() => Promise.resolve()} onDelete={handleDelete} agentMap={agentMap} />
          ))}
        </div>
      )}
    </div>
  )
}
