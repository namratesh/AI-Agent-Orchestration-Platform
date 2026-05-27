import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, GitBranch, Play, DollarSign, Clock, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { getStats } from '../api'
import type { StatsResponse, ExecutionRecord } from '../types'
import StatsCard from '../components/StatsCard'
import { LineChartWidget } from '../components/AnimatedChart'
import { PageSpinner } from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

function fmtCost(n: number) { return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}` }
function fmtDur(s: number)  { return s < 1 ? `${(s*1000).toFixed(0)}ms` : `${s.toFixed(1)}s` }
function fmtTime(ts: string) {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)   return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  return `${Math.floor(diff/3600)}h ago`
}

function buildCostChartData(executions: ExecutionRecord[]) {
  const map: Record<string, number> = {}
  const now = Date.now()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    const key = d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    map[key] = 0
  }
  executions.forEach(e => {
    const key = new Date(e.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    if (key in map) map[key] = (map[key] ?? 0) + e.cost
  })
  return Object.entries(map).map(([name, cost]) => ({ name, cost: Number(cost.toFixed(4)) }))
}

export default function Dashboard() {
  const [stats, setStats]   = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => toast.error('Failed to load stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  const chartData = buildCostChartData(stats?.recent_executions ?? [])

  return (
    <div className="animate-fade-in space-y-6">
      {/* Hero */}
      <div className="page-header">
        <h1 className="page-title">Welcome back 👋</h1>
        <p className="page-subtitle">Here's what's happening on your AI orchestration platform.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Total Agents"
          value={stats?.total_agents ?? 0}
          icon={<Bot size={20} />}
          iconBg="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
          loading={loading}
        />
        <StatsCard
          label="Total Workflows"
          value={stats?.total_workflows ?? 0}
          icon={<GitBranch size={20} />}
          iconBg="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
          loading={loading}
        />
        <StatsCard
          label="Executions Today"
          value={stats?.executions_today ?? 0}
          icon={<Play size={20} />}
          iconBg="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          loading={loading}
        />
        <StatsCard
          label="Cost This Month"
          value={fmtCost(stats?.cost_this_month ?? 0)}
          icon={<DollarSign size={20} />}
          iconBg="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
          loading={loading}
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Quick Start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Create Agent',     sub: 'Configure a new AI agent',     to: '/agents',    color: 'from-primary-500 to-primary-700',   icon: <Bot size={20} /> },
            { label: 'Build Workflow',   sub: 'Design a multi-agent pipeline', to: '/workflows', color: 'from-emerald-500 to-emerald-700',   icon: <GitBranch size={20} /> },
            { label: 'Execute Now',      sub: 'Run a workflow immediately',    to: '/executor',  color: 'from-amber-500 to-orange-600',      icon: <Play size={20} /> },
          ].map(({ label, sub, to, color, icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={`group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br ${color} text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left`}
            >
              <div className="p-2 bg-white/20 rounded-lg">{icon}</div>
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-white/70">{sub}</p>
              </div>
              <ArrowRight size={16} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost trend chart */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Cost Trend (7 days)</h2>
          <div className="h-48">
            <LineChartWidget data={chartData} dataKey="cost" xKey="name" color="#6366f1" label="Cost USD" />
          </div>
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Recent Executions</h2>
            <button onClick={() => navigate('/history')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
              View all
            </button>
          </div>
          {!stats?.recent_executions?.length ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No executions yet</p>
          ) : (
            <div className="space-y-2">
              {stats.recent_executions.map(ex => (
                <div key={ex.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  {ex.status === 'success'
                    ? <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                    : <XCircle    size={16} className="text-red-500 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{ex.task}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} />{fmtDur(ex.execution_time_seconds)}
                      </span>
                      <span className="text-xs text-gray-400">{fmtCost(ex.cost)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{fmtTime(ex.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
