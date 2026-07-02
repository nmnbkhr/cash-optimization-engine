import { useState, useEffect } from 'react'
import axios from 'axios'
import DataSourceBadge from '../common/DataSourceBadge'

const theme = {
  bg: '#0a0e17',
  card: '#0f1419',
  border: '#1e293b',
  gold: '#d4a853',
  green: '#10b981',
  cyan: '#06b6d4',
  red: '#ef4444',
  orange: '#f59e0b',
  blue: '#3b82f6',
  purple: '#a78bfa',
  text: '#e8eaed',
  textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
}

const formatPKR = (val) => {
  if (val == null) return '\u2014'
  if (Math.abs(val) >= 1000) return `PKR ${(val / 1000).toFixed(1)} B`
  return `PKR ${val.toFixed(1)} M`
}

const formatNum = (val) => {
  if (val == null) return '\u2014'
  return val.toLocaleString()
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 16,
    }}>
      <div style={{
        width: 36,
        height: 36,
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.gold,
        borderRadius: '50%',
        animation: 'rv-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading regional data...
      </span>
      <style>{`@keyframes rv-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function KPICard({ label, value, sub, color = theme.gold }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 180,
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '22px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: theme.textSecondary,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 26,
        fontWeight: 700,
        fontFamily: theme.mono,
        color,
        lineHeight: 1.1,
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: theme.textSecondary }}>
          {sub}
        </span>
      )}
    </div>
  )
}

function SectionCard({ title, children, style: extra }) {
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '20px 24px',
      ...extra,
    }}>
      {title && (
        <h3 style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: theme.textSecondary,
          marginTop: 0,
          marginBottom: 16,
        }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

function MiniCard({ label, value, color }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 110,
      backgroundColor: '#0a0e17',
      border: `1px solid ${color}30`,
      borderRadius: 8,
      padding: '14px 14px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        fontFamily: theme.mono,
        color,
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: theme.textSecondary,
        marginTop: 4,
      }}>
        {label}
      </div>
    </div>
  )
}

function ActionBadge({ action, priority }) {
  const badgeMap = {
    URGENT_LOAD: { bg: 'rgba(239,68,68,0.15)', border: theme.red, text: theme.red },
    SCHEDULED_LOAD: { bg: 'rgba(245,158,11,0.15)', border: theme.orange, text: theme.orange },
    SKIP_NEXT: { bg: 'rgba(59,130,246,0.15)', border: theme.blue, text: theme.blue },
    OPTIMAL: { bg: 'rgba(16,185,129,0.15)', border: theme.green, text: theme.green },
  }
  const s = badgeMap[action] || badgeMap.OPTIMAL
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      fontFamily: theme.mono,
      padding: '3px 10px',
      borderRadius: 4,
      backgroundColor: s.bg,
      border: `1px solid ${s.border}40`,
      color: s.text,
      whiteSpace: 'nowrap',
    }}>
      {(action || '').replace(/_/g, ' ')}
    </span>
  )
}

function CESBadge({ score }) {
  if (score == null) return <span style={{ color: theme.textSecondary }}>{'\u2014'}</span>
  let color = theme.green
  if (score < 0.5) color = theme.red
  else if (score < 0.8) color = theme.orange
  return (
    <span style={{
      fontFamily: theme.mono,
      fontWeight: 700,
      fontSize: 13,
      color,
    }}>
      {(score * 100).toFixed(1)}%
    </span>
  )
}

function GaugeBar({ label, current, target, max }) {
  const effectiveMax = max || Math.max(current, target) * 1.3
  const currentPct = Math.min((current / effectiveMax) * 100, 100)
  const targetPct = Math.min((target / effectiveMax) * 100, 100)
  const isOver = current > target
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: theme.textSecondary }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: theme.mono, color: theme.text }}>
          <span style={{ color: isOver ? theme.orange : theme.green, fontWeight: 700 }}>
            {current.toFixed(1)}
          </span>
          {' / '}
          <span style={{ color: theme.gold }}>{target.toFixed(1)}</span>
          {' days'}
        </span>
      </div>
      <div style={{
        position: 'relative',
        height: 14,
        backgroundColor: '#1a2130',
        borderRadius: 7,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${currentPct}%`,
          backgroundColor: isOver ? theme.orange : theme.green,
          borderRadius: 7,
          transition: 'width 0.6s ease',
        }} />
        {/* Target marker */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${targetPct}%`,
          width: 2,
          backgroundColor: theme.gold,
          transform: 'translateX(-1px)',
        }} />
      </div>
    </div>
  )
}

const thStyle = {
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: theme.textSecondary,
  textAlign: 'left',
  borderBottom: `1px solid ${theme.border}`,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '9px 12px',
  fontSize: 13,
  color: theme.text,
  borderBottom: `1px solid ${theme.border}20`,
  whiteSpace: 'nowrap',
}

const tdMono = {
  ...tdStyle,
  fontFamily: theme.mono,
  fontWeight: 600,
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function RegionalView() {
  const [branches, setBranches] = useState([])
  const [cities, setCities] = useState([])
  const [selectedCity, setSelectedCity] = useState(null)
  const [nettingData, setNettingData] = useState(null)
  const [atmData, setAtmData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cityLoading, setCityLoading] = useState(false)

  // 1) Load branches on mount
  useEffect(() => {
    axios.get('http://localhost:8000/api/branches')
      .then((res) => {
        const list = res.data || []
        setBranches(list)
        // Extract unique cities sorted by frequency (descending)
        const freq = {}
        list.forEach((b) => {
          const c = b.city
          if (c) freq[c] = (freq[c] || 0) + 1
        })
        const sorted = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .map(([c]) => c)
        setCities(sorted)
        if (sorted.length > 0) setSelectedCity(sorted[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 2) Fetch netting + ATM data when city changes
  useEffect(() => {
    if (!selectedCity) return
    setCityLoading(true)
    setNettingData(null)
    setAtmData(null)
    Promise.all([
      axios.get(`http://localhost:8000/api/business/netting/${encodeURIComponent(selectedCity)}`).catch(() => ({ data: null })),
      axios.get(`http://localhost:8000/api/business/atm-load-orders?city=${encodeURIComponent(selectedCity)}`).catch(() => ({ data: null })),
    ]).then(([nRes, aRes]) => {
      setNettingData(nRes.data)
      setAtmData(aRes.data)
    }).finally(() => setCityLoading(false))
  }, [selectedCity])

  if (loading) return <Spinner />

  // Derive city-level stats from branches
  const cityBranches = branches
    .filter((b) => b.city === selectedCity)
    .sort((a, b) => (a.cash_efficiency_score || 0) - (b.cash_efficiency_score || 0))

  const cityCount = cityBranches.length
  const avgCES = cityCount > 0
    ? cityBranches.reduce((s, b) => s + (b.cash_efficiency_score || 0), 0) / cityCount
    : 0
  // /api/branches money fields are RAW PKR; formatPKR (and the netting values below) work
  // in PKR Millions — convert to M here so everything through formatPKR is on one scale.
  const totalIdleCash = cityBranches.reduce((s, b) => s + (b.idle_cash || 0), 0) / 1e6

  const net = nettingData
  const atm = atmData
  const summary = atm?.summary

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1340, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: 0 }}>
            Regional Head View
          </h1>
          <p style={{ fontSize: 12, color: theme.textSecondary, margin: '4px 0 0' }}>
            City-level analysis &mdash; netting opportunities &amp; ATM fleet status
          </p>
        </div>
        {net?.data_source && (
          <DataSourceBadge lineage={{ data_source: net.data_source, as_of: net.date }} />
        )}
      </div>

      {/* City selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: theme.textSecondary,
          display: 'block',
          marginBottom: 6,
        }}>
          Select City
        </label>
        <select
          value={selectedCity || ''}
          onChange={(e) => setSelectedCity(e.target.value)}
          style={{
            backgroundColor: '#0a0e17',
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 14,
            fontFamily: theme.mono,
            fontWeight: 600,
            minWidth: 260,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* City Summary KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPICard
          label="Branches in City"
          value={formatNum(cityCount)}
          sub="Active branches"
          color={theme.text}
        />
        <KPICard
          label="Avg Cash Efficiency"
          value={`${(avgCES * 100).toFixed(1)}%`}
          sub="CES score"
          color={avgCES < 0.5 ? theme.red : avgCES < 0.8 ? theme.orange : theme.green}
        />
        <KPICard
          label="Total Idle Cash"
          value={formatPKR(totalIdleCash)}
          sub="Excess vault holdings"
          color={theme.red}
        />
        <KPICard
          label="Netting Matches"
          value={formatNum(net?.matches_found)}
          sub="Surplus-deficit pairs"
          color={theme.gold}
        />
      </div>

      {cityLoading && (
        <div style={{
          textAlign: 'center',
          padding: '40px 0',
          color: theme.textSecondary,
          fontFamily: theme.mono,
          fontSize: 13,
        }}>
          Loading city data...
        </div>
      )}

      {!cityLoading && (
        <>
          {/* Two-column: Netting (left) + ATM Fleet (right) */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            {/* Netting Section */}
            <SectionCard
              title="Inter-Branch Cash Netting"
              style={{ flex: '1 1 0', minWidth: 420 }}
            >
              {net ? (
                <>
                  {/* Summary row */}
                  <div style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      Surplus: <strong style={{ color: theme.green, fontFamily: theme.mono }}>{net.surplus_branches}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      Deficit: <strong style={{ color: theme.red, fontFamily: theme.mono }}>{net.deficit_branches}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      Nettable: <strong style={{ color: theme.cyan, fontFamily: theme.mono }}>{formatPKR(net.total_nettable_amount)}</strong>
                    </div>
                  </div>

                  {/* Annual saving highlight */}
                  <div style={{
                    backgroundColor: `${theme.gold}10`,
                    border: `1px solid ${theme.gold}30`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>
                      Annual Saving Potential
                    </span>
                    <span style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: theme.mono,
                      color: theme.gold,
                    }}>
                      {formatPKR(net.annual_saving)}
                    </span>
                  </div>

                  {/* Top 10 matches table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>From</th>
                          <th style={thStyle}>To</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Transfer (M)</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Distance</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Saving</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(net.matches || []).slice(0, 10).map((m, i) => (
                          <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#0a0e1750' }}>
                            <td style={tdStyle}>
                              <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.cyan }}>{m.from_branch}</span>
                              <br />
                              <span style={{ fontSize: 11, color: theme.textSecondary }}>{m.from_name}</span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.orange }}>{m.to_branch}</span>
                              <br />
                              <span style={{ fontSize: 11, color: theme.textSecondary }}>{m.to_name}</span>
                            </td>
                            <td style={{ ...tdMono, textAlign: 'right', color: theme.gold }}>
                              {m.transfer_amount != null ? m.transfer_amount.toFixed(1) : '\u2014'}
                            </td>
                            <td style={{ ...tdMono, textAlign: 'right', color: theme.textSecondary }}>
                              {m.distance_km != null ? `${m.distance_km.toFixed(1)} km` : '\u2014'}
                            </td>
                            <td style={{ ...tdMono, textAlign: 'right', color: theme.green }}>
                              {m.net_saving != null ? m.net_saving.toFixed(4) : '\u2014'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Narrative */}
                  {net.narrative && (
                    <p style={{
                      fontSize: 12,
                      color: theme.textSecondary,
                      lineHeight: 1.7,
                      marginTop: 16,
                      marginBottom: 0,
                      borderTop: `1px solid ${theme.border}`,
                      paddingTop: 12,
                    }}>
                      {net.narrative}
                    </p>
                  )}
                </>
              ) : (
                <p style={{ color: theme.textSecondary, fontSize: 12 }}>
                  No netting data available for {selectedCity}.
                </p>
              )}
            </SectionCard>

            {/* ATM Fleet Section */}
            <SectionCard
              title="ATM Fleet Status"
              style={{ flex: '1 1 0', minWidth: 420 }}
            >
              {atm && summary ? (
                <>
                  {/* 4 mini-cards */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                    <MiniCard label="Urgent Loads" value={summary.urgent_loads} color={theme.red} />
                    <MiniCard label="Scheduled" value={summary.scheduled_loads} color={theme.orange} />
                    <MiniCard label="Skip Next" value={summary.skip_next} color={theme.blue} />
                    <MiniCard label="Optimal" value={summary.optimal} color={theme.green} />
                  </div>

                  {/* DoC gauge */}
                  <GaugeBar
                    label="Avg Days of Cash vs Target"
                    current={summary.avg_days_of_cash || 0}
                    target={summary.target_days_of_cash || 2.2}
                    max={Math.max((summary.avg_days_of_cash || 0), (summary.target_days_of_cash || 2.2)) * 1.5}
                  />

                  {/* Top 10 ATMs needing action */}
                  <div style={{ overflowX: 'auto', marginTop: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>ATM ID</th>
                          <th style={thStyle}>Type</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>DoC</th>
                          <th style={thStyle}>Action</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Load (M)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(atm.orders || []).slice(0, 10).map((o, i) => (
                          <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#0a0e1750' }}>
                            <td style={{ ...tdMono, fontSize: 11, color: theme.cyan }}>
                              {o.atm_id}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 12, textTransform: 'capitalize' }}>
                              {o.location_type}
                            </td>
                            <td style={{
                              ...tdMono,
                              textAlign: 'right',
                              color: (o.days_of_cash || 0) < 1 ? theme.red : (o.days_of_cash || 0) < 2 ? theme.orange : theme.text,
                            }}>
                              {o.days_of_cash != null ? o.days_of_cash.toFixed(1) : '\u2014'}
                            </td>
                            <td style={tdStyle}>
                              <ActionBadge action={o.action} priority={o.priority} />
                            </td>
                            <td style={{ ...tdMono, textAlign: 'right', color: theme.gold }}>
                              {o.load_amount != null ? o.load_amount.toFixed(1) : '\u2014'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Narrative */}
                  {atm.narrative && (
                    <p style={{
                      fontSize: 12,
                      color: theme.textSecondary,
                      lineHeight: 1.7,
                      marginTop: 16,
                      marginBottom: 0,
                      borderTop: `1px solid ${theme.border}`,
                      paddingTop: 12,
                    }}>
                      {atm.narrative}
                    </p>
                  )}
                </>
              ) : (
                <p style={{ color: theme.textSecondary, fontSize: 12 }}>
                  No ATM data available for {selectedCity}.
                </p>
              )}
            </SectionCard>
          </div>

          {/* Branch Rankings - full width */}
          <SectionCard title={`Branch Rankings \u2014 ${selectedCity}`}>
            {cityBranches.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Branch ID</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Type</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>CES</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Idle Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityBranches.map((b, i) => (
                      <tr key={b.branch_id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#0a0e1750' }}>
                        <td style={{ ...tdMono, fontSize: 11, color: theme.cyan }}>
                          {b.branch_id}
                        </td>
                        <td style={tdStyle}>{b.name}</td>
                        <td style={{ ...tdStyle, fontSize: 12, textTransform: 'capitalize' }}>
                          {b.branch_type}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <CESBadge score={b.cash_efficiency_score} />
                        </td>
                        <td style={{ ...tdMono, textAlign: 'right', color: theme.red }}>
                          {b.idle_cash != null ? formatPKR(b.idle_cash / 1e6) : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: theme.textSecondary, fontSize: 12 }}>
                No branches found for {selectedCity}.
              </p>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
