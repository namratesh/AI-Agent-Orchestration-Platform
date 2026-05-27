import { Menu, Sun, Moon, Activity, Search } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAppStore } from '../store'
import { useLocation } from 'react-router-dom'

const BREADCRUMBS: Record<string, string> = {
  '/':          'Dashboard',
  '/dashboard': 'Dashboard',
  '/agents':    'Agents',
  '/workflows': 'Workflow Builder',
  '/executor':  'Workflow Executor',
  '/logs':      'Live Logs',
  '/history':   'Execution History',
  '/settings':  'Settings',
}

export default function Header() {
  const { toggle, isDark } = useTheme()
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const location = useLocation()
  const page = BREADCRUMBS[location.pathname] ?? 'Platform'

  return (
    <header className="fixed top-0 right-0 left-0 z-40 h-[60px] glass border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4">
      <button
        onClick={toggleSidebar}
        className="btn-ghost p-2 rounded-lg text-gray-500 dark:text-gray-400"
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Platform</span>
        <span className="text-xs text-gray-300 dark:text-gray-600 hidden sm:block">/</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{page}</span>
      </div>

      <div className="flex-1 max-w-xs hidden md:block">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 py-1.5 text-xs"
            placeholder="Search agents, workflows…"
            readOnly
            onClick={() => {}}
          />
        </div>
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
  )
}
