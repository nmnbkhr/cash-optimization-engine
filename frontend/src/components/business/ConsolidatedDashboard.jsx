import { useState, useEffect } from 'react'
import axios from 'axios'
import DataSourceBadge from '../common/DataSourceBadge'
import { formatPKRM } from '../../utils/formatPKR'

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

// All /api/business/consolidated money fields are in PKR Millions.
const formatPKR = (val) => {
  if (val == null || isNaN(val)) return '\u2014'
  return `PKR ${formatPKRM(val)}`
}

const formatNum = (val) => {
  if (val == null) return '\u2014'
  return val.toLocaleString()
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function HeroCard({ label, value, sub, color = theme.gold, statusBadge }) {
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
      {statusBadge ? (
        <span style={{
          display: 'inline-block',
          alignSelf: 'flex-start',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: theme.mono,
          padding: '4px 14px',
          borderRadius: 6,
          backgroundColor: color === theme.green ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          color,
          border: `1px solid ${color}40`,
        }}>
          {value}
        </span>
      ) : (
        <span style={{
          fontSize: 28,
          fontWeight: 700,
          fontFamily: theme.mono,
          color,
          lineHeight: 1.1,
        }}>
          {value}
        </span>
      )}
      {sub && (
        <span style={{ fontSize: 11, color: theme.textSecondary }}>
          {sub}
        </span>
      )}
    </div>
  )
}

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
        animation: 'coe-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading consolidated dashboard...
      </span>
      <style>{`@keyframes coe-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load dashboard
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

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ConsolidatedDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/consolidated')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!data) return null

  const {
    bank_snapshot: snap,
    optimization_impact: impact,
    today_actions: actions,
    revenue_breakdown: revenue,
    cost_breakdown: cost,
    digital_shift: digital,
    compliance,
    top_actions_now: topActions,
  } = data

  const crrLabel = compliance?.crr_status === 'ON_TRACK' ? 'ON TRACK' : compliance?.crr_status || '\u2014'
  const crrColor = compliance?.crr_status === 'ON_TRACK' ? theme.green : theme.red

  const revenueMax = revenue?.total_revenue || 1
  const costMax = cost?.total_cash_ops_cost || 1

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: theme.text,
            margin: 0,
          }}>
            Cash Optimization Engine
          </h1>
          <p style={{
            fontSize: 12,
            color: theme.textSecondary,
            margin: '4px 0 0',
          }}>
            Treasury Operations Consolidated View
          </p>
        </div>
        <DataSourceBadge lineage={{ data_source: snap?.data_source, as_of: snap?.as_of }} />
      </div>

      {/* Row 1: Hero KPIs */}
      <div style={{
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}>
        <HeroCard
          label="Annual Value Realized"
          value={formatPKR(impact?.annual_value_realized)}
          sub={`Monthly: ${formatPKR(impact?.monthly_value_realized)}`}
          color={theme.green}
        />
        <HeroCard
          label="Total Idle Cash"
          value={formatPKR(snap?.total_idle_cash)}
          sub={`of ${formatPKR(snap?.total_vault_cash)} vault cash`}
          color={theme.red}
        />
        <HeroCard
          label="Avg CES Score"
          value={impact?.avg_ces != null ? `${(impact.avg_ces * 100).toFixed(1)}%` : '\u2014'}
          sub="Cash Efficiency Score"
          color={theme.gold}
        />
        <HeroCard
          label="CRR Compliance"
          value={crrLabel}
          statusBadge
          color={crrColor}
          sub="SBP regulatory status"
        />
      </div>

      {/* Row 2: Top actions now */}
      {topActions && topActions.length > 0 && (
        <SectionCard title="Top Actions Now" style={{ marginBottom: 20 }}>
          <ol style={{
            margin: 0,
            paddingLeft: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {topActions.map((action, i) => (
              <li key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <span style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  backgroundColor: `${theme.gold}20`,
                  border: `1px solid ${theme.gold}50`,
                  color: theme.gold,
                  fontFamily: theme.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize: 14,
                  color: theme.text,
                  lineHeight: 1.6,
                  paddingTop: 2,
                }}>
                  {action}
                </span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      {/* Row 3: Revenue + Cost breakdowns */}
      <div style={{
        display: 'flex',
        gap: 14,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        <SectionCard title="Revenue Breakdown" style={{ flex: '1 1 0', minWidth: 320 }}>
          <HBar
            label="Vault Cash Freed Income"
            value={revenue?.vault_cash_freed_income || 0}
            max={revenueMax}
            color={theme.green}
            formatted={formatPKR(revenue?.vault_cash_freed_income)}
          />
          <HBar
            label="ATM Cash Freed Income"
            value={revenue?.atm_cash_freed_income || 0}
            max={revenueMax}
            color={theme.cyan}
            formatted={formatPKR(revenue?.atm_cash_freed_income)}
          />
          <HBar
            label="CRR Float Income"
            value={revenue?.crr_float_income || 0}
            max={revenueMax}
            color={theme.gold}
            formatted={formatPKR(revenue?.crr_float_income)}
          />
          <HBar
            label="Nostro Sweep Income"
            value={revenue?.nostro_sweep_income || 0}
            max={revenueMax}
            color={theme.purple}
            formatted={formatPKR(revenue?.nostro_sweep_income)}
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
              {formatPKR(revenue?.total_revenue)}
            </span>
          </div>
        </SectionCard>

        <SectionCard title="Cost Breakdown" style={{ flex: '1 1 0', minWidth: 320 }}>
          <HBar
            label="Cash Personnel"
            value={cost?.cash_personnel || 0}
            max={costMax}
            color={theme.red}
            formatted={formatPKR(cost?.cash_personnel)}
          />
          <HBar
            label="Cash Premises"
            value={cost?.cash_premises || 0}
            max={costMax}
            color={theme.orange}
            formatted={formatPKR(cost?.cash_premises)}
          />
          <HBar
            label="CIT & Handling"
            value={cost?.cit_and_handling || 0}
            max={costMax}
            color='#fb7185'
            formatted={formatPKR(cost?.cit_and_handling)}
          />
          <HBar
            label="Other Cash Ops"
            value={cost?.other_cash_ops || 0}
            max={costMax}
            color={theme.textSecondary}
            formatted={formatPKR(cost?.other_cash_ops)}
          />
          <div style={{
            borderTop: `1px solid ${theme.border}`,
            marginTop: 8,
            paddingTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Total Cash Ops Cost</span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: theme.red,
            }}>
              {formatPKR(cost?.total_cash_ops_cost)}
            </span>
          </div>
        </SectionCard>
      </div>

      {/* Row 4: Digital shift + Today's actions */}
      <div style={{
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
      }}>
        {/* Digital Shift */}
        <SectionCard title="Digital Channel Shift" style={{ flex: '1 1 0', minWidth: 320 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 12, color: theme.textSecondary }}>
              Cash <strong style={{ color: theme.text }}>{digital?.cash_pct ?? 0}%</strong>
            </span>
            <span style={{ fontSize: 12, color: theme.textSecondary }}>
              Digital <strong style={{ color: theme.cyan }}>{digital?.digital_pct ?? 0}%</strong>
            </span>
          </div>
          {/* Dual progress bar */}
          <div style={{
            display: 'flex',
            height: 18,
            borderRadius: 9,
            overflow: 'hidden',
            backgroundColor: '#1a2130',
          }}>
            <div style={{
              width: `${digital?.cash_pct ?? 65}%`,
              backgroundColor: theme.orange,
              transition: 'width 0.6s ease',
            }} />
            <div style={{
              width: `${digital?.digital_pct ?? 35}%`,
              backgroundColor: theme.cyan,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 14,
          }}>
            <span style={{ fontSize: 11, color: theme.textSecondary }}>
              Annual savings potential from digital shift
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: theme.gold,
            }}>
              {formatPKR(digital?.annual_savings_potential)}
            </span>
          </div>
        </SectionCard>

        {/* Today's Actions Quick Stats */}
        <SectionCard title="Today's Actions" style={{ flex: '1 1 0', minWidth: 320 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <span style={{ fontSize: 12, color: theme.textSecondary }}>CRR Deploy Amount</span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.gold,
              }}>
                {formatPKR(actions?.crr_deploy)}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <span style={{ fontSize: 12, color: theme.textSecondary }}>Nostro Sweepable</span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.cyan,
              }}>
                {formatPKR(actions?.nostro_sweepable)}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <span style={{ fontSize: 12, color: theme.textSecondary }}>Netting Matches</span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.green,
              }}>
                {formatNum(actions?.netting_matches)}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: '#0a0e17',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <span style={{ fontSize: 12, color: theme.textSecondary }}>CRR Income Today</span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.gold,
              }}>
                {formatPKR(actions?.crr_income_today)}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Footer bank snapshot */}
      <div style={{
        marginTop: 20,
        padding: '12px 20px',
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'center',
        gap: 32,
        flexWrap: 'wrap',
      }}>
        {[
          { label: 'Branches', value: formatNum(snap?.total_branches) },
          { label: 'ATMs', value: formatNum(snap?.total_atms) },
          { label: 'Deposit Base', value: formatPKR(snap?.deposit_base) },
        ].map((item, i) => (
          <span key={i} style={{ fontSize: 11, color: theme.textSecondary }}>
            {item.label}: <strong style={{ color: theme.text, fontFamily: theme.mono }}>{item.value}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}
