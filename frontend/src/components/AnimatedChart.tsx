import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

interface LineProps { data: Record<string, unknown>[]; dataKey: string; xKey?: string; color?: string; label?: string }
interface BarProps  { data: Record<string, unknown>[]; dataKey: string; xKey?: string; color?: string }
interface PieProps  { data: { name: string; value: number }[] }

export function LineChartWidget({ data, dataKey, xKey = 'name', color = '#6366f1', label }: LineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: 'var(--tw-bg,#fff)', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} name={label ?? dataKey} isAnimationActive animationDuration={600} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function BarChartWidget({ data, dataKey, xKey = 'name', color = '#6366f1' }: BarProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function PieChartWidget({ data }: PieProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
          dataKey="value" isAnimationActive animationDuration={600}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
