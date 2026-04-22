import { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#22c55e', cyan: '#06b6d4',
  red: '#ef4444', orange: '#f97316', purple: '#a78bfa',
  text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

const fmt = v => {
  if (v == null || isNaN(v)) return '--'
  const a = Math.abs(v)
  if (a >= 1e6) return `PKR ${(v / 1e6).toFixed(1)}T`
  if (a >= 1000) return `PKR ${(v / 1000).toFixed(1)}B`
  return `PKR ${v.toFixed(1)}M`
}

function Badge({ children, color = T.gold }) {
  return (
    <span style={{ background: color + '22', color, padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  )
}

export default function CDMPlan() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    axios.get('http://localhost:8000/api/business/cdm-recycling')
      .then(r => { setData(r.data); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: T.muted, padding: 40, textAlign: 'center' }}>Loading CDM data...</div>
  if (error) return <div style={{ color: T.red, padding: 40, textAlign: 'center' }}>Error: {error}</div>
  if (!data) return null

  const state = data.current_state || {}
  const priorities = data.recommendations || []
  const economics = data.economics || {}
  const installed = state.installed || 0
  const target = state.target_count || 1
  const pct = Math.round((installed / target) * 100)
  const gap = state.gap || (target - installed)

  // Chart data: group by branch type for CIT impact
  const typeMap = {}
  priorities.forEach(p => {
    const t = p.branch_type || 'Unknown'
    if (!typeMap[t]) typeMap[t] = { type: t, count: 0, savings: 0 }
    typeMap[t].count += 1
    typeMap[t].savings += p.monthly_savings_m || 0
  })
  const chartData = Object.values(typeMap).map(d => ({
    type: d.type,
    'CIT Before CDM': Math.round(d.count * 4.2),
    'CIT After CDM': Math.round(d.count * 4.2 * 0.62),
  }))

  const reqs = [
    { label: 'Instant credit to customer account', rule: 'Mandatory for all CDMs', done: true },
    { label: 'Biometric verification for non-customers', rule: 'Required per SBP circular', done: true },
    { label: 'Dispute resolution within 3 business days', rule: 'SLA per PSP&OD', done: true },
    { label: 'CCTV recording with 60-day retention', rule: 'Minimum storage period', done: true },
    { label: 'Notes authentication before crediting', rule: 'Machine must verify notes', done: true },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>CDM Deployment & Recycling</h1>
        <p style={{ color: T.muted, marginTop: 4 }}>Per PSP&OD Circular Letter No. 01 of 2025 — 25% branch coverage by CY2028</p>
      </div>

      {/* Progress Bar */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: T.text, fontSize: 18, fontWeight: 600 }}>
            {installed} / {target} branches
          </span>
          <span style={{ color: pct >= 100 ? T.green : pct >= 50 ? T.gold : T.orange, fontSize: 24, fontWeight: 700 }}>
            {pct}%
          </span>
        </div>
        <div style={{ background: T.border, borderRadius: 8, height: 20, overflow: 'hidden' }}>
          <div style={{
            background: pct >= 100 ? T.green : `linear-gradient(90deg, ${T.gold}, ${T.orange})`,
            height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 8,
            transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ color: T.dim, fontSize: 13 }}>Target: 25% of branches by CY2028</span>
          <span style={{ color: T.dim, fontSize: 13 }}>{gap} remaining</span>
        </div>
      </div>

      {/* Top row: Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Installed', value: installed, color: T.green },
          { label: 'Gap to Target', value: gap, color: T.orange },
          { label: 'Total Branches', value: state.total_branches || 0, color: T.cyan },
          { label: 'Network Saving/mo', value: fmt(economics.network_monthly_saving_m || priorities.reduce((s, p) => s + (p.monthly_savings_m || 0), 0)), color: T.purple },
        ].map((c, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 4 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 28, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Priority List */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Top Priority Branches for CDM Installation
          </h2>
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['#', 'Branch', 'City', 'Type', 'Monthly Saving', 'Payback', 'Priority'].map(h => (
                    <th key={h} style={{ color: T.dim, fontSize: 12, fontWeight: 600, padding: '8px 10px', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priorities.slice(0, 20).map((p, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}15` }}>
                    <td style={{ color: T.dim, padding: '10px' }}>{i + 1}</td>
                    <td style={{ color: T.text, padding: '10px', fontWeight: 500 }}>{p.name || p.branch_id}</td>
                    <td style={{ color: T.muted, padding: '10px' }}>{p.city || '--'}</td>
                    <td style={{ color: T.muted, padding: '10px' }}>{p.branch_type || '--'}</td>
                    <td style={{ color: T.green, padding: '10px', fontFamily: 'monospace' }}>
                      {fmt(p.monthly_savings_m)}
                    </td>
                    <td style={{ color: T.gold, padding: '10px', fontFamily: 'monospace' }}>
                      {p.payback_months ? `${p.payback_months.toFixed(1)} mo` : '--'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Badge color={p.recommendation === 'HIGH PRIORITY' ? T.red : T.gold}>
                        {p.recommendation || 'Recommend'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chart: CIT Before vs After */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            CIT Trips: Before vs After CDM
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barGap={4}>
                <XAxis dataKey="type" tick={{ fill: T.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: T.muted, fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                  labelStyle={{ color: T.text }}
                  itemStyle={{ color: T.muted }}
                />
                <Legend wrapperStyle={{ color: T.muted, fontSize: 12 }} />
                <Bar dataKey="CIT Before CDM" fill={T.orange} radius={[4, 4, 0, 0]} />
                <Bar dataKey="CIT After CDM" fill={T.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: T.dim, textAlign: 'center', padding: 40 }}>No data for chart</div>
          )}

          {/* Narrative */}
          {data.narrative && (
            <p style={{ color: T.muted, fontSize: 13, marginTop: 16, lineHeight: 1.6 }}>{data.narrative}</p>
          )}
        </div>
      </div>

      {/* Regulatory Box */}
      <div style={{ background: T.card, border: `1px solid ${T.gold}33`, borderRadius: 12, padding: 24 }}>
        <h2 style={{ color: T.gold, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          SBP Requirements — PSP&OD Circular Letter No. 01 of 2025
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {reqs.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
              <span style={{ color: T.green, fontSize: 18, flexShrink: 0 }}>✓</span>
              <div>
                <div style={{ color: T.text, fontSize: 14, fontWeight: 500 }}>{r.label}</div>
                <div style={{ color: T.dim, fontSize: 12 }}>{r.rule}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
