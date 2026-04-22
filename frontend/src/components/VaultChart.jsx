import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import useAppStore from '../stores/appStore'
import { formatYAxis } from '../utils/formatPKR'

export default function VaultChart() {
  const branches = useAppStore((s) => s.branches)

  // Sort by idle_cash descending, take top 15
  const sortedBranches = [...branches]
    .filter((b) => b.current_balance != null || b.idle_cash != null)
    .sort((a, b) => (b.idle_cash || 0) - (a.idle_cash || 0))
    .slice(0, 15)

  const data = sortedBranches.map((b) => {
    const total = b.current_balance || 0
    const idle = b.idle_cash || 0
    const productive = Math.max(0, total - idle)
    // Truncate name to 12 chars
    const name = (b.name || b.branch_id || '').length > 12
      ? (b.name || b.branch_id || '').slice(0, 12) + '...'
      : (b.name || b.branch_id || '')
    return { name, productive, idle }
  })

  if (data.length === 0) {
    return (
      <div
        className="rounded-lg border p-8 flex items-center justify-center"
        style={{
          backgroundColor: '#141a23',
          borderColor: '#1e293b',
          minHeight: 300,
        }}
      >
        <p className="text-sm" style={{ color: '#6b7280' }}>
          No vault utilization data available
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: '#e8eaed' }}>
        Top 15 Branches — Vault Utilization
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#8b949e', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
            stroke="#1e293b"
            tickLine={false}
            angle={-35}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
            stroke="#1e293b"
            tickFormatter={formatYAxis}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#141a23',
              border: '1px solid #1e293b',
              borderRadius: 8,
              fontSize: 11,
              color: '#e8eaed',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            formatter={(value, name) => [`PKR ${formatYAxis(value)}`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}
          />
          <Bar
            dataKey="productive"
            stackId="vault"
            fill="#22c55e"
            name="Productive"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="idle"
            stackId="vault"
            fill="#ef4444"
            name="Idle"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
