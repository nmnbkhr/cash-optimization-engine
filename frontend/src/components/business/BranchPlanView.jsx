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

const fmtPKR = (v) => v == null ? '\u2014' : `PKR ${v.toLocaleString()}`

const denomColors = {
  rs5000: '#d4a853',
  rs1000: '#10b981',
  rs500: '#06b6d4',
  rs100: '#a78bfa',
  rs50_below: '#f59e0b',
}

const denomLabels = {
  rs5000: 'Rs.5,000',
  rs1000: 'Rs.1,000',
  rs500: 'Rs.500',
  rs100: 'Rs.100',
  rs50_below: 'Rs.50 & below',
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
        animation: 'bpv-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading branch plan...
      </span>
      <style>{`@keyframes bpv-spin { to { transform: rotate(360deg) } }`}</style>
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

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function BranchPlanView() {
  const [branches, setBranches] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [vault, setVault] = useState(null)
  const [denom, setDenom] = useState(null)
  const [loading, setLoading] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionPlan, setActionPlan] = useState(null)
  const [actionPlanLoading, setActionPlanLoading] = useState(false)

  // Load branch list on mount
  useEffect(() => {
    setBranchesLoading(true)
    axios.get('http://localhost:8000/api/branches')
      .then((res) => {
        const list = res.data || []
        setBranches(list)
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].branch_id)
        }
      })
      .catch((err) => setError(err.message || 'Failed to load branches'))
      .finally(() => setBranchesLoading(false))
  }, [])

  // Load vault recommendation + denomination plan when branch changes
  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setError(null)
    Promise.all([
      axios.get(`http://localhost:8000/api/business/vault-recommendation/${selectedId}`),
      axios.get(`http://localhost:8000/api/business/denomination-plan/${selectedId}`),
    ])
      .then(([vaultRes, denomRes]) => {
        setVault(vaultRes.data)
        setDenom(denomRes.data)
      })
      .catch((err) => setError(err.message || 'Failed to load branch data'))
      .finally(() => setLoading(false))

    // Also fetch integrated action plan
    setActionPlanLoading(true)
    axios.get(`http://localhost:8000/api/business/integrated-plan/${selectedId}`)
      .then(r => setActionPlan(r.data))
      .catch(() => setActionPlan(null))
      .finally(() => setActionPlanLoading(false))
  }, [selectedId])

  const handleRetry = () => {
    if (selectedId) {
      setLoading(true)
      setError(null)
      Promise.all([
        axios.get(`http://localhost:8000/api/business/vault-recommendation/${selectedId}`),
        axios.get(`http://localhost:8000/api/business/denomination-plan/${selectedId}`),
      ])
        .then(([vaultRes, denomRes]) => {
          setVault(vaultRes.data)
          setDenom(denomRes.data)
        })
        .catch((err) => setError(err.message || 'Failed to load branch data'))
        .finally(() => setLoading(false))
    }
  }

  const selectedBranch = branches.find((b) => b.branch_id === selectedId)

  // Determine hero action styling
  const actionColor = vault?.decision?.action === 'RELEASE'
    ? theme.green
    : vault?.decision?.action === 'REQUEST'
      ? theme.red
      : theme.gold

  const actionLabel = vault?.decision?.action || 'HOLD'
  const actionAmount = vault?.decision?.action_amount

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: theme.text,
          margin: 0,
        }}>
          Branch Manager View
        </h1>
        <p style={{
          fontSize: 12,
          color: theme.textSecondary,
          margin: '4px 0 0',
        }}>
          Daily operational plan &mdash; vault recommendation, denomination mix, scorecard
        </p>
      </div>

      {/* ---- Top: Branch Selector ---- */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={branchesLoading}
          style={{
            backgroundColor: theme.card,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 14,
            fontFamily: theme.mono,
            minWidth: 320,
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b949e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 14px center',
            paddingRight: 36,
          }}
          onFocus={(e) => e.target.style.borderColor = theme.gold}
          onBlur={(e) => e.target.style.borderColor = theme.border}
        >
          {branchesLoading && <option value="">Loading branches...</option>}
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.branch_id} &mdash; {b.name || b.branch_name || b.city}
            </option>
          ))}
        </select>

        {selectedBranch && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge text={selectedBranch.city || vault?.city || '\u2014'} color={theme.cyan} />
            <Badge text={selectedBranch.branch_type || vault?.branch_type || '\u2014'} color={theme.purple} />
          </div>
        )}

        {vault?.date && (
          <span style={{
            fontSize: 11,
            color: theme.textSecondary,
            fontFamily: theme.mono,
            marginLeft: 'auto',
          }}>
            {vault.date}
          </span>
        )}
      </div>

      {/* ---- Loading / Error states ---- */}
      {loading && <Spinner />}
      {error && !loading && <ErrorBanner message={error} onRetry={handleRetry} />}

      {/* ---- Main content (only when data is loaded) ---- */}
      {!loading && !error && vault && denom && (
        <>
          {/* ---- Hero Decision ---- */}
          <div style={{
            backgroundColor: theme.card,
            border: `1px solid ${actionColor}40`,
            borderRadius: 12,
            padding: '32px 36px',
            marginBottom: 20,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: theme.textSecondary,
              marginBottom: 10,
            }}>
              Today's Decision
            </div>
            <div style={{
              fontSize: 42,
              fontWeight: 800,
              fontFamily: theme.mono,
              color: actionColor,
              lineHeight: 1.1,
              marginBottom: 8,
            }}>
              {actionLabel} {actionAmount != null ? fmt(actionAmount) : ''}
            </div>
            {vault.decision?.action_detail && (
              <div style={{
                fontSize: 14,
                color: theme.textSecondary,
                maxWidth: 600,
                margin: '0 auto',
                lineHeight: 1.5,
              }}>
                {vault.decision.action_detail}
              </div>
            )}
          </div>

          {/* ---- Two-column: Vault Panel + Cost of Inaction ---- */}
          <div style={{
            display: 'flex',
            gap: 16,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}>
            {/* Vault Panel */}
            <SectionCard title="Vault Position" style={{ flex: '1 1 0', minWidth: 380 }}>
              {/* Current vs Recommended */}
              <div style={{
                display: 'flex',
                gap: 24,
                marginBottom: 24,
              }}>
                <div style={{ flex: '1 1 0' }}>
                  <div style={{
                    fontSize: 11,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 6,
                  }}>
                    Current Vault
                  </div>
                  <div style={{
                    fontSize: 30,
                    fontWeight: 700,
                    fontFamily: theme.mono,
                    color: theme.text,
                    lineHeight: 1.1,
                  }}>
                    {fmt(vault.decision?.current_vault)}
                  </div>
                </div>
                <div style={{
                  width: 1,
                  backgroundColor: theme.border,
                  alignSelf: 'stretch',
                }} />
                <div style={{ flex: '1 1 0' }}>
                  <div style={{
                    fontSize: 11,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 6,
                  }}>
                    Recommended Vault
                  </div>
                  <div style={{
                    fontSize: 30,
                    fontWeight: 700,
                    fontFamily: theme.mono,
                    color: theme.gold,
                    lineHeight: 1.1,
                  }}>
                    {fmt(vault.decision?.recommended_vault)}
                  </div>
                </div>
              </div>

              {/* Vault Gauge */}
              {vault.constraints && (() => {
                const cap = vault.constraints.vault_capacity || 1
                const current = vault.decision?.current_vault || 0
                const optimal = vault.decision?.recommended_vault || 0
                const sbpMin = vault.constraints.sbp_minimum || 0
                const insLimit = vault.constraints.insurance_limit || cap

                const pctCurrent = Math.min((current / cap) * 100, 100)
                const pctOptimal = Math.min((optimal / cap) * 100, 100)
                const pctSbp = Math.min((sbpMin / cap) * 100, 100)
                const pctIns = Math.min((insLimit / cap) * 100, 100)

                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{
                      fontSize: 11,
                      color: theme.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 10,
                    }}>
                      Vault Gauge &mdash; Capacity {fmt(cap)}
                    </div>
                    {/* Bar background */}
                    <div style={{ position: 'relative', height: 28, marginBottom: 28 }}>
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 28,
                        backgroundColor: '#1a2130',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}>
                        {/* Current fill */}
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          width: `${pctCurrent}%`,
                          backgroundColor: current > insLimit ? `${theme.red}60` : `${theme.text}25`,
                          borderRadius: 6,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>

                      {/* SBP Minimum marker */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: `${pctSbp}%`,
                        height: 28,
                        width: 2,
                        backgroundColor: theme.red,
                        zIndex: 2,
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: 32,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: 9,
                          fontFamily: theme.mono,
                          color: theme.red,
                          whiteSpace: 'nowrap',
                        }}>
                          SBP Min
                        </div>
                      </div>

                      {/* Optimal marker */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: `${pctOptimal}%`,
                        height: 28,
                        width: 2,
                        backgroundColor: theme.gold,
                        zIndex: 2,
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: 32,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: 9,
                          fontFamily: theme.mono,
                          color: theme.gold,
                          whiteSpace: 'nowrap',
                        }}>
                          Optimal
                        </div>
                      </div>

                      {/* Insurance limit marker */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: `${pctIns}%`,
                        height: 28,
                        width: 2,
                        backgroundColor: theme.orange,
                        zIndex: 2,
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: 32,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: 9,
                          fontFamily: theme.mono,
                          color: theme.orange,
                          whiteSpace: 'nowrap',
                        }}>
                          Ins. Limit
                        </div>
                      </div>

                      {/* Current position triangle */}
                      <div style={{
                        position: 'absolute',
                        top: -8,
                        left: `${pctCurrent}%`,
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: `7px solid ${theme.text}`,
                        zIndex: 3,
                      }} />
                    </div>

                    {/* Binding constraint */}
                    {vault.constraints.binding_constraint && (
                      <div style={{
                        fontSize: 11,
                        color: theme.textSecondary,
                        marginTop: 4,
                      }}>
                        Binding constraint: <span style={{
                          fontFamily: theme.mono,
                          color: theme.gold,
                          fontWeight: 600,
                        }}>
                          {vault.constraints.binding_constraint}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Forecast info */}
              {vault.forecast && (
                <div style={{
                  padding: '14px 16px',
                  backgroundColor: theme.bg,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                }}>
                  <div style={{
                    fontSize: 11,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 10,
                  }}>
                    Forecast
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: 20,
                    flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 3 }}>
                        Predicted Demand
                      </div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 700,
                        fontFamily: theme.mono,
                        color: theme.cyan,
                      }}>
                        {fmt(vault.forecast.predicted_demand)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 3 }}>
                        Confidence Range
                      </div>
                      <div style={{
                        fontSize: 14,
                        fontFamily: theme.mono,
                        color: theme.text,
                      }}>
                        {vault.forecast.confidence_lower != null
                          ? `${vault.forecast.confidence_lower.toFixed(1)} \u2013 ${vault.forecast.confidence_upper?.toFixed(1)} M`
                          : '\u2014'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 3 }}>
                        Model
                      </div>
                      <div style={{
                        fontSize: 12,
                        fontFamily: theme.mono,
                        color: theme.textSecondary,
                      }}>
                        {vault.forecast.model || '\u2014'}
                      </div>
                    </div>
                    {vault.forecast.mape != null && (
                      <div>
                        <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 3 }}>
                          MAPE
                        </div>
                        <div style={{
                          fontSize: 14,
                          fontFamily: theme.mono,
                          color: theme.gold,
                        }}>
                          {(vault.forecast.mape * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Cost of Inaction Panel */}
            <SectionCard title="Cost of Inaction" style={{ flex: '1 1 0', minWidth: 340 }}>
              {vault.cost_of_inaction && (() => {
                const coi = vault.cost_of_inaction
                return (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20,
                  }}>
                    {/* Idle cash - big number */}
                    <div>
                      <div style={{
                        fontSize: 11,
                        color: theme.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 6,
                      }}>
                        Idle Cash
                      </div>
                      <div style={{
                        fontSize: 36,
                        fontWeight: 700,
                        fontFamily: theme.mono,
                        color: theme.red,
                        lineHeight: 1.1,
                      }}>
                        {fmt(coi.idle_cash)}
                      </div>
                    </div>

                    {/* Daily KIBOR loss */}
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: theme.bg,
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 2 }}>
                          Daily KIBOR Loss
                        </div>
                        <div style={{ fontSize: 9, color: theme.textSecondary }}>
                          @ {coi.kibor_reference || '10.50%'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: theme.mono,
                        color: theme.orange,
                      }}>
                        {fmtPKR(coi.daily_kibor_loss_pkr)}
                      </div>
                    </div>

                    {/* Total daily cost */}
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: theme.bg,
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ fontSize: 10, color: theme.textSecondary }}>
                        Total Daily Cost (incl. handling)
                      </div>
                      <div style={{
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: theme.mono,
                        color: theme.red,
                      }}>
                        {fmtPKR(coi.total_daily_cost_pkr)}
                      </div>
                    </div>

                    {/* Annual loss */}
                    <div style={{
                      padding: '14px 16px',
                      backgroundColor: `${theme.red}10`,
                      borderRadius: 8,
                      border: `1px solid ${theme.red}30`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{
                        fontSize: 11,
                        color: theme.textSecondary,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}>
                        Annual Loss
                      </div>
                      <div style={{
                        fontSize: 24,
                        fontWeight: 800,
                        fontFamily: theme.mono,
                        color: theme.red,
                      }}>
                        {fmt(coi.annual_loss_m)}
                      </div>
                    </div>

                    {/* Narrative */}
                    {coi.narrative && (
                      <div style={{
                        fontSize: 13,
                        color: theme.textSecondary,
                        lineHeight: 1.6,
                        borderLeft: `3px solid ${theme.gold}40`,
                        paddingLeft: 14,
                        fontStyle: 'italic',
                      }}>
                        {coi.narrative}
                      </div>
                    )}
                  </div>
                )
              })()}
            </SectionCard>
          </div>

          {/* ---- Denomination Plan (full width) ---- */}
          <SectionCard title="Denomination Plan" style={{ marginBottom: 20 }}>
            {/* Stacked horizontal bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex',
                height: 32,
                borderRadius: 6,
                overflow: 'hidden',
              }}>
                {Object.entries(denom.denomination_plan_pct || {}).map(([key, pct]) => (
                  pct > 0 && (
                    <div
                      key={key}
                      title={`${denomLabels[key] || key}: ${pct}%`}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: denomColors[key] || theme.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'width 0.5s ease',
                        minWidth: pct >= 8 ? 'auto' : 0,
                      }}
                    >
                      {pct >= 8 && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: theme.mono,
                          color: '#0a0e17',
                          whiteSpace: 'nowrap',
                        }}>
                          {pct}%
                        </span>
                      )}
                    </div>
                  )
                ))}
              </div>
              {/* Legend */}
              <div style={{
                display: 'flex',
                gap: 16,
                marginTop: 10,
                flexWrap: 'wrap',
              }}>
                {Object.entries(denomLabels).map(([key, label]) => (
                  <div key={key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: denomColors[key],
                    }} />
                    <span style={{
                      fontSize: 11,
                      color: theme.textSecondary,
                    }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Denomination table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}>
                <thead>
                  <tr>
                    {['Denomination', 'Target %', 'Target Amount'].map((h) => (
                      <th key={h} style={{
                        textAlign: h === 'Denomination' ? 'left' : 'right',
                        padding: '10px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: theme.textSecondary,
                        borderBottom: `1px solid ${theme.border}`,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(denomLabels).map(([key, label]) => {
                    const pct = denom.denomination_plan_pct?.[key]
                    const amt = denom.denomination_amounts?.[key]
                    return (
                      <tr key={key}>
                        <td style={{
                          padding: '10px 14px',
                          borderBottom: `1px solid ${theme.border}`,
                          color: theme.text,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}>
                          <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            backgroundColor: denomColors[key],
                            flexShrink: 0,
                          }} />
                          {label}
                        </td>
                        <td style={{
                          padding: '10px 14px',
                          borderBottom: `1px solid ${theme.border}`,
                          textAlign: 'right',
                          fontFamily: theme.mono,
                          fontWeight: 600,
                          color: theme.gold,
                        }}>
                          {pct != null ? `${pct}%` : '\u2014'}
                        </td>
                        <td style={{
                          padding: '10px 14px',
                          borderBottom: `1px solid ${theme.border}`,
                          textAlign: 'right',
                          fontFamily: theme.mono,
                          color: theme.text,
                        }}>
                          {amt != null ? fmt(amt) : '\u2014'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Eid badge + rationale + SBP warning */}
            <div style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {/* Eid badge + rationale row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                {denom.eid_adjusted && (
                  <Badge text="Eid Adjusted" color={theme.orange} />
                )}
                {denom.rationale && (
                  <span style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    lineHeight: 1.5,
                  }}>
                    {denom.rationale}
                  </span>
                )}
              </div>

              {/* SBP penalty warning */}
              {denom.sbp_penalty_risk && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '10px 14px',
                  backgroundColor: `${theme.red}10`,
                  borderRadius: 6,
                  border: `1px solid ${theme.red}25`,
                }}>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 14,
                    color: theme.red,
                    fontWeight: 700,
                    lineHeight: 1.4,
                  }}>
                    !
                  </span>
                  <span style={{
                    fontSize: 12,
                    color: theme.red,
                    lineHeight: 1.5,
                    opacity: 0.85,
                  }}>
                    {denom.sbp_penalty_risk}
                  </span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ---- Scorecard Strip ---- */}
          {vault.scorecard && (
            <div style={{
              padding: '14px 24px',
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 40,
              flexWrap: 'wrap',
            }}>
              {/* CES Score */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{
                  fontSize: 11,
                  color: theme.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}>
                  CES Score
                </span>
                <span style={{
                  display: 'inline-block',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: theme.mono,
                  padding: '4px 14px',
                  borderRadius: 6,
                  backgroundColor: vault.scorecard.ces >= 0.7
                    ? `${theme.green}18`
                    : vault.scorecard.ces >= 0.4
                      ? `${theme.gold}18`
                      : `${theme.red}18`,
                  color: vault.scorecard.ces >= 0.7
                    ? theme.green
                    : vault.scorecard.ces >= 0.4
                      ? theme.gold
                      : theme.red,
                  border: `1px solid ${
                    vault.scorecard.ces >= 0.7
                      ? theme.green
                      : vault.scorecard.ces >= 0.4
                        ? theme.gold
                        : theme.red
                  }40`,
                }}>
                  {vault.scorecard.ces != null
                    ? `${(vault.scorecard.ces * 100).toFixed(1)}%`
                    : '\u2014'}
                </span>
              </div>

              {/* Separator */}
              <div style={{
                width: 1,
                height: 24,
                backgroundColor: theme.border,
              }} />

              {/* Annual Savings Potential */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{
                  fontSize: 11,
                  color: theme.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}>
                  Annual Savings Potential
                </span>
                <span style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: theme.mono,
                  color: theme.green,
                }}>
                  {fmt(vault.scorecard.savings_potential_annual)}
                </span>
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────── */}
          {/* DAILY ACTION SHEET (Integrated Plan)           */}
          {/* ────────────────────────────────────────────── */}
          {actionPlanLoading && (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: 20, marginTop: 24 }}>
              Loading action sheet...
            </div>
          )}
          {actionPlan && !actionPlan.error && (
            <div id="action-sheet" style={{
              marginTop: 32, background: theme.card, border: `1px solid ${theme.gold}44`,
              borderRadius: 12, padding: 28,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ color: theme.gold, fontSize: 22, fontWeight: 700, margin: 0 }}>
                    Daily Action Sheet
                  </h2>
                  <p style={{ color: theme.textSecondary, fontSize: 13, margin: '4px 0 0' }}>
                    {actionPlan.header?.branch_name} — {actionPlan.header?.date}
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  style={{
                    background: theme.gold + '22', color: theme.gold,
                    border: `1px solid ${theme.gold}55`, borderRadius: 8,
                    padding: '8px 20px', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Print Action Sheet
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {/* Vault Action */}
                <div style={{ background: theme.bg, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    Vault Action
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      background: (actionPlan.vault_action?.action === 'RELEASE' ? theme.green
                        : actionPlan.vault_action?.action === 'REQUEST' ? theme.orange
                        : theme.cyan) + '22',
                      color: actionPlan.vault_action?.action === 'RELEASE' ? theme.green
                        : actionPlan.vault_action?.action === 'REQUEST' ? theme.orange
                        : theme.cyan,
                      padding: '3px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                    }}>
                      {actionPlan.vault_action?.action || 'HOLD'}
                    </span>
                    <span style={{ color: theme.text, fontSize: 16, fontWeight: 700, fontFamily: theme.mono }}>
                      {fmt(actionPlan.vault_action?.action_amount)}
                    </span>
                  </div>
                </div>

                {/* Compliance */}
                <div style={{ background: theme.bg, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    Compliance
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      color: actionPlan.compliance_status?.color === 'GREEN' ? theme.green
                        : actionPlan.compliance_status?.color === 'YELLOW' ? theme.gold
                        : theme.red,
                      fontSize: 18, fontWeight: 700,
                    }}>
                      {actionPlan.compliance_status?.color || '--'} {actionPlan.compliance_status?.color === 'GREEN' ? '✓' : '⚠'}
                    </span>
                    <span style={{ color: theme.textSecondary, fontSize: 13 }}>
                      CES {actionPlan.compliance_status?.ces_pct}%
                    </span>
                  </div>
                  {(actionPlan.compliance_status?.issues || []).map((iss, j) => (
                    <div key={j} style={{ color: theme.orange, fontSize: 12, marginTop: 4 }}>• {iss}</div>
                  ))}
                </div>

                {/* ATM Orders */}
                <div style={{ background: theme.bg, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    ATM Orders
                  </div>
                  {(actionPlan.atm_orders || []).length > 0 ? (
                    actionPlan.atm_orders.slice(0, 4).map((atm, j) => (
                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span style={{ color: theme.text, fontSize: 13 }}>{atm.atm_id}</span>
                        <span style={{
                          color: atm.action === 'URGENT_LOAD' ? theme.red
                            : atm.action === 'SCHEDULE_LOAD' ? theme.orange
                            : atm.action === 'SKIP_NEXT_CIT' ? theme.cyan
                            : theme.green,
                          fontSize: 13, fontWeight: 600,
                        }}>
                          {atm.action} {atm.load_amount > 0 ? `${fmt(atm.load_amount)}` : ''}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: theme.textSecondary, fontSize: 13 }}>No ATM orders</div>
                  )}
                </div>

                {/* Denomination Plan */}
                <div style={{ background: theme.bg, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    Denomination Mix
                  </div>
                  {actionPlan.denomination_plan && Object.keys(actionPlan.denomination_plan).length > 0 ? (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {Object.entries(actionPlan.denomination_plan).map(([k, v]) => (
                        <span key={k} style={{ color: theme.text, fontSize: 13 }}>
                          <span style={{ color: theme.gold }}>{k}:</span> {typeof v === 'number' ? `${v}%` : v}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: theme.textSecondary, fontSize: 13 }}>Standard mix</div>
                  )}
                </div>

                {/* CIT Schedule */}
                <div style={{ background: theme.bg, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    CIT Schedule
                  </div>
                  {(actionPlan.cit_schedule || []).length > 0 ? (
                    actionPlan.cit_schedule.map((cit, j) => (
                      <div key={j} style={{ color: theme.text, fontSize: 13, padding: '2px 0' }}>
                        {cit.type} — {fmt(cit.amount_m)} — {cit.window || '08:00-16:00'}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: theme.textSecondary, fontSize: 13 }}>No CIT trips scheduled</div>
                  )}
                </div>

                {/* Forecast */}
                <div style={{ background: theme.bg, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    Forecast (Tomorrow)
                  </div>
                  {actionPlan.forecast_tomorrow ? (
                    <div>
                      <div style={{ color: theme.text, fontSize: 15, fontWeight: 600, fontFamily: theme.mono }}>
                        {fmt(actionPlan.forecast_tomorrow.predicted_demand_m)}
                      </div>
                      <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                        95% band: {fmt(actionPlan.forecast_tomorrow.confidence_lower_m)} – {fmt(actionPlan.forecast_tomorrow.confidence_upper_m)}
                      </div>
                      <div style={{ color: theme.textSecondary, fontSize: 11 }}>
                        Model: {actionPlan.forecast_tomorrow.model}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: theme.textSecondary, fontSize: 13 }}>No forecast available — train model first</div>
                  )}
                </div>
              </div>

              {/* KIBOR Impact */}
              {actionPlan.kibor_impact && actionPlan.kibor_impact.idle_cash_m > 0 && (
                <div style={{
                  marginTop: 16, padding: 14, background: `${theme.red}11`,
                  borderRadius: 8, border: `1px solid ${theme.red}33`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ color: theme.red, fontSize: 13 }}>
                    Idle Cash: {fmt(actionPlan.kibor_impact.idle_cash_m)} — losing PKR {actionPlan.kibor_impact.daily_loss_pkr?.toLocaleString()}/day
                  </span>
                  <span style={{ color: theme.red, fontSize: 14, fontWeight: 700, fontFamily: theme.mono }}>
                    {fmt(actionPlan.kibor_impact.annual_loss_m)}/yr
                  </span>
                </div>
              )}

              {/* Netting */}
              {(actionPlan.netting_transfers || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                    Netting Transfers
                  </div>
                  {actionPlan.netting_transfers.map((n, j) => (
                    <div key={j} style={{ color: theme.text, fontSize: 13, padding: '3px 0' }}>
                      {n.surplus_branch} → {n.deficit_branch}: {fmt(n.matched_amount)} ({n.distance_km?.toFixed(1)} km)
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
