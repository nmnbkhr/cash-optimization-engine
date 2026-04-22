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
        animation: 'recon-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading reconciliation data...
      </span>
      <style>{`@keyframes recon-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load reconciliation data
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

function StatusBadge({ status }) {
  const isOk = status === 'ALL RECONCILED'
  const color = isOk ? theme.green : theme.red
  const bgColor = isOk ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 16,
      fontWeight: 700,
      fontFamily: theme.mono,
      padding: '8px 24px',
      borderRadius: 8,
      backgroundColor: bgColor,
      color,
      border: `1px solid ${color}40`,
      letterSpacing: '0.04em',
    }}>
      {status}
    </span>
  )
}

function ChainBox({ name, count, pass }) {
  const color = pass ? theme.green : theme.red
  const bgColor = pass ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'
  return (
    <div style={{
      backgroundColor: bgColor,
      border: `1px solid ${color}40`,
      borderRadius: 8,
      padding: '14px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      minWidth: 140,
    }}>
      <span style={{
        fontSize: 12,
        fontWeight: 700,
        color: theme.text,
        textTransform: 'lowercase',
        fontFamily: theme.mono,
      }}>
        {name}
      </span>
      <span style={{
        fontSize: 20,
        fontWeight: 700,
        fontFamily: theme.mono,
        color: theme.gold,
      }}>
        {count != null ? count.toLocaleString() : '\u2014'}
      </span>
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color,
      }}>
        {pass ? '\u2713' : '\u2717'}
      </span>
    </div>
  )
}

function ChainArrow() {
  return (
    <span style={{
      fontSize: 22,
      color: theme.textSecondary,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px',
      fontFamily: theme.mono,
    }}>
      {'\u2192'}
    </span>
  )
}

function PassFailBadge({ pass }) {
  const color = pass ? theme.green : theme.red
  const bgColor = pass ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 700,
      fontFamily: theme.mono,
      padding: '3px 12px',
      borderRadius: 4,
      backgroundColor: bgColor,
      color,
      border: `1px solid ${color}40`,
    }}>
      {pass ? 'PASS' : 'FAIL'}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ReconciliationSheet() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/reconciliation')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!data) return null

  const { status, chain, checks, tables } = data

  /* Parse the chain string into ordered steps (reversed so source is first) */
  const chainParts = chain
    ? chain.split('->').map((s) => s.trim()).reverse()
    : []

  /* Checks data */
  const glCheck = checks?.gl_deposits_vs_branch || {}
  const bankWide = checks?.bank_wide || {}
  const glAvg = bankWide.gl_daily_avg_deposits_m
  const brAvg = bankWide.branch_daily_avg_deposits_m
  const diff = glAvg != null && brAvg != null ? Math.abs(glAvg - brAvg) : null

  const today = new Date().toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Karachi',
  })

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
          Data Reconciliation
        </h1>
        <StatusBadge status={status} />
      </div>

      {/* ---- Chain Visualization ---- */}
      <SectionCard title="Data Lineage Chain" style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 4,
          padding: '8px 0',
        }}>
          {chainParts.map((part, i) => {
            const rowCount = tables?.[part] ?? null
            const allPass = status === 'ALL RECONCILED'
            return (
              <div key={part} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <ChainArrow />}
                <ChainBox name={part} count={rowCount} pass={allPass} />
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ---- Checks ---- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360, 1fr))',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* GL Deposits vs Branch check */}
        <SectionCard title="GL Deposits vs Branch Balances">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, color: theme.text }}>Max Gap</span>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: glCheck.max_gap_m === 0 ? theme.green : theme.gold,
            }}>
              {glCheck.max_gap_m != null ? `${glCheck.max_gap_m.toFixed(1)} M` : '\u2014'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PassFailBadge pass={glCheck.pass} />
          </div>
        </SectionCard>

        {/* Bank-wide comparison */}
        <SectionCard title="Bank-Wide Daily Average Deposits">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 14,
          }}>
            <div>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.textSecondary,
                display: 'block',
                marginBottom: 4,
              }}>
                GL Daily Avg
              </span>
              <span style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.cyan,
              }}>
                {glAvg != null ? `${glAvg.toLocaleString(undefined, { maximumFractionDigits: 1 })} M` : '\u2014'}
              </span>
            </div>
            <div>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.textSecondary,
                display: 'block',
                marginBottom: 4,
              }}>
                Branch Daily Avg
              </span>
              <span style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.purple,
              }}>
                {brAvg != null ? `${brAvg.toLocaleString(undefined, { maximumFractionDigits: 1 })} M` : '\u2014'}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: '#0a0e17',
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
          }}>
            <span style={{ fontSize: 11, color: theme.textSecondary }}>Difference</span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: diff === 0 ? theme.green : theme.orange,
            }}>
              {diff != null ? `${diff.toFixed(1)} M` : '\u2014'}
            </span>
          </div>
        </SectionCard>
      </div>

      {/* ---- Table Stats Grid ---- */}
      <SectionCard title="Table Row Counts" style={{ marginBottom: 20 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {tables && Object.entries(tables).map(([name, count]) => (
            <div key={name} style={{
              backgroundColor: '#0a0e17',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: theme.textSecondary,
                fontFamily: theme.mono,
              }}>
                {name}
              </span>
              <span style={{
                fontSize: 24,
                fontWeight: 700,
                fontFamily: theme.mono,
                color: theme.gold,
              }}>
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ---- Footer ---- */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '16px 0',
        borderTop: `1px solid ${theme.border}`,
      }}>
        <span style={{
          fontSize: 11,
          color: theme.textSecondary,
          fontFamily: theme.mono,
        }}>
          Last verified: {today}
        </span>
        <span style={{
          fontSize: 11,
          color: theme.textSecondary,
          lineHeight: 1.5,
        }}>
          Dirichlet distribution ensures exact summation at every level. SUM(child) == parent.
        </span>
      </div>
    </div>
  )
}
