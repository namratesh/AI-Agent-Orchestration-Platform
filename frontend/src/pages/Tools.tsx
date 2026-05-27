import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Wrench, Trash2, Edit2, Play, X, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, AlertCircle,
} from 'lucide-react'
import {
  listTools, createTool, updateTool, deleteTool, testTool,
} from '../api'
import type { Tool, ToolCreate, ToolTestResponse } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const
type Method = typeof METHODS[number]

const METHOD_COLORS: Record<Method, string> = {
  GET:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  POST:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  PUT:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  PATCH:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
}

const VAR_RE = /\{\{(\w+)\}\}/g

function extractVars(texts: string[]): string[] {
  const seen = new Set<string>()
  for (const t of texts) {
    let m: RegExpExecArray | null
    const re = new RegExp(VAR_RE.source, 'g')
    while ((m = re.exec(t)) !== null) seen.add(m[1])
  }
  return [...seen]
}

function statusColor(code: number) {
  if (code === 0)         return 'text-red-500'
  if (code < 300)         return 'text-emerald-500'
  if (code < 400)         return 'text-blue-500'
  if (code < 500)         return 'text-amber-500'
  return 'text-red-500'
}

// ── blank form state ──────────────────────────────────────────────────────────

function blankForm(): ToolCreate {
  return {
    name: '', description: '', method: 'GET', url: '',
    headers: {}, body_template: '', api_key: '',
    api_key_header: 'Authorization', api_key_prefix: 'Bearer',
    timeout_seconds: 30,
  }
}

// ── header row editor ─────────────────────────────────────────────────────────

