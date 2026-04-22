import { useState, useEffect } from 'react'
import axios from 'axios'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#22c55e', cyan: '#06b6d4',
  red: '#ef4444', orange: '#f97316', purple: '#a78bfa',
  text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

const fmtM = v => {
  if (v == null || isNaN(v)) return '--'
  return `PKR ${v.toFixed(1)}M`
}

const fmtPKR = v => {
  if (v == null || isNaN(v)) return '--'
  if (v >= 1) return `PKR ${v.toFixed(2)}M`
  return `PKR ${(v * 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const CITIES = ['', 'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot']

export default function IECHub() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [city, setCity] = useState('')

  const fetchData = (c) => {
    setLoading(true)
    const url = c
      ? `http://localhost:8000/api/business/iec-opportunities?city=${encodeURIComponent(c)}`
      : 'http://localhost:8000/api/business/iec-opportunities'
    axios.get(url)
      .then(r => { setData(r.data); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(city) }, [city])

  const swaps = data?.swaps || []

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>Interbank Exchange Cash Swap Hub</h1>
          <p style={{ color: T.muted, marginTop: 4 }}>
            Denomination swap matching to avoid SBP-BSC 0.12% service charge
          </p>
        </div>
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          style={{
            background: T.card, color: T.text, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: '10px 16px', fontSize: 14, cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">All Cities</option>
          {CITIES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Swaps', value: data?.swaps_found ?? swaps.length, color: T.cyan },
          { label: 'Total Swap Value', value: fmtM(data?.total_swap_amount_m || 0), color: T.gold },
          { label: 'BSC Rate Avoided', value: data?.bsc_rate_avoided || '0.12%', color: T.green },
          { label: 'Annual Savings', value: fmtM(data?.annual_saving_m || 0), color: T.purple },
        ].map((c, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 4 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 28, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: T.muted, textAlign: 'center', padding: 60 }}>Loading IEC data...</div>
      ) : error ? (
        <div style={{ color: T.red, textAlign: 'center', padding: 60 }}>Error: {error}</div>
      ) : swaps.length === 0 ? (
        /* No swaps — show explanation */
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚖️</div>
          <h2 style={{ color: T.text, fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No Swap Opportunities Found</h2>
          <p style={{ color: T.muted, fontSize: 14, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
            IEC swaps require denomination imbalances between branches in the same city.
            Current inventory shows balanced distribution.
            Opportunities emerge when branches have genuine surplus/deficit in specific denominations.
          </p>
          {data?.narrative && (
            <p style={{ color: T.dim, fontSize: 13, marginTop: 16, fontStyle: 'italic' }}>{data.narrative}</p>
          )}
        </div>
      ) : (
        /* Swap Cards */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
          {swaps.map((s, i) => (
            <div key={i} style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: T.gold, fontSize: 16, fontWeight: 600 }}>
                  {s.denomination || 'Mixed'} Swap
                </span>
                <span style={{
                  background: T.green + '22', color: T.green,
                  padding: '3px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                }}>
                  MATCH
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                {/* Surplus branch */}
                <div style={{ background: T.bg, borderRadius: 8, padding: 12 }}>
                  <div style={{ color: T.dim, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Surplus</div>
                  <div style={{ color: T.text, fontSize: 14, fontWeight: 500 }}>{s.surplus_branch || s.branch_a}</div>
                  <div style={{ color: T.cyan, fontSize: 13, fontFamily: 'monospace' }}>
                    {fmtM(s.surplus_amount_m || s.amount_m)}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ color: T.gold, fontSize: 24 }}>⇄</div>

                {/* Deficit branch */}
                <div style={{ background: T.bg, borderRadius: 8, padding: 12 }}>
                  <div style={{ color: T.dim, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Deficit</div>
                  <div style={{ color: T.text, fontSize: 14, fontWeight: 500 }}>{s.deficit_branch || s.branch_b}</div>
                  <div style={{ color: T.orange, fontSize: 13, fontFamily: 'monospace' }}>
                    {fmtM(s.deficit_amount_m || s.amount_m)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                <span style={{ color: T.muted, fontSize: 13 }}>
                  Swap: <span style={{ color: T.text }}>{fmtM(s.swap_value_m || s.amount_m)}</span>
                </span>
                <span style={{ color: T.muted, fontSize: 13 }}>
                  BSC Saved: <span style={{ color: T.green }}>PKR {((s.bsc_saved || 0) * 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </span>
                <span style={{ color: T.muted, fontSize: 13 }}>
                  CIT Saved: <span style={{ color: T.green }}>PKR {((s.cit_saved || 0.015) * 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SBP Reporting Reminder */}
      <div style={{
        background: T.card, border: `1px solid ${T.gold}44`, borderRadius: 12, padding: 20, marginTop: 24,
        display: 'flex', alignItems: 'flex-start', gap: 16,
      }}>
        <span style={{ fontSize: 28, flexShrink: 0 }}>⚠️</span>
        <div>
          <h3 style={{ color: T.gold, fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
            SBP Reporting Requirement
          </h3>
          <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            All Interbank Exchange of Currency (IEC) swaps must be reported to the <strong style={{ color: T.text }}>SBP Finance Department</strong>.
            Per Currency Management Strategy 2015, IEC transactions between commercial banks must be documented and submitted within the same business day.
            Failure to report constitutes a CMS violation (PKR 100K penalty per instance).
          </p>
        </div>
      </div>
    </div>
  )
}
