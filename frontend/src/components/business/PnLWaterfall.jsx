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

const formatPKR = (v) => {
  if (v == null) return '\u2014'
  if (Math.abs(v) >= 1000) return `PKR ${(v / 1000).toFixed(1)}B`
  return `PKR ${v.toFixed(1)}M`
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
        animation: 'wf-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading P&L waterfall...
      </span>
      <style>{`@keyframes wf-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load waterfall data
        </p>
        <p style={{ color: theme.textSecondary, fontSize: 12, margin: '0 0 14px' }}>
          {message}
        </p>
        <button
          onClick={onRetry}
          style={{
            backgroundColor: theme.gold,
            color: theme.bg,
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            fontWeight: 700,
            fontSize: 12,
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
/*  Waterfall Bar                                                      */
/* ------------------------------------------------------------------ */

function WaterfallBar({ label, value, barTop, barHeight, chartHeight, barWidth, isPositive, isTotal, connectorFromY }) {
  const barColor = isTotal ? theme.gold : isPositive ? theme.green : theme.red
  const labelColor = isTotal ? theme.gold : isPositive ? theme.green : theme.red
  const sign = isPositive ? '+' : ''
  const displayValue = isTotal ? formatPKR(value) : `${sign}${value.toFixed(1)}M`

  return (
    <div style={{ position: 'relative', width: barWidth, flexShrink: 0 }}>
      {/* Connector line from previous bar's running total */}
      {connectorFromY != null && (
        <div style={{
          position: 'absolute',
          top: connectorFromY,
          left: -10,
          width: 10,
          height: 1,
          backgroundColor: theme.textSecondary + '60',
        }} />
      )}

      {/* Value label above or below bar */}
      <div style={{
        position: 'absolute',
        top: isPositive || isTotal ? barTop - 28 : barTop + barHeight + 6,
        left: 0,
        width: '100%',
        textAlign: 'center',
        fontFamily: theme.mono,
        fontSize: 11,
        fontWeight: 700,
        color: labelColor,
        whiteSpace: 'nowrap',
      }}>
        {displayValue}
      </div>

      {/* The bar */}
      <div style={{
        position: 'absolute',
        top: barTop,
        left: 0,
        width: '100%',
        height: Math.max(barHeight, 2),
        backgroundColor: barColor,
        borderRadius: isTotal ? '4px' : isPositive ? '4px 4px 0 0' : '0 0 4px 4px',
        opacity: isTotal ? 1 : 0.85,
        transition: 'height 0.6s ease, top 0.6s ease',
      }} />

      {/* Item label below chart */}
      <div style={{
        position: 'absolute',
        top: chartHeight + 8,
        left: -10,
        width: barWidth + 20,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: theme.textSecondary,
        lineHeight: '1.3',
      }}>
        {label}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function PnLWaterfall() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/value-realized')
      .then(res => {
        setData(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Network error')
        setLoading(false)
      })
  }

  useEffect(() => { fetchData() }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!data) return null

  const { revenue, costs, net_value_realized } = data

  // Build waterfall items
  const items = [
    { label: 'Vault Freed', value: revenue.vault_cash_freed_income, positive: true },
    { label: 'ATM Freed', value: revenue.atm_cash_freed_income, positive: true },
    { label: 'CRR Float', value: revenue.crr_float_income, positive: true },
    { label: 'Nostro Sweep', value: revenue.nostro_sweep_income, positive: true },
    { label: 'Personnel', value: -costs.cash_personnel, positive: false },
    { label: 'Premises', value: -costs.cash_premises, positive: false },
    { label: 'CIT/Handling', value: -costs.cit_and_handling, positive: false },
    { label: 'Other Ops', value: -costs.other_cash_ops, positive: false },
  ]

  // Compute running totals
  let running = 0
  const steps = items.map(item => {
    const prevRunning = running
    running += item.value
    return {
      ...item,
      runningBefore: prevRunning,
      runningAfter: running,
    }
  })

  // Final net bar
  const netValue = net_value_realized.monthly

  // Find max value for scaling
  let maxRunning = 0
  steps.forEach(s => {
    maxRunning = Math.max(maxRunning, Math.abs(s.runningBefore), Math.abs(s.runningAfter))
  })
  maxRunning = Math.max(maxRunning, Math.abs(netValue))

  // Chart dimensions
  const chartHeight = 300
  const barWidth = 60
  const barGap = 20
  const totalSteps = steps.length + 1 // +1 for net bar
  const chartWidth = totalSteps * (barWidth + barGap) - barGap + 40 // 40 for padding

  // Scale: map value to pixels (leave 40px top/bottom margin for labels)
  const marginY = 40
  const usableHeight = chartHeight - marginY * 2

  // Map value to pixel Y: maxRunning*1.1 -> top (marginY), 0 -> bottom (marginY+usableHeight)
  const toPixelY = (val) => {
    return marginY + (1 - val / (maxRunning * 1.1)) * usableHeight
  }

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '24px 28px',
    }}>
      {/* Title */}
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        fontFamily: theme.mono,
        color: theme.text,
        marginBottom: 6,
        letterSpacing: '0.04em',
      }}>
        P&L WATERFALL &mdash; Monthly Value Creation
      </div>
      <div style={{
        fontSize: 11,
        color: theme.textSecondary,
        marginBottom: 24,
      }}>
        Revenue streams vs operational costs (PKR Millions)
      </div>

      {/* Chart container */}
      <div style={{
        overflowX: 'auto',
        paddingBottom: 8,
      }}>
        <div style={{
          position: 'relative',
          width: chartWidth,
          height: chartHeight + 40, // extra for labels below
          margin: '0 auto',
        }}>
          {/* Zero baseline */}
          <div style={{
            position: 'absolute',
            top: toPixelY(0),
            left: 0,
            width: '100%',
            height: 1,
            backgroundColor: theme.border,
          }} />

          {/* Bars */}
          <div style={{
            display: 'flex',
            gap: barGap,
            paddingLeft: 20,
            position: 'relative',
            height: chartHeight,
          }}>
            {steps.map((step, idx) => {
              const isPositive = step.value >= 0
              let barTop, barHeight

              if (isPositive) {
                // Bar goes UP from runningBefore
                barTop = toPixelY(step.runningAfter)
                barHeight = toPixelY(step.runningBefore) - toPixelY(step.runningAfter)
              } else {
                // Bar goes DOWN from runningBefore
                barTop = toPixelY(step.runningBefore)
                barHeight = toPixelY(step.runningAfter) - toPixelY(step.runningBefore)
              }

              // Connector: horizontal line from previous bar's running total
              let connectorFromY = null
              if (idx > 0) {
                connectorFromY = toPixelY(step.runningBefore)
              }

              return (
                <WaterfallBar
                  key={idx}
                  label={step.label}
                  value={step.value}
                  barTop={barTop}
                  barHeight={barHeight}
                  chartHeight={chartHeight}
                  barWidth={barWidth}
                  isPositive={isPositive}
                  isTotal={false}
                  connectorFromY={connectorFromY}
                />
              )
            })}

            {/* Net Value bar (from 0 to netValue) */}
            {(() => {
              const barTop = toPixelY(Math.max(netValue, 0))
              const barHeight = Math.abs(toPixelY(0) - toPixelY(Math.abs(netValue)))
              // Connector from last step's running total
              const lastStep = steps[steps.length - 1]
              const connectorFromY = toPixelY(lastStep.runningAfter)

              return (
                <WaterfallBar
                  label="Net Value"
                  value={netValue}
                  barTop={barTop}
                  barHeight={barHeight}
                  chartHeight={chartHeight}
                  barWidth={barWidth}
                  isPositive={netValue >= 0}
                  isTotal={true}
                  connectorFromY={connectorFromY}
                />
              )
            })()}
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        marginTop: 16,
        padding: '14px 20px',
        backgroundColor: `${theme.gold}10`,
        border: `1px solid ${theme.gold}30`,
        borderRadius: 8,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.textSecondary,
          }}>
            Monthly
          </span>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: theme.mono,
            color: theme.gold,
          }}>
            {formatPKR(net_value_realized.monthly)}
          </span>
        </div>
        <div style={{
          width: 1,
          height: 24,
          backgroundColor: theme.border,
        }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.textSecondary,
          }}>
            Annual
          </span>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: theme.mono,
            color: theme.gold,
          }}>
            {formatPKR(net_value_realized.annual)}
          </span>
        </div>
      </div>

      {/* Narrative */}
      {data.narrative && (
        <div style={{
          marginTop: 14,
          padding: '12px 16px',
          backgroundColor: `${theme.bg}`,
          borderRadius: 6,
          border: `1px solid ${theme.border}`,
          fontSize: 11,
          lineHeight: '1.6',
          color: theme.textSecondary,
        }}>
          {data.narrative}
        </div>
      )}
    </div>
  )
}