function HeaderEditor({
  value, onChange,
}: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const pairs = Object.entries(value)

  const set = (i: number, k: string, v: string) => {
    const next = [...pairs]
    next[i] = [k, v]
    onChange(Object.fromEntries(next))
  }
  const remove = (i: number) => {
    const next = pairs.filter((_, j) => j !== i)
    onChange(Object.fromEntries(next))
  }
  const add = () => onChange({ ...value, '': '' })

  return (
    <div className="space-y-2">
      {pairs.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder="Header name"
            value={k}
            onChange={e => set(i, e.target.value, v)}
          />
          <input
            className="input flex-1 text-xs"
            placeholder="Value"
            value={v}
            onChange={e => set(i, k, e.target.value)}
          />
          <button onClick={() => remove(i)} className="p-1 text-gray-400 hover:text-red-500">
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs text-primary-500 hover:text-primary-700 font-medium"
      >
        + Add header
      </button>
    </div>
  )
}

// ── Tool modal (create / edit) ─────────────────────────────────────────────────

interface ModalProps {
  initial?: Tool | null
  onClose: () => void
  onSaved: (tool: Tool) => void
}

function ToolModal({ initial, onClose, onSaved }: ModalProps) {
  const isEdit = !!initial
  const [form, setForm] = useState<ToolCreate>(
    initial
      ? { ...initial }
      : blankForm()
  )
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof ToolCreate>(k: K, v: ToolCreate[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.url.trim())  { toast.error('URL is required'); return }
    setSaving(true)
    try {
      const saved = isEdit
        ? await updateTool(initial!.id, form)
        : await createTool(form)
      onSaved(saved)
      toast.success(isEdit ? 'Tool updated' : 'Tool created')
    } catch {
      toast.error('Failed to save tool')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Edit Tool' : 'New Tool'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* name + description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="My API Tool" />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="What this tool does" />
            </div>
          </div>

          {/* method + url */}
          <div className="flex gap-3">
            <div className="w-32 shrink-0">
              <label className="label">Method</label>
              <select className="input" value={form.method} onChange={e => set('method', e.target.value as Method)}>
                {METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="label">URL * <span className="text-gray-400 font-normal">(use {'{{variable}}'} for placeholders)</span></label>
              <input className="input font-mono text-xs" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://api.example.com/{{endpoint}}" />
            </div>
          </div>

          {/* auth */}
          <div>
            <label className="label">API Key / Token</label>
            <div className="grid grid-cols-3 gap-2">
              <input className="input col-span-1 text-xs" value={form.api_key_prefix} onChange={e => set('api_key_prefix', e.target.value)} placeholder="Bearer" />
              <input className="input col-span-2 font-mono text-xs" type="password" value={form.api_key} onChange={e => set('api_key', e.target.value)} placeholder="your-api-key-here" />
            </div>
            <div className="mt-1">
              <input className="input text-xs" value={form.api_key_header} onChange={e => set('api_key_header', e.target.value)} placeholder="Authorization" />
              <p className="text-xs text-gray-400 mt-0.5">Header name where the key is sent</p>
            </div>
          </div>

          {/* headers */}
          <div>
            <label className="label">Custom Headers <span className="text-gray-400 font-normal">(supports {'{{variable}}'})</span></label>
            <HeaderEditor value={form.headers} onChange={v => set('headers', v)} />
          </div>

          {/* body template */}
          {['POST', 'PUT', 'PATCH'].includes(form.method) && (
            <div>
              <label className="label">Body Template <span className="text-gray-400 font-normal">(JSON, supports {'{{variable}}'})</span></label>
              <textarea
                className="input font-mono text-xs h-28 resize-none"
                value={form.body_template}
                onChange={e => set('body_template', e.target.value)}
                placeholder={'{\n  "key": "{{value}}"\n}'}
              />
            </div>
          )}

          {/* timeout */}
          <div className="w-40">
            <label className="label">Timeout (seconds)</label>
            <input
              className="input"
              type="number"
              min={1} max={300}
              value={form.timeout_seconds}
              onChange={e => set('timeout_seconds', Number(e.target.value))}
            />
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 shrink-0">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Test panel ────────────────────────────────────────────────────────────────

interface TestPanelProps {
  tool: Tool
  onClose: () => void
}

function TestPanel({ tool, onClose }: TestPanelProps) {
  const vars = extractVars([
    tool.url,
    tool.body_template,
    ...Object.values(tool.headers),
  ])

  const [varVals, setVarVals] = useState<Record<string, string>>(
    Object.fromEntries(vars.map(v => [v, '']))
  )
  const [params, setParams] = useState<Record<string, string>>({})
  const [bodyOverride, setBodyOverride] = useState('')
  const [showBody, setShowBody] = useState(false)
  const [showHeaders, setShowHeaders] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ToolTestResponse | null>(null)

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await testTool(tool.id, {
        variables: varVals,
        params,
        body_override: bodyOverride || undefined,
      })
      setResult(res)
    } catch {
      toast.error('Test request failed')
    } finally {
      setLoading(false)
    }
  }

  const prettyBody = (() => {
    if (!result?.response_body) return ''
    try { return JSON.stringify(JSON.parse(result.response_body), null, 2) }
    catch { return result.response_body }
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${METHOD_COLORS[tool.method as Method] ?? ''}`}>
              {tool.method}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-xs">
              {tool.name}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* resolved URL preview */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 break-all">
            {tool.url}
          </div>

          {/* variables */}
          {vars.length > 0 && (
            <div>
              <label className="label">Template Variables</label>
              <div className="space-y-2">
                {vars.map(v => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-32 shrink-0">{`{{${v}}}`}</span>
                    <input
                      className="input flex-1 text-xs"
                      placeholder={`Value for ${v}`}
                      value={varVals[v] ?? ''}
                      onChange={e => setVarVals(p => ({ ...p, [v]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* query params */}
          <div>
            <label className="label">Query Parameters <span className="text-gray-400 font-normal">(optional)</span></label>
            <HeaderEditor value={params} onChange={setParams} />
          </div>

          {/* body override */}
          {['POST', 'PUT', 'PATCH'].includes(tool.method) && (
            <div>
              <label className="label">Body Override <span className="text-gray-400 font-normal">(leave blank to use template)</span></label>
              <textarea
                className="input font-mono text-xs h-24 resize-none"
                value={bodyOverride}
                onChange={e => setBodyOverride(e.target.value)}
                placeholder={tool.body_template || '{"key": "value"}'}
              />
            </div>
          )}

          {/* send */}
          <button
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={run}
            disabled={loading}
          >
            <Play size={14} />
            {loading ? 'Sending…' : 'Send Request'}
          </button>

          {/* result */}
          {result && (
            <div className="space-y-2">
              {/* status bar */}
              <div className="flex items-center gap-3 text-sm">
                {result.error ? (
                  <><XCircle size={16} className="text-red-500" /><span className="text-red-500 font-medium">{result.error}</span></>
                ) : (
                  <>
                    {result.status_code < 300
                      ? <CheckCircle size={16} className="text-emerald-500" />
                      : <AlertCircle size={16} className="text-amber-500" />}
                    <span className={`font-bold ${statusColor(result.status_code)}`}>{result.status_code}</span>
                    <span className="text-gray-500 flex items-center gap-1"><Clock size={12} />{result.duration_ms} ms</span>
                  </>
                )}
              </div>

              {/* response headers */}
              {!result.error && (
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    onClick={() => setShowHeaders(h => !h)}
                  >
                    {showHeaders ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Response Headers ({Object.keys(result.response_headers).length})
                  </button>
                  {showHeaders && (
                    <div className="mt-1 bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs font-mono space-y-0.5 max-h-32 overflow-y-auto">
                      {Object.entries(result.response_headers).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-gray-500 shrink-0">{k}:</span>
                          <span className="text-gray-700 dark:text-gray-300 break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* response body */}
              {!result.error && result.response_body && (
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    onClick={() => setShowBody(b => !b)}
                  >
                    {showBody ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Response Body
                  </button>
                  {showBody && (
                    <pre className="mt-1 bg-gray-50 dark:bg-gray-800 rounded p-3 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                      {prettyBody}
                    </pre>
                  )}
                  {!showBody && (
                    <div
                      className="mt-1 bg-gray-50 dark:bg-gray-800 rounded p-3 text-xs font-mono text-gray-700 dark:text-gray-300 cursor-pointer line-clamp-3 hover:line-clamp-none"
                      onClick={() => setShowBody(true)}
                    >
                      {prettyBody}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tool card ─────────────────────────────────────────────────────────────────

interface CardProps {
  tool: Tool
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
}

function ToolCard({ tool, onEdit, onDelete, onTest }: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${METHOD_COLORS[tool.method as Method] ?? ''}`}>
            {tool.method}
          </span>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{tool.name}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onTest}   title="Test" className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"><Play size={14} /></button>
          <button onClick={onEdit}   title="Edit" className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"><Edit2 size={14} /></button>
          <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      {tool.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{tool.description}</p>
      )}

      <p className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
        {tool.url || <span className="text-gray-400 italic">no URL</span>}
      </p>

      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
        {tool.api_key && <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">Auth</span>}
        {Object.keys(tool.headers).length > 0 && (
          <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
            {Object.keys(tool.headers).length} header{Object.keys(tool.headers).length !== 1 ? 's' : ''}
          </span>
        )}
        {tool.body_template && <span className="bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">Body</span>}
        <span className="ml-auto">{tool.timeout_seconds}s timeout</span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Tools() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [modalTool, setModalTool] = useState<Tool | null | undefined>(undefined)
  const [testTool_, setTestTool] = useState<Tool | null>(null)

  const load = async () => {
    try {
      setTools(await listTools())
    } catch {
      toast.error('Failed to load tools')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSaved = (tool: Tool) => {
    setTools(prev => {
      const idx = prev.findIndex(t => t.id === tool.id)
      return idx >= 0 ? prev.map(t => t.id === tool.id ? tool : t) : [tool, ...prev]
    })
    setModalTool(undefined)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tool?')) return
    try {
      await deleteTool(id)
      setTools(prev => prev.filter(t => t.id !== id))
      toast.success('Tool deleted')
    } catch {
      toast.error('Failed to delete tool')
    }
  }

  const showModal = modalTool !== undefined
  // undefined = closed, null = new, Tool = edit

  return (
    <div className="space-y-6">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tools</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Define HTTP API tools with auth, headers, and body templates. Use {'{{variable}}'} placeholders.
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setModalTool(null)}
        >
          <Plus size={16} /> New Tool
        </button>
      </div>

      {/* grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Wrench size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No tools yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-4">
            Create your first tool to call external APIs from your agents.
          </p>
          <button className="btn-primary flex items-center gap-2" onClick={() => setModalTool(null)}>
            <Plus size={14} /> Create Tool
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map(tool => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onEdit={() => setModalTool(tool)}
              onDelete={() => handleDelete(tool.id)}
              onTest={() => setTestTool(tool)}
            />
          ))}
        </div>
      )}

      {/* modals */}
      {showModal && (
        <ToolModal
          initial={modalTool}
          onClose={() => setModalTool(undefined)}
          onSaved={handleSaved}
        />
      )}
      {testTool_ && (
        <TestPanel
          tool={testTool_}
          onClose={() => setTestTool(null)}
        />
      )}
    </div>
  )
}
