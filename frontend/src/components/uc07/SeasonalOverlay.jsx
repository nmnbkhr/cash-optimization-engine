import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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

const DENOMINATIONS = ['Rs5000', 'Rs1000', 'Rs500', 'Rs100', 'Rs50', 'Rs20', 'Rs10']

const DEFAULT_DATA = [
  { denomination: 'Rs5000', normal: 35, eid: 50, ramadan: 42 },
  { denomination: 'Rs1000', normal: 25, eid: 22, ramadan: 28 },
  { denomination: 'Rs500',  normal: 18, eid: 12, ramadan: 14 },
  { denomination: 'Rs100',  normal: 10, eid: 8,  ramadan: 8 },
  { denomination: 'Rs50',   normal: 6,  eid: 4,  ramadan: 4 },
  { denomination: 'Rs20',   normal: 4,  eid: 2,  ramadan: 2 },
  { denomination: 'Rs10',   normal: 2,  eid: 2,  ramadan: 2 },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '10px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.gold, fontWeight: 700, marginBottom: '6px' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '2px' }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ color: theme.text }}>{p.value}%</span>
        </div>
      ))}
    </div>
  )
}

export default function SeasonalOverlay({ data }) {
  const chartData = data && data.length ? data : DEFAULT_DATA

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
        SEASONAL DEMAND PROFILE — DENOMINATION MIX
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke={theme.border} />
          <PolarAngleAxis
            dataKey="denomination"
            tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 'auto']}
            tick={{ fill: theme.textSecondary, fontSize: 9, fontFamily: theme.font }}
            tickFormatter={(v) => `${v}%`}
          />
          <Radar
            name="Normal"
            dataKey="normal"
            stroke={theme.teal}
            fill={theme.teal}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Radar
            name="Eid"
            dataKey="eid"
            stroke={theme.gold}
            fill={theme.gold}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Radar
            name="Ramadan"
            dataKey="ramadan"
            stroke={theme.green}
            fill={theme.green}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: theme.font, fontSize: '11px' }}
            formatter={(value) => <span style={{ color: theme.textSecondary }}>{value}</span>}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
