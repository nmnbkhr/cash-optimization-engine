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
        animation: 'rates-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading SBP rates...
      </span>
      <style>{`@keyframes rates-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load rates data
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

function SourceBadge({ source }) {
  const isSBP = source === 'SBP EasyData'
  const color = isSBP ? theme.green : theme.orange
  const bgColor = isSBP ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 700,
      fontFamily: theme.mono,
      padding: '4px 14px',
      borderRadius: 6,
      backgroundColor: bgColor,
      color,
      border: `1px solid ${color}40`,
    }}>
      {source}
    </span>
  )
}

function HeroKPI({ label, value, unit, color = theme.gold }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 200,
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '24px 20px',
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
        fontSize: 32,
        fontWeight: 700,
        fontFamily: theme.mono,
        color,
        lineHeight: 1.1,
      }}>
        {value != null ? `${value.toFixed(2)}` : '\u2014'}
        <span style={{ fontSize: 16, marginLeft: 2 }}>{unit}</span>
      </span>
    </div>
  )
}

/* Tenor order for the yield curve */
const TENOR_ORDER = ['1W', '2W', '1M', '3M', '6M', '9M', '12M']

/* Color gradient from cyan (short tenors) to gold (long tenors) */
function tenorColor(index, total) {
  /* Interpolate from cyan (#06b6d4) to gold (#d4a853) */
  const r = Math.round(6 + (212 - 6) * (index / Math.max(total - 1, 1)))
  const g = Math.round(182 + (168 - 182) * (index / Math.max(total - 1, 1)))
  const b = Math.round(212 + (83 - 212) * (index / Math.max(total - 1, 1)))
  return `rgb(${r}, ${g}, ${b})`
}

const FX_CURRENCIES = [
  { code: 'USD', label: 'USD/PKR' },
  { code: 'EUR', label: 'EUR/PKR' },
  { code: 'GBP', label: 'GBP/PKR' },
  { code: 'AED', label: 'AED/PKR' },
  { code: 'SAR', label: 'SAR/PKR' },
]

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function RatesSheet() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/rates')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!data) return null

  const {
    as_of,
    data_source,
    kibor_6m,
    policy_rate,
    kibor_curve,
    fx,
    weighted_avg_lending,
    cpi_yoy,
  } = data

  /* Build sorted curve entries */
  const curveEntries = kibor_curve
    ? TENOR_ORDER
        .filter((t) => kibor_curve[t] != null)
        .map((t) => ({ tenor: t, rate: kibor_curve[t] }))
    : []

  /* Find min/max for bar scaling */
  const rates = curveEntries.map((e) => e.rate)
  const minRate = rates.length > 0 ? Math.min(...rates) : 0
  const maxRate = rates.length > 0 ? Math.max(...rates) : 1
  /* Map rate to width percentage (floor at 40% so shortest bar is still visible) */
  const barWidth = (rate) => {
    if (maxRate === minRate) return 80
    return 40 + 60 * ((rate - minRate) / (maxRate - minRate))
  }

  /* WALR spread vs KIBOR 6M */
  const spread = kibor_6m != null && weighted_avg_lending != null
    ? (weighted_avg_lending - kibor_6m).toFixed(2)
    : null

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* ---- Header ---- */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 28,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: theme.text,
          margin: 0,
        }}>
          SBP Rates Dashboard
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SourceBadge source={data_source || 'Unknown'} />
          <span style={{
            fontSize: 12,
            fontFamily: theme.mono,
            color: theme.textSecondary,
          }}>
            As of {as_of || '\u2014'}
          </span>
        </div>
      </div>

      {/* ---- Hero KPI Row ---- */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        <HeroKPI label="KIBOR 6M" value={kibor_6m} unit="%" color={theme.gold} />
        <HeroKPI label="Policy Rate" value={policy_rate} unit="%" color={theme.cyan} />
        <HeroKPI label="CPI YoY" value={cpi_yoy} unit="%" color={theme.purple} />
      </div>

      {/* ---- KIBOR Yield Curve ---- */}
      <SectionCard title="KIBOR Yield Curve" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {curveEntries.map((entry, i) => {
            const color = tenorColor(i, curveEntries.length)
            return (
              <div key={entry.tenor} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <span style={{
                  width: 40,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: theme.mono,
                  color: theme.textSecondary,
                  textAlign: 'right',
                  flexShrink: 0,
                }}>
                  {entry.tenor}
                </span>
                <div style={{
                  flex: 1,
                  height: 28,
                  backgroundColor: '#1a2130',
                  borderRadius: 6,
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${barWidth(entry.rate)}%`,
                    backgroundColor: color,
                    borderRadius: 6,
                    transition: 'width 0.6s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 10,
                  }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: theme.mono,
                      color: '#0a0e17',
                    }}>
                      {entry.rate.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ---- FX Rates Panel ---- */}
      <SectionCard title="FX Rates (PKR)" style={{ marginBottom: 20 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
        }}>
          {FX_CURRENCIES.map(({ code, label }) => {
            const rate = fx?.[code]
            return (
              <div key={code} style={{
                backgroundColor: '#0a0e17',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                alignItems: 'center',
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.textSecondary,
                }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: theme.mono,
                  color: theme.gold,
                }}>
                  {rate != null ? rate.toFixed(2) : '\u2014'}
                </span>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ---- Additional Rates Strip ---- */}
      <SectionCard title="Additional Rates">
        <div style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.textSecondary,
            }}>
              Weighted Avg Lending Rate
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: theme.text,
            }}>
              {weighted_avg_lending != null ? `${weighted_avg_lending.toFixed(2)}%` : '\u2014'}
            </span>
          </div>
          <div style={{
            width: 1,
            height: 40,
            backgroundColor: theme.border,
            flexShrink: 0,
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.textSecondary,
            }}>
              Spread vs KIBOR 6M
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: spread != null && parseFloat(spread) > 0 ? theme.green : theme.orange,
            }}>
              {spread != null ? `${parseFloat(spread) > 0 ? '+' : ''}${Math.round(parseFloat(spread) * 100)} bps` : '\u2014'}
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
