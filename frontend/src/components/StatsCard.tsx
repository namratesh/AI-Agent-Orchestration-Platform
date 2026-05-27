import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  label: string
  value: string | number
  icon: ReactNode
  iconBg?: string
  change?: number
  suffix?: string
  loading?: boolean
}

export default function StatsCard({ label, value, icon, iconBg = 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400', change, suffix, loading }: Props) {
  return (
    <div className="card p-5 animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {value}{suffix && <span className="text-lg font-medium text-gray-500 ml-1">{suffix}</span>}
            </p>
          )}
        </div>
        <div className={clsx('p-3 rounded-xl', iconBg)}>{icon}</div>
      </div>
      {change !== undefined && !loading && (
        <div className={clsx('mt-3 flex items-center gap-1 text-xs font-medium', change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{Math.abs(change)}% vs last period</span>
        </div>
      )}
    </div>
  )
}
