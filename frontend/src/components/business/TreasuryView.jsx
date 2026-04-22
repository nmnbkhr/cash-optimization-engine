import { useState, useEffect } from 'react'
import axios from 'axios'

const theme = {
  bg: '#0a0e17',
  card: '#0f1419',
  border: '#1e293b',
  gold: '#d4a853',
  green: '#10b981',
  cyan: '#06b6d4',
  red: '#ef4444',
  orange: '#f59e0b',
  purple: '#a78bfa',
  text: '#e8eaed',
  textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
}

const fmt = (val) => {
  if (val == null) return '\u2014'
  if (Math.abs(val) >= 1000) return `PKR ${(val / 1000).toFixed(1)} B`
  return `PKR ${val.toFixed(1)} M`
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
        animation: 'tv-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading treasury desk...
      </span>
      <style>{`@keyframes tv-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '50vh',
      gap: 14,
    }}>
      <div style={{
        backgroundColor: 'rgba(239,68,68,0.1)',
        border: `1px solid ${theme.red}50`,
        borderRadius: 10,
        padding: '24px 32px',
        maxWidth: 480,
        textAlign: 'center',
      }}>
        <p style={{ color: theme.red, fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>
          Failed to load treasury data
        </p>
        <p style={{ color: theme.textSecondary, fontSize: 12, margin: '0 0 14px' }}>
          {message}
        </p>
        <button
          onClick={onRetry}
          style={{
            backgroundColor: theme.gold,
            color: '#0a0e17',
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: theme.mono,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
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

/* ------------------------------------------------------------------ */
/*  CRR Maintenance Week Gauge                                         */
/* ------------------------------------------------------------------ */

function WeekGauge({ dayNumber }) {
  const days = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      {days.map((label, i) => {
        const dayIdx = i + 1
        const isPast = dayIdx < dayNumber
        const isCurrent = dayIdx === dayNumber
        const isFuture = dayIdx > dayNumber
        let bg = '#1a2130'
        let borderColor = theme.border
        let textColor = theme.textSecondary
        if (isPast) {
          bg = 'rgba(16,185,129,0.25)'
          borderColor = `${theme.green}60`
          textColor = theme.green
        }
        if (isCurrent) {
          bg = `${theme.gold}30`
          borderColor = theme.gold
          textColor = theme.gold
        }
        return (
          <div key={i} style={{
            flex: '1 1 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              fontSize: 10,
              fontFamily: theme.mono,
              fontWeight: isCurrent ? 700 : 500,
              color: textColor,
            }}>
              {label}
            </span>
            <div style={{
              width: '100%',
              height: isCurrent ? 48 : 36,
              backgroundColor: bg,
              border: `2px solid ${borderColor}`,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}>
              <span style={{
                fontSize: 13,
                fontFamily: theme.mono,
                fontWeight: 700,
                color: textColor,
              }}>
                {dayIdx}
              </span>
            </div>
            {isCurrent && (
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: theme.gold,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Horizontal Bar (for revenue breakdown)                             */
/* ------------------------------------------------------------------ */

function HBar({ label, value, max, color, formatted }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 5,
      }}>
        <span style={{ fontSize: 12, color: theme.text }}>{label}</span>
        <span style={{
          fontSize: 12,
          fontFamily: theme.mono,
          color: theme.gold,
          fontWeight: 600,
        }}>
          {formatted}
        </span>
      </div>
      <div style={{
        height: 10,
        backgroundColor: '#1a2130',
        borderRadius: 5,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: color,
          borderRadius: 5,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Nostro Actions Table                                                */
/* ------------------------------------------------------------------ */

function NostroTable({ actions }) {
  if (!actions || actions.length === 0) {
    return (
      <p style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', padding: 20 }}>
        No nostro actions available
      </p>
    )
  }

  // Sort: FUND first, then SWEEP, then HOLD
  const order = { FUND: 0, SWEEP: 1, HOLD: 2 }
  const sorted = [...actions]
    .sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9))
    .slice(0, 15)

  const actionColor = (action) => {
    if (action === 'SWEEP') return theme.green
    if (action === 'FUND') return theme.red
    return theme.textSecondary
  }

  const actionBg = (action) => {
    if (action === 'SWEEP') return 'rgba(16,185,129,0.12)'
    if (action === 'FUND') return 'rgba(239,68,68,0.12)'
    return 'rgba(139,148,158,0.1)'
  }

  const thStyle = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: theme.textSecondary,
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  }

  const tdStyle = {
    fontSize: 12,
    color: theme.text,
    padding: '8px 10px',
    borderBottom: `1px solid ${theme.border}30`,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: theme.mono,
      }}>
        <thead>
          <tr>
            <th style={thStyle}>Bank</th>
            <th style={thStyle}>Currency</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
            <th style={thStyle}>Destination</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Yield</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={{
              backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}>
              <td style={{ ...tdStyle, color: theme.text, fontFamily: 'inherit', fontSize: 11 }}>
                {row.bank || '\u2014'}
              </td>
              <td style={{ ...tdStyle, fontSize: 11 }}>
                {row.currency || '\u2014'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: theme.mono }}>
                {row.balance != null ? row.balance.toFixed(1) : '\u2014'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: actionColor(row.action),
                  backgroundColor: actionBg(row.action),
                  border: `1px solid ${actionColor(row.action)}30`,
                }}>
                  {row.action || '\u2014'}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: theme.mono, color: theme.gold }}>
                {row.amount != null ? row.amount.toFixed(1) : '\u2014'}
              </td>
              <td style={{ ...tdStyle, fontSize: 11, color: theme.textSecondary }}>
                {row.destination || '\u2014'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: theme.mono, color: theme.green }}>
                {row.expected_yield != null ? `${row.expected_yield}%` : '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TreasuryView() {
  const [crr, setCrr] = useState(null)
  const [nv, setNv] = useState(null)
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      axios.get('http://localhost:8000/api/business/crr-deployment'),
      axios.get('http://localhost:8000/api/business/nostro-vostro'),
      axios.get('http://localhost:8000/api/business/value-realized'),
    ])
      .then(([crrRes, nvRes, valRes]) => {
        setCrr(crrRes.data)
        setNv(nvRes.data)
        setValue(valRes.data)
      })
      .catch((err) => setError(err.message || 'Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchAll} />
  if (!crr && !nv && !value) return null

  const rec = crr?.recommendation
  const pos = crr?.position
  const maint = crr?.maintenance_period
  const weekPerf = crr?.week_performance
  const risk = crr?.risk
  const nostro = nv?.nostro
  const revenue = value?.revenue
  const costs = value?.costs
  const net = value?.net_value_realized

  const deployAmount = rec?.free_for_deployment
  const revenueMax = revenue?.total_revenue || 1

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: 0 }}>
          Treasury Desk View
        </h1>
        <p style={{ fontSize: 12, color: theme.textSecondary, margin: '4px 0 0' }}>
          CRR Deployment &middot; Nostro/Vostro Actions &middot; P&L Attribution
        </p>
      </div>

      {/* ============================================================ */}
      {/*  CRR SECTION                                                  */}
      {/* ============================================================ */}

      {/* Hero: DEPLOY command */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '32px 36px',
        marginBottom: 14,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 42,
          fontWeight: 800,
          fontFamily: theme.mono,
          color: theme.gold,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}>
          DEPLOY {fmt(deployAmount)}
        </div>
        <div style={{
          fontSize: 14,
          color: theme.textSecondary,
          marginTop: 8,
        }}>
          in <span style={{ color: theme.cyan, fontWeight: 600 }}>
            {rec?.deploy_in || 'Overnight KIBOR Repo'}
          </span> @ <span style={{ color: theme.gold, fontFamily: theme.mono, fontWeight: 600 }}>
            {rec?.kibor_rate || '10.50%'}
          </span>
        </div>
      </div>

      {/* CRR detail row: gauge + metrics */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Left: Maintenance week gauge */}
        <SectionCard title="CRR Maintenance Week" style={{ flex: '1 1 420px', minWidth: 360 }}>
          <WeekGauge dayNumber={maint?.day_number || 1} />
          <div style={{
            marginTop: 14,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: theme.textSecondary,
          }}>
            <span>Period: {maint?.period || '\u2014'}</span>
            <span>
              Day <span style={{ color: theme.gold, fontFamily: theme.mono, fontWeight: 700 }}>
                {maint?.day_number || '\u2014'}
              </span> of 7 &mdash; {maint?.days_remaining ?? '\u2014'} day{maint?.days_remaining !== 1 ? 's' : ''} remaining
            </span>
          </div>
        </SectionCard>

        {/* Right: Key metrics */}
        <SectionCard title="CRR Position" style={{ flex: '1 1 420px', minWidth: 360 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Hold at SBP */}
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Hold at SBP Today
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: theme.mono, color: theme.text }}>
                {fmt(rec?.hold_at_sbp_today)}
              </div>
              <div style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>
                {rec?.hold_pct != null ? `${rec.hold_pct}% of deposits` : ''}
              </div>
            </div>

            {/* Free for deployment */}
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Free for Deployment
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: theme.mono, color: theme.gold }}>
                {fmt(deployAmount)}
              </div>
              <div style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>
                Intraday buffer: {fmt(rec?.intraday_buffer)}
              </div>
            </div>

            {/* Expected income today */}
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Expected Income Today
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: theme.mono, color: theme.green }}>
                {fmt(rec?.expected_income_today)}
              </div>
            </div>

            {/* Compliance badge */}
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
            }}>
              <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Compliance
              </div>
              <span style={{
                display: 'inline-block',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: theme.mono,
                padding: '4px 16px',
                borderRadius: 6,
                backgroundColor: risk?.compliance_status === 'ON_TRACK'
                  ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: risk?.compliance_status === 'ON_TRACK' ? theme.green : theme.red,
                border: `1px solid ${risk?.compliance_status === 'ON_TRACK' ? theme.green : theme.red}40`,
              }}>
                {risk?.compliance_status === 'ON_TRACK' ? 'ON TRACK' : (risk?.compliance_status || '\u2014')}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* CRR bottom strip: annualized income + breach probability */}
      <div style={{
        display: 'flex',
        gap: 14,
        marginBottom: 28,
        flexWrap: 'wrap',
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
          padding: '12px 20px',
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: theme.textSecondary }}>
            Income This Week:{' '}
            <strong style={{ color: theme.green, fontFamily: theme.mono }}>
              {fmt(weekPerf?.income_earned_so_far)}
            </strong>
          </span>
          <span style={{ fontSize: 11, color: theme.textSecondary }}>
            Projected Week:{' '}
            <strong style={{ color: theme.gold, fontFamily: theme.mono }}>
              {fmt(weekPerf?.projected_week_income)}
            </strong>
          </span>
          <span style={{ fontSize: 11, color: theme.textSecondary }}>
            Annualized:{' '}
            <strong style={{ color: theme.gold, fontFamily: theme.mono }}>
              {fmt(weekPerf?.annualized)}
            </strong>
          </span>
          <span style={{ fontSize: 11, color: theme.textSecondary }}>
            Breach Probability:{' '}
            <strong style={{ color: theme.green, fontFamily: theme.mono }}>
              {risk?.breach_probability || '\u2014'}
            </strong>
          </span>
        </div>
      </div>

      {/* CRR narrative */}
      {crr?.narrative && (
        <div style={{
          padding: '12px 18px',
          backgroundColor: `${theme.gold}08`,
          border: `1px solid ${theme.gold}20`,
          borderRadius: 8,
          marginBottom: 28,
          marginTop: -14,
        }}>
          <p style={{ fontSize: 12, color: theme.textSecondary, margin: 0, lineHeight: 1.7 }}>
            {crr.narrative}
          </p>
        </div>
      )}

      {/* ============================================================ */}
      {/*  NOSTRO SECTION                                               */}
      {/* ============================================================ */}

      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: '0 0 4px' }}>
          Nostro Account Actions
        </h2>
        <p style={{ fontSize: 11, color: theme.textSecondary, margin: 0 }}>
          Correspondent bank sweep/fund recommendations
        </p>
      </div>

      {/* Nostro summary strip */}
      <div style={{
        display: 'flex',
        gap: 14,
        marginBottom: 14,
        flexWrap: 'wrap',
      }}>
        {[
          { label: 'Accounts', value: nostro?.total_accounts ?? '\u2014', color: theme.text },
          { label: 'Total Sweepable', value: fmt(nostro?.total_sweepable), color: theme.green },
          { label: 'Total Fund Needed', value: fmt(nostro?.total_fund_needed), color: theme.red },
          { label: 'Monthly Income if Swept', value: fmt(nostro?.monthly_income_if_swept), color: theme.gold },
          { label: 'Annual Income if Swept', value: fmt(nostro?.annual_income_if_swept), color: theme.gold },
        ].map((item, i) => (
          <div key={i} style={{
            flex: '1 1 0',
            minWidth: 170,
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '14px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: theme.mono, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Nostro actions table */}
      <SectionCard style={{ marginBottom: 14 }}>
        <NostroTable actions={nostro?.actions} />
      </SectionCard>

      {/* Nostro/Vostro narrative */}
      {nv?.narrative && (
        <div style={{
          padding: '12px 18px',
          backgroundColor: `${theme.gold}08`,
          border: `1px solid ${theme.gold}20`,
          borderRadius: 8,
          marginBottom: 28,
        }}>
          <p style={{ fontSize: 12, color: theme.textSecondary, margin: 0, lineHeight: 1.7 }}>
            {nv.narrative}
          </p>
        </div>
      )}

      {/* ============================================================ */}
      {/*  VALUE REALIZED SECTION                                       */}
      {/* ============================================================ */}

      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: '0 0 4px' }}>
          Value Realized &mdash; {value?.period || 'Monthly'}
        </h2>
        <p style={{ fontSize: 11, color: theme.textSecondary, margin: 0 }}>
          Revenue from cash optimization initiatives vs. operational costs
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Left: Revenue bars */}
        <SectionCard title="Revenue Breakdown" style={{ flex: '1.2 1 380px', minWidth: 340 }}>
          <HBar
            label="Vault Cash Freed Income"
            value={revenue?.vault_cash_freed_income || 0}
            max={revenueMax}
            color={theme.green}
            formatted={fmt(revenue?.vault_cash_freed_income)}
          />
          <HBar
            label="ATM Cash Freed Income"
            value={revenue?.atm_cash_freed_income || 0}
            max={revenueMax}
            color="#34d399"
            formatted={fmt(revenue?.atm_cash_freed_income)}
          />
          <HBar
            label="CRR Float Income"
            value={revenue?.crr_float_income || 0}
            max={revenueMax}
            color="#6ee7b7"
            formatted={fmt(revenue?.crr_float_income)}
          />
          <HBar
            label="Nostro Sweep Income"
            value={revenue?.nostro_sweep_income || 0}
            max={revenueMax}
            color="#a7f3d0"
            formatted={fmt(revenue?.nostro_sweep_income)}
          />
          <div style={{
            borderTop: `1px solid ${theme.border}`,
            marginTop: 8,
            paddingTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Total Revenue</span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: theme.green,
            }}>
              {fmt(revenue?.total_revenue)}
            </span>
          </div>
        </SectionCard>

        {/* Right: Net value card */}
        <div style={{
          flex: '0.8 1 300px',
          minWidth: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {/* Net monthly */}
          <div style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.gold}40`,
            borderRadius: 10,
            padding: '28px 24px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}>
            <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Net Value Realized (Monthly)
            </div>
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              fontFamily: theme.mono,
              color: theme.gold,
              lineHeight: 1.1,
            }}>
              {fmt(net?.monthly)}
            </div>
          </div>

          {/* Net annual */}
          <div style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: '20px 24px',
            textAlign: 'center',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}>
            <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Net Value Realized (Annual)
            </div>
            <div style={{
              fontSize: 30,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: theme.green,
              lineHeight: 1.1,
            }}>
              {fmt(net?.annual)}
            </div>
          </div>

          {/* Cost + KIBOR strip */}
          <div style={{
            display: 'flex',
            gap: 10,
          }}>
            <div style={{
              flex: 1,
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '12px 14px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Total Costs
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: theme.mono, color: theme.red }}>
                {fmt(costs?.total_cash_ops_cost)}
              </div>
            </div>
            <div style={{
              flex: 1,
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '12px 14px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                KIBOR Rate
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: theme.mono, color: theme.cyan }}>
                {net?.kibor_used || '\u2014'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Value realized narrative */}
      {value?.narrative && (
        <div style={{
          padding: '12px 18px',
          backgroundColor: `${theme.gold}08`,
          border: `1px solid ${theme.gold}20`,
          borderRadius: 8,
          marginBottom: 14,
        }}>
          <p style={{ fontSize: 12, color: theme.textSecondary, margin: 0, lineHeight: 1.7 }}>
            {value.narrative}
          </p>
        </div>
      )}
    </div>
  )
}
