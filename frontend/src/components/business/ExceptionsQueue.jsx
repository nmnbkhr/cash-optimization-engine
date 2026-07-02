import { useState, useEffect } from 'react'
import axios from 'axios'
import ConstitutionBadge from '../common/ConstitutionBadge'
import DataSourceBadge from '../common/DataSourceBadge'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#22c55e', cyan: '#06b6d4',
  red: '#ef4444', orange: '#f97316', purple: '#a78bfa',
  text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

const API = 'http://localhost:8000/api/uc01/exceptions'

/* band severity colour ramp */
const bandColor = (b) => (b >= 70 ? T.red : b >= 50 ? T.orange : T.gold)

function Drivers({ drivers }) {
  if (!drivers || drivers.length === 0) return <span style={{ color: T.dim }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {drivers.map((d, i) => (
        <span key={i} style={{ fontSize: 12, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: d.direction === 'up' ? T.green : T.red }}>
            {d.contribution_m >= 0 ? '+' : ''}{Number(d.contribution_m).toFixed(1)}M
          </span>{' '}
          <span style={{ color: T.dim }}>{d.pct}%</span> {d.label}
        </span>
      ))}
    </div>
  )
}

export default function ExceptionsQueue() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [origin, setOrigin] = useState('')          // optional YYYY-MM-DD
  const [reload, setReload] = useState(0)

  useEffect(() => {
    setLoading(true)
    const url = origin ? `${API}?origin_date=${origin}` : API
    axios.get(url)
      .then(r => { setData(r.data); setError(null) })
      .catch(e => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }, [reload])     // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ color: T.muted, padding: 40, textAlign: 'center' }}>Scoring network for exceptions…</div>
  if (error) return <div style={{ color: T.red, padding: 40, textAlign: 'center' }}>Error: {error}</div>
  if (!data) return null

  const ex = data.exceptions || []
  const autoPct = data.total_nodes ? (100 * data.auto_handled / data.total_nodes).toFixed(1) : '0'

  const KPIS = [
    { label: 'Auto-handled', value: data.auto_handled, sub: `${autoPct}% of network`, color: T.green },
    { label: 'Need review', value: data.flagged_count, sub: `${data.flagged_pct}% flagged`, color: T.orange },
    { label: 'Hard-blocked', value: data.blocked_count, sub: 'constitution breach', color: T.red },
    { label: 'Total nodes', value: data.total_nodes, sub: `origin ${data.origin_date}`, color: T.cyan },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1500 }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>Exceptions Queue</h1>
            <DataSourceBadge lineage={{ data_source: 'fact_gl_daily (reconciled) + T3', as_of: data.origin_date, is_latest_slice: true }} />
          </div>
          <p style={{ color: T.muted, marginTop: 4 }}>
            Scalable human-in-the-loop: the confident majority is auto-handled; the uncertain
            minority is escalated with its reason, drivers, and any constitution breach.
          </p>
        </div>
        {/* Origin date control (demo: target a pre-Eid window) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.dim, fontSize: 12 }}>Origin</span>
          <input
            type="date" value={origin} onChange={e => setOrigin(e.target.value)}
            style={{
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
              color: T.text, padding: '6px 10px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <button
            onClick={() => setReload(x => x + 1)}
            style={{
              background: T.gold + '22', color: T.gold, border: `1px solid ${T.gold}55`,
              borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Run
          </button>
        </div>
      </div>

      {/* KPI split — the scalable-oversight story */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {KPIS.map((c, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${c.color}33`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 6 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 40, fontWeight: 700, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              {Number(c.value).toLocaleString()}
            </div>
            <div style={{ color: T.dim, fontSize: 12, marginTop: 6 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Policy knob — visible, read-only op-point */}
      {data.policy && (
        <div style={{
          background: T.card, border: `1px solid ${T.gold}33`, borderRadius: 10, padding: '12px 16px',
          marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{
            background: T.gold + '22', color: T.gold, borderRadius: 6, padding: '3px 10px',
            fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
          }}>
            {data.policy.name} = ±{data.policy.value_pct}%{data.policy.is_default ? ' (default)' : ' (override)'}
          </span>
          <span style={{ color: T.dim, fontSize: 12, lineHeight: 1.5 }}>{data.policy.rationale}</span>
        </div>
      )}

      {/* Exceptions table */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr style={{ background: T.bg }}>
                {['#', 'Branch', 'Tier', 'Band', 'Reason', 'Top-3 drivers (PKR M / %)', 'Constitution'].map(h => (
                  <th key={h} style={{
                    color: T.dim, fontSize: 11, fontWeight: 600, padding: '12px 14px',
                    textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ex.map((e, i) => {
                const blocked = e.constitution_status === 'BLOCKED'
                return (
                  <tr key={e.branch_id} style={{
                    borderBottom: `1px solid ${T.border}20`,
                    background: blocked ? T.red + '0c' : 'transparent',
                  }}>
                    <td style={{ color: T.dim, padding: '12px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{i + 1}</td>
                    <td style={{ color: T.text, padding: '12px 14px', fontWeight: 600, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
                      {e.branch_id}
                      {e.city && <div style={{ color: T.dim, fontSize: 11, fontWeight: 400 }}>{e.city}</div>}
                    </td>
                    <td style={{ color: T.muted, padding: '12px 14px', fontSize: 13 }}>{e.branch_type}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ color: bandColor(e.max_band_pct), fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14 }}>
                        ±{Math.round(e.max_band_pct)}%
                      </span>
                      <div style={{ color: T.dim, fontSize: 11 }}>h{e.worst_horizon}</div>
                    </td>
                    <td style={{ color: blocked ? T.red : T.muted, padding: '12px 14px', fontSize: 13, maxWidth: 280, lineHeight: 1.4 }}>
                      {e.reason}
                    </td>
                    <td style={{ padding: '12px 14px' }}><Drivers drivers={e.drivers} /></td>
                    <td style={{ padding: '12px 14px' }}>
                      <ConstitutionBadge status={e.constitution_status} violations={e.hard_violations || []} compact />
                    </td>
                  </tr>
                )
              })}
              {ex.length === 0 && (
                <tr><td colSpan={7} style={{ color: T.green, textAlign: 'center', padding: 40 }}>
                  No exceptions — entire network within band and constitution at this origin.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ color: T.dim, fontSize: 12, marginTop: 14 }}>
        Ranked by priority: constitution-blocked first, then by conformal band width.
        Bands and drivers come from the frozen T3 managed-level model; constitution limits
        from SBP / insurance constants. All amounts PKR Millions.
      </p>
    </div>
  )
}
