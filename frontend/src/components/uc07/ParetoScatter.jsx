import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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

function getColorForSortingTime(val, min, max) {
  if (min === max) return theme.teal
  const ratio = (val - min) / (max - min)
  if (ratio < 0.33) return theme.green
  if (ratio < 0.66) return '#f59e0b'
  return theme.red
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '12px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.gold, fontWeight: 700, marginBottom: '6px' }}>
        {d.label || `Solution ${d.index + 1}`}
        {d.is_knee && ' (RECOMMENDED)'}
      </div>
      <div style={{ color: theme.text, marginBottom: '3px' }}>
        Mismatch Cost: <span style={{ color: theme.teal }}>{(d.mismatch_cost / 1e6).toFixed(1)}M</span>
      </div>
      <div style={{ color: theme.text, marginBottom: '3px' }}>
        Penalty Risk: <span style={{ color: theme.red }}>{(d.penalty_risk / 1e6).toFixed(1)}M</span>
      </div>
      <div style={{ color: theme.text, marginBottom: '3px' }}>
        Sorting Time: <span style={{ color: '#f59e0b' }}>{d.sorting_time?.toFixed(1)}h</span>
      </div>
      {d.allocation && (
        <div style={{ color: theme.textSecondary, marginTop: '6px', fontSize: '10px' }}>
          {Object.entries(d.allocation).map(([k, v]) => (
            <div key={k}>{k}: {typeof v === 'number' ? v.toFixed(1) + '%' : (typeof v === 'object' && v !== null ? JSON.stringify(v) : v)}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ParetoScatter({ data }) {
  if (!data || !data.length) {
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
        Run NSGA-II Optimizer to see Pareto frontier
      </div>
    )
  }

  const sortingTimes = data.map(d => d.sorting_time || 0)
  const minST = Math.min(...sortingTimes)
  const maxST = Math.max(...sortingTimes)

  const chartData = data.map((d, i) => ({
    ...d,
    index: i,
    mismatch_cost: d.mismatch_cost || 0,
    penalty_risk: d.penalty_risk || 0,
    sorting_time: d.sorting_time || 0,
  }))

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '20px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{
          color: theme.text,
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: theme.font,
        }}>
          PARETO FRONTIER — NSGA-II SOLUTIONS
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', fontFamily: theme.font }}>
          <span style={{ color: theme.green }}>Low Sort Time</span>
          <span style={{ color: '#f59e0b' }}>Medium</span>
          <span style={{ color: theme.red }}>High Sort Time</span>
          <span style={{ color: theme.gold }}>Recommended (Knee)</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
          <XAxis
            dataKey="mismatch_cost"
            name="Mismatch Cost"
            type="number"
            tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
            tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`}
            label={{ value: 'Mismatch Cost (PKR)', position: 'bottom', offset: 5, fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
          />
          <YAxis
            dataKey="penalty_risk"
            name="Penalty Risk"
            type="number"
            tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
            tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`}
            label={{ value: 'Penalty Risk (PKR)', angle: -90, position: 'insideLeft', offset: 0, fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
          />
          <ZAxis dataKey="sorting_time" range={[60, 200]} name="Sorting Time" />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={chartData} shape="circle">
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.is_knee ? theme.gold : getColorForSortingTime(entry.sorting_time, minST, maxST)}
                stroke={entry.is_knee ? theme.gold : 'none'}
                strokeWidth={entry.is_knee ? 3 : 0}
                r={entry.is_knee ? 8 : 5}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
