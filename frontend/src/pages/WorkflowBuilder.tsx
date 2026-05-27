import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GitBranch, Plus, Play, Bot, Wrench, Clock, Network,
  RefreshCw, ChevronRight, Layers, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import { listWorkflows, executeWorkflow, deleteWorkflow } from '../api'
import type { Workflow } from '../types'
import { PageSpinner } from '../components/LoadingSpinner'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function WorkflowCard({ workflow, onRun, onDelete }: { workflow: Workflow; onRun: (id: string) => void; onDelete: (id: string) => void }) {
  const [running, setRunning] = useState(false)
  const [task, setTask]       = useState('')
  const [showRun, setShowRun] = useState(false)

  const agentNodes = workflow.definition.nodes.filter(n => n.type === 'AGENT').length
  const toolNodes  = workflow.definition.nodes.filter(n => n.type === 'TOOL').length
  const edges      = workflow.definition.edges.length

  const handleRun = async () => {
    if (!task.trim()) { toast.error('Enter a task to run'); return }
    setRunning(true)
    try {
      await onRun(workflow.id)
      await executeWorkflow(workflow.id, task)
      toast.success('Workflow started!')
      setShowRun(false)
      setTask('')
    } catch {
      toast.error('Failed to run workflow')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
            <GitBranch size={18} className="text-indigo-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{workflow.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Bot size={11} /> {agentNodes} agent{agentNodes !== 1 ? 's' : ''}
              </span>
              {toolNodes > 0 && (
                <span className="flex items-center gap-1">
                  <Wrench size={11} /> {toolNodes} tool{toolNodes !== 1 ? 's' : ''}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Network size={11} /> {edges} link{edges !== 1 ? 's' : ''}
              </span>
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
            {running ? 'Running…' : 'Execute'}
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
  )
}

export default function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const navigate = useNavigate()

  const load = useCallback(() => {
    setLoading(true)
    listWorkflows()
      .then(setWorkflows)
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
            {search ? 'Try a different name.' : 'Build your first workflow by dragging agents and tools onto the canvas in the Workspace.'}
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
            <WorkflowCard key={wf.id} workflow={wf} onRun={() => Promise.resolve()} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
