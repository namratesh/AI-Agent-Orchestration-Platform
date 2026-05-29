import { useEffect, useRef, useState } from 'react'
import { Play, Copy, CheckCircle, XCircle, Clock, Zap, DollarSign, RotateCcw, Loader2 } from 'lucide-react'
import { executeWorkflow, getExecution, listWorkflows } from '../api'
import type { Workflow, WorkflowExecuteResponse } from '../types'
import WorkflowCard from '../components/WorkflowCard'
import { PageSpinner } from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function fmtCost(n: number) { return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}` }
function fmtDur(s: number)  { return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s` }

type RunStatus = 'idle' | 'queued' | 'running' | 'success' | 'error'

export default function WorkflowExecutor() {
  const [workflows, setWorkflows]   = useState<Workflow[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Workflow | null>(null)
  const [task, setTask]             = useState('')
  const [runStatus, setRunStatus]   = useState<RunStatus>('idle')
  const [result, setResult]         = useState<WorkflowExecuteResponse | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [progress, setProgress]     = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    listWorkflows()
      .then(setWorkflows)
      .catch(() => toast.error('Failed to load workflows'))
      .finally(() => setLoading(false))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const run = async () => {
    if (!selected || !task.trim()) { toast.error('Select a workflow and enter a task'); return }
    if (pollRef.current) clearInterval(pollRef.current)

    setRunStatus('queued'); setResult(null); setError(null); setProgress(10)

    try {
      // POST immediately returns {execution_id, status: "queued"} (202)
      const initial = await executeWorkflow(selected.id, task.trim())
      const execId  = initial.execution_id
      if (!execId) throw new Error('No execution ID returned')

      setRunStatus('running'); setProgress(30)

      // Poll GET /executions/{id} until status is "success" or "error"
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const rec = await getExecution(execId)
          setProgress(Math.min(30 + attempts * 5, 88))

          if (rec.status === 'success') {
            clearInterval(pollRef.current!)
            setProgress(100)
            setRunStatus('success')
            setResult({
              workflow_id:            rec.workflow_id ?? selected.id,
              task:                   rec.task,
              result:                 rec.result,
              tokens_used:            rec.tokens_used,
              cost:                   rec.cost,
              trace_id:               '',
              execution_id:           rec.id,
              execution_time_seconds: rec.execution_time_seconds,
              status:                 'success',
            })
            toast.success('Execution complete!')
          } else if (rec.status === 'error') {
            clearInterval(pollRef.current!)
            setRunStatus('error')
            setError(rec.result || 'Execution failed')
            toast.error('Execution failed')
          } else if (attempts >= 60) {
            // 60 × 2s = 2 min timeout
            clearInterval(pollRef.current!)
            setRunStatus('error')
            setError('Execution timed out after 2 minutes')
          }
        } catch {
          // Transient network error — keep polling
        }
      }, 2000)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start execution'
      setError(msg)
      setRunStatus('error')
      toast.error(msg)
    }
  }

  const copy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusLabel: Record<RunStatus, string> = {
    idle:    '',
    queued:  'Queued — waiting to start…',
    running: 'Running pipeline…',
    success: '',
    error:   '',
  }

  if (loading) return <PageSpinner />

  const isRunning = runStatus === 'queued' || runStatus === 'running'

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <h1 className="page-title">Workflow Executor</h1>
        <p className="page-subtitle">Select a workflow, enter a task, and run.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — workflow selector + task */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Select Workflow {selected && <span className="text-primary-600 dark:text-primary-400 ml-1">✓</span>}
            </h2>
            {workflows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No workflows — build one in the Workflow Builder</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {workflows.map(w => (
                  <WorkflowCard
                    key={w.id}
                    workflow={w}
                    selected={selected?.id === w.id}
                    onClick={() => setSelected(w === selected ? null : w)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Task</h2>
            <textarea
              className="input h-32 resize-none"
              placeholder="Describe the task for this workflow…"
              value={task}
              onChange={e => setTask(e.target.value)}
              disabled={isRunning}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">{task.length} chars</span>
              {selected && (
                <span className="text-xs text-gray-400">{selected.definition.nodes.length} node{selected.definition.nodes.length !== 1 ? 's' : ''} in pipeline</span>
              )}
            </div>
          </div>

          <button
            className={clsx(
              'w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-sm',
              isRunning
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                : selected && task.trim()
                  ? 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 hover:shadow-md hover:-translate-y-0.5'
                  : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed text-gray-500 dark:text-gray-400',
            )}
            disabled={isRunning || !selected || !task.trim()}
            onClick={run}
          >
            {isRunning ? (
              <><Loader2 size={16} className="animate-spin" />Executing…</>
            ) : (
              <><Play size={16} />Execute Workflow</>
            )}
          </button>

          {isRunning && (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {runStatus && (
                <p className="text-xs text-center text-gray-400">{statusLabel[runStatus]}</p>
              )}
            </div>
          )}
        </div>

        {/* Right — result */}
        <div className="card p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Result</h2>

          {runStatus === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-gray-400 dark:text-gray-500">
              <Play size={32} className="mb-3 opacity-30" />
              <p className="text-sm">Execute a workflow to see the result</p>
            </div>
          )}

          {isRunning && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{statusLabel[runStatus]}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Polling for result every 2 s…</p>
            </div>
          )}

          {runStatus === 'error' && error && (
            <div className="flex-1 animate-slide-up">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle size={18} className="text-red-500 shrink-0" />
                  <span className="font-semibold text-red-700 dark:text-red-400 text-sm">Execution Failed</span>
                </div>
                <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
              </div>
              <button className="btn-secondary mt-3 text-sm" onClick={run}>
                <RotateCcw size={14} />Retry
              </button>
            </div>
          )}

          {runStatus === 'success' && result && (
            <div className="flex-1 space-y-4 animate-slide-up overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: <Clock size={13} />, label: 'Duration', value: fmtDur(result.execution_time_seconds) },
                  { icon: <Zap size={13} />,   label: 'Tokens',   value: result.tokens_used.toLocaleString() },
                  { icon: <DollarSign size={13} />, label: 'Cost', value: fmtCost(result.cost) },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-gray-400 dark:text-gray-500 mb-1">
                      {m.icon}
                      <span className="text-[10px] uppercase tracking-wide">{m.label}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{m.value}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Success</span>
                  </div>
                  <button onClick={copy} className="btn-ghost text-xs py-1 px-2">
                    {copied ? <><CheckCircle size={12} />Copied</> : <><Copy size={12} />Copy</>}
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 max-h-80 overflow-y-auto">
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{result.result}</p>
                </div>
              </div>

              {result.execution_id && (
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">ID: {result.execution_id}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
