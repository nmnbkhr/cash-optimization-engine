import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const theme = {
  bg: '#0a0e17',
  card: '#0f1419',
  border: '#1e293b',
  gold: '#d4a853',
  green: '#10b981',
  red: '#ef4444',
  text: '#e8eaed',
  textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
}

const formatM = (val) => {
  if (val == null) return '--'
  return `PKR ${val.toFixed(1)}M`
}

const formatB = (val) => {
  if (val == null) return '--'
  if (Math.abs(val) >= 1000) return `PKR ${(val / 1000).toFixed(1)}B`
  return `PKR ${val.toFixed(1)}M`
}

/* ------------------------------------------------------------------ */
/*  Spinner                                                            */
/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 60,
      gap: 16,
    }}>
      <div style={{
        width: 36,
        height: 36,
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.gold,
        borderRadius: '50%',
        animation: 'wif-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Running simulation...
      </span>
      <style>{`@keyframes wif-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Error banner                                                       */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
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
          Simulation failed
        </p>
        <p style={{ color: theme.textSecondary, fontSize: 13, margin: 0 }}>
          {message}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: 'none',
            border: `1px solid ${theme.gold}`,
            color: theme.gold,
            padding: '8px 20px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: theme.mono,
            fontSize: 12,
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Styled range slider                                                */
/* ------------------------------------------------------------------ */

function SliderInput({ label, value, min, max, step, suffix, formatValue, onChange }) {
  const displayVal = formatValue
    ? formatValue(value)
    : `${value}${suffix || ''}`

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <label style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: theme.textSecondary,
        }}>
          {label}
        </label>
        <span style={{
          fontFamily: theme.mono,
          fontSize: 14,
          fontWeight: 700,
          color: theme.gold,
          minWidth: 80,
          textAlign: 'right',
        }}>
          {displayVal}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: theme.gold, cursor: 'pointer' }}
      />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
      }}>
        <span style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono }}>
          {min}{suffix || ''}
        </span>
        <span style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono }}>
          {max}{suffix || ''}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Toggle switch                                                      */
/* ------------------------------------------------------------------ */

function ToggleSwitch({ label, checked, onChange }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    }}>
      <label style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: theme.textSecondary,
      }}>
        {label}
      </label>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 48,
          height: 26,
          borderRadius: 13,
          backgroundColor: checked ? theme.gold : theme.border,
          position: 'relative',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
      >
        <div style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: checked ? theme.bg : theme.textSecondary,
          position: 'absolute',
          top: 3,
          left: checked ? 25 : 3,
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Metric comparison row                                              */
/* ------------------------------------------------------------------ */

function ComparisonRow({ label, baseline, simulated, unit, inverse }) {
  const delta = simulated - baseline
  const isPositive = inverse ? delta < 0 : delta > 0
  const arrow = delta > 0 ? '\u25B2' : delta < 0 ? '\u25BC' : '\u25CF'
  const deltaColor = delta === 0 ? theme.textSecondary : isPositive ? theme.green : theme.red

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: `1px solid ${theme.border}`,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: theme.mono,
          fontSize: 16,
          fontWeight: 700,
          color: theme.text,
        }}>
          {typeof baseline === 'number' ? baseline.toFixed(2) : '--'}
          {unit && <span style={{ fontSize: 11, color: theme.textSecondary, marginLeft: 4 }}>{unit}</span>}
        </div>
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 16px',
        minWidth: 80,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: theme.textSecondary,
          marginBottom: 2,
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: theme.mono,
          fontSize: 12,
          fontWeight: 700,
          color: deltaColor,
        }}>
          {arrow} {delta > 0 ? '+' : ''}{delta.toFixed(2)}
        </span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: theme.mono,
          fontSize: 16,
          fontWeight: 700,
          color: theme.text,
        }}>
          {typeof simulated === 'number' ? simulated.toFixed(2) : '--'}
          {unit && <span style={{ fontSize: 11, color: theme.textSecondary, marginLeft: 4 }}>{unit}</span>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Breakdown card                                                     */
/* ------------------------------------------------------------------ */

function BreakdownCard({ label, value, color }) {
  return (
    <div style={{
      backgroundColor: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      flex: '1 1 0',
      minWidth: 140,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: theme.textSecondary,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: theme.mono,
        fontSize: 18,
        fontWeight: 700,
        color: color || theme.gold,
      }}>
        {value}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function WhatIfSimulator() {
  // Slider state
  const [kiborBps, setKiborBps] = useState(0)
  const [vaultPct, setVaultPct] = useState(0)
  const [cdmBranches, setCdmBranches] = useState(0)
  const [pkrDeprec, setPkrDeprec] = useState(0)
  const [isEidWeek, setIsEidWeek] = useState(false)

  // Simulation state
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const debounceRef = useRef(null)

  const runSimulation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.post('http://localhost:8000/api/business/simulate', {
        kibor_change_bps: kiborBps,
        vault_reduction_pct: vaultPct,
        cdm_branches_added: cdmBranches,
        pkr_depreciation_pct: pkrDeprec,
        is_eid_week: isEidWeek,
      })
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [kiborBps, vaultPct, cdmBranches, pkrDeprec, isEidWeek])

  // Auto-submit with 500ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSimulation()
    }, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [runSimulation])

  const b = result?.baseline
  const s = result?.simulated
  const d = result?.delta
  const isDown = d?.direction === 'DOWN'

  return (
    <div style={{
      backgroundColor: theme.bg,
      minHeight: '100%',
      padding: 28,
      color: theme.text,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: theme.gold,
          }}>
            What-If Scenario Simulator
          </h2>
          <p style={{
            margin: '4px 0 0',
            fontSize: 12,
            color: theme.textSecondary,
          }}>
            Adjust parameters to model treasury impact scenarios
          </p>
        </div>
        <button
          onClick={runSimulation}
          disabled={loading}
          style={{
            backgroundColor: theme.gold,
            color: theme.bg,
            border: 'none',
            padding: '10px 24px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            fontFamily: theme.mono,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Run Simulation
        </button>
      </div>

      {/* Body: Sliders (left) + Results (right) */}
      <div style={{
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
      }}>
        {/* Sliders panel — 40% */}
        <div style={{
          flex: '0 0 40%',
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: 24,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: theme.gold,
            marginBottom: 20,
            borderBottom: `1px solid ${theme.border}`,
            paddingBottom: 10,
          }}>
            Scenario Parameters
          </div>

          <SliderInput
            label="KIBOR Change (basis points)"
            value={kiborBps}
            min={-500}
            max={500}
            step={25}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v} bps`}
            onChange={setKiborBps}
          />

          <SliderInput
            label="Vault Reduction %"
            value={vaultPct}
            min={0}
            max={50}
            step={5}
            suffix="%"
            onChange={setVaultPct}
          />

          <SliderInput
            label="CDM Branches Added"
            value={cdmBranches}
            min={0}
            max={500}
            step={25}
            onChange={setCdmBranches}
          />

          <SliderInput
            label="PKR Depreciation %"
            value={pkrDeprec}
            min={0}
            max={20}
            step={1}
            suffix="%"
            onChange={setPkrDeprec}
          />

          <ToggleSwitch
            label="Eid Week"
            checked={isEidWeek}
            onChange={setIsEidWeek}
          />
        </div>

        {/* Results panel — 60% */}
        <div style={{ flex: '1 1 60%', minWidth: 0 }}>
          {loading && !result && <Spinner />}
          {error && <ErrorBanner message={error} onRetry={runSimulation} />}

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Side-by-side comparison */}
              <div style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: 24,
              }}>
                {/* Column headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  marginBottom: 12,
                }}>
                  <div style={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: theme.textSecondary,
                  }}>
                    Baseline
                  </div>
                  <div style={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: theme.textSecondary,
                    padding: '0 16px',
                    minWidth: 80,
                  }}>
                    Delta
                  </div>
                  <div style={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: theme.gold,
                  }}>
                    Simulated
                  </div>
                </div>

                <ComparisonRow
                  label="KIBOR Rate"
                  baseline={b?.kibor_pct}
                  simulated={s?.kibor_pct}
                  unit="%"
                  inverse={false}
                />
                <ComparisonRow
                  label="Monthly Revenue"
                  baseline={b?.monthly_revenue_m}
                  simulated={s?.monthly_revenue_m}
                  unit="M"
                  inverse={false}
                />
                <ComparisonRow
                  label="Annual Value"
                  baseline={b?.annual_value_m}
                  simulated={s?.annual_value_m}
                  unit="M"
                  inverse={false}
                />
              </div>

              {/* Impact card */}
              <div style={{
                backgroundColor: theme.card,
                border: `1px solid ${isDown ? theme.red : theme.green}40`,
                borderRadius: 10,
                padding: '24px 28px',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: theme.textSecondary,
                  marginBottom: 8,
                }}>
                  Annual Impact
                </div>
                <div style={{
                  fontFamily: theme.mono,
                  fontSize: 36,
                  fontWeight: 700,
                  color: isDown ? theme.red : theme.green,
                  lineHeight: 1.1,
                }}>
                  {d?.annual_change_m > 0 ? '+' : ''}{formatM(d?.annual_change_m)}
                </div>
                <div style={{
                  fontSize: 13,
                  color: theme.textSecondary,
                  marginTop: 6,
                }}>
                  {isDown ? '\u25BC Decrease' : '\u25B2 Increase'} vs. baseline
                </div>
              </div>

              {/* Narrative */}
              {d?.narrative && (
                <div style={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderLeft: `3px solid ${theme.gold}`,
                  borderRadius: '0 8px 8px 0',
                  padding: '16px 20px',
                }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: theme.gold,
                    marginBottom: 6,
                  }}>
                    Analysis
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: theme.text,
                    fontStyle: 'italic',
                  }}>
                    {d.narrative}
                  </p>
                </div>
              )}

              {/* Breakdown cards */}
              <div style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                <BreakdownCard
                  label="Vault Freed"
                  value={s?.vault_freed_m != null ? formatB(s.vault_freed_m) : '--'}
                  color={theme.green}
                />
                <BreakdownCard
                  label="CDM Savings"
                  value={s?.cdm_savings_m != null ? formatM(s.cdm_savings_m) : '--'}
                  color={theme.green}
                />
                <BreakdownCard
                  label="Nostro FX Impact"
                  value={s?.nostro_fx_impact_m != null ? formatM(s.nostro_fx_impact_m) : '--'}
                  color={theme.gold}
                />
                <BreakdownCard
                  label="Eid Factor"
                  value={s?.eid_factor != null ? `${s.eid_factor.toFixed(2)}x` : '--'}
                  color={s?.eid_factor > 1 ? '#f59e0b' : theme.textSecondary}
                />
              </div>
            </div>
          )}

          {/* Initial state — no result yet and not loading */}
          {!result && !loading && !error && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 60,
              gap: 12,
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
            }}>
              <span style={{ fontSize: 32, opacity: 0.4 }}>&#9881;</span>
              <span style={{
                color: theme.textSecondary,
                fontSize: 13,
              }}>
                Adjust parameters and results will appear here
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
