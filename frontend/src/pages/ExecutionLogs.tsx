import { useCallback, useEffect, useRef, useState } from 'react'
import { Wifi, WifiOff, Pause, Play, Download, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { LogEntry } from '../types'
import { useWebSocket } from '../hooks/useWebSocket'
import clsx from 'clsx'

const LEVEL_CLASS: Record<string, string> = {
  debug: 'log-debug', info: 'log-info', warning: 'log-warn', warn: 'log-warn', error: 'log-error',
}

function levelClass(entry: LogEntry): string {
  return LEVEL_CLASS[entry.level?.toLowerCase() ?? 'info'] ?? 'log-info'
}

function msgText(entry: LogEntry): string {
  if (typeof entry.event === 'string' && entry.event !== 'log') return entry.event
  if (typeof entry.message === 'string') return entry.message
  return JSON.stringify(entry)
}

function fmtTs(ts?: string) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

export default function ExecutionLogs() {
  const [logs, setLogs]           = useState<LogEntry[]>([])
  const [paused, setPaused]       = useState(false)
  const [search, setSearch]       = useState('')
  const [levelFilter, setLevel]   = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [expanded, setExpanded]   = useState<Set<number>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)

  const proto  = location.protocol === 'https:' ? 'wss' : 'ws'
  const wsUrl  = `${proto}://${location.host}/ws/logs`

  const onMessage = useCallback((data: unknown) => {
    if (paused) return
    const entry = data as LogEntry
    if (entry.type === 'ping') return
    setLogs(prev => [...prev.slice(-500), entry])
  }, [paused])

  const { status } = useWebSocket(wsUrl, onMessage)

  useEffect(() => {
    if (autoScroll && !paused) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll, paused])

  const filtered = logs.filter(e => {
    if (levelFilter !== 'all' && e.level?.toLowerCase() !== levelFilter) return false
    if (search) {
      const txt = JSON.stringify(e).toLowerCase()
      if (!txt.includes(search.toLowerCase())) return false
    }
    return true
  })

  const toggleExpand = (i: number) => setExpanded(prev => {
    const s = new Set(prev)
    s.has(i) ? s.delete(i) : s.add(i)
    return s
  })

  const downloadLogs = () => {
    const blob = new Blob([filtered.map(e => JSON.stringify(e)).join('\n')], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `logs-${new Date().toISOString().slice(0,19)}.jsonl`
    a.click()
  }

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="page-header mb-0">
          <h1 className="page-title">Live Logs</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
            status === 'connected'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
              : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400',
          )}>
            {status === 'connected' ? <Wifi size={11} className="animate-pulse-slow" /> : <WifiOff size={11} />}
            {status === 'connected' ? 'Live' : status}
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} entries</span>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-3 mb-3 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs text-xs"
          placeholder="Search logs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input max-w-[120px] text-xs" value={levelFilter} onChange={e => setLevel(e.target.value)}>
          <option value="all">All levels</option>
          {['debug','info','warning','error'].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" />
            Auto-scroll
          </label>
          <button className="btn-ghost text-xs py-1 px-2" onClick={() => setPaused(p => !p)}>
            {paused ? <><Play size={13} />Resume</> : <><Pause size={13} />Pause</>}
          </button>
          <button className="btn-ghost text-xs py-1 px-2" onClick={downloadLogs} disabled={filtered.length === 0}>
            <Download size={13} />Export
          </button>
          <button className="btn-ghost text-xs py-1 px-2 text-red-500 hover:text-red-600" onClick={() => setLogs([])}>
            <Trash2 size={13} />Clear
          </button>
        </div>
      </div>

      {/* Log stream */}
      <div className="card flex-1 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <Wifi size={32} className="mb-3 opacity-30" />
            <p>{status === 'connected' ? 'Waiting for logs…' : 'Connecting to log stream…'}</p>
          </div>
        ) : filtered.map((entry, i) => (
          <div
            key={i}
            className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
            onClick={() => toggleExpand(i)}
          >
            <div className="flex items-start gap-3 px-4 py-2">
              <span className="text-gray-300 dark:text-gray-600 shrink-0 mt-0.5">
                {expanded.has(i) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums mt-0.5">{fmtTs(entry.timestamp)}</span>
              <span className={clsx('shrink-0 text-[10px] py-0 px-1.5', levelClass(entry))}>{(entry.level ?? 'info').toUpperCase()}</span>
              {entry.logger && (
                <span className="shrink-0 text-[10px] text-gray-400 max-w-[120px] truncate">{entry.logger}</span>
              )}
              <span className="flex-1 text-gray-800 dark:text-gray-200 leading-relaxed break-all">{msgText(entry)}</span>
            </div>
            {expanded.has(i) && (
              <div className="px-10 pb-3">
                <pre className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 overflow-x-auto border border-gray-200 dark:border-gray-700">
                  {JSON.stringify(entry, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
