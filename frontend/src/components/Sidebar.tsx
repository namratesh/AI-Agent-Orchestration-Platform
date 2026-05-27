import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Bot, GitBranch, Play, FileText, History, Settings, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../store'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/agents',    icon: Bot,             label: 'Agents'      },
  { to: '/workflows', icon: GitBranch,       label: 'Workflows'   },
  { to: '/executor',  icon: Play,            label: 'Executor'    },
  { to: '/history',   icon: History,         label: 'History'     },
  { to: '/logs',      icon: FileText,        label: 'Live Logs'   },
  { to: '/settings',  icon: Settings,        label: 'Settings'    },
]

export default function Sidebar() {
  const collapsed = useAppStore(s => s.sidebarCollapsed)

  return (
    <aside className={clsx(
      'fixed top-0 left-0 z-50 h-full flex flex-col bg-gray-900 dark:bg-gray-950 text-white border-r border-gray-800 dark:border-gray-800',
      'transition-all duration-300 ease-in-out',
      collapsed ? 'w-16' : 'w-60',
    )}>
      {/* Logo */}
      <div className={clsx(
        'flex items-center gap-3 px-4 border-b border-gray-800 shrink-0',
        'h-[60px]',
      )}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <p className="text-sm font-bold leading-tight truncate">AI Orchestration</p>
            <p className="text-xs text-gray-400 truncate">Platform v2</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800',
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate animate-fade-in">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={clsx(
        'shrink-0 px-2 py-3 border-t border-gray-800',
        'flex items-center',
        collapsed ? 'justify-center' : 'gap-3 px-4',
      )}>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
          A
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <p className="text-xs font-medium text-gray-200 truncate">Admin</p>
            <p className="text-xs text-gray-500 truncate">admin@platform.ai</p>
          </div>
        )}
      </div>
    </aside>
  )
}
