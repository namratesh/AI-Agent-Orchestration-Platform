import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GitBranch, Plus, Play, Bot, Wrench, Clock, Network,
  RefreshCw, ChevronRight, Layers, Trash2, LayoutTemplate, X,
  ArrowRight, Calendar, ToggleLeft, ToggleRight, AlarmClock,
  MessageSquare, Send, Eye, EyeOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import {
  listWorkflows, executeWorkflow, deleteWorkflow,
  listSchedules, createSchedule, updateScheduleApi, deleteScheduleApi,
  listIntegrations, createIntegration, updateIntegrationApi, deleteIntegrationApi,
} from '../api'
import type { Workflow, WorkflowIntegration, WorkflowSchedule } from '../types'
import { PageSpinner } from '../components/LoadingSpinner'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Hardcoded workflow templates ────────────────────────────────────────────
const WORKFLOW_TEMPLATES = [
  {
    id: 'research-summarize',
    name: 'Research & Summarize',
    description: 'Two-agent pipeline: a researcher gathers information, then a writer produces a clean summary report.',
    agentCount: 2,
    toolCount: 0,
    steps: ['Research Agent', 'Summarizer Agent'],
  },
  {
    id: 'content-pipeline',
    name: 'Content Pipeline',
    description: 'Three-stage pipeline: collect data, analyze it, then produce a polished report — ideal for automated content generation.',
    agentCount: 3,
    toolCount: 0,
    steps: ['Data Collector', 'Analyzer Agent', 'Report Writer'],
  },
]

