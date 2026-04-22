import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DollarSign } from 'lucide-react'

// UC09 budget values are in raw PKR (not millions) — use direct formatter
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

const SEGMENT_COLORS = [
  '#06b6d4', // Mass Retail
  '#10b981', // SME
  '#a855f7', // Corporate
  '#d4a853', // Premium
  '#ef4444', // Rural
  '#3b82f6', '#ec4899', '#f97316',
]

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.text, fontWeight: 700, marginBottom: '4px' }}>{d.segment}</div>
      <div style={{ color: theme.teal, marginBottom: '2px' }}>Budget: {formatRawPKR(d.amount)} PKR</div>
      <div style={{ color: theme.gold, marginBottom: '2px' }}>Share: {d.pct?.toFixed(1)}%</div>
      {d.best_incentive && (
        <div style={{ color: theme.cyan, marginBottom: '2px' }}>Best Arm: {d.best_incentive}</div>
      )}
      {d.target_digital_pct != null && (
        <div style={{ color: theme.green }}>Target Adoption: {d.target_digital_pct}%</div>
      )}
    </div>
  )
}

export default function BudgetSankey({ data }) {
  let segments = []
  let totalBudget = 500e6
  let totalAllocated = 0

  if (data) {
    // From optimize response: budget_allocation_pkr is { segName: amount }
    if (data.budget_allocation_pkr && typeof data.budget_allocation_pkr === 'object') {
      totalBudget = data.annual_budget_pkr || 500e6
      totalAllocated = data.total_allocated_pkr || 0
      const expectedAdoption = data.expected_adoption_pct || {}
      const bestArms = data.best_arm_per_segment || {}
      segments = Object.entries(data.budget_allocation_pkr).map(([seg, amount]) => ({
        segment: seg,
        amount: amount,
        best_incentive: bestArms[seg],
        target_digital_pct: expectedAdoption[seg],
      }))
    }
    // From summary response: segment_summary array
    else if (data.segment_summary) {
      totalBudget = data.budget?.annual_budget_pkr || 500e6
      totalAllocated = data.budget?.allocated_pkr || 0
      segments = data.segment_summary.map(s => ({
        segment: s.segment,
        amount: s.budget_share_pkr || 0,
        best_incentive: s.best_incentive,
        current_digital_pct: s.current_digital_pct,
        target_digital_pct: s.target_digital_pct,
      }))
    }
  }

  if (!totalAllocated && segments.length > 0) {
    totalAllocated = segments.reduce((s, seg) => s + (seg.amount || 0), 0)
  }

  // Add percentage for each segment relative to allocated (not total budget)
  const chartData = segments
    .map(s => ({
      ...s,
      pct: totalAllocated > 0 ? (s.amount / totalAllocated) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  const utilizationPct = totalBudget > 0 ? (totalAllocated / totalBudget) * 100 : 0

  return (
    <div style={{
      backgroundColor: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: '8px', padding: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <DollarSign size={16} style={{ color: theme.gold }} />
        <span style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
          BUDGET ALLOCATION
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'baseline' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>ALLOCATED </span>
            <span style={{ color: theme.green, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
              {formatRawPKR(totalAllocated)}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>BUDGET </span>
            <span style={{ color: theme.textSecondary, fontSize: '14px', fontWeight: 600, fontFamily: theme.font }}>
              {formatRawPKR(totalBudget)}
            </span>
          </div>
        </div>
      </div>

      {/* Budget utilization bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, fontWeight: 600 }}>
            BUDGET UTILIZATION
          </span>
          <span style={{ color: theme.green, fontSize: '10px', fontFamily: theme.font, fontWeight: 700 }}>
            {utilizationPct.toFixed(2)}%
          </span>
        </div>
        <div style={{
          height: '8px', borderRadius: '4px', backgroundColor: theme.bg,
          border: `1px solid ${theme.border}`, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: '4px',
            backgroundColor: utilizationPct > 80 ? theme.red : utilizationPct > 50 ? theme.gold : theme.green,
            width: `${Math.min(utilizationPct, 100)}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {segments.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', color: theme.textSecondary,
          fontSize: '12px', fontFamily: theme.font,
        }}>
          Run Thompson Sampling to see budget allocation across segments.
        </div>
      ) : (
        <>
          {/* Horizontal bar chart */}
          <div style={{ height: Math.max(200, segments.length * 50 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
                  axisLine={{ stroke: theme.border }}
                  tickLine={false}
                  tickFormatter={(v) => formatRawPKR(v)}
                />
                <YAxis
                  type="category"
                  dataKey="segment"
                  width={100}
                  tick={{ fill: theme.textSecondary, fontSize: 11, fontFamily: theme.font }}
                  axisLine={{ stroke: theme.border }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: theme.border + '30' }} />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={28}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Segment detail cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            gap: '10px',
            marginTop: '16px',
          }}>
            {chartData.map((seg, i) => (
              <div key={seg.segment} style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                padding: '12px 14px',
                borderLeft: `3px solid ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`,
              }}>
                <div style={{
                  color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  fontSize: '11px', fontWeight: 700, fontFamily: theme.font,
                  marginBottom: '6px',
                }}>
                  {seg.segment}
                </div>
                <div style={{
                  color: theme.text, fontSize: '16px', fontWeight: 700, fontFamily: theme.font,
                }}>
                  {formatRawPKR(seg.amount)}
                </div>
                <div style={{
                  color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font,
                  marginTop: '2px',
                }}>
                  {seg.pct.toFixed(1)}% of allocation
                </div>
                {seg.best_incentive && (
                  <div style={{
                    marginTop: '6px', display: 'inline-block',
                    padding: '2px 6px', borderRadius: '3px', fontSize: '9px',
                    fontWeight: 600, fontFamily: theme.font,
                    backgroundColor: theme.cyan + '15', color: theme.cyan,
                    border: `1px solid ${theme.cyan}30`,
                  }}>
                    {seg.best_incentive}
                  </div>
                )}
                {seg.target_digital_pct != null && (
                  <div style={{
                    color: theme.green, fontSize: '9px', fontFamily: theme.font, marginTop: '4px',
                  }}>
                    Target: {seg.target_digital_pct}% adoption
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
