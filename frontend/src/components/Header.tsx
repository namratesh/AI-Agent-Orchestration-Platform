import { useState, useRef, useEffect } from 'react'
import { Menu, Sun, Moon, Activity, Search, X, Bot, GitBranch, Wrench } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAppStore } from '../store'
import { useLocation, useNavigate } from 'react-router-dom'
import { listAgents, listWorkflows, listTools } from '../api'
import type { Agent, Workflow, Tool } from '../types'
import clsx from 'clsx'

const BREADCRUMBS: Record<string, string> = {
  '/':          'Dashboard',
  '/dashboard': 'Dashboard',
  '/agents':    'Agents',
  '/tools':     'Tools',
  '/workspace': 'Workspace',
  '/workflows': 'Workflows',
  '/executor':  'Executor',
  '/logs':      'Live Logs',
  '/history':   'Execution History',
  '/settings':  'Settings',
}

export default function Header() {
  const { toggle, isDark } = useTheme()
  const { toggleSidebar, sidebarCollapsed } = useAppStore(s => ({ toggleSidebar: s.toggleSidebar, sidebarCollapsed: s.sidebarCollapsed }))
  const location = useLocation()
  const navigate = useNavigate()
  const page = BREADCRUMBS[location.pathname] ?? 'Platform'

  const [query, setQuery]         = useState('')
  const [open, setOpen]           = useState(false)
  const [agents, setAgents]       = useState<Agent[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [tools, setTools]         = useState<Tool[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    Promise.all([listAgents(), listWorkflows(), listTools()])
      .then(([a, w, t]) => { setAgents(a); setWorkflows(w); setTools(t) })
      .catch(() => {})
  }, [open])

  const q = query.toLowerCase()
  const filteredAgents    = agents.filter(a => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q))
  const filteredWorkflows = workflows.filter(w => w.name.toLowerCase().includes(q))
  const filteredTools     = tools.filter(t => t.name.toLowerCase().includes(q))
  const hasResults = filteredAgents.length + filteredWorkflows.length + filteredTools.length > 0

  const go = (path: string) => { navigate(path); setOpen(false); setQuery('') }

  return (
    <>
      <header
        className="fixed top-0 right-0 z-40 h-[60px] glass border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 transition-all duration-300"
        style={{ left: sidebarCollapsed ? '64px' : '240px' }}
      >
        <button
          onClick={toggleSidebar}
          className="btn-ghost p-2 rounded-lg text-gray-500 dark:text-gray-400 shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-1 min-w-0 shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Platform</span>
          <span className="text-xs text-gray-300 dark:text-gray-600 hidden sm:block">/</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{page}</span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-sm hidden md:block relative">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              className="input pl-9 pr-8 py-1.5 text-xs w-full"
              placeholder="Search agents, tools, workflows…"
            />
            {query && (
              <button onClick={() => { setQuery(''); inputRef.current?.focus() }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Dropdown results */}
          {open && query && (
            <div className="absolute top-full mt-2 left-0 right-0 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-72 overflow-y-auto">
              {!hasResults ? (
                <p className="text-xs text-gray-400 text-center py-6">No results for "{query}"</p>
              ) : (
                <>
                  {filteredAgents.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2.5 pb-1">Agents</p>
                      {filteredAgents.slice(0, 4).map(a => (
                        <button key={a.id} onClick={() => go('/agents')}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left">
                          <Bot size={13} className="text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{a.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{a.role} · {a.provider}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredTools.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2.5 pb-1">Tools</p>
                      {filteredTools.slice(0, 4).map(t => (
                        <button key={t.id} onClick={() => go('/tools')}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left">
                          <Wrench size={13} className="text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{t.method} · {t.description || t.url}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredWorkflows.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2.5 pb-1">Workflows</p>
                      {filteredWorkflows.slice(0, 4).map(w => (
                        <button key={w.id} onClick={() => go('/workflows')}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left">
                          <GitBranch size={13} className="text-purple-400 shrink-0" />
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{w.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <Activity size={11} className="text-emerald-500 animate-pulse-slow" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Operational</span>
          </div>

          <button
            onClick={toggle}
            className="btn-ghost p-2 rounded-lg text-gray-500 dark:text-gray-400"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            AI
          </div>
        </div>
      </header>

      {/* Backdrop to close search */}
      {open && query && (
        <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery('') }} />
      )}
    </>
  )
}
