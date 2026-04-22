import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import formatPKR from '../../utils/formatPKR'

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

const formatNum = (val) => {
  if (val == null) return '--'
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(0)}K`
  return val.toFixed(0)
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.text, fontWeight: 700, marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: '2px' }}>
          {p.name}: {formatNum(p.value)}
        </div>
      ))}
    </div>
  )
}

function MetricCard({ label, currentVal, optimizedVal, unit, isCost }) {
  const diff = currentVal != null && optimizedVal != null ? currentVal - optimizedVal : null
  const pctChange = diff != null && currentVal !== 0 ? (diff / currentVal) * 100 : null
  const isBetter = isCost ? diff > 0 : diff < 0

  return (
    <div style={{
      backgroundColor: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '14px',
    }}>
      <div style={{
        color: theme.textSecondary,
        fontSize: '10px',
        fontFamily: theme.font,
        fontWeight: 600,
        textTransform: 'uppercase',
        marginBottom: '10px',
      }}>
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '4px' }}>
            CURRENT
          </div>
          <div style={{ color: theme.text, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
            {formatNum(currentVal)} <span style={{ fontSize: '10px', color: theme.textSecondary }}>{unit}</span>
          </div>
        </div>
        <div>
          <div style={{ color: theme.teal, fontSize: '9px', fontFamily: theme.font, marginBottom: '4px' }}>
            OPTIMIZED
          </div>
          <div style={{ color: theme.teal, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
            {formatNum(optimizedVal)} <span style={{ fontSize: '10px', color: theme.textSecondary }}>{unit}</span>
          </div>
        </div>
      </div>
      {pctChange != null && (
        <div style={{
          marginTop: '8px',
          padding: '4px 10px',
          borderRadius: '4px',
          display: 'inline-block',
          fontSize: '10px',
          fontWeight: 700,
          fontFamily: theme.font,
          backgroundColor: isBetter ? theme.green + '20' : theme.red + '20',
          color: isBetter ? theme.green : theme.red,
          border: `1px solid ${isBetter ? theme.green : theme.red}40`,
        }}>
          {isBetter ? 'SAVING' : 'INCREASE'}: {Math.abs(pctChange).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

export default function BeforeAfterComparison({ data }) {
  if (!data) return null

  const current = data.current || data.before || {}
  const optimized = data.optimized || data.after || {}

  const chartData = [
    {
      metric: 'Distance (km)',
      Current: current.total_distance_km || current.total_distance || 0,
      Optimized: optimized.total_distance_km || optimized.total_distance || 0,
    },
    {
      metric: 'Cost (PKR)',
      Current: (current.total_cost || 0) / 1000,
      Optimized: (optimized.total_cost || 0) / 1000,
    },
    {
      metric: 'Vehicles',
      Current: current.vehicles_used || current.total_vehicles || 0,
      Optimized: optimized.vehicles_used || optimized.total_vehicles || 0,
    },
    {
      metric: 'Avg Stops',
      Current: current.avg_stops_per_route || current.avg_stops || 0,
      Optimized: optimized.avg_stops_per_route || optimized.avg_stops || 0,
    },
  ]

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
        ROUTE COMPARISON: CURRENT vs OPTIMIZED
      </div>

      {/* Side-by-side Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <MetricCard
          label="Total Distance"
          currentVal={current.total_distance_km || current.total_distance}
          optimizedVal={optimized.total_distance_km || optimized.total_distance}
          unit="km"
          isCost={true}
        />
        <MetricCard
          label="Total Cost"
          currentVal={current.total_cost}
          optimizedVal={optimized.total_cost}
          unit="PKR"
          isCost={true}
        />
        <MetricCard
          label="Vehicles Used"
          currentVal={current.vehicles_used || current.total_vehicles}
          optimizedVal={optimized.vehicles_used || optimized.total_vehicles}
          unit=""
          isCost={true}
        />
        <MetricCard
          label="Avg Stops / Route"
          currentVal={current.avg_stops_per_route || current.avg_stops}
          optimizedVal={optimized.avg_stops_per_route || optimized.avg_stops}
          unit=""
          isCost={false}
        />
      </div>

      {/* Comparison Bar Chart */}
      <div style={{
        backgroundColor: theme.bg,
        borderRadius: '8px',
        padding: '16px',
        border: `1px solid ${theme.border}`,
      }}>
        <div style={{
          color: theme.textSecondary,
          fontSize: '10px',
          fontFamily: theme.font,
          fontWeight: 600,
          textTransform: 'uppercase',
          marginBottom: '12px',
        }}>
          Comparison Chart
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
            <XAxis
              dataKey="metric"
              tick={{ fill: theme.textSecondary, fontSize: 11, fontFamily: theme.font }}
              stroke={theme.border}
            />
            <YAxis
              tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
              stroke={theme.border}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{
                fontFamily: theme.font,
                fontSize: '11px',
                color: theme.textSecondary,
              }}
            />
            <Bar dataKey="Current" fill={theme.red + 'AA'} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Optimized" fill={theme.green} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Savings Summary */}
      {data.savings && (
        <div style={{
          marginTop: '16px',
          padding: '14px',
          backgroundColor: theme.green + '10',
          border: `1px solid ${theme.green}30`,
          borderRadius: '6px',
          display: 'flex',
          gap: '24px',
          alignItems: 'center',
        }}>
          <div style={{
            color: theme.green,
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            TOTAL SAVINGS
          </div>
          {data.savings.distance_saved_km != null && (
            <div>
              <span style={{ color: theme.green, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                {formatNum(data.savings.distance_saved_km)}
              </span>
              <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginLeft: '4px' }}>km saved</span>
            </div>
          )}
          {data.savings.cost_saved != null && (
            <div>
              <span style={{ color: theme.green, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                {formatNum(data.savings.cost_saved)}
              </span>
              <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginLeft: '4px' }}>PKR saved</span>
            </div>
          )}
          {data.savings.vehicles_saved != null && (
            <div>
              <span style={{ color: theme.green, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                {data.savings.vehicles_saved}
              </span>
              <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginLeft: '4px' }}>fewer vehicles</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
