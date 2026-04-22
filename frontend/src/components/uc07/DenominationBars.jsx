import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  gold: '#d4a853',
  teal: '#2dd4bf',
  red: '#ef4444',
  green: '#10b981',
  text: '#e8eaed',
  textSecondary: '#9ca3af',
  font: "'JetBrains Mono', monospace",
}

const DENOM_COLORS = {
  '5000': '#d4a853',
  '1000': '#2dd4bf',
  '500': '#3b82f6',
  '100': '#10b981',
  '50': '#f59e0b',
  '20': '#a855f7',
  '10': '#ec4899',
}

const DENOMINATIONS = ['5000', '1000', '500', '100', '50', '20', '10']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '12px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.gold, fontWeight: 700, marginBottom: '8px' }}>
        {label}
      </div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
          <span style={{ color: entry.color }}>Rs.{entry.name}</span>
          <span style={{ color: theme.text }}>{entry.value?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function DenominationBars({ current, optimal }) {
  const hasCurrent = current && Object.keys(current).length > 0
  const hasOptimal = optimal && Object.keys(optimal).length > 0

  if (!hasCurrent && !hasOptimal) {
    return (
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        color: theme.textSecondary,
        fontSize: '12px',
        fontFamily: theme.font,
      }}>
        No denomination data available
      </div>
    )
  }

  const chartData = []
  if (hasCurrent) {
    const row = { name: 'Current' }
    DENOMINATIONS.forEach(d => { row[d] = current[d] || current[`Rs${d}`] || 0 })
    chartData.push(row)
  }
  if (hasOptimal) {
    const row = { name: 'Optimal' }
    DENOMINATIONS.forEach(d => { row[d] = optimal[d] || optimal[`Rs${d}`] || 0 })
    chartData.push(row)
  }

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '20px',
    }}>
      <div style={{
        color: theme.text,
        fontSize: '14px',
        fontWeight: 700,
        fontFamily: theme.font,
        marginBottom: '16px',
      }}>
        DENOMINATION ALLOCATION — CURRENT vs OPTIMAL
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
          <XAxis
            dataKey="name"
            tick={{ fill: theme.textSecondary, fontSize: 11, fontFamily: theme.font }}
          />
          <YAxis
            tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: '% of Total Value', angle: -90, position: 'insideLeft', fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: theme.font, fontSize: '10px' }}
            formatter={(value) => <span style={{ color: theme.textSecondary }}>Rs.{value}</span>}
          />
          {DENOMINATIONS.map(d => (
            <Bar key={d} dataKey={d} stackId="a" fill={DENOM_COLORS[d]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        marginTop: '8px',
        flexWrap: 'wrap',
      }}>
        {DENOMINATIONS.map(d => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: DENOM_COLORS[d] }} />
            <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font }}>
              Rs.{d}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
