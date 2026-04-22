import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

function UtilizationGauge({ value }) {
  const pct = value || 0
  const angle = (pct / 100) * 180
  const radians = (angle * Math.PI) / 180
  const cx = 100
  const cy = 90
  const r = 70
  const endX = cx - r * Math.cos(radians)
  const endY = cy - r * Math.sin(radians)
  const largeArc = angle > 180 ? 1 : 0
  const color = pct >= 75 ? theme.green : pct >= 50 ? theme.gold : theme.red

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="200" height="120" viewBox="0 0 200 120">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={theme.border}
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Value arc */}
        {pct > 0 && (
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
          />
        )}
        <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize="24" fontWeight="700" fontFamily="JetBrains Mono, monospace">
          {pct.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={theme.textSecondary} fontSize="10" fontFamily="JetBrains Mono, monospace">
          UTILIZATION
        </text>
      </svg>
    </div>
  )
}

export default function FleetDashboard({ data }) {
  if (!data) return null

  const vehicles = (data.vehicles || data.vehicle_stats || []).map(v => ({
    ...v,
    trips: v.trips ?? v.total_trips ?? v.trip_count ?? 0,
    distance_km: v.distance_km ?? v.total_distance_km ?? v.total_distance ?? 0,
    avg_stops: v.avg_stops ?? v.average_stops ?? 0,
    cost: v.cost ?? v.total_cost_pkr ?? v.total_cost ?? 0,
  }))
  const chartData = vehicles
    .slice(0, 20)
    .map(v => ({
      name: v.vehicle_id || v.id || v.name,
      trips: v.trips,
      distance: v.distance_km,
    }))
    .sort((a, b) => b.trips - a.trips)

  const summary = data.summary || {}
  const utilization = data.fleet_utilization_pct ?? data.utilization ?? summary.utilization_pct ?? 0

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
        FLEET DASHBOARD
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: '20px',
        marginBottom: '20px',
      }}>
        {/* Utilization Gauge */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg,
          borderRadius: '8px',
          padding: '16px',
          border: `1px solid ${theme.border}`,
        }}>
          <UtilizationGauge value={utilization} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            width: '100%',
            marginTop: '12px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: theme.teal, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
                {data.active_vehicles ?? summary.total_active_vehicles ?? vehicles.filter(v => v.trips > 0).length}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>ACTIVE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: theme.textSecondary, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
                {data.total_vehicles ?? summary.fleet_size ?? vehicles.length}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>TOTAL</div>
            </div>
          </div>
        </div>

        {/* Bar Chart: Trips per Vehicle */}
        {chartData.length > 0 && (
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
              Trips per Vehicle (Top 20)
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: theme.textSecondary, fontSize: 9, fontFamily: theme.font }}
                  angle={-45}
                  textAnchor="end"
                  stroke={theme.border}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
                  stroke={theme.border}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="trips" name="Trips" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.trips > (chartData[0]?.trips || 0) * 0.7 ? theme.teal : theme.gold + '80'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Vehicle Stats Table */}
      {vehicles.length > 0 && (
        <div style={{
          backgroundColor: theme.bg,
          borderRadius: '8px',
          padding: '16px',
          border: `1px solid ${theme.border}`,
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          <div style={{
            color: theme.textSecondary,
            fontSize: '10px',
            fontFamily: theme.font,
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>
            Vehicle Stats
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Vehicle ID', 'Trips', 'Distance (km)', 'Avg Stops', 'Cost (PKR)', 'Status'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    color: theme.textSecondary,
                    fontSize: '10px',
                    fontFamily: theme.font,
                    fontWeight: 600,
                    borderBottom: `1px solid ${theme.border}`,
                    textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.slice(0, 30).map((v, i) => {
                const trips = v.trips
                const dist = v.distance_km
                const stops = v.avg_stops
                const cost = v.cost
                const status = trips > 0 ? 'Active' : 'Idle'
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                    <td style={{ padding: '8px 12px', color: theme.text, fontSize: '11px', fontFamily: theme.font, fontWeight: 600 }}>
                      {v.vehicle_id || v.id || `V-${i + 1}`}
                    </td>
                    <td style={{ padding: '8px 12px', color: theme.teal, fontSize: '11px', fontFamily: theme.font }}>
                      {trips}
                    </td>
                    <td style={{ padding: '8px 12px', color: theme.gold, fontSize: '11px', fontFamily: theme.font }}>
                      {dist.toFixed?.(1) || dist}
                    </td>
                    <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font }}>
                      {stops.toFixed?.(1) || stops}
                    </td>
                    <td style={{ padding: '8px 12px', color: theme.text, fontSize: '11px', fontFamily: theme.font }}>
                      {cost.toLocaleString?.() || cost}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 700,
                        fontFamily: theme.font,
                        backgroundColor: status === 'Active' ? theme.green + '20' : theme.textSecondary + '20',
                        color: status === 'Active' ? theme.green : theme.textSecondary,
                        border: `1px solid ${status === 'Active' ? theme.green : theme.textSecondary}40`,
                      }}>
                        {status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
