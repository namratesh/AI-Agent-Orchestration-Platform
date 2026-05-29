import { Trash2, Bot, Zap } from 'lucide-react'
import type { Agent } from '../types'

const PROVIDER_COLORS: Record<string, string> = {
  openrouter: 'badge-indigo',
  openai:     'badge-green',
  groq:       'badge-amber',
  ollama:     'badge-gray',
}

interface Props {
  agent: Agent
  onDelete: (id: string) => void
  selected?: boolean
  onClick?: () => void
}

function promptSnippet(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  return cleaned.length > 90 ? cleaned.slice(0, 87) + '…' : cleaned
}

export default function AgentCard({ agent, onDelete, selected, onClick }: Props) {
  const snippet = agent.system_prompt ? promptSnippet(agent.system_prompt) : ''

  return (
    <div
      onClick={onClick}
      className={`card p-4 transition-all duration-200 hover:shadow-card-hover group ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${selected ? 'ring-2 ring-primary-500' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 shrink-0">
          <Bot size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{agent.name}</h3>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(agent.id) }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="Delete agent"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{agent.role}</p>
          {snippet && (
            <p
              className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 leading-relaxed line-clamp-2 cursor-default"
              title={agent.system_prompt}
            >
              {snippet}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={PROVIDER_COLORS[agent.provider] ?? 'badge-gray'}>{agent.provider}</span>
            {agent.tools.map(t => (
              <span key={t} className="badge badge-green">
                <Zap size={10} />{t}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{agent.model}</p>
        </div>
      </div>
    </div>
  )
}
