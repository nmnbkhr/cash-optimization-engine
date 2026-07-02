import { useState, useEffect } from 'react'
import axios from 'axios'

const T = {
  bg: '#0a0e17', card: '#111827', border: '#1e293b',
  gold: '#d4a853', green: '#10b981', blue: '#3b82f6', amber: '#f59e0b',
  red: '#ef4444', dim2: '#8b5cf6', text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
}

const CAT_COLOR = {
  canonical: T.green, output: T.dim2, domain: T.blue, deprecated: T.red, system: T.dim,
}

export default function SchemaBrowser() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState({})
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    axios.get('http://localhost:8000/api/schema')
      .then(r => { setData(r.data); setOpen({ [r.data.tables[0]?.table]: true }) })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div style={{ color: T.red, padding: 40 }}>Error: {error}</div>
  if (!data) return <div style={{ color: T.muted, padding: 40, textAlign: 'center' }}>Loading schema…</div>

  const cats = Object.keys(data.category_labels)
  const tabs = [{ id: 'all', label: `All (${data.total_tables})` },
    ...cats.filter(c => data.category_counts[c]).map(c => ({ id: c, label: `${c} (${data.category_counts[c]})` }))]

  const tables = data.tables.filter(t =>
    (filter === 'all' || t.category === filter) &&
    (!q || t.table.toLowerCase().includes(q.toLowerCase())
      || t.columns.some(c => c.name.toLowerCase().includes(q.toLowerCase()))))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ color: T.gold, fontSize: 28, fontWeight: 700, margin: 0 }}>Schema Browser</h1>
        <p style={{ color: T.muted, marginTop: 4 }}>
          {data.database} · {data.total_tables} tables · {Number(data.total_rows).toLocaleString()} total rows.
          Tables are tiered by data authority (canonical reconciled spine → deprecated legacy).
        </p>
      </div>

      {/* filter + search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setFilter(tb.id)} style={{
            background: filter === tb.id ? T.gold + '22' : T.card,
            color: filter === tb.id ? T.gold : T.muted,
            border: `1px solid ${filter === tb.id ? T.gold + '55' : T.border}`,
            borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', textTransform: 'capitalize',
          }}>{tb.label}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search table / column…"
          style={{
            marginLeft: 'auto', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.text, padding: '7px 12px', fontSize: 12, minWidth: 220,
            fontFamily: "'JetBrains Mono', monospace",
          }} />
      </div>

      {/* tables */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tables.map(t => {
          const color = CAT_COLOR[t.category] || T.dim
          const isOpen = !!open[t.table]
          return (
            <div key={t.table} style={{ background: T.card, border: `1px solid ${color}33`, borderRadius: 10, overflow: 'hidden' }}>
              <div onClick={() => setOpen(o => ({ ...o, [t.table]: !o[t.table] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}>
                <span style={{ color: T.dim, width: 12 }}>{isOpen ? '▾' : '▸'}</span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ color: T.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>{t.table}</span>
                <span style={{
                  color, background: color + '18', border: `1px solid ${color}44`, borderRadius: 5,
                  padding: '1px 7px', fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase',
                }}>{t.category}</span>
                {t.relationships?.length > 0 && (
                  <span style={{ color: T.blue, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    ⛓ {t.relationships.length} fk
                  </span>
                )}
                <span style={{ marginLeft: 'auto', color: T.muted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                  {Number(t.rows).toLocaleString()} rows · {t.n_columns} cols
                  {t.max_date && <span style={{ color: T.dim }}> · {t.min_date}→{t.max_date}</span>}
                </span>
              </div>
              {isOpen && (
                <div style={{ borderTop: `1px solid ${T.border}` }}>
                  <div style={{ color: T.dim, fontSize: 11, padding: '6px 16px', background: T.bg }}>{t.category_label}</div>
                  {t.purpose && (
                    <div style={{ color: T.muted, fontSize: 12.5, lineHeight: 1.5, padding: '10px 16px', borderBottom: `1px solid ${T.border}` }}>
                      {t.purpose}
                    </div>
                  )}
                  {t.relationships?.length > 0 && (
                    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: T.dim, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginRight: 4 }}>Relationships</span>
                      {t.relationships.map((r, i) => (
                        <span key={i} title={r.declared ? 'Declared foreign key' : 'Inferred from naming convention'}
                          style={{
                            color: r.declared ? T.blue : T.dim, background: (r.declared ? T.blue : T.dim) + '14',
                            border: `1px solid ${(r.declared ? T.blue : T.dim)}3a`, borderRadius: 6, padding: '3px 9px',
                            fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace",
                          }}>
                          {r.column} → {r.ref_table}.{r.ref_column}{!r.declared && <span style={{ opacity: 0.7 }}> *</span>}
                        </span>
                      ))}
                      <span style={{ color: T.dim, fontSize: 10, marginLeft: 4 }}>* inferred</span>
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: T.bg }}>
                      {['Column', 'Type', 'Key', 'Null'].map(h => (
                        <th key={h} style={{ color: T.dim, fontSize: 10, fontWeight: 600, padding: '6px 16px', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {t.columns.map(c => (
                        <tr key={c.name} style={{ borderBottom: `1px solid ${T.border}15` }}>
                          <td style={{ color: c.pk ? T.gold : T.text, padding: '5px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: c.pk ? 700 : 400 }}>{c.name}</td>
                          <td style={{ color: T.muted, padding: '5px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{c.type}</td>
                          <td style={{ padding: '5px 16px' }}>{c.pk && <span style={{ color: T.gold, fontSize: 10, fontWeight: 700 }}>PK</span>}</td>
                          <td style={{ color: T.dim, padding: '5px 16px', fontSize: 11 }}>{c.not_null ? 'NOT NULL' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        {tables.length === 0 && <div style={{ color: T.dim, textAlign: 'center', padding: 30 }}>No tables match.</div>}
      </div>
    </div>
  )
}
