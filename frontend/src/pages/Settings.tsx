import { useEffect, useState } from 'react'
import {
  Eye, EyeOff, Copy, Check, Plus, Trash2, ExternalLink,
  Bot, Send, MessageSquare, ChevronRight, ChevronLeft,
  ToggleLeft, ToggleRight, X, RefreshCw, Wifi,
} from 'lucide-react'
import {
  listBots, createBot, updateBotApi, deleteBotApi,
  listTelegramMappingsForBot, addTelegramMapping, removeTelegramMapping,
  listSlackMappings, addSlackMapping, removeSlackMapping,
  listWorkflows,
} from '../api'
import type { ChannelBot, SlackChannelMapping, TelegramMapping, Workflow } from '../types'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { PageSpinner } from '../components/LoadingSpinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="btn-ghost text-xs py-1 px-2 shrink-0"
    >
      {copied ? <><Check size={12} />Copied</> : <><Copy size={12} />Copy</>}
    </button>
  )
}

function SecretInput({ value, onChange, placeholder, readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="flex-1 input font-mono text-xs"
      />
      <button type="button" className="btn-ghost p-2" onClick={() => setVisible(v => !v)}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      {readOnly && <CopyButton text={value} />}
    </div>
  )
}

// ── Channel type field definitions ────────────────────────────────────────────
const TELEGRAM_FIELDS = [
  { key: 'bot_token', label: 'Bot Token', placeholder: '123456:ABCdef…', secret: true },
]
const SLACK_FIELDS = [
  { key: 'bot_token',      label: 'Bot Token (xoxb-…)',  placeholder: 'xoxb-…',   secret: true },
  { key: 'signing_secret', label: 'Signing Secret',      placeholder: 'abc123…',  secret: true },
]

// ── Add Bot wizard ────────────────────────────────────────────────────────────

