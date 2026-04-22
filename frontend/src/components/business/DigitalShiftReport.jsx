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
  blue: '#3b82f6',
  purple: '#a78bfa',
  text: '#e8eaed',
  textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
}

const fmtPKR = (v) => {
  if (v == null) return '\u2014'
  if (Math.abs(v) >= 1000) return `PKR ${(v / 1000).toFixed(1)} B`
  return `PKR ${v.toFixed(1)} M`
}

const fmtNum = (v) => v == null ? '\u2014' : v.toLocaleString()

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
        animation: 'dsr-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading digital shift report...
      </span>
      <style>{`@keyframes dsr-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load data
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

function Badge({ text, color }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 700,
      fontFamily: theme.mono,
      padding: '3px 10px',
      borderRadius: 5,
      backgroundColor: `${color}18`,
      color,
      border: `1px solid ${color}40`,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {text}
    </span>
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

function MetricCard({ label, value, color = theme.gold }) {
  return (
    <div style={{
      backgroundColor: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: theme.textSecondary,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 20,
        fontWeight: 700,
        fontFamily: theme.mono,
        color,
        lineHeight: 1.1,
      }}>
        {value}
      </span>
    </div>
  )
}

function DualProgressBar({ cashPct, digitalPct }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        height: 36,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${theme.border}`,
      }}>
        {/* Cash segment */}
        <div style={{
          width: `${cashPct}%`,
          backgroundColor: theme.orange,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'width 0.5s ease',
          minWidth: cashPct > 5 ? 'auto' : 0,
        }}>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 13,
            fontWeight: 700,
            color: '#0a0e17',
          }}>
            {cashPct}% Cash
          </span>
        </div>
        {/* Digital segment */}
        <div style={{
          width: `${digitalPct}%`,
          backgroundColor: theme.cyan,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'width 0.5s ease',
          minWidth: digitalPct > 5 ? 'auto' : 0,
        }}>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 13,
            fontWeight: 700,
            color: '#0a0e17',
          }}>
            {digitalPct}% Digital
          </span>
        </div>
      </div>
    </div>
  )
}

