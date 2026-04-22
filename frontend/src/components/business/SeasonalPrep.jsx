import { useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#22c55e', cyan: '#06b6d4',
  red: '#ef4444', orange: '#f97316', purple: '#a78bfa',
  text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

const fmt = v => {
  if (v == null || isNaN(v)) return '--'
  const a = Math.abs(v)
  if (a >= 1000) return `PKR ${(v / 1000).toFixed(1)}B`
  return `PKR ${v.toFixed(1)}M`
}

const EVENTS = [
  { id: 'Eid-ul-Fitr', label: 'Eid-ul-Fitr', icon: '🌙', desc: '+30-40% cash demand, Eidi (small notes)' },
  { id: 'Eid-ul-Adha', label: 'Eid-ul-Adha', icon: '🐪', desc: '+20-25% cash demand, cattle market' },
  { id: 'Ramadan', label: 'Ramadan', icon: '☪️', desc: '+15-20% evenings, Sehr/Iftar patterns' },
  { id: 'Payroll', label: 'Payroll', icon: '💰', desc: '+35% on 1st and 15th of month' },
  { id: 'Independence-Day', label: 'Independence Day', icon: '🇵🇰', desc: 'Moderate spike (Aug 14)' },
  { id: 'Muharram', label: 'Muharram', icon: '🕌', desc: 'Slight commercial slowdown' },
]

export default function SeasonalPrep() {
  const [event, setEvent] = useState('Eid-ul-Fitr')
  const [uplift, setUplift] = useState(1.15)
  const [duration, setDuration] = useState(7)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const calculate = () => {
    setLoading(true)
    setError(null)
    axios.post('http://localhost:8000/api/business/seasonal-scenario', {
      event, uplift_factor: uplift, duration_days: duration,
      start_date: new Date().toISOString().split('T')[0],
    })
      .then(r => setResult(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const ev = result?.event || {}
  const impact = result?.network_impact || {}
  const actions = result?.actions || {}
  const plans = result?.branch_plans || []

  // Chart: Normal vs Peak vault levels for top branches
  const chartData = plans.slice(0, 10).map(p => ({
    name: p.branch_id,
    'Normal Vault': p.normal_optimal_m,
    'Surge Vault': p.surge_optimal_m,
  }))

  // Denomination shift table
  const denomShift = plans[0]?.denomination_shift || {}

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>Seasonal Peak Preparation</h1>
        <p style={{ color: T.muted, marginTop: 4 }}>
          Eid / Ramadan / Payroll cash surge planning with KIBOR opportunity cost
        </p>
      </div>

      {/* Controls */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        {/* Event Selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: T.muted, fontSize: 13, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Select Event
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {EVENTS.map(e => (
              <button
                key={e.id}
                onClick={() => setEvent(e.id)}
                style={{
                  background: event === e.id ? T.gold + '22' : T.bg,
                  color: event === e.id ? T.gold : T.muted,
                  border: `1px solid ${event === e.id ? T.gold + '66' : T.border}`,
                  borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>{e.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{e.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{e.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 24, alignItems: 'end' }}>
          {/* Uplift */}
          <div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 6 }}>
              Uplift Factor: <span style={{ color: T.gold, fontWeight: 700 }}>{uplift.toFixed(2)}×</span>
              <span style={{ color: T.dim }}> ({((uplift - 1) * 100).toFixed(0)}%)</span>
            </div>
            <input
              type="range" min="1.0" max="1.5" step="0.05" value={uplift}
              onChange={e => setUplift(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: T.gold }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: T.dim, fontSize: 11 }}>
              <span>1.0×</span><span>1.5×</span>
            </div>
          </div>

          {/* Duration */}
          <div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 6 }}>
              Duration: <span style={{ color: T.cyan, fontWeight: 700 }}>{duration} days</span>
            </div>
            <input
              type="range" min="3" max="14" step="1" value={duration}
              onChange={e => setDuration(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: T.cyan }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: T.dim, fontSize: 11 }}>
              <span>3 days</span><span>14 days</span>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 6 }}>Start Date</div>
            <div style={{ color: T.text, fontSize: 14, padding: '8px 0' }}>
              {new Date().toISOString().split('T')[0]}
            </div>
          </div>

          {/* Calculate Button */}
          <button
            onClick={calculate}
            disabled={loading}
            style={{
              background: loading ? T.dim : `linear-gradient(135deg, ${T.gold}, ${T.orange})`,
              color: '#000', border: 'none', borderRadius: 10,
              padding: '12px 32px', fontSize: 16, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: T.red, background: T.card, borderRadius: 12, padding: 20, marginBottom: 24, textAlign: 'center' }}>
          Error: {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Impact Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Extra Cash Needed', value: fmt(impact.total_extra_cash_m), color: T.cyan, sub: `${impact.branches_affected} branches` },
              { label: 'Extra CIT Cost', value: fmt(impact.total_extra_cit_cost_m), color: T.orange, sub: `${actions.cit?.match(/\d+/)?.[0] || 0} extra trips/branch` },
              { label: 'KIBOR Opportunity Cost', value: fmt(impact.total_kibor_cost_m), color: T.red, sub: `Over ${duration} days` },
              { label: 'Total Preparation Cost', value: fmt(impact.total_opportunity_cost_m), color: T.gold, sub: 'KIBOR + CIT' },
            ].map((c, i) => (
              <div key={i} style={{ background: T.card, border: `1px solid ${c.color}33`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <div style={{ color: T.muted, fontSize: 13, marginBottom: 4 }}>{c.label}</div>
                <div style={{ color: c.color, fontSize: 28, fontWeight: 700 }}>{c.value}</div>
                <div style={{ color: T.dim, fontSize: 12, marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Actions + Denomination */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Actions */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Preparation Actions</h2>
              {Object.entries(actions).filter(([k]) => k !== 'cost_warning').map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.border}15` }}>
                  <span style={{ color: T.gold, fontSize: 14, flexShrink: 0 }}>►</span>
                  <div>
                    <div style={{ color: T.dim, fontSize: 11, textTransform: 'uppercase' }}>{key}</div>
                    <div style={{ color: T.text, fontSize: 14 }}>{val}</div>
                  </div>
                </div>
              ))}
              {actions.cost_warning && (
                <div style={{ marginTop: 12, padding: 12, background: T.red + '11', borderRadius: 8, border: `1px solid ${T.red}33` }}>
                  <span style={{ color: T.red, fontSize: 13 }}>{actions.cost_warning}</span>
                </div>
              )}
            </div>

            {/* Denomination Shift */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Denomination Adjustment</h2>
              {Object.keys(denomShift).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(denomShift).map(([denom, shift]) => {
                    const pct = shift * 100
                    const barWidth = Math.abs(pct) * 5
                    const isPositive = pct > 0
                    return (
                      <div key={denom} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: T.text, fontWeight: 600, width: 60, fontSize: 14, fontFamily: 'monospace' }}>{denom}</span>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            height: 20, width: `${barWidth}%`, minWidth: pct !== 0 ? 4 : 0,
                            background: isPositive ? T.green : T.red,
                            borderRadius: 4, opacity: 0.7,
                          }} />
                          <span style={{
                            color: pct === 0 ? T.dim : isPositive ? T.green : T.red,
                            fontSize: 14, fontWeight: 600, fontFamily: 'monospace',
                          }}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ color: T.dim, textAlign: 'center', padding: 20 }}>No denomination shift for this event</div>
              )}
              <p style={{ color: T.dim, fontSize: 12, marginTop: 16 }}>
                Adjustments relative to normal day mix. Eid events increase small notes (Rs.100/Rs.500) for Eidi distribution.
              </p>
            </div>
          </div>

          {/* Chart: Normal vs Peak */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                Normal vs Peak Vault Levels (Top 10)
              </h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} barGap={2}>
                    <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fill: T.muted, fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}
                      labelStyle={{ color: T.text }}
                      formatter={v => [`PKR ${v.toFixed(1)}M`]}
                    />
                    <Legend wrapperStyle={{ color: T.muted, fontSize: 12 }} />
                    <Bar dataKey="Normal Vault" fill={T.cyan} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Surge Vault" fill={T.orange} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: T.dim, textAlign: 'center', padding: 40 }}>No branch data</div>
              )}
            </div>

            {/* ATM Impact */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>ATM Fleet Impact</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: T.bg, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>Normal DoC Target</div>
                  <div style={{ color: T.cyan, fontSize: 32, fontWeight: 700 }}>2.2</div>
                  <div style={{ color: T.dim, fontSize: 12 }}>days</div>
                </div>
                <div style={{ background: T.bg, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>Surge DoC Target</div>
                  <div style={{ color: T.orange, fontSize: 32, fontWeight: 700 }}>{impact.atm_surge_doc?.toFixed(1) || '--'}</div>
                  <div style={{ color: T.dim, fontSize: 12 }}>days</div>
                </div>
              </div>
              <div style={{ marginTop: 16, background: T.bg, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>Extra ATM Loading</div>
                <div style={{ color: T.gold, fontSize: 28, fontWeight: 700 }}>{fmt(impact.atm_extra_load_m)}</div>
                <div style={{ color: T.dim, fontSize: 12 }}>across all ATMs</div>
              </div>
            </div>
          </div>

          {/* Per-Branch List */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
            <h2 style={{ color: T.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              Top 20 Highest-Impact Branches
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {['#', 'Branch', 'City', 'Current Vault', 'Normal Optimal', 'Surge Optimal', 'Extra Needed', 'KIBOR Cost'].map(h => (
                      <th key={h} style={{
                        color: T.dim, fontSize: 11, fontWeight: 600, padding: '10px 12px',
                        textAlign: 'left', textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.slice(0, 20).map((p, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}15` }}>
                      <td style={{ color: T.dim, padding: '10px 12px' }}>{i + 1}</td>
                      <td style={{ color: T.text, padding: '10px 12px', fontWeight: 500 }}>{p.name || p.branch_id}</td>
                      <td style={{ color: T.muted, padding: '10px 12px' }}>{p.city}</td>
                      <td style={{ color: T.muted, padding: '10px 12px', fontFamily: 'monospace' }}>{p.current_vault_m?.toFixed(1)}M</td>
                      <td style={{ color: T.cyan, padding: '10px 12px', fontFamily: 'monospace' }}>{p.normal_optimal_m?.toFixed(1)}M</td>
                      <td style={{ color: T.orange, padding: '10px 12px', fontFamily: 'monospace' }}>{p.surge_optimal_m?.toFixed(1)}M</td>
                      <td style={{ color: T.gold, padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                        {p.extra_needed_m?.toFixed(1)}M
                      </td>
                      <td style={{ color: T.red, padding: '10px 12px', fontFamily: 'monospace' }}>
                        {p.kibor_cost_m ? `${p.kibor_cost_m.toFixed(3)}M` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Narrative */}
          {result.narrative && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginTop: 24 }}>
              <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.7, margin: 0 }}>{result.narrative}</p>
            </div>
          )}
        </>
      )}

      {/* Pre-calculate hint */}
      {!result && !loading && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ color: T.text, fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Select an Event & Calculate</h2>
          <p style={{ color: T.muted, fontSize: 14 }}>
            Choose an event above, adjust uplift factor and duration, then click Calculate to see the preparation plan.
          </p>
        </div>
      )}
    </div>
  )
}
