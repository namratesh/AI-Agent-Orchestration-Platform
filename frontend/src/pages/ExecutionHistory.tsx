import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, Zap, DollarSign, Trash2, ChevronDown, ChevronUp, Download, RefreshCw, Bot, Wrench, GitBranch } from 'lucide-react'
import { deleteExecution, listExecutions } from '../api'
import type { ExecutionRecord } from '../types'
import { PageSpinner } from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type SortKey = 'created_at' | 'cost' | 'tokens_used' | 'execution_time_seconds'
type SortDir = 'asc' | 'desc'

function fmtCost(n: number) { return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}` }
function fmtDur(s: number)  { return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s` }
function fmtDate(ts: string) {
  return new Date(ts).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ExecutionHistory() {
  const [rows, setRows]         = useState<ExecutionRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [sortKey, setSortKey]   = useState<SortKey>('created_at')
  const [sortDir, setSortDir]   = useState<SortDir>('desc')
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all')
  const [detail, setDetail]     = useState<ExecutionRecord | null>(null)
  const [page, setPage]         = useState(0)
  const PAGE_SIZE = 25

  const load = () => {
    setLoading(true)
    listExecutions(200, 0)
      .then(setRows)
      .catch(() => toast.error('Failed to load history'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this execution record?')) return
    try {
      await deleteExecution(id)
      toast.success('Deleted')
      setRows(r => r.filter(x => x.id !== id))
    } catch { toast.error('Delete failed') }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} className="opacity-20" />

  const filtered = rows
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'created_at') return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      return dir * ((a[sortKey] as number) - (b[sortKey] as number))
    })

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const exportCSV = () => {
    const header = 'id,task,status,tokens_used,cost,execution_time_seconds,source,created_at'
    const body = filtered.map(r =>
      [r.id, `"${r.task.replace(/"/g,'""')}"`, r.status, r.tokens_used, r.cost, r.execution_time_seconds, r.source, r.created_at].join(',')
    ).join('\n')
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `executions-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="page-header mb-0">
          <h1 className="page-title">Execution History</h1>
          <p className="page-subtitle">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-sm py-1.5 px-3" onClick={load}>
            <RefreshCw size={14} />Refresh
          </button>
          <button className="btn-secondary text-sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download size={14} />CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'success', 'error'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(0) }}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              statusFilter === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'
            )}
          >
            {s === 'all' ? 'All' : s === 'success' ? '✓ Success' : '✗ Error'}
          </button>
        ))}
      </div>

      {loading ? <PageSpinner /> : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-gray-400 dark:text-gray-500">No execution records yet</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Task</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    {([['execution_time_seconds','Duration'],['tokens_used','Tokens'],['cost','Cost'],['created_at','Time']] as [SortKey, string][]).map(([k, label]) => (
                      <th key={k} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => toggleSort(k)}>
                        <span className="inline-flex items-center gap-1 justify-end">{label}<SortIcon k={k} /></span>
                      </th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {paged.map(r => (
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                      onClick={() => setDetail(r)}
                    >
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="truncate text-gray-800 dark:text-gray-200 font-medium">{r.task}</p>
                        {r.workflow_id && <p className="text-xs text-gray-400 dark:text-gray-500 truncate font-mono">{r.workflow_id.slice(0,8)}…</p>}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'success'
                          ? <span className="badge-green"><CheckCircle size={11} />Success</span>
                          : <span className="badge-red"><XCircle size={11} />Error</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"><Clock size={11} className="inline mr-1 text-gray-400" />{fmtDur(r.execution_time_seconds)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"><Zap size={11} className="inline mr-1 text-gray-400" />{r.tokens_used.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"><DollarSign size={11} className="inline mr-0.5 text-gray-400" />{fmtCost(r.cost)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button className="btn-secondary text-xs py-1 px-3" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span className="text-sm text-gray-500 dark:text-gray-400">{page + 1} / {totalPages}</span>
              <button className="btn-secondary text-xs py-1 px-3" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Execution Detail" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Status',   value: detail.status, badge: true },
                { label: 'Duration', value: fmtDur(detail.execution_time_seconds) },
                { label: 'Tokens',   value: detail.tokens_used.toLocaleString() },
                { label: 'Cost',     value: fmtCost(detail.cost) },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{m.label}</p>
                  {m.badge
                    ? (detail.status === 'success' ? <span className="badge-green"><CheckCircle size={11} />Success</span> : <span className="badge-red"><XCircle size={11} />Error</span>)
                    : <p className="font-bold text-gray-900 dark:text-white">{m.value}</p>
                  }
                </div>
              ))}
            </div>
            <div>
              <p className="label">Task</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">{detail.task}</p>
            </div>

            {/* Inter-agent message trace */}
            {detail.node_outputs && Object.keys(detail.node_outputs).length > 0 && (
              <div>
                <p className="label">Message Trace <span className="font-normal text-gray-400">(inter-agent outputs)</span></p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {Object.entries(detail.node_outputs).map(([nodeId, output], idx) => {
                    const isTool  = nodeId.startsWith('tool')
                    const Icon    = isTool ? Wrench : Bot
                    const color   = isTool ? 'text-emerald-500' : 'text-indigo-500'
                    const bg      = isTool ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                    const truncated = output.length > 300
                    return (
                      <div key={nodeId} className={`rounded-lg border p-3 ${bg}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                          <Icon size={11} className={color} />
                          <span className={`text-[10px] font-semibold font-mono ${color}`}>{nodeId}</span>
                        </div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                          {truncated ? output.slice(0, 300) + '…' : output}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="label">Final Result</p>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 max-h-48 overflow-y-auto">
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{detail.result}</p>
              </div>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
              <p><span className="font-medium">ID:</span> <span className="font-mono">{detail.id}</span></p>
              <p><span className="font-medium">Time:</span> {new Date(detail.created_at).toLocaleString()}</p>
              <p><span className="font-medium">Source:</span> {detail.source}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