function CostComparisonBars() {
  const cashCost = 95
  const digitalCost = 8
  const maxCost = cashCost
  const cashWidth = 100
  const digitalWidth = (digitalCost / maxCost) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cash bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{
          fontFamily: theme.mono,
          fontSize: 12,
          color: theme.textSecondary,
          width: 80,
          textAlign: 'right',
          flexShrink: 0,
        }}>
          Cash Txn
        </span>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{
            height: 28,
            width: `${cashWidth}%`,
            backgroundColor: theme.orange,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 12,
          }}>
            <span style={{
              fontFamily: theme.mono,
              fontSize: 13,
              fontWeight: 700,
              color: '#0a0e17',
            }}>
              PKR 95
            </span>
          </div>
        </div>
      </div>

      {/* Digital bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{
          fontFamily: theme.mono,
          fontSize: 12,
          color: theme.textSecondary,
          width: 80,
          textAlign: 'right',
          flexShrink: 0,
        }}>
          Digital Txn
        </span>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{
            height: 28,
            width: `${digitalWidth}%`,
            backgroundColor: theme.cyan,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 12,
            minWidth: 72,
          }}>
            <span style={{
              fontFamily: theme.mono,
              fontSize: 13,
              fontWeight: 700,
              color: '#0a0e17',
            }}>
              PKR 8
            </span>
          </div>
        </div>
      </div>

      {/* Savings highlight */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginTop: 4,
      }}>
        <span style={{ width: 80, flexShrink: 0 }} />
        <div style={{
          backgroundColor: `${theme.green}15`,
          border: `1px solid ${theme.green}40`,
          borderRadius: 6,
          padding: '6px 14px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 13,
            fontWeight: 700,
            color: theme.green,
          }}>
            PKR 87 savings per transaction
          </span>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 11,
            color: theme.textSecondary,
          }}>
            (91.6% reduction)
          </span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function DigitalShiftReport() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/digital-shift')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Failed to load report'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (loading) return <Spinner />
  if (!data) return null

  const cs = data.current_state || {}
  const st = data.shift_target || {}
  const fin = data.financials || {}
  const branches = (data.top_cash_heavy_branches || [])
    .sort((a, b) => (b.cash_intensity || 0) - (a.cash_intensity || 0))
    .slice(0, 15)

  return (
    <div style={{
      backgroundColor: theme.bg,
      minHeight: '100vh',
      padding: '28px 32px',
      color: theme.text,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 14,
      }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 800,
          margin: 0,
          letterSpacing: '0.04em',
          color: theme.text,
        }}>
          DIGITAL CHANNEL SHIFT REPORT
        </h1>
        <Badge text="SBP CDM Mandate: 25% by 2028" color={theme.gold} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Current state */}
        <SectionCard title="Current Transaction Mix">
          <DualProgressBar
            cashPct={cs.cash_transactions_pct || 0}
            digitalPct={cs.digital_transactions_pct || 0}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 14,
            gap: 20,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: theme.orange,
              }} />
              <span style={{ color: theme.textSecondary, fontSize: 12 }}>
                Daily Cash Transactions:{' '}
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: theme.text,
                }}>
                  {fmtNum(cs.daily_cash_transactions)}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: theme.cyan,
              }} />
              <span style={{ color: theme.textSecondary, fontSize: 12 }}>
                Daily Digital Transactions:{' '}
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: theme.text,
                }}>
                  {fmtNum(cs.daily_digital_transactions)}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: theme.textSecondary, fontSize: 12 }}>
                Daily Cash Handling Cost:{' '}
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: theme.orange,
                }}>
                  {fmtPKR(cs.daily_cash_handling_cost)}
                </span>
              </span>
            </div>
          </div>
        </SectionCard>

        {/* Shift target */}
        <SectionCard title="Shift Target">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            }}>
              <span style={{
                fontSize: 11,
                color: theme.textSecondary,
              }}>
                Shift
              </span>
              <span style={{
                fontSize: 32,
                fontWeight: 800,
                fontFamily: theme.mono,
                color: theme.gold,
                lineHeight: 1,
              }}>
                {st.shift_pct || 0}%
              </span>
              <span style={{
                fontSize: 11,
                color: theme.textSecondary,
              }}>
                ={' '}
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: theme.text,
                }}>
                  {fmtNum(st.transactions_to_shift)}
                </span>
                {' '}transactions/day
              </span>
            </div>
          </div>

          {/* Channel badges */}
          <div style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 14,
          }}>
            {(st.channels || []).map((ch) => (
              <Badge key={ch} text={ch} color={theme.cyan} />
            ))}
          </div>
        </SectionCard>

        {/* Financials panel - 2x3 grid */}
        <SectionCard title="Financials">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}>
            <MetricCard
              label="Daily Savings"
              value={fmtPKR(fin.daily_savings)}
              color={theme.green}
            />
            <MetricCard
              label="Monthly Savings"
              value={fmtPKR(fin.monthly_savings)}
              color={theme.green}
            />
            <MetricCard
              label="Annual Savings"
              value={fmtPKR(fin.annual_savings)}
              color={theme.green}
            />
            <MetricCard
              label="Campaign Cost / Month"
              value={fmtPKR(fin.monthly_campaign_cost)}
              color={theme.gold}
            />
            <MetricCard
              label="Net Monthly Benefit"
              value={fmtPKR(fin.net_monthly_benefit)}
              color={theme.gold}
            />
            <MetricCard
              label="ROI"
              value={fin.roi_pct != null ? `${fin.roi_pct}%` : '\u2014'}
              color={theme.gold}
            />
          </div>
        </SectionCard>

        {/* Cost comparison */}
        <SectionCard title="Cost Per Transaction Comparison">
          <CostComparisonBars />
        </SectionCard>

        {/* Top cash-heavy branches table */}
        <SectionCard title={`Top Cash-Heavy Branches (${branches.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: theme.mono,
              fontSize: 12,
            }}>
              <thead>
                <tr>
                  {['Branch ID', 'Name', 'City', 'Cash Intensity', 'Daily Cash Txns', 'Potential Shift'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: theme.textSecondary,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.map((b, idx) => (
                  <tr key={b.branch_id || idx} style={{
                    borderBottom: `1px solid ${theme.border}20`,
                  }}>
                    <td style={{ padding: '10px 12px', color: theme.gold, fontWeight: 600 }}>
                      {b.branch_id}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.text }}>
                      {b.name}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary }}>
                      {b.city}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.orange, fontWeight: 700 }}>
                      {b.cash_intensity?.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.text }}>
                      {fmtNum(b.daily_cash_txns)}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.cyan, fontWeight: 700 }}>
                      {fmtNum(b.potential_shift)}
                    </td>
                  </tr>
                ))}
                {branches.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                      color: theme.textSecondary,
                    }}>
                      No branch data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Narrative */}
        {data.narrative && (
          <div style={{
            backgroundColor: theme.card,
            border: `2px solid ${theme.gold}40`,
            borderLeft: `4px solid ${theme.gold}`,
            borderRadius: 10,
            padding: '20px 24px',
          }}>
            <h3 style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.gold,
              marginTop: 0,
              marginBottom: 10,
            }}>
              Narrative
            </h3>
            <p style={{
              color: theme.text,
              fontSize: 13,
              lineHeight: 1.7,
              margin: 0,
              fontStyle: 'italic',
            }}>
              {data.narrative}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
