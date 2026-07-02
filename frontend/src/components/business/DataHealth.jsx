import { useState, useEffect } from 'react'
import axios from 'axios'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
  text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

const statusColor = (s) => (s === 'healthy' ? T.green : s === 'stale' ? T.amber
  : s === 'deprecated' ? T.red : T.dim)

export default function DataHealth() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    axios.get('http://localhost:8000/api/data-health')
      .then(r => setData(r.data)).catch(e => setError(e.message))
  }, [])

  if (error) return <div style={{ color: T.red, padding: 40 }}>Error: {error}</div>
  if (!data) return <div style={{ color: T.muted, padding: 40, textAlign: 'center' }}>Loading data health…</div>

  const Row = ({ r, deprecated }) => (
    <tr style={{ borderBottom: `1px solid ${T.border}20` }}>
      <td style={{ padding: '10px 14px' }}>
        <span style={{
          background: statusColor(r.status) + '22', color: statusColor(r.status),
          padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase',
        }}>{r.status}</span>
      </td>
      <td style={{ color: T.text, padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13 }}>{r.table}</td>
      <td style={{ color: T.muted, padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{Number(r.rows).toLocaleString()}</td>
      <td style={{ color: T.dim, padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
        {r.min_date ? `${r.min_date} → ${r.max_date}` : '—'}
        {r.age_vs_latest_days != null && r.age_vs_latest_days > 0 && (
          <span style={{ color: T.amber }}> ({r.age_vs_latest_days}d behind)</span>
        )}
      </td>
      <td style={{ color: T.muted, padding: '10px 14px', fontSize: 12 }}>
        {deprecated ? <span style={{ color: T.red }}>→ use <b>{r.replacement}</b> · {r.reason}</span> : (r.feeds || r.grain)}
      </td>
    </tr>
  )

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>Data Health & Lineage</h1>
        <p style={{ color: T.muted, marginTop: 4 }}>
          Single source of truth: decisioning surfaces read only the canonical reconciled
          tables; deprecated legacy tables are quarantined and must not feed any Tier-1 view.
        </p>
      </div>

      {/* Verdict banner */}
      <div style={{
        background: T.card, border: `1px solid ${(data.canonical_ok ? T.green : T.red)}44`,
        borderRadius: 10, padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: data.canonical_ok ? T.green : T.red }} />
        <span style={{ color: data.canonical_ok ? T.green : T.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {data.canonical_ok ? 'ALL CANONICAL TABLES HEALTHY' : 'CANONICAL TABLE ISSUE'}
        </span>
        <span style={{ color: T.dim, fontSize: 13 }}>
          {data.summary.canonical_healthy}/{data.summary.canonical_tables} canonical healthy ·
          {' '}{data.summary.deprecated_tables} deprecated · reference date {data.reference_date}
        </span>
      </div>

      {/* Canonical */}
      <h3 style={{ color: T.green, fontSize: 14, fontWeight: 700, margin: '0 0 8px', fontFamily: "'JetBrains Mono', monospace" }}>
        CANONICAL — system of record
      </h3>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: T.bg }}>
            {['Status', 'Table', 'Rows', 'Coverage', 'Feeds'].map(h => (
              <th key={h} style={{ color: T.dim, fontSize: 11, fontWeight: 600, padding: '10px 14px', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{data.canonical.map(r => <Row key={r.table} r={r} />)}</tbody>
        </table>
      </div>

      {/* Deprecated */}
      <h3 style={{ color: T.red, fontSize: 14, fontWeight: 700, margin: '0 0 8px', fontFamily: "'JetBrains Mono', monospace" }}>
        DEPRECATED — quarantined, must not feed decisioning
      </h3>
      <div style={{ background: T.card, border: `1px solid ${T.red}33`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: T.bg }}>
            {['Status', 'Table', 'Rows', 'Coverage', 'Replacement'].map(h => (
              <th key={h} style={{ color: T.dim, fontSize: 11, fontWeight: 600, padding: '10px 14px', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{data.deprecated.map(r => <Row key={r.table} r={r} deprecated />)}</tbody>
        </table>
      </div>

      <p style={{ color: T.dim, fontSize: 12, marginTop: 16 }}>{data.policy}</p>
    </div>
  )
}
