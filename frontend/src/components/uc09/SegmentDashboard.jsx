import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Users } from 'lucide-react'

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

const defaultSegments = [
  { segment: 'Mass Retail', current_digital_adoption_pct: 18, best_incentive: 'Cashback 2%', adoption_lift_pct: 21.0, budget_allocated_pkr: 20440 },
  { segment: 'SME', current_digital_adoption_pct: 25, best_incentive: 'Cashback 2%', adoption_lift_pct: 16.8, budget_allocated_pkr: 219000 },
  { segment: 'Corporate', current_digital_adoption_pct: 56, best_incentive: 'Cashback 2%', adoption_lift_pct: 9.9, budget_allocated_pkr: 1825000 },
  { segment: 'Premium', current_digital_adoption_pct: 40, best_incentive: 'Cashback 2%', adoption_lift_pct: 15.4, budget_allocated_pkr: 383250 },
  { segment: 'Rural', current_digital_adoption_pct: 7, best_incentive: 'Cashback 2%', adoption_lift_pct: 22.5, budget_allocated_pkr: 5475 },
]

export default function SegmentDashboard({ data }) {
  const segments = data?.segments || data || defaultSegments

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return (
      <div style={{
        backgroundColor: theme.card, border: `1px solid ${theme.border}`,
        borderRadius: '8px', padding: '24px', textAlign: 'center',
        color: theme.textSecondary, fontSize: '12px', fontFamily: theme.font,
      }}>
        No segment data available. Load summary data first.
      </div>
    )
  }

  const chartData = segments.map((s, i) => ({
    name: s.segment || s.name || `Segment ${i + 1}`,
    adoption: s.adoption ?? s.current_digital_adoption_pct ?? s.current_adoption ?? 0,
    lift: s.expected_lift ?? s.adoption_lift_pct ?? s.lift ?? 0,
    budget: ((s.budget_alloc ?? s.budget_allocated_pkr ?? s.budget_allocation ?? 0) / 1e6) || (s.budget_alloc ?? 0),
  }))

  return (
    <div style={{
      backgroundColor: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: '8px', padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Users size={16} style={{ color: theme.cyan }} />
        <span style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
          SEGMENT DASHBOARD
        </span>
      </div>

      {/* Segment Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{
            padding: '14px', borderRadius: '8px',
            backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
            borderTop: `3px solid ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`,
          }}>
            <div style={{
              color: theme.text, fontSize: '11px', fontWeight: 700, fontFamily: theme.font,
              marginBottom: '10px', textTransform: 'uppercase',
            }}>
              {seg.segment || seg.name || `Segment ${i + 1}`}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>ADOPTION</div>
              <div style={{ color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                {(seg.adoption ?? seg.current_digital_adoption_pct ?? seg.current_adoption ?? 0).toFixed(0)}%
              </div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>BEST ARM</div>
              <div style={{ color: theme.text, fontSize: '10px', fontWeight: 600, fontFamily: theme.font }}>
                {String(seg.best_arm || seg.best_incentive || seg.best_incentive_arm || '--')}
              </div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>EXPECTED LIFT</div>
              <div style={{ color: theme.green, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                +{(seg.expected_lift ?? seg.adoption_lift_pct ?? seg.lift ?? 0).toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>BUDGET</div>
              <div style={{ color: theme.gold, fontSize: '12px', fontWeight: 700, fontFamily: theme.font }}>
                {(() => {
                  const b = seg.budget_alloc ?? seg.budget_allocated_pkr ?? seg.budget_allocation ?? 0
                  if (b >= 1e6) return `${(b / 1e6).toFixed(1)}M`
                  if (b >= 1e3) return `${(b / 1e3).toFixed(0)}K`
                  return `${b}`
                })()} PKR
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Chart */}
      <div style={{ height: '260px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
            <XAxis dataKey="name" tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }} axisLine={{ stroke: theme.border }} />
            <YAxis tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }} axisLine={{ stroke: theme.border }} />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.card, border: `1px solid ${theme.border}`,
                borderRadius: '6px', fontFamily: theme.font, fontSize: '11px',
              }}
              labelStyle={{ color: theme.text, fontWeight: 700 }}
              itemStyle={{ color: theme.textSecondary }}
            />
            <Bar dataKey="adoption" name="Adoption %" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
            <Bar dataKey="lift" name="Expected Lift %" fill={theme.green} radius={[4, 4, 0, 0]} fillOpacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
