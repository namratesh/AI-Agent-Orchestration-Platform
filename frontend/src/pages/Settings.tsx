import { useEffect, useState } from 'react'
import { Eye, EyeOff, Copy, Check, Send, Plus, Trash2, ExternalLink } from 'lucide-react'
import { createMapping, deleteMapping, listMappings, listWorkflows } from '../api'
import type { TelegramMapping, Workflow } from '../types'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { PageSpinner } from '../components/LoadingSpinner'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="btn-ghost text-xs py-1 px-2">
      {copied ? <><Check size={12} />Copied</> : <><Copy size={12} />Copy</>}
    </button>
  )
}

function ShowHideField({ value }: { value: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        readOnly
        className="input flex-1 font-mono text-xs"
      />
      <button className="btn-ghost p-2" onClick={() => setVisible(v => !v)}>
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <CopyButton text={value} />
    </div>
  )
}

export default function Settings() {
  const [mappings, setMappings]   = useState<TelegramMapping[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading]     = useState(true)
  const [addModal, setAddModal]   = useState(false)
  const [form, setForm]           = useState({ chat_id: '', workflow_id: '', username: '' })
  const [saving, setSaving]       = useState(false)

  const apiKeyPlaceholder = '••••••••••••••••••••••••••••••••••••••••'

  useEffect(() => {
    Promise.all([listMappings(), listWorkflows()])
      .then(([m, w]) => { setMappings(m); setWorkflows(w) })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const addMapping = async () => {
    if (!form.chat_id.trim() || !form.workflow_id) { toast.error('Chat ID and workflow are required'); return }
    setSaving(true)
    try {
      const m = await createMapping({ chat_id: form.chat_id, workflow_id: form.workflow_id, username: form.username || undefined })
      setMappings(prev => [...prev.filter(x => x.chat_id !== m.chat_id), m])
      setAddModal(false)
      setForm({ chat_id: '', workflow_id: '', username: '' })
      toast.success('Mapping added')
    } catch { toast.error('Failed to add mapping') }
    finally { setSaving(false) }
  }

  const removeMapping = async (chatId: string) => {
    if (!confirm('Remove this mapping?')) return
    try {
      await deleteMapping(chatId)
      setMappings(prev => prev.filter(m => m.chat_id !== chatId))
      toast.success('Mapping removed')
    } catch { toast.error('Failed to remove mapping') }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="animate-fade-in space-y-8 max-w-3xl">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure integrations and API access.</p>
      </div>

      {/* API Keys */}
      <section className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">API Keys</h2>
        <div className="divider" />
        <div className="space-y-4">
          {[
            { label: 'OpenRouter API Key', env: 'OPENROUTER_API_KEY' },
            { label: 'OpenAI API Key',     env: 'OPENAI_API_KEY'     },
            { label: 'Groq API Key',       env: 'GROQ_API_KEY'       },
            { label: 'Telegram Bot Token', env: 'TELEGRAM_BOT_TOKEN' },
          ].map(({ label, env }) => (
            <div key={env}>
              <label className="label">{label}</label>
              <ShowHideField value={apiKeyPlaceholder} />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Set via <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{env}</code> in <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">.env</code>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Telegram */}
      <section className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Telegram Integration</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Map Telegram chats to workflows</p>
          </div>
          <button className="btn-primary text-sm" onClick={() => setAddModal(true)}>
            <Plus size={15} />Add Mapping
          </button>
        </div>
        <div className="divider" />

        {/* Webhook URL */}
        <div>
          <label className="label">Webhook URL</label>
          <div className="flex items-center gap-2">
            <input readOnly className="input flex-1 font-mono text-xs" value={`${location.origin}/telegram/webhook`} />
            <CopyButton text={`${location.origin}/telegram/webhook`} />
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Register this URL with BotFather using <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/setwebhook</code>
          </p>
        </div>

        {/* Mappings table */}
        {mappings.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No chat mappings yet</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Chat ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Workflow</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {mappings.map(m => (
                  <tr key={m.chat_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{m.chat_id}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.username ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{m.workflow_id.slice(0,8)}…</td>
                    <td className="px-4 py-3">
                      <button onClick={() => removeMapping(m.chat_id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Observability links */}
      <section className="card p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Observability</h2>
        <div className="divider" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Grafana', url: 'http://localhost:3001', desc: 'Dashboards & metrics' },
            { label: 'Jaeger',  url: 'http://localhost:16686', desc: 'Distributed traces' },
            { label: 'Prometheus', url: 'http://localhost:9090', desc: 'Raw metrics query' },
          ].map(({ label, url, desc }) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{desc}</p>
              </div>
              <ExternalLink size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-primary-500 shrink-0" />
            </a>
          ))}
        </div>
      </section>

      {/* Add mapping modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add Telegram Mapping"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={addMapping} disabled={saving}>
              <Send size={14} />{saving ? 'Adding…' : 'Add Mapping'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Chat ID *</label>
            <input className="input" placeholder="e.g. 625882718" value={form.chat_id} onChange={e => setForm(f => ({ ...f, chat_id: e.target.value }))} />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" placeholder="@username (optional)" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label className="label">Workflow *</label>
            <select className="input" value={form.workflow_id} onChange={e => setForm(f => ({ ...f, workflow_id: e.target.value }))}>
              <option value="">Select workflow…</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
