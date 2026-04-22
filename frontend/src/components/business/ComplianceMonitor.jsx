import { useState, useEffect } from 'react'
import axios from 'axios'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#22c55e', cyan: '#06b6d4',
  red: '#ef4444', orange: '#f97316', purple: '#a78bfa',
  text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

function SeverityDot({ color }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, marginRight: 6 }} />
}

export default function ComplianceMonitor() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    axios.get('http://localhost:8000/api/business/compliance-risk')
      .then(r => { setData(r.data); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: T.muted, padding: 40, textAlign: 'center' }}>Loading compliance data...</div>
  if (error) return <div style={{ color: T.red, padding: 40, textAlign: 'center' }}>Error: {error}</div>
  if (!data) return null

  const summary = data.summary || {}
  const assessments = data.assessments || []
  const violations = data.cms_violations_checked || []

  const filtered = filter === 'all'
    ? assessments
    : assessments.filter(a => a.severity === filter.toUpperCase())

  const sevColor = s => s === 'RED' ? T.red : s === 'YELLOW' ? T.gold : T.green
  const tabs = [
    { id: 'all', label: `All (${assessments.length})` },
    { id: 'RED', label: `Critical (${summary.red || 0})` },
    { id: 'YELLOW', label: `Warning (${summary.yellow || 0})` },
    { id: 'GREEN', label: `Compliant (${summary.green || 0})` },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>CMS Compliance Dashboard</h1>
        <p style={{ color: T.muted, marginTop: 4 }}>
          Currency Management Strategy 2015 + DMMD Circular No. 01 of 2026
        </p>
      </div>

      {/* Big 3 numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'GREEN — Compliant', value: summary.green || 0, pct: summary.green_pct || 0, color: T.green },
          { label: 'YELLOW — Warning', value: summary.yellow || 0, pct: ((summary.yellow || 0) / Math.max(summary.total_branches || 1, 1) * 100).toFixed(1), color: T.gold },
          { label: 'RED — Critical', value: summary.red || 0, pct: ((summary.red || 0) / Math.max(summary.total_branches || 1, 1) * 100).toFixed(1), color: T.red },
        ].map((c, i) => (
          <div key={i} style={{
            background: T.card, border: `1px solid ${c.color}33`, borderRadius: 12, padding: 24, textAlign: 'center',
          }}>
            <div style={{ color: T.muted, fontSize: 14, marginBottom: 8 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
            <div style={{ color: T.dim, fontSize: 13, marginTop: 6 }}>{c.pct}% of network</div>
          </div>
        ))}
      </div>

      {/* Total penalty exposure */}
      <div style={{
        background: T.card, border: `1px solid ${T.red}33`, borderRadius: 12, padding: 20, marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ color: T.muted, fontSize: 14 }}>Total Estimated Penalty Exposure</div>
          <div style={{ color: T.red, fontSize: 13, marginTop: 2 }}>If all violations fined per CMS 2015</div>
        </div>
        <div style={{ color: T.red, fontSize: 32, fontWeight: 700, fontFamily: 'monospace' }}>
          PKR {(summary.total_fine_risk_m || 0).toFixed(2)}M
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            style={{
              background: filter === t.id ? T.gold + '22' : T.card,
              color: filter === t.id ? T.gold : T.muted,
              border: `1px solid ${filter === t.id ? T.gold + '55' : T.border}`,
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: T.bg }}>
                {['Status', 'Branch', 'City', 'CES', 'Issues', 'Fine Risk', 'Mitigation'].map(h => (
                  <th key={h} style={{
                    color: T.dim, fontSize: 11, fontWeight: 600, padding: '12px 14px',
                    textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}20` }}>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      background: sevColor(a.severity) + '22',
                      color: sevColor(a.severity),
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    }}>
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ color: T.text, padding: '12px 14px', fontWeight: 500, fontSize: 14 }}>
                    {a.name || a.branch_id}
                  </td>
                  <td style={{ color: T.muted, padding: '12px 14px', fontSize: 14 }}>{a.city}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      color: a.ces >= 70 ? T.green : a.ces >= 40 ? T.gold : T.red,
                      fontFamily: 'monospace', fontWeight: 600,
                    }}>
                      {a.ces}%
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', maxWidth: 280 }}>
                    {(a.issues || []).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {a.issues.map((issue, j) => (
                          <span key={j} style={{ color: T.muted, fontSize: 12, lineHeight: 1.4 }}>
                            • {issue}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: T.green, fontSize: 12 }}>No issues</span>
                    )}
                  </td>
                  <td style={{
                    color: a.fine_risk_m > 0 ? T.red : T.green,
                    padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600,
                  }}>
                    {a.fine_risk_m > 0 ? `PKR ${a.fine_risk_m.toFixed(2)}M` : '—'}
                  </td>
                  <td style={{ color: T.cyan, padding: '12px 14px', fontSize: 13 }}>
                    {a.severity === 'RED' ? 'Immediate remediation'
                      : a.severity === 'YELLOW' ? 'Monitor + plan'
                      : 'Maintain standards'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: T.dim, textAlign: 'center', padding: 40 }}>
                    No branches in this category
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regulatory Reference */}
      <div style={{ background: T.card, border: `1px solid ${T.gold}33`, borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h3 style={{ color: T.gold, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          CMS Violations Checked
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {violations.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <SeverityDot color={T.gold} />
              <span style={{ color: T.muted, fontSize: 13 }}>{v}</span>
              <span style={{ color: T.dim, fontSize: 11, marginLeft: 'auto' }}>PKR 100K fine</span>
            </div>
          ))}
        </div>
        <p style={{ color: T.dim, fontSize: 12, marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          Reference: Currency Management Strategy 2015 • DMMD Circular No. 01 of 2026 • PSP&OD Circular Letter No. 01 of 2025
        </p>
      </div>
    </div>
  )
}
