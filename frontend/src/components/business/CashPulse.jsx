import { useState, useEffect } from 'react'
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

const formatB = (val) => {
  if (val == null) return '--'
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}B`
  return `${val.toFixed(1)}M`
}

const formatM = (val) => {
  if (val == null) return '--'
  return `${val.toFixed(1)}M`
}

/* ------------------------------------------------------------------ */
/*  Inline keyframe styles injected once                               */
/* ------------------------------------------------------------------ */

const animationCSS = `
@keyframes cashFlowRight {
  0%   { transform: translateX(0);     opacity: 0; }
  8%   { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translateX(100%);  opacity: 0; }
}
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 8px rgba(212,168,83,0.3); }
  50%      { box-shadow: 0 0 20px rgba(212,168,83,0.6); }
}
@keyframes tickerScroll {
  0%   { transform: translateX(100%); }
  100% { transform: translateX(-200%); }
}
`

/* ------------------------------------------------------------------ */
/*  Stage box                                                          */
/* ------------------------------------------------------------------ */

function StageBox({ title, lines, accent = theme.gold, icon }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 180,
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: 8,
      padding: '20px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      position: 'relative',
      zIndex: 2,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: accent,
        }}>
          {title}
        </span>
      </div>
      {lines.map((line, i) => (
        <span key={i} style={{
          fontSize: 12,
          fontFamily: theme.mono,
          color: i === 0 ? theme.text : theme.textSecondary,
          fontWeight: i === 0 ? 600 : 400,
          lineHeight: 1.5,
        }}>
          {line}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Animated flow connector with particles                             */
/* ------------------------------------------------------------------ */

function FlowConnector() {
  const dots = [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8]
  return (
    <div style={{
      flex: '0 0 80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1,
    }}>
      {/* Dashed line */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: 1,
        borderTop: `1px dashed ${theme.border}`,
      }} />
      {/* Flowing dots */}
      {dots.map((delay, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: theme.gold,
          transform: 'translateY(-50%)',
          animation: `cashFlowRight 3s ${delay}s ease-in-out infinite`,
          opacity: 0,
        }} />
      ))}
      {/* Arrow head */}
      <div style={{
        position: 'absolute',
        right: -2,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderLeft: `8px solid ${theme.gold}`,
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        opacity: 0.6,
      }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Loading spinner                                                    */
/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200,
      backgroundColor: theme.bg,
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.gold,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Error banner                                                       */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.red}40`,
      borderRadius: 8,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <span style={{ color: theme.red, fontSize: 13, fontFamily: theme.mono }}>
        {message}
      </span>
      <button
        onClick={onRetry}
        style={{
          padding: '6px 16px',
          fontSize: 12,
          fontWeight: 600,
          color: theme.bg,
          backgroundColor: theme.gold,
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function CashPulse() {
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

  const snap = data.bank_snapshot || {}
  const actions = data.today_actions || {}
  const impact = data.optimization_impact || {}
  const compliance = data.compliance || {}

  const vaultCash = snap.total_vault_cash || 0
  const idleCash = snap.total_idle_cash || 0
  const totalBranches = snap.total_branches || 0
  const nettingMatches = actions.netting_matches || 0
  const crrDeploy = actions.crr_deploy || 0
  const dailyIncome = actions.crr_income_today || 0
  const annualValue = impact.annual_value_realized || 0

  // Infer KIBOR-ish rate from daily income and CRR deploy
  const kibor = crrDeploy > 0 ? ((dailyIncome / crrDeploy) * 365 * 100) : 10.5

  return (
    <div style={{
      backgroundColor: theme.bg,
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      padding: '24px 28px 16px',
      width: '100%',
      overflow: 'hidden',
    }}>
      <style>{animationCSS}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: theme.green,
            animation: 'pulseGlow 2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: theme.text,
          }}>
            Cash Pulse
          </span>
          <span style={{
            fontSize: 11,
            color: theme.textSecondary,
            fontFamily: theme.mono,
          }}>
            Real-time money flow
          </span>
        </div>
        <span style={{
          fontSize: 10,
          fontFamily: theme.mono,
          color: compliance.crr_status === 'ON_TRACK' ? theme.green : theme.red,
          padding: '3px 10px',
          borderRadius: 4,
          backgroundColor: compliance.crr_status === 'ON_TRACK'
            ? 'rgba(16,185,129,0.12)'
            : 'rgba(239,68,68,0.12)',
          fontWeight: 600,
        }}>
          CRR: {compliance.crr_status === 'ON_TRACK' ? 'COMPLIANT' : (compliance.crr_status || 'N/A')}
        </span>
      </div>

      {/* Flow diagram */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        marginBottom: 16,
      }}>
        <StageBox
          title="Branches"
          icon={'🏦'}
          accent={theme.gold}
          lines={[
            `${totalBranches.toLocaleString()} branches`,
            `PKR ${formatB(vaultCash)} in vaults`,
            `PKR ${formatB(idleCash)} idle`,
          ]}
        />
        <FlowConnector />
        <StageBox
          title="CIT / Netting"
          icon={'🚚'}
          accent="#06b6d4"
          lines={[
            `${nettingMatches} netting transfers`,
            `Cash in transit`,
            `Surplus \u2192 Deficit flow`,
          ]}
        />
        <FlowConnector />
        <StageBox
          title="SBP / Repo"
          icon={'🏛'}
          accent="#a78bfa"
          lines={[
            `CRR: PKR ${formatB(crrDeploy)} deployed`,
            `Freed for overnight repo`,
            `${kibor.toFixed(1)}% KIBOR yield`,
          ]}
        />
        <FlowConnector />
        <StageBox
          title="Income"
          icon={'💰'}
          accent={theme.green}
          lines={[
            `PKR ${formatM(dailyIncome)} earned today`,
            `PKR ${formatB(annualValue)}/year realized`,
            `Value from optimization`,
          ]}
        />
      </div>

      {/* Bottom ticker */}
      <div style={{
        borderTop: `1px solid ${theme.border}`,
        paddingTop: 12,
        overflow: 'hidden',
        position: 'relative',
        height: 30,
      }}>
        <div style={{
          position: 'absolute',
          whiteSpace: 'nowrap',
          fontFamily: theme.mono,
          fontSize: 16,
          color: theme.textSecondary,
          animation: 'tickerScroll 45s linear infinite',
        }}>
          <span style={{ color: theme.green, fontWeight: 600 }}>
            PKR {formatM(dailyIncome)}
          </span>
          {' earned today from freed cash at KIBOR '}
          <span style={{ color: theme.gold, fontWeight: 600 }}>
            {kibor.toFixed(1)}%
          </span>
          {'  \u00b7  '}
          <span style={{ color: theme.text }}>
            {totalBranches.toLocaleString()} branches
          </span>
          {' pushing PKR '}
          <span style={{ color: theme.gold, fontWeight: 600 }}>
            {formatB(vaultCash)}
          </span>
          {' through the network  \u00b7  '}
          <span style={{ color: '#06b6d4' }}>
            {nettingMatches} netting transfers
          </span>
          {' reducing logistics costs  \u00b7  Annual value: '}
          <span style={{ color: theme.green, fontWeight: 600 }}>
            PKR {formatB(annualValue)}
          </span>
        </div>
      </div>
    </div>
  )
}
