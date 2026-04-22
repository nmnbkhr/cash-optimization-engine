import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { TrendingUp } from 'lucide-react'

// UC09 values are in raw PKR (not millions) — use direct formatter
function formatRawPKR(val) {
  if (val == null || isNaN(val)) return '--'
  const abs = Math.abs(val)
  if (abs >= 1e12) return `${(val / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}K`
  return val.toFixed(0)
}

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  gold: '#d4a853',
  teal: '#2dd4bf',
  green: '#10b981',
  purple: '#a855f7',
  red: '#ef4444',
  text: '#e8eaed',
  textSecondary: '#9ca3af',
  font: "'JetBrains Mono', monospace",
}

const SEGMENT_COLORS = ['#06b6d4', '#a855f7', '#10b981', '#d4a853', '#ef4444']

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  fontFamily: theme.font,
  color: theme.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: `1px solid ${theme.border}`,
}

const tdStyle = {
  padding: '8px 12px',
  fontSize: '11px',
  fontFamily: theme.font,
  color: theme.text,
  borderBottom: `1px solid ${theme.border}`,
}

export default function ROICalculator({ data }) {
  const segments = data?.segments || data?.segment_roi || data?.roi_by_segment || (Array.isArray(data) ? data : [])
  const totals = data?.totals || {
    incentive_cost: data?.total_annual_cost_pkr,
    digital_savings: data?.total_annual_value_pkr,
    roi_pct: data?.overall_roi_pct,
  }

  const chartData = segments.map((seg, i) => ({
    name: seg.segment || seg.name || `Segment ${i + 1}`,
    cost: (seg.incentive_cost ?? seg.annual_incentive_cost_pkr ?? 0) / 1e6,
    savings: (seg.digital_savings ?? seg.total_annual_value_pkr ?? 0) / 1e6,
    net: (seg.net_benefit ?? ((seg.total_annual_value_pkr ?? 0) - (seg.annual_incentive_cost_pkr ?? 0))) / 1e6,
    roi: seg.roi_pct || 0,
  }))

  return (
    <div style={{
      backgroundColor: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: '8px', padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <TrendingUp size={16} style={{ color: theme.green }} />
        <span style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
          ROI ANALYSIS
        </span>
      </div>

      {/* ROI Table */}
      <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          backgroundColor: theme.bg, borderRadius: '6px',
        }}>
          <thead>
            <tr>
              <th style={thStyle}>Segment</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Incentive Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Digital Savings</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Net Benefit</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>ROI %</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg, i) => {
              const roiPct = seg.roi_pct || 0
              return (
                <tr key={i} style={{ transition: 'background-color 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.card}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '2px',
                        backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                      }} />
                      {seg.segment || seg.name || `Segment ${i + 1}`}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: theme.red }}>
                    {formatRawPKR(seg.incentive_cost ?? seg.annual_incentive_cost_pkr ?? 0)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: theme.green }}>
                    {formatRawPKR(seg.digital_savings ?? seg.total_annual_value_pkr ?? 0)}
                  </td>
                  <td style={{
                    ...tdStyle, textAlign: 'right',
                    color: ((seg.net_benefit ?? ((seg.total_annual_value_pkr ?? 0) - (seg.annual_incentive_cost_pkr ?? 0))) || 0) >= 0 ? theme.green : theme.red,
                    fontWeight: 700,
                  }}>
                    {formatRawPKR(seg.net_benefit ?? ((seg.total_annual_value_pkr ?? 0) - (seg.annual_incentive_cost_pkr ?? 0)))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                      fontSize: '10px', fontWeight: 700,
                      backgroundColor: roiPct >= 100 ? theme.green + '20' : roiPct >= 50 ? theme.gold + '20' : theme.red + '20',
                      color: roiPct >= 100 ? theme.green : roiPct >= 50 ? theme.gold : theme.red,
                      border: `1px solid ${roiPct >= 100 ? theme.green : roiPct >= 50 ? theme.gold : theme.red}40`,
                    }}>
                      {roiPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            {(totals.incentive_cost != null || segments.length > 0) && (
              <tr style={{ backgroundColor: theme.card }}>
                <td style={{ ...tdStyle, fontWeight: 700, borderBottom: 'none' }}>
                  TOTAL
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: theme.red, borderBottom: 'none' }}>
                  {formatRawPKR(totals.incentive_cost ?? segments.reduce((sum, s) => sum + (s.incentive_cost ?? s.annual_incentive_cost_pkr ?? 0), 0))}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: theme.green, borderBottom: 'none' }}>
                  {formatRawPKR(totals.digital_savings ?? segments.reduce((sum, s) => sum + (s.digital_savings ?? s.total_annual_value_pkr ?? 0), 0))}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: theme.green, borderBottom: 'none' }}>
                  {formatRawPKR((() => {
                    const totalCost = totals.incentive_cost ?? segments.reduce((sum, s) => sum + (s.incentive_cost ?? s.annual_incentive_cost_pkr ?? 0), 0)
                    const totalVal = totals.digital_savings ?? segments.reduce((sum, s) => sum + (s.digital_savings ?? s.total_annual_value_pkr ?? 0), 0)
                    return totalVal - totalCost
                  })())}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, borderBottom: 'none' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: '4px',
                    fontSize: '11px', fontWeight: 700,
                    backgroundColor: theme.cyan + '20', color: theme.cyan,
                    border: `1px solid ${theme.cyan}40`,
                  }}>
                    {(totals.roi_pct != null ? totals.roi_pct : (() => {
                      const totalCost = segments.reduce((sum, s) => sum + (s.incentive_cost ?? s.annual_incentive_cost_pkr ?? 0), 0)
                      const totalVal = segments.reduce((sum, s) => sum + (s.digital_savings ?? s.total_annual_value_pkr ?? 0), 0)
                      return totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0
                    })()).toFixed(1)}%
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ROI Chart */}
      {chartData.length > 0 && (
        <div style={{ height: '280px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
              <XAxis
                dataKey="name"
                tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
                axisLine={{ stroke: theme.border }}
              />
              <YAxis
                tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
                axisLine={{ stroke: theme.border }}
                label={{ value: 'M PKR', angle: -90, position: 'insideLeft', style: { fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme.card, border: `1px solid ${theme.border}`,
                  borderRadius: '6px', fontFamily: theme.font, fontSize: '11px',
                }}
                labelStyle={{ color: theme.text, fontWeight: 700 }}
                formatter={(val, name) => [`${val.toFixed(1)}M PKR`, name]}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px', fontFamily: theme.font }}
                iconSize={8}
              />
              <Bar dataKey="cost" name="Incentive Cost" fill={theme.red} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
              <Bar dataKey="savings" name="Digital Savings" fill={theme.green} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Net Benefit" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.net >= 0 ? theme.cyan : theme.red} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
