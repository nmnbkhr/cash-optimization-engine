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

const denomLabels = {
  rs5000: 'Rs.5,000',
  rs1000: 'Rs.1,000',
  rs500: 'Rs.500',
  rs100: 'Rs.100',
  rs50_below: 'Rs.50 & below',
}

const ACTION_COLORS = {
  RELEASE: theme.green,
  REQUEST: theme.red,
  HOLD: theme.gold,
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
        animation: 'bsc-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading scorecard...
      </span>
      <style>{`@keyframes bsc-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load scorecard
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

function StarRating({ score }) {
  const pct = Math.max(0, Math.min(1, score)) * 100
  const stars = Math.round(pct / 20)  /* 100%=5, 80%=4, 60%=3, etc. */
  const filled = '\u2605'
  const empty = '\u2606'
  return (
    <span style={{
      fontSize: 28,
      color: theme.gold,
      letterSpacing: 4,
      fontFamily: 'inherit',
    }}>
      {filled.repeat(stars)}{empty.repeat(5 - stars)}
    </span>
  )
}

function ScoreBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value))
  const barColor = pct > 70 ? theme.green : pct > 40 ? theme.gold : theme.red
  const finalColor = color || barColor

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 5,
      }}>
        <span style={{ fontSize: 12, color: theme.text, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{
          fontSize: 12,
          fontFamily: theme.mono,
          fontWeight: 700,
          color: finalColor,
        }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div style={{
        height: 8,
        backgroundColor: `${theme.border}80`,
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: finalColor,
          borderRadius: 4,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Print styles                                                       */
/* ------------------------------------------------------------------ */

const printStyles = `
@media print {
  body * {
    visibility: hidden !important;
  }
  #branch-scorecard-print,
  #branch-scorecard-print * {
    visibility: visible !important;
  }
  #branch-scorecard-print {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    background: #ffffff !important;
    color: #111111 !important;
    padding: 24px !important;
  }
  #branch-scorecard-print [data-print-dark] {
    background: #ffffff !important;
    border-color: #cccccc !important;
    color: #111111 !important;
  }
  #branch-scorecard-print [data-print-text] {
    color: #333333 !important;
  }
  #branch-scorecard-print [data-print-bar-track] {
    background: #e5e5e5 !important;
  }
  .no-print {
    display: none !important;
  }
}
`

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function BranchScorecard() {
  const [branches, setBranches] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [vault, setVault] = useState(null)
  const [denom, setDenom] = useState(null)
  const [loading, setLoading] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [error, setError] = useState(null)

  /* Derive rank from all branches' CES scores */
  const sortedByCES = [...branches].sort(
    (a, b) => (b.cash_efficiency_score || 0) - (a.cash_efficiency_score || 0)
  )

  const selectedBranch = branches.find((b) => b.branch_id === selectedId)
  const branchRank = sortedByCES.findIndex((b) => b.branch_id === selectedId) + 1

  /* Load branch list */
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

  /* Load vault + denom when branch changes */
  const fetchBranchData = (branchId) => {
    if (!branchId) return
    setLoading(true)
    setError(null)
    Promise.all([
      axios.get(`http://localhost:8000/api/business/vault-recommendation/${branchId}`),
      axios.get(`http://localhost:8000/api/business/denomination-plan/${branchId}`),
    ])
      .then(([vaultRes, denomRes]) => {
        setVault(vaultRes.data)
        setDenom(denomRes.data)
      })
      .catch((err) => setError(err.message || 'Failed to load branch data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchBranchData(selectedId) }, [selectedId])

  const handleRetry = () => fetchBranchData(selectedId)

  /* Compute score values */
  const ces = vault?.scorecard?.ces || 0
  const cashEfficiency = ces * 100

  const current = vault?.decision?.current_vault || 0
  const recommended = vault?.decision?.recommended_vault || 1
  const vaultAdherence = recommended > 0
    ? Math.max(0, (1 - Math.abs(current - recommended) / recommended)) * 100
    : 50

  const sbpMin = vault?.constraints?.sbp_minimum || 0
  const insLim = vault?.constraints?.insurance_limit || Infinity
  const sbpCompliance = (current >= sbpMin && current <= insLim) ? 100 : (
    current < sbpMin ? Math.max(0, (current / sbpMin) * 100) :
    Math.max(0, (1 - (current - insLim) / insLim) * 100)
  )

  const digitalAdoption = 35 /* hardcoded baseline */

  const idle = vault?.cost_of_inaction?.idle_cash || 0
  const capacity = vault?.constraints?.vault_capacity || 1
  const costEfficiency = Math.max(0, Math.min(100, (1 - idle / capacity) * 100))

  const action = vault?.decision?.action || 'HOLD'
  const actionColor = ACTION_COLORS[action] || theme.gold
  const dailyLoss = vault?.cost_of_inaction?.total_daily_cost_pkr || 0
  const annualLoss = vault?.scorecard?.savings_potential_annual || 0
  const monthlySavings = annualLoss / 12

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{printStyles}</style>

      {/* Page header */}
      <div className="no-print" style={{ marginBottom: 20 }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: theme.text,
          margin: 0,
        }}>
          Branch Scorecard
        </h1>
        <p style={{
          fontSize: 12,
          color: theme.textSecondary,
          margin: '4px 0 0',
        }}>
          Performance report card &mdash; vault adherence, efficiency, compliance
        </p>
      </div>

      {/* Branch selector */}
      <div className="no-print" style={{
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
      </div>

      {/* Loading / Error states */}
      {loading && <Spinner />}
      {error && !loading && <ErrorBanner message={error} onRetry={handleRetry} />}

      {/* Report card */}
      {!loading && !error && vault && denom && (
        <div
          id="branch-scorecard-print"
          style={{
            maxWidth: 600,
            margin: '0 auto',
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: '32px 36px',
          }}
          data-print-dark
        >
          {/* ---- Header ---- */}
          <div style={{
            textAlign: 'center',
            marginBottom: 24,
            paddingBottom: 20,
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: theme.text,
              margin: '0 0 8px',
            }} data-print-text>
              {vault.branch_name || vault.branch_id}
            </h2>
            <div style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 10,
            }}>
              <Badge text={vault.city || '\u2014'} color={theme.cyan} />
              <Badge text={vault.branch_type || '\u2014'} color={theme.purple} />
              <span style={{
                fontSize: 11,
                color: theme.textSecondary,
                fontFamily: theme.mono,
              }}>
                {vault.date}
              </span>
            </div>

            {/* Star rating */}
            <div style={{ marginBottom: 6 }}>
              <StarRating score={ces} />
            </div>

            {/* Rank */}
            <div style={{
              fontSize: 13,
              fontFamily: theme.mono,
              color: theme.textSecondary,
              fontWeight: 600,
            }} data-print-text>
              Rank: {branchRank > 0 ? branchRank : '\u2014'} / {sortedByCES.length.toLocaleString()}
            </div>
          </div>

          {/* ---- Score bars ---- */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.textSecondary,
              marginTop: 0,
              marginBottom: 16,
            }} data-print-text>
              Performance Scores
            </h3>
            <ScoreBar label="Cash Efficiency (CES)" value={cashEfficiency} />
            <ScoreBar label="Vault Adherence" value={vaultAdherence} />
            <ScoreBar label="SBP Compliance" value={sbpCompliance} />
            <ScoreBar label="Digital Adoption" value={digitalAdoption} />
            <ScoreBar label="Cost Efficiency" value={costEfficiency} />
          </div>

          {/* ---- Financial summary ---- */}
          <div style={{
            marginBottom: 24,
            paddingBottom: 20,
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.textSecondary,
              marginTop: 0,
              marginBottom: 14,
            }} data-print-text>
              Financial Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: theme.textSecondary }}>Monthly Savings Potential</span>
                <span style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: theme.mono,
                  color: theme.green,
                }} data-print-text>
                  {fmt(monthlySavings)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: theme.textSecondary }}>Daily KIBOR Loss</span>
                <span style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: theme.mono,
                  color: dailyLoss > 0 ? theme.red : theme.green,
                }} data-print-text>
                  PKR {dailyLoss.toLocaleString()}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: theme.textSecondary }}>Action</span>
                <Badge text={action} color={actionColor} />
              </div>

              {vault.decision?.action_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: theme.textSecondary }}>Action Amount</span>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: theme.mono,
                    color: actionColor,
                  }} data-print-text>
                    {fmt(vault.decision.action_amount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ---- Denomination plan ---- */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.textSecondary,
              marginTop: 0,
              marginBottom: 14,
            }} data-print-text>
              Denomination Plan
            </h3>

            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              fontFamily: theme.mono,
            }}>
              <thead>
                <tr>
                  {['Denomination', 'Target %'].map((h) => (
                    <th key={h} style={{
                      textAlign: h === 'Denomination' ? 'left' : 'right',
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
                {Object.entries(denom.denomination_plan_pct || {})
                  .filter(([key]) => ['rs5000', 'rs1000', 'rs500', 'rs100'].includes(key))
                  .map(([key, pct]) => (
                    <tr key={key} style={{
                      borderBottom: `1px solid ${theme.border}40`,
                    }}>
                      <td style={{
                        padding: '7px 4px',
                        color: theme.text,
                        fontSize: 12,
                      }} data-print-text>
                        {denomLabels[key] || key}
                      </td>
                      <td style={{
                        padding: '7px 4px',
                        color: theme.gold,
                        textAlign: 'right',
                        fontWeight: 600,
                        fontSize: 12,
                      }} data-print-text>
                        {pct}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {denom.eid_adjusted && (
              <div style={{
                marginTop: 10,
                fontSize: 11,
                color: theme.orange,
                fontStyle: 'italic',
              }}>
                * Eid-adjusted denomination mix active
              </div>
            )}
          </div>

          {/* ---- Print button ---- */}
          <div className="no-print" style={{ textAlign: 'center' }}>
            <button
              onClick={() => window.print()}
              style={{
                backgroundColor: theme.gold,
                color: '#0a0e17',
                border: 'none',
                borderRadius: 8,
                padding: '10px 28px',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: theme.mono,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Print Scorecard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
