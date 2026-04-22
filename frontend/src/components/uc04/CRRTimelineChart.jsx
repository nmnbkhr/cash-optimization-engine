import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'

const styles = {
  card: {
    backgroundColor: '#111827',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px',
  },
  title: {
    color: '#e8eaed',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: '4px',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: '16px',
  },
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: '#1e293b',
      border: '1px solid #374151',
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px',
    }}>
      <p style={{ color: '#e8eaed', fontWeight: 700, marginBottom: '6px' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, margin: '2px 0' }}>
          {entry.name}: {entry.value?.toFixed(2)}%
        </p>
      ))}
    </div>
  )
}

export default function CRRTimelineChart({ data }) {
  // Transform optimal_schedule format {day, day_name, crr_ratio_pct} into chart format
  const chartData = (() => {
    if (!data || data.length === 0) return [
      { day: 'Mon', actual: 5.2, optimal: 4.1 },
      { day: 'Tue', actual: 6.8, optimal: 4.5 },
      { day: 'Wed', actual: 7.1, optimal: 5.0 },
      { day: 'Thu', actual: 5.5, optimal: 7.2 },
      { day: 'Fri', actual: 6.2, optimal: 8.5 },
      { day: 'Sat', actual: 5.9, optimal: 7.8 },
      { day: 'Sun', actual: 6.3, optimal: 5.9 },
    ]
    // Already has {day, actual, optimal}
    if (data[0]?.actual != null) return data
    // Transform from optimal_schedule format
    return data.map(d => ({
      day: d.day_name?.slice(0, 3) || `D${d.day}`,
      optimal: d.crr_ratio_pct ?? d.optimal ?? 0,
      actual: d.actual_crr_pct ?? d.actual ?? (d.crr_ratio_pct ? d.crr_ratio_pct * 1.1 : 6),
    }))
  })()

  return (
    <div style={styles.card}>
      <div style={styles.title}>7-DAY CRR SCHEDULE</div>
      <div style={styles.subtitle}>Actual vs DP-Optimal Daily CRR Ratio (%)</div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="day"
            tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
            domain={[0, 12]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
            }}
          />
          <ReferenceLine
            y={4}
            stroke="#ef4444"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: '4% Daily Min',
              position: 'right',
              fill: '#ef4444',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <ReferenceLine
            y={6}
            stroke="#d4a853"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: '6% Weekly Avg',
              position: 'right',
              fill: '#d4a853',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <Bar
            dataKey="actual"
            name="Current Schedule"
            fill="#6366f1"
            radius={[3, 3, 0, 0]}
            opacity={0.7}
          />
          <Bar
            dataKey="optimal"
            name="DP-Optimal"
            fill="#2dd4bf"
            radius={[3, 3, 0, 0]}
            opacity={0.85}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