function TemplateModal({ onClose, onSelect }: { onClose: () => void; onSelect: (id: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={18} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Workflow Templates</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {WORKFLOW_TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => onSelect(tpl.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {tpl.name}
                </h3>
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                  {tpl.agentCount} agents
                </span>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{tpl.description}</p>

              {/* Step flow visualization */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {tpl.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                      <Bot size={9} /> {step}
                    </span>
                    {i < tpl.steps.length - 1 && <ArrowRight size={10} className="text-gray-400 shrink-0" />}
                  </div>
                ))}
              </div>

              <button
                onClick={e => { e.stopPropagation(); onSelect(tpl.id) }}
                className="mt-4 w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Use Template <ChevronRight size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
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

// ─── Channel field config ──────────────────────────────────────────────────────
const CHANNEL_FIELDS: Record<string, { key: string; label: string; placeholder: string; required: boolean; secret?: boolean }[]> = {
  telegram: [
    { key: 'bot_token',  label: 'Bot Token',  placeholder: '123456:ABCdef…',    required: true,  secret: true },
    { key: 'chat_id',    label: 'Chat ID',    placeholder: '625882718',          required: true  },
    { key: 'username',   label: 'Username',   placeholder: '@myuser (optional)', required: false },
  ],
  slack: [
    { key: 'bot_token',      label: 'Bot Token (xoxb-…)',   placeholder: 'xoxb-…',                   required: true,  secret: true },
    { key: 'signing_secret', label: 'Signing Secret',       placeholder: 'abc123…',                  required: true,  secret: true },
    { key: 'channel_id',     label: 'Channel ID',           placeholder: 'C0123456789',              required: true  },
    { key: 'channel_name',   label: 'Channel Name',         placeholder: '#general (display label)', required: false },
  ],
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button type="button" onClick={() => setVisible(v => !v)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

function IntegrationModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const [integrations, setIntegrations] = useState<WorkflowIntegration[]>([])
  const [loading, setLoading]           = useState(true)
  const [channel, setChannel]           = useState<'telegram' | 'slack'>('telegram')
  const [fields, setFields]             = useState<Record<string, string>>({})
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    listIntegrations(workflow.id)
      .then(setIntegrations)
      .catch(() => toast.error('Failed to load integrations'))
      .finally(() => setLoading(false))
  }, [workflow.id])

  const resetFields = (ch: 'telegram' | 'slack') => {
    setChannel(ch)
    setFields({})
  }

  const handleCreate = async () => {
    const defs = CHANNEL_FIELDS[channel]
    for (const f of defs) {
      if (f.required && !fields[f.key]?.trim()) {
        toast.error(`${f.label} is required`); return
      }
    }
    setSaving(true)
    try {
      const row = await createIntegration(workflow.id, { channel_type: channel, config: fields })
      setIntegrations(prev => [...prev, row])
      setFields({})
      toast.success(`${channel === 'telegram' ? 'Telegram' : 'Slack'} integration added`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to save integration')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (it: WorkflowIntegration) => {
    try {
      const updated = await updateIntegrationApi(it.id, { enabled: !it.enabled })
      setIntegrations(prev => prev.map(x => x.id === it.id ? updated : x))
    } catch { toast.error('Failed to update integration') }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteIntegrationApi(id)
      setIntegrations(prev => prev.filter(x => x.id !== id))
      toast.success('Integration removed')
    } catch { toast.error('Failed to delete integration') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Channel Integrations — {workflow.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Existing integrations */}
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : integrations.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No integrations yet — add one below.</p>
          ) : (
            <div className="space-y-2">
              {integrations.map(it => (
                <div key={it.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <button onClick={() => toggleEnabled(it)} className="mt-0.5 shrink-0">
                    {it.enabled
                      ? <ToggleRight size={20} className="text-indigo-500" />
                      : <ToggleLeft  size={20} className="text-gray-400" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                        it.channel_type === 'telegram'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
                      )}>
                        {it.channel_type}
                      </span>
                      {!it.enabled && <span className="text-[10px] text-gray-400 italic">disabled</span>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {it.channel_type === 'telegram'
                        ? `Chat ID: ${it.config.chat_id ?? '—'}${it.config.username ? ` · ${it.config.username}` : ''}`
                        : `Channel: ${it.config.channel_id ?? '—'}${it.config.channel_name ? ` (#${it.config.channel_name})` : ''}`}
                    </p>
                  </div>
                  <button onClick={() => handleDelete(it.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new integration */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add Integration</p>

            {/* Channel selector */}
            <div className="grid grid-cols-2 gap-3">
              {(['telegram', 'slack'] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => resetFields(ch)}
                  className={clsx(
                    'flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all',
                    channel === ch
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600',
                  )}
                >
                  <div className={clsx(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    ch === 'telegram' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30',
                  )}>
                    {ch === 'telegram'
                      ? <Send size={18} className="text-blue-500" />
                      : <MessageSquare size={18} className="text-purple-500" />
                    }
                  </div>
                  <span className={clsx(
                    'text-sm font-semibold capitalize',
                    channel === ch ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-300',
                  )}>
                    {ch}
                  </span>
                  <span className="text-[10px] text-gray-400 text-center px-2">
                    {ch === 'telegram' ? 'Send via Telegram Bot' : 'Post to Slack channel'}
                  </span>
                </button>
              ))}
            </div>

            {/* Dynamic fields */}
            <div className="space-y-3">
              {CHANNEL_FIELDS[channel].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                    {f.label} {f.required && <span className="text-red-400">*</span>}
                  </label>
                  {f.secret ? (
                    <SecretInput
                      value={fields[f.key] ?? ''}
                      onChange={v => setFields(prev => ({ ...prev, [f.key]: v }))}
                      placeholder={f.placeholder}
                    />
                  ) : (
                    <input
                      value={fields[f.key] ?? ''}
                      onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Help text per channel */}
            <div className="rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {channel === 'telegram' ? (
                <>
                  <strong className="text-gray-700 dark:text-gray-300">How to get these:</strong><br />
                  1. Message <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">@BotFather</code> → <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">/newbot</code> → copy the token.<br />
                  2. Start a chat with your bot, then visit<br />
                  <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> to get your Chat ID.
                </>
              ) : (
                <>
                  <strong className="text-gray-700 dark:text-gray-300">How to set up bidirectional Slack chat:</strong><br />
                  1. Create a Slack app at <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">api.slack.com/apps</code> → enable <strong>Event Subscriptions</strong>.<br />
                  2. Set Request URL to <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{location.origin}/slack/events</code><br />
                  3. Subscribe to <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">message.channels</code> bot event.<br />
                  4. Under <strong>OAuth &amp; Permissions</strong> add <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">chat:write</code> scope → install app → copy Bot Token.<br />
                  5. Copy <strong>Signing Secret</strong> from Basic Information.<br />
                  6. Channel ID: right-click the channel in Slack → Copy Link → last segment.
                </>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {saving ? 'Saving…' : `Connect ${channel === 'telegram' ? 'Telegram' : 'Slack'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkflowCard({ workflow, onRun, onDelete }: { workflow: Workflow; onRun: (id: string) => void; onDelete: (id: string) => void }) {
  const [running, setRunning]               = useState(false)
  const [task, setTask]                     = useState('')
  const [showRun, setShowRun]               = useState(false)
  const [showSchedule, setShowSchedule]     = useState(false)
  const [showIntegration, setShowIntegration] = useState(false)

  const agentNodes = workflow.definition.nodes.filter(n => n.type === 'AGENT').length
  const toolNodes  = workflow.definition.nodes.filter(n => n.type === 'TOOL').length
  const edges      = workflow.definition.edges.length

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
      {showSchedule    && <ScheduleModal     workflow={workflow} onClose={() => setShowSchedule(false)} />}
      {showIntegration && <IntegrationModal  workflow={workflow} onClose={() => setShowIntegration(false)} />}
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
            onClick={() => setShowSchedule(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            title="Manage schedules"
          >
            <AlarmClock size={14} />
          </button>
          <button
            onClick={() => setShowIntegration(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            title="Channel integrations (Telegram / Slack)"
          >
            <MessageSquare size={14} />
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
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
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

  const handleSelectTemplate = (templateId: string) => {
    setShowTemplates(false)
    navigate(`/workspace?template=${templateId}`)
  }

  const filtered = workflows.filter(w =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {showTemplates && (
        <TemplateModal onClose={() => setShowTemplates(false)} onSelect={handleSelectTemplate} />
      )}

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
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <LayoutTemplate size={16} /> Templates
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
            {search ? 'Try a different name.' : 'Start from a template or build your own in the Workspace.'}
          </p>
          {!search && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-2 border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors hover:bg-indigo-100"
              >
                <LayoutTemplate size={15} /> Use Template
              </button>
              <Link
                to="/workspace"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <Plus size={15} /> Open Workspace
              </Link>
            </div>
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
