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
        animation: 'crr-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading CRR position...
      </span>
      <style>{`@keyframes crr-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load CRR data
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
/*  SVG Gauge Helpers                                                  */
/* ------------------------------------------------------------------ */

const CX = 150
const CY = 150
const R = 120
const STROKE_WIDTH = 24
const TICK_R_OUTER = R + 4
const TICK_R_INNER = R - STROKE_WIDTH / 2 - 8

// Convert CRR percentage (0-10) to angle in radians
// 0% -> -90deg (left), 10% -> +90deg (right)
const pctToAngle = (pct) => ((pct / 10) * Math.PI) - Math.PI

// Convert angle (radians) to SVG point
const angleToXY = (angle, r) => ({
  x: CX + r * Math.cos(angle),
  y: CY + r * Math.sin(angle),
})

// Build SVG arc path for a zone between pct1 and pct2
const arcPath = (pct1, pct2, r) => {
  const a1 = pctToAngle(pct1)
  const a2 = pctToAngle(pct2)
  const start = angleToXY(a1, r)
  const end = angleToXY(a2, r)
  const largeArc = (a2 - a1) > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

// Zones: [start%, end%, color, label]
const ZONES = [
  [0, 4, theme.red, 'VIOLATION'],
  [4, 5, theme.orange, 'MONITOR'],
  [5, 7, theme.green, 'COMPLIANT'],
  [7, 10, theme.blue, 'OVER-FUNDED'],
]

// Tick marks at zone boundaries
const TICKS = [
  { pct: 0, label: '0%' },
  { pct: 4, label: '4% min' },
  { pct: 5, label: '5%' },
  { pct: 6, label: '6% target' },
  { pct: 7, label: '7%' },
  { pct: 10, label: '10%' },
]

const statusColors = {
  ON_TRACK: theme.green,
  COMPLIANT: theme.green,
  MONITOR: theme.orange,
  WARNING: theme.orange,
  VIOLATION: theme.red,
  CRITICAL: theme.red,
  OVER_FUNDED: theme.blue,
}

const statusLabels = {
  ON_TRACK: 'On Track',
  COMPLIANT: 'Compliant',
  MONITOR: 'Monitor',
  WARNING: 'Warning',
  VIOLATION: 'Violation',
  CRITICAL: 'Critical',
  OVER_FUNDED: 'Over-Funded',
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CRRGauge() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [animatedPct, setAnimatedPct] = useState(0)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/business/crr-deployment')
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

  // Animate needle
  useEffect(() => {
    if (!data) return
    const target = data.position.avg_pct_so_far
    const duration = 1200
    const startTime = Date.now()
    const startVal = 0

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedPct(startVal + (target - startVal) * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [data])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!data) return null

  const { position, recommendation, risk } = data
  const crrPct = position.avg_pct_so_far
  const deployable = recommendation.free_for_deployment
  const expectedIncome = recommendation.expected_income_today
  const status = risk.compliance_status

  // Needle angle
  const needleAngle = pctToAngle(animatedPct)
  const needleTip = angleToXY(needleAngle, R - 8)
  const needleBase1 = angleToXY(needleAngle + Math.PI / 2, 6)
  const needleBase2 = angleToXY(needleAngle - Math.PI / 2, 6)

  const statusColor = statusColors[status] || theme.green
  const statusLabel = statusLabels[status] || status

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
        CRR COMPLIANCE GAUGE
      </div>
      <div style={{
        fontSize: 11,
        color: theme.textSecondary,
        marginBottom: 20,
      }}>
        Cash Reserve Ratio position vs SBP requirements
      </div>

      {/* Gauge SVG */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <svg
          viewBox="0 0 300 190"
          style={{ width: '100%', maxWidth: 360 }}
        >
          {/* Zone arcs */}
          {ZONES.map(([start, end, color, label], idx) => (
            <path
              key={idx}
              d={arcPath(start, end, R)}
              fill="none"
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="butt"
              opacity={0.7}
            />
          ))}

          {/* Tick marks and labels */}
          {TICKS.map(({ pct, label }, idx) => {
            const angle = pctToAngle(pct)
            const outer = angleToXY(angle, TICK_R_OUTER)
            const inner = angleToXY(angle, R + STROKE_WIDTH / 2 + 2)
            const labelPos = angleToXY(angle, R + STROKE_WIDTH / 2 + 16)

            // Adjust text anchor based on position
            let anchor = 'middle'
            if (pct < 3) anchor = 'end'
            else if (pct > 7) anchor = 'start'

            return (
              <g key={idx}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={theme.textSecondary}
                  strokeWidth={1.5}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  fill={theme.textSecondary}
                  fontSize={8}
                  fontFamily={theme.mono}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
            fill={theme.text}
          />
          {/* Needle center dot */}
          <circle cx={CX} cy={CY} r={8} fill={theme.card} stroke={theme.text} strokeWidth={2} />

          {/* Center text: CRR percentage */}
          <text
            x={CX}
            y={CY - 24}
            fill={statusColor}
            fontSize={28}
            fontWeight={700}
            fontFamily={theme.mono}
            textAnchor="middle"
            dominantBaseline="auto"
          >
            {crrPct.toFixed(2)}%
          </text>

          {/* Status badge */}
          <rect
            x={CX - 36}
            y={CY - 14}
            width={72}
            height={20}
            rx={4}
            fill={`${statusColor}20`}
            stroke={`${statusColor}50`}
            strokeWidth={1}
          />
          <text
            x={CX}
            y={CY - 1}
            fill={statusColor}
            fontSize={9}
            fontWeight={700}
            fontFamily={theme.mono}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {statusLabel.toUpperCase()}
          </text>
        </svg>

        {/* Below gauge: deployment info */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
        }}>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: theme.mono,
            color: theme.gold,
            lineHeight: 1.1,
          }}>
            FREE {formatPKR(deployable)}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.textSecondary,
            letterSpacing: '0.02em',
          }}>
            Deploy in Overnight KIBOR Repo
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            padding: '8px 16px',
            backgroundColor: `${theme.green}10`,
            border: `1px solid ${theme.green}30`,
            borderRadius: 6,
          }}>
            <span style={{
              fontSize: 11,
              color: theme.textSecondary,
              fontWeight: 600,
            }}>
              Expected income today:
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: theme.mono,
              color: theme.green,
            }}>
              {formatPKR(expectedIncome)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
