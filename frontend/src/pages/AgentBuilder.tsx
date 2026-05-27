import { useEffect, useState } from 'react'
import { Plus, Search, Bot, ChevronDown } from 'lucide-react'
import { createAgent, deleteAgent, listAgents } from '../api'
import type { Agent, AgentCreate } from '../types'
import AgentCard from '../components/AgentCard'
import Modal from '../components/Modal'
import { PageSpinner } from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PROVIDERS = ['openrouter', 'openai', 'groq', 'ollama'] as const
const TOOLS     = ['web_search']

const TEMPLATES: Record<string, Partial<AgentCreate>> = {
  researcher: { name: 'Research Bot', role: 'researcher', system_prompt: 'You are a research assistant. Find accurate, up-to-date information and provide concise summaries.', model: 'openai/gpt-3.5-turbo', provider: 'openrouter', tools: ['web_search'] },
  writer:     { name: 'Writer Bot',   role: 'writer',     system_prompt: 'You are a professional writer. Create clear, engaging content based on the provided information.', model: 'openai/gpt-3.5-turbo', provider: 'openrouter', tools: [] },
  analyzer:   { name: 'Analyzer Bot', role: 'analyzer',   system_prompt: 'You are a data analyst. Analyze information critically and provide structured insights.', model: 'openai/gpt-3.5-turbo', provider: 'openrouter', tools: [] },
}

const blank: AgentCreate = { name: '', role: '', system_prompt: '', model: 'openai/gpt-3.5-turbo', provider: 'openrouter', tools: [], config: {} }

export default function AgentBuilder() {
  const [agents, setAgents]         = useState<Agent[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState<AgentCreate>(blank)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch]         = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)

  const load = () => listAgents().then(setAgents).catch(() => toast.error('Failed to load agents')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.role.trim()) { toast.error('Name and role are required'); return }
    setSubmitting(true)
    try {
      await createAgent(form)
      toast.success(`Agent "${form.name}" created!`)
      setForm(blank)
      setShowModal(false)
      load()
    } catch {
      toast.error('Failed to create agent')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const agent = agents.find(a => a.id === id)
    if (!confirm(`Delete "${agent?.name}"?`)) return
    try {
      await deleteAgent(id)
      toast.success('Agent deleted')
      setAgents(prev => prev.filter(a => a.id !== id))
    } catch {
      toast.error('Failed to delete agent')
    }
  }

  const applyTemplate = (key: string) => {
    const tpl = TEMPLATES[key]
    if (tpl) setForm(f => ({ ...f, ...tpl, config: {} }))
    setTemplateOpen(false)
  }

  const filtered = agents.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(blank); setShowModal(true) }}>
          <Plus size={16} />New Agent
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="Search agents…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Grid */}
      {loading ? <PageSpinner /> : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
            <Bot size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {search ? 'No agents match your search' : 'No agents yet'}
          </p>
          {!search && (
            <button className="btn-primary mt-4" onClick={() => setShowModal(true)}>
              <Plus size={16} />Create your first agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(a => (
            <AgentCard key={a.id} agent={a} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Create Agent"
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Agent'}
            </button>
          </>
        }
      >
        {/* Template picker */}
        <div className="mb-4 relative">
          <button
            type="button"
            className="btn-secondary w-full justify-between"
            onClick={() => setTemplateOpen(v => !v)}
          >
            <span className="text-sm text-gray-500">Start from template…</span>
            <ChevronDown size={14} />
          </button>
          {templateOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 card shadow-modal z-10 py-1">
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <button key={key} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" onClick={() => applyTemplate(key)}>
                  <span className="font-medium capitalize">{key}</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-2">— {tpl.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name *</label>
              <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Research Bot" />
            </div>
            <div>
              <label className="label">Role *</label>
              <input className="input" required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="researcher" />
            </div>
          </div>

          <div>
            <label className="label">System Prompt *</label>
            <textarea className="input h-28 resize-none" required value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} placeholder="You are a helpful assistant…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Provider</label>
              <select className="input" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}>
                {PROVIDERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <input className="input" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="openai/gpt-3.5-turbo" />
            </div>
          </div>

          <div>
            <label className="label">Tools</label>
            <div className="flex flex-wrap gap-2">
              {TOOLS.map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.tools.includes(t)}
                    onChange={() => setForm(f => ({ ...f, tools: f.tools.includes(t) ? f.tools.filter(x => x !== t) : [...f.tools, t] }))}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t}</span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