function AddBotWizard({ workflows, onClose, onCreated }: {
  workflows: Workflow[]
  onClose: () => void
  onCreated: (bot: ChannelBot) => void
}) {
  const [step, setStep]         = useState<1 | 2 | 3>(1)
  const [name, setName]         = useState('')
  const [channel, setChannel]   = useState<'telegram' | 'slack'>('telegram')
  const [creds, setCreds]       = useState<Record<string, string>>({})
  const [createdBot, setCreatedBot] = useState<ChannelBot | null>(null)
  const [saving, setSaving]     = useState(false)

  // First mapping
  const [mapChatId,   setMapChatId]   = useState('')
  const [mapChannel,  setMapChannel]  = useState('')
  const [mapChanName, setMapChanName] = useState('')
  const [mapWorkflow, setMapWorkflow] = useState('')
  const [mapSaving,   setMapSaving]   = useState(false)

  const fields = channel === 'telegram' ? TELEGRAM_FIELDS : SLACK_FIELDS
  const webhookHost = window.location.origin

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Give your bot a name'); return }
    const required = fields.filter(f => !creds[f.key]?.trim())
    if (required.length) { toast.error(`${required[0].label} is required`); return }
    setSaving(true)
    try {
      const bot = await createBot({ name: name.trim(), channel_type: channel, config: creds })
      setCreatedBot(bot)
      onCreated(bot)
      setStep(3)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to create bot')
    } finally {
      setSaving(false)
    }
  }

  const handleAddMapping = async () => {
    if (!createdBot || !mapWorkflow) { toast.error('Select a workflow'); return }
    setMapSaving(true)
    try {
      if (channel === 'telegram') {
        if (!mapChatId.trim()) { toast.error('Chat ID is required'); setMapSaving(false); return }
        await addTelegramMapping(createdBot.id, { chat_id: mapChatId, workflow_id: mapWorkflow })
      } else {
        if (!mapChannel.trim()) { toast.error('Channel ID is required'); setMapSaving(false); return }
        await addSlackMapping(createdBot.id, { channel_id: mapChannel, workflow_id: mapWorkflow, channel_name: mapChanName || undefined })
      }
      toast.success('Mapping added — your bot is ready!')
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to add mapping')
    } finally {
      setMapSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {([1, 2, 3] as const).map(s => (
                <div key={s} className={clsx(
                  'w-6 h-1.5 rounded-full transition-colors',
                  step >= s ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-700'
                )} />
              ))}
            </div>
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              Step {step} of 3
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* STEP 1 — Name + Channel */}
          {step === 1 && (
            <>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5">Name your bot</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Give it a friendly name so you can identify it later.</p>
              </div>
              <div>
                <label className="label">Bot Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Customer Support Bot, Research Assistant…"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Channel</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {(['telegram', 'slack'] as const).map(ch => (
                    <button
                      key={ch}
                      onClick={() => setChannel(ch)}
                      className={clsx(
                        'flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all',
                        channel === ch
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300',
                      )}
                    >
                      <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        ch === 'telegram' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30',
                      )}>
                        {ch === 'telegram'
                          ? <Send size={18} className="text-blue-500" />
                          : <MessageSquare size={18} className="text-purple-500" />}
                      </div>
                      <span className={clsx(
                        'text-sm font-semibold capitalize',
                        channel === ch ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-300',
                      )}>{ch}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => name.trim() ? setStep(2) : toast.error('Enter a bot name')}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* STEP 2 — Credentials + Webhook URL */}
          {step === 2 && (
            <>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5">
                  Connect your {channel === 'telegram' ? 'Telegram' : 'Slack'} bot
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {channel === 'telegram'
                    ? 'Paste your bot token from BotFather.'
                    : 'Paste your Slack bot token and signing secret.'}
                </p>
              </div>

              {/* Credentials */}
              <div className="space-y-3">
                {fields.map(f => (
                  <div key={f.key}>
                    <label className="label">{f.label} *</label>
                    <SecretInput
                      value={creds[f.key] ?? ''}
                      onChange={v => setCreds(prev => ({ ...prev, [f.key]: v }))}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>

              {/* Setup instructions */}
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed space-y-1">
                {channel === 'telegram' ? (
                  <>
                    <p className="font-semibold">How to get your Bot Token:</p>
                    <p>1. Open Telegram → search <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">@BotFather</code></p>
                    <p>2. Send <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/newbot</code> and follow the prompts</p>
                    <p>3. Copy the token BotFather gives you and paste it above</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">How to set up your Slack bot:</p>
                    <p>1. Go to <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">api.slack.com/apps</code> → Create App</p>
                    <p>2. OAuth &amp; Permissions → add <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">chat:write</code> scope → Install → copy Bot Token</p>
                    <p>3. Basic Information → copy Signing Secret</p>
                    <p>4. Event Subscriptions → enable → set URL (shown after saving)</p>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                  {saving ? 'Creating…' : 'Create Bot'}
                </button>
              </div>
            </>
          )}

          {/* STEP 3 — Register URL + First Mapping */}
          {step === 3 && createdBot && (
            <>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5">
                  Register &amp; connect a channel
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {channel === 'telegram'
                    ? 'Register the webhook with BotFather, then map a chat to a workflow.'
                    : 'Register the events URL in your Slack app, then map a channel to a workflow.'}
                </p>
              </div>

              {/* Webhook / Events URL */}
              <div>
                <label className="label">
                  {channel === 'telegram' ? 'Webhook URL (register with BotFather)' : 'Events URL (register in Slack app)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    className="input flex-1 font-mono text-xs"
                    value={channel === 'telegram'
                      ? `${webhookHost}/telegram/webhook/${createdBot.id}`
                      : `${webhookHost}/slack/events`}
                  />
                  <CopyButton text={channel === 'telegram'
                    ? `${webhookHost}/telegram/webhook/${createdBot.id}`
                    : `${webhookHost}/slack/events`}
                  />
                </div>
                {channel === 'telegram' && (
                  <p className="mt-1 text-xs text-gray-400">
                    Run: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
                      curl "https://api.telegram.org/bot{'<TOKEN>'}/setWebhook?url={webhookHost}/telegram/webhook/{createdBot.id}"
                    </code>
                  </p>
                )}
              </div>

              {/* First mapping */}
              <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add first mapping (optional)</p>

                {channel === 'telegram' ? (
                  <div>
                    <label className="label">Chat ID *</label>
                    <input className="input" placeholder="e.g. -625882718" value={mapChatId} onChange={e => setMapChatId(e.target.value)} />
                    <p className="mt-1 text-xs text-gray-400">
                      Send a message to your bot then visit
                      <code className="bg-gray-100 dark:bg-gray-700 px-1 mx-1 rounded">
                        api.telegram.org/bot{'<TOKEN>'}/getUpdates
                      </code>
                      to get the chat_id.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="label">Channel ID *</label>
                      <input className="input" placeholder="C0123456789" value={mapChannel} onChange={e => setMapChannel(e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <label className="label">Display name</label>
                      <input className="input" placeholder="#general" value={mapChanName} onChange={e => setMapChanName(e.target.value)} />
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">Workflow *</label>
                  <select className="input" value={mapWorkflow} onChange={e => setMapWorkflow(e.target.value)}>
                    <option value="">Select workflow…</option>
                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary text-sm">
                  Skip mapping
                </button>
                <button
                  onClick={handleAddMapping}
                  disabled={mapSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {mapSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {mapSaving ? 'Saving…' : 'Add Mapping & Finish'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bot Card ──────────────────────────────────────────────────────────────────

function BotCard({ bot, workflows, onUpdated, onDeleted }: {
  bot: ChannelBot
  workflows: Workflow[]
  onUpdated: (b: ChannelBot) => void
  onDeleted: (id: string) => void
}) {
  const [tgMappings, setTgMappings] = useState<TelegramMapping[]>([])
  const [slMappings, setSlMappings] = useState<SlackChannelMapping[]>([])
  const [loadingMaps, setLoadingMaps] = useState(true)
  const [showAddMap, setShowAddMap]   = useState(false)

  // Add mapping form state
  const [mapChatId,   setMapChatId]   = useState('')
  const [mapChannel,  setMapChannel]  = useState('')
  const [mapChanName, setMapChanName] = useState('')
  const [mapWorkflow, setMapWorkflow] = useState(() => workflows[0]?.id ?? '')
  const [mapSaving,   setMapSaving]   = useState(false)

  const webhookHost = window.location.origin

  useEffect(() => {
    const load = bot.channel_type === 'telegram'
      ? listTelegramMappingsForBot(bot.id).then(d => { setTgMappings(d); setLoadingMaps(false) })
      : listSlackMappings(bot.id).then(d => { setSlMappings(d); setLoadingMaps(false) })
    load.catch(() => setLoadingMaps(false))
  }, [bot.id, bot.channel_type])

  const toggleEnabled = async () => {
    try {
      const updated = await updateBotApi(bot.id, { enabled: !bot.enabled })
      onUpdated(updated)
    } catch { toast.error('Failed to update bot') }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${bot.name}"? This removes all its channel mappings.`)) return
    try {
      await deleteBotApi(bot.id)
      onDeleted(bot.id)
      toast.success('Bot deleted')
    } catch { toast.error('Failed to delete bot') }
  }

  const handleAddMap = async () => {
    if (bot.channel_type === 'telegram') {
      if (!mapChatId.trim() && !mapWorkflow) { toast.error('Chat ID and workflow are required'); return }
      if (!mapChatId.trim()) { toast.error('Chat ID is required'); return }
      if (!mapWorkflow) { toast.error('Please select a workflow'); return }
    } else {
      if (!mapChannel.trim() && !mapWorkflow) { toast.error('Channel ID and workflow are required'); return }
      if (!mapChannel.trim()) { toast.error('Channel ID is required'); return }
      if (!mapWorkflow) { toast.error('Please select a workflow'); return }
    }
    setMapSaving(true)
    try {
      if (bot.channel_type === 'telegram') {
        const m = await addTelegramMapping(bot.id, { chat_id: mapChatId, workflow_id: mapWorkflow })
        setTgMappings(prev => [...prev.filter(x => x.chat_id !== m.chat_id), m])
      } else {
        const m = await addSlackMapping(bot.id, { channel_id: mapChannel, workflow_id: mapWorkflow, channel_name: mapChanName || undefined })
        setSlMappings(prev => [...prev, m])
      }
      setMapChatId(''); setMapChannel(''); setMapChanName(''); setMapWorkflow('')
      setShowAddMap(false)
      toast.success('Mapping added')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to add mapping')
    } finally {
      setMapSaving(false)
    }
  }

  const handleRemoveTg = async (chatId: string) => {
    try {
      await removeTelegramMapping(chatId)
      setTgMappings(prev => prev.filter(m => m.chat_id !== chatId))
    } catch { toast.error('Failed to remove mapping') }
  }

  const handleRemoveSl = async (id: string) => {
    try {
      await removeSlackMapping(id)
      setSlMappings(prev => prev.filter(m => m.id !== id))
    } catch { toast.error('Failed to remove mapping') }
  }

  const webhookUrl = bot.channel_type === 'telegram'
    ? `${webhookHost}/telegram/webhook/${bot.id}`
    : `${webhookHost}/slack/events`

  return (
    <div className="card p-5 space-y-4">
      {/* Bot header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            bot.channel_type === 'telegram' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30',
          )}>
            {bot.channel_type === 'telegram'
              ? <Send size={18} className="text-blue-500" />
              : <MessageSquare size={18} className="text-purple-500" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{bot.name}</h3>
            <span className={clsx(
              'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
              bot.channel_type === 'telegram'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
            )}>
              {bot.channel_type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={toggleEnabled} title={bot.enabled ? 'Disable bot' : 'Enable bot'}>
            {bot.enabled
              ? <ToggleRight size={22} className="text-indigo-500" />
              : <ToggleLeft  size={22} className="text-gray-400" />}
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Webhook URL */}
      <div>
        <label className="label">
          {bot.channel_type === 'telegram' ? 'Webhook URL' : 'Events URL'}
        </label>
        <div className="flex items-center gap-2">
          <input readOnly className="input flex-1 font-mono text-xs" value={webhookUrl} />
          <CopyButton text={webhookUrl} />
        </div>
        {bot.channel_type === 'telegram' && (
          <p className="mt-1 text-xs text-gray-400">Register with BotFather using <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">/setwebhook</code></p>
        )}
        {bot.channel_type === 'slack' && (
          <p className="mt-1 text-xs text-gray-400">Set this as your Slack app's Event Subscriptions URL</p>
        )}
      </div>

      <div className="divider" />

      {/* Channel mappings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Channel → Workflow Mappings
          </p>
          <button
            onClick={() => setShowAddMap(v => !v)}
            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 font-semibold"
          >
            <Plus size={12} /> Add
          </button>
        </div>

        {/* Add mapping inline form */}
        {showAddMap && (
          <div className="mb-3 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/10 space-y-2">
            {bot.channel_type === 'telegram' ? (
              <input className="input text-sm" placeholder="Chat ID (e.g. -625882718)" value={mapChatId} onChange={e => setMapChatId(e.target.value)} />
            ) : (
              <div className="flex gap-2">
                <input className="input text-sm flex-1" placeholder="Channel ID (C…)" value={mapChannel} onChange={e => setMapChannel(e.target.value)} />
                <input className="input text-sm flex-1" placeholder="#channel-name" value={mapChanName} onChange={e => setMapChanName(e.target.value)} />
              </div>
            )}
            <select className="input text-sm" value={mapWorkflow} onChange={e => setMapWorkflow(e.target.value)}>
              <option value="">Select workflow…</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowAddMap(false)} className="btn-secondary text-xs py-1.5">Cancel</button>
              <button onClick={handleAddMap} disabled={mapSaving} className="btn-primary text-xs py-1.5 flex-1">
                {mapSaving ? 'Adding…' : 'Add Mapping'}
              </button>
            </div>
          </div>
        )}

        {loadingMaps ? (
          <p className="text-xs text-gray-400 py-2 text-center">Loading…</p>
        ) : bot.channel_type === 'telegram' ? (
          tgMappings.length === 0
            ? <p className="text-xs text-gray-400 py-2 text-center">No mappings yet — add one above</p>
            : tgMappings.map(m => (
              <div key={m.chat_id} className="flex items-center gap-2 py-1.5 text-xs">
                <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{m.chat_id}</code>
                <ChevronRight size={10} className="text-gray-400 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
                  {workflows.find(w => w.id === String(m.workflow_id))?.name ?? m.workflow_id}
                </span>
                {m.username && <span className="text-gray-400 shrink-0">{m.username}</span>}
                <button onClick={() => handleRemoveTg(m.chat_id)} className="p-0.5 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={11} /></button>
              </div>
            ))
        ) : (
          slMappings.length === 0
            ? <p className="text-xs text-gray-400 py-2 text-center">No mappings yet — add one above</p>
            : slMappings.map(m => (
              <div key={m.id} className="flex items-center gap-2 py-1.5 text-xs">
                <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{m.channel_id}</code>
                {m.channel_name && <span className="text-gray-400 shrink-0">({m.channel_name})</span>}
                <ChevronRight size={10} className="text-gray-400 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
                  {workflows.find(w => w.id === String(m.workflow_id))?.name ?? m.workflow_id}
                </span>
                <button onClick={() => handleRemoveSl(m.id)} className="p-0.5 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={11} /></button>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const [bots,      setBots]      = useState<ChannelBot[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    Promise.all([listBots(), listWorkflows()])
      .then(([b, w]) => { setBots(b); setWorkflows(w) })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="animate-fade-in space-y-8 max-w-3xl">
      {showWizard && (
        <AddBotWizard
          workflows={workflows}
          onClose={() => setShowWizard(false)}
          onCreated={bot => setBots(prev => [...prev, bot])}
        />
      )}

      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure bots, integrations, and observability.</p>
      </div>

      {/* ── Bots & Integrations ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Bot size={16} className="text-indigo-500" /> Bots &amp; Integrations
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Configure named Telegram / Slack bots. Anyone can chat with a bot once mapped to a workflow.
            </p>
          </div>
          <button className="btn-primary text-sm" onClick={() => setShowWizard(true)}>
            <Plus size={15} /> Add Bot
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="card p-8 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
              <Bot size={26} className="text-indigo-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No bots configured yet</p>
            <p className="text-xs text-gray-400 max-w-xs">
              Add a Telegram or Slack bot, enter its token, register the webhook URL,
              then map chats/channels to workflows. End users just chat naturally.
            </p>
            <button className="btn-primary text-sm mt-1" onClick={() => setShowWizard(true)}>
              <Plus size={14} /> Add your first bot
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {bots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                workflows={workflows}
                onUpdated={updated => setBots(prev => prev.map(b => b.id === updated.id ? updated : b))}
                onDeleted={id => setBots(prev => prev.filter(b => b.id !== id))}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Observability links ──────────────────────────────────────────── */}
      <section className="card p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Observability</h2>
        <div className="divider" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Grafana',     url: 'http://localhost:3001',  desc: 'Dashboards & metrics' },
            { label: 'Jaeger',      url: 'http://localhost:16686', desc: 'Distributed traces'   },
            { label: 'Prometheus',  url: 'http://localhost:9090',  desc: 'Raw metrics query'    },
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
    </div>
  )
}
