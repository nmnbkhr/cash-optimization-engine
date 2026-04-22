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

const fmt = (v) => v == null ? '\u2014' : v >= 1000 ? `PKR ${(v / 1000).toFixed(1)} B` : `PKR ${v.toFixed(1)} M`

/* Country positions on the SVG viewBox (percentage-based, mapped to 1000x500 viewBox) */
const COUNTRY_POS = {
  PK: { x: 550, y: 225, label: 'PAK' },
  US: { x: 150, y: 175, label: 'USA' },
  UK: { x: 380, y: 125, label: 'GBR' },
  GB: { x: 380, y: 125, label: 'GBR' },
  DE: { x: 420, y: 140, label: 'DEU' },
  AE: { x: 520, y: 225, label: 'UAE' },
  SA: { x: 480, y: 225, label: 'SAU' },
  CN: { x: 650, y: 175, label: 'CHN' },
  JP: { x: 750, y: 150, label: 'JPN' },
  CH: { x: 400, y: 150, label: 'CHE' },
}

const ACTION_COLORS = {
  SWEEP: theme.green,
  FUND: theme.red,
  HOLD: theme.textSecondary,
}

const ACTION_ORDER = { FUND: 0, SWEEP: 1, HOLD: 2 }

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
        animation: 'nm-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading nostro positions...
      </span>
      <style>{`@keyframes nm-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load nostro data
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

function ActionBadge({ action }) {
  const color = ACTION_COLORS[action] || theme.textSecondary
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      fontFamily: theme.mono,
      padding: '2px 8px',
      borderRadius: 4,
      backgroundColor: `${color}18`,
      color,
      border: `1px solid ${color}40`,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {action}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  SVG Map                                                            */
/* ------------------------------------------------------------------ */

function WorldMapSVG({ countryData }) {
  const pkPos = COUNTRY_POS.PK

  /* Compute circle radius: min 12, max 36, scaled by balance */
  const maxBal = Math.max(...Object.values(countryData).map(c => c.totalBalance), 1)
  const getRadius = (bal) => 12 + (bal / maxBal) * 24

  /* Determine dominant action color for a country */
  const getDominantColor = (country) => {
    const actions = country.accounts.map(a => a.action)
    if (actions.includes('FUND')) return ACTION_COLORS.FUND
    if (actions.includes('SWEEP')) return ACTION_COLORS.SWEEP
    return ACTION_COLORS.HOLD
  }

  return (
    <svg
      viewBox="0 0 1000 500"
      style={{ width: '100%', height: '100%' }}
    >
      {/* Background grid for context */}
      <defs>
        <pattern id="nm-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke={theme.border} strokeWidth="0.3" />
        </pattern>
      </defs>
      <rect width="1000" height="500" fill={theme.card} rx="8" />
      <rect width="1000" height="500" fill="url(#nm-grid)" rx="8" />

      {/* Simplified continent outlines — very rough rectangles */}
      <rect x="60" y="100" width="240" height="200" rx="16" fill={`${theme.border}30`} stroke={theme.border} strokeWidth="0.5" />
      <text x="180" y="320" fill={`${theme.textSecondary}40`} fontSize="11" textAnchor="middle" fontFamily={theme.mono}>Americas</text>

      <rect x="330" y="70" width="200" height="250" rx="16" fill={`${theme.border}30`} stroke={theme.border} strokeWidth="0.5" />
      <text x="430" y="340" fill={`${theme.textSecondary}40`} fontSize="11" textAnchor="middle" fontFamily={theme.mono}>Europe / MENA</text>

      <rect x="560" y="90" width="250" height="220" rx="16" fill={`${theme.border}30`} stroke={theme.border} strokeWidth="0.5" />
      <text x="685" y="330" fill={`${theme.textSecondary}40`} fontSize="11" textAnchor="middle" fontFamily={theme.mono}>Asia Pacific</text>

      {/* Pakistan — home marker */}
      <circle cx={pkPos.x} cy={pkPos.y} r="8" fill={theme.gold} opacity="0.9" />
      <circle cx={pkPos.x} cy={pkPos.y} r="14" fill="none" stroke={theme.gold} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.5" />
      <text
        x={pkPos.x}
        y={pkPos.y - 20}
        fill={theme.gold}
        fontSize="11"
        fontWeight="700"
        textAnchor="middle"
        fontFamily={theme.mono}
      >
        HQ
      </text>

      {/* Connection lines + country bubbles */}
      {Object.entries(countryData).map(([code, country]) => {
        const pos = COUNTRY_POS[code]
        if (!pos || code === 'PK') return null
        const r = getRadius(country.totalBalance)
        const color = getDominantColor(country)

        return (
          <g key={code}>
            {/* Dashed line from Pakistan to country */}
            <line
              x1={pkPos.x} y1={pkPos.y}
              x2={pos.x} y2={pos.y}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="6,4"
              opacity="0.4"
            />

            {/* Country bubble */}
            <circle
              cx={pos.x} cy={pos.y} r={r}
              fill={`${color}20`}
              stroke={color}
              strokeWidth="1.5"
            />

            {/* Country code */}
            <text
              x={pos.x}
              y={pos.y - r - 6}
              fill={theme.text}
              fontSize="10"
              fontWeight="700"
              textAnchor="middle"
              fontFamily={theme.mono}
            >
              {pos.label}
            </text>

            {/* Balance label */}
            <text
              x={pos.x}
              y={pos.y + 4}
              fill={color}
              fontSize="10"
              fontWeight="700"
              textAnchor="middle"
              fontFamily={theme.mono}
            >
              {country.totalBalance.toFixed(0)}M
            </text>
          </g>
        )
      })}

      {/* Legend */}
      <g transform="translate(20, 430)">
        {[
          { label: 'SWEEP', color: theme.green },
          { label: 'HOLD', color: theme.textSecondary },
          { label: 'FUND', color: theme.red },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${i * 100}, 0)`}>
            <circle cx="6" cy="6" r="5" fill={`${item.color}30`} stroke={item.color} strokeWidth="1" />
            <text x="16" y="10" fill={item.color} fontSize="10" fontFamily={theme.mono} fontWeight="600">
              {item.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function NostroMap() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/nostro-vostro')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Failed to load nostro data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!data?.nostro) return <ErrorBanner message="No nostro data available" onRetry={fetchData} />

  const { nostro } = data
  const actions = nostro.actions || []

  /* Group accounts by country */
  const countryData = {}
  for (const acc of actions) {
    const code = acc.country || 'XX'
    if (!countryData[code]) {
      countryData[code] = { totalBalance: 0, accounts: [] }
    }
    countryData[code].totalBalance += acc.balance || 0
    countryData[code].accounts.push(acc)
  }

  /* Sort actions for the table: FUND first, then SWEEP, then HOLD */
  const sortedActions = [...actions].sort(
    (a, b) => (ACTION_ORDER[a.action] ?? 2) - (ACTION_ORDER[b.action] ?? 2)
  )

  const totalFundNeeded = nostro.total_fund_needed || 0
  const totalSweepable = nostro.total_sweepable || 0
  const monthlyIncome = nostro.monthly_income_if_swept || 0

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: theme.text,
          margin: 0,
        }}>
          NOSTRO POSITIONS &mdash; Global Correspondent Banking
        </h1>
        <p style={{
          fontSize: 12,
          color: theme.textSecondary,
          margin: '4px 0 0',
        }}>
          {nostro.total_accounts} correspondent accounts &middot; sweep/fund/hold recommendations
        </p>
      </div>

      {/* Main layout: Map + Table side by side */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Map area (~70%) */}
        <div style={{
          flex: '7 1 600px',
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: 16,
          minHeight: 400,
        }}>
          <WorldMapSVG countryData={countryData} />
        </div>

        {/* Action panel (~30%) */}
        <div style={{
          flex: '3 1 320px',
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: '16px 20px',
          maxHeight: 520,
          overflowY: 'auto',
        }}>
          <h3 style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.textSecondary,
            marginTop: 0,
            marginBottom: 14,
          }}>
            Nostro Actions
          </h3>

          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
            fontFamily: theme.mono,
          }}>
            <thead>
              <tr>
                {['Bank', 'Ccy', 'Balance', 'Action', 'Amount'].map((h) => (
                  <th key={h} style={{
                    textAlign: h === 'Bank' ? 'left' : 'right',
                    padding: '6px 4px',
                    borderBottom: `1px solid ${theme.border}`,
                    color: theme.textSecondary,
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedActions.map((acc, i) => (
                <tr key={i} style={{
                  borderBottom: `1px solid ${theme.border}40`,
                }}>
                  <td style={{
                    padding: '8px 4px',
                    color: theme.text,
                    fontSize: 11,
                    maxWidth: 120,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}>
                    {acc.bank}
                  </td>
                  <td style={{
                    padding: '8px 4px',
                    color: theme.cyan,
                    textAlign: 'right',
                    fontSize: 11,
                  }}>
                    {acc.currency}
                  </td>
                  <td style={{
                    padding: '8px 4px',
                    color: theme.text,
                    textAlign: 'right',
                    fontSize: 11,
                  }}>
                    {(acc.balance || 0).toFixed(1)}
                  </td>
                  <td style={{
                    padding: '8px 4px',
                    textAlign: 'right',
                  }}>
                    <ActionBadge action={acc.action} />
                  </td>
                  <td style={{
                    padding: '8px 4px',
                    color: ACTION_COLORS[acc.action] || theme.text,
                    textAlign: 'right',
                    fontWeight: 600,
                    fontSize: 11,
                  }}>
                    {acc.amount > 0 ? acc.amount.toFixed(1) : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        {[
          {
            label: 'Total Sweepable',
            value: fmt(totalSweepable),
            color: theme.green,
            sub: `${actions.filter(a => a.action === 'SWEEP').length} accounts`,
          },
          {
            label: 'Total Needing Funding',
            value: fmt(totalFundNeeded),
            color: theme.red,
            sub: `${actions.filter(a => a.action === 'FUND').length} accounts`,
          },
          {
            label: 'Potential Monthly Income',
            value: fmt(monthlyIncome),
            color: theme.gold,
            sub: `At KIBOR if swept`,
          },
        ].map((item) => (
          <div key={item.label} style={{
            flex: '1 1 200px',
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: '18px 20px',
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.textSecondary,
              marginBottom: 6,
            }}>
              {item.label}
            </div>
            <div style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: item.color,
              lineHeight: 1.2,
            }}>
              {item.value}
            </div>
            <div style={{
              fontSize: 11,
              color: theme.textSecondary,
              marginTop: 4,
            }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
