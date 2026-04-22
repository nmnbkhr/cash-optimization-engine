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

const fmt = (v) => {
  v = v / 1e6
  return v >= 1000 ? (v / 1000).toFixed(1) + 'B' : v.toFixed(1) + 'M'
}

const REGIONS = ['All', 'Sindh', 'Punjab', 'KPK', 'Balochistan', 'Federal']

// Simplified Pakistan border polygon (lat,lng pairs)
const PK_BORDER = [
  // South coast (Balochistan)
  [25.2, 61.8], [25.5, 63.5], [26.0, 64.5], [25.5, 65.5], [25.0, 66.0],
  // Sindh coast
  [24.8, 66.7], [24.5, 67.0], [24.0, 68.0],
  // Eastern border going north
  [27.5, 68.5], [28.5, 68.0], [29.0, 67.0], [30.0, 66.5],
  // Punjab / KPK east
  [31.0, 63.0], [30.5, 61.5],
  // Balochistan west
  [29.5, 60.8], [28.0, 61.0], [27.0, 62.0], [26.5, 63.5],
  // Back west
  [25.2, 61.8],
]

// Northern regions (separate path for clarity)
const PK_NORTH = [
  [30.0, 66.5], [31.0, 63.0],
  // North up through KPK
  [33.5, 73.5], [34.0, 71.0], [36.5, 71.0], [37.0, 74.5],
  // AJK / Kashmir line east
  [35.5, 77.0], [33.5, 73.5],
]

// City label positions (approximate lat, lng)
const CITY_LABELS = [
  { name: 'Karachi', lat: 24.86, lng: 67.01 },
  { name: 'Lahore', lat: 31.55, lng: 74.35 },
  { name: 'Islamabad', lat: 33.69, lng: 73.04 },
  { name: 'Peshawar', lat: 34.01, lng: 71.58 },
  { name: 'Faisalabad', lat: 31.42, lng: 73.08 },
]

const SVG_W = 640
const SVG_H = 700

// Transform geo coords to SVG coords
const toX = (lng) => ((lng - 61) / 16) * SVG_W
const toY = (lat) => ((37 - lat) / 13) * SVG_H

function pathFromCoords(coords) {
  return coords
    .map(([lat, lng], i) => `${i === 0 ? 'M' : 'L'}${toX(lng).toFixed(1)},${toY(lat).toFixed(1)}`)
    .join(' ')
}

function cesColor(score) {
  if (score >= 0.8) return theme.green
  if (score >= 0.5) return theme.gold
  return theme.red
}

function circleRadius(dailyTx) {
  if (dailyTx >= 600) return 6
  if (dailyTx >= 300) return 4.5
  return 3
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
      height: '60vh',
      gap: 16,
    }}>
      <div style={{
        width: 36,
        height: 36,
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.gold,
        borderRadius: '50%',
        animation: 'bmv-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading branch network...
      </span>
      <style>{`@keyframes bmv-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stats Panel                                                        */
/* ------------------------------------------------------------------ */

function StatsPanel({ branches }) {
  // Region breakdown
  const regionCounts = {}
  branches.forEach((b) => {
    const r = b.region || 'Other'
    regionCounts[r] = (regionCounts[r] || 0) + 1
  })
  const regionEntries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])
  const maxRegionCount = Math.max(...regionEntries.map(([, c]) => c), 1)

  // Branch type breakdown
  const typeCounts = {}
  branches.forEach((b) => {
    const t = b.branch_type || 'Unknown'
    typeCounts[t] = (typeCounts[t] || 0) + 1
  })
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])

  const typeColors = {
    'Cash-Surplus': theme.green,
    Surplus: theme.green,
    Deficit: theme.red,
    Balanced: '#3b82f6',
    Seasonal: '#f59e0b',
    Hub: '#a78bfa',
  }

  // CES distribution
  const cesGreen = branches.filter((b) => (b.cash_efficiency_score || 0) >= 0.8).length
  const cesGold = branches.filter((b) => {
    const s = b.cash_efficiency_score || 0
    return s >= 0.5 && s < 0.8
  }).length
  const cesRed = branches.filter((b) => (b.cash_efficiency_score || 0) < 0.5).length

  // Top 10 idle cash branches
  const topIdle = [...branches]
    .filter((b) => (b.idle_cash || 0) > 0)
    .sort((a, b) => (b.idle_cash || 0) - (a.idle_cash || 0))
    .slice(0, 10)

  const sectionTitle = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.textSecondary,
    margin: '0 0 10px 0',
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      overflowY: 'auto',
      maxHeight: '100%',
    }}>
      {/* Region Breakdown */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '16px 18px',
      }}>
        <h4 style={sectionTitle}>Region Breakdown</h4>
        {regionEntries.map(([region, count]) => (
          <div key={region} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 3,
            }}>
              <span style={{ fontSize: 12, color: theme.text }}>{region}</span>
              <span style={{
                fontSize: 12,
                fontFamily: theme.mono,
                fontWeight: 600,
                color: theme.gold,
              }}>
                {count}
              </span>
            </div>
            <div style={{
              height: 6,
              backgroundColor: '#1a2130',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${(count / maxRegionCount) * 100}%`,
                backgroundColor: theme.gold,
                borderRadius: 3,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Branch Type Breakdown */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '16px 18px',
      }}>
        <h4 style={sectionTitle}>Branch Type</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {typeEntries.map(([type, count]) => (
            <div key={type} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: typeColors[type] || theme.textSecondary,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: theme.text, flex: 1 }}>{type}</span>
              <span style={{
                fontSize: 12,
                fontFamily: theme.mono,
                fontWeight: 600,
                color: theme.textSecondary,
              }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CES Distribution */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '16px 18px',
      }}>
        <h4 style={sectionTitle}>CES Distribution</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Efficient', count: cesGreen, color: theme.green },
            { label: 'Moderate', count: cesGold, color: theme.gold },
            { label: 'Attention', count: cesRed, color: theme.red },
          ].map(({ label, count, color }) => (
            <div key={label} style={{
              flex: '1 1 0',
              backgroundColor: theme.bg,
              border: `1px solid ${color}30`,
              borderRadius: 6,
              padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: theme.mono,
                color,
                lineHeight: 1.2,
              }}>
                {count}
              </div>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.textSecondary,
                marginTop: 3,
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 10 Idle Cash */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '16px 18px',
      }}>
        <h4 style={sectionTitle}>Top 10 Idle Cash</h4>
        {topIdle.length === 0 ? (
          <span style={{ fontSize: 12, color: theme.textSecondary }}>No idle cash detected.</span>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.textSecondary,
                  textAlign: 'left',
                  padding: '4px 6px',
                  borderBottom: `1px solid ${theme.border}`,
                }}>
                  Branch
                </th>
                <th style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.textSecondary,
                  textAlign: 'left',
                  padding: '4px 6px',
                  borderBottom: `1px solid ${theme.border}`,
                }}>
                  City
                </th>
                <th style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.textSecondary,
                  textAlign: 'right',
                  padding: '4px 6px',
                  borderBottom: `1px solid ${theme.border}`,
                }}>
                  Idle (PKR)
                </th>
              </tr>
            </thead>
            <tbody>
              {topIdle.map((b, i) => (
                <tr key={b.branch_id} style={{
                  backgroundColor: i % 2 === 0 ? 'transparent' : '#0a0e1750',
                }}>
                  <td style={{
                    fontSize: 11,
                    fontFamily: theme.mono,
                    color: '#06b6d4',
                    padding: '5px 6px',
                    borderBottom: `1px solid ${theme.border}20`,
                  }}>
                    {b.branch_id}
                  </td>
                  <td style={{
                    fontSize: 11,
                    color: theme.textSecondary,
                    padding: '5px 6px',
                    borderBottom: `1px solid ${theme.border}20`,
                  }}>
                    {b.city}
                  </td>
                  <td style={{
                    fontSize: 11,
                    fontFamily: theme.mono,
                    fontWeight: 600,
                    color: theme.red,
                    textAlign: 'right',
                    padding: '5px 6px',
                    borderBottom: `1px solid ${theme.border}20`,
                  }}>
                    {fmt(b.idle_cash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function BranchMapView() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [regionFilter, setRegionFilter] = useState('All')
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)

  useEffect(() => {
    axios.get('http://localhost:8000/api/branches')
      .then((res) => setBranches(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleMouseMove = useCallback((e, branch) => {
    const svgEl = svgRef.current
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    setTooltip({
      x: e.clientX - rect.left + 14,
      y: e.clientY - rect.top - 10,
      branch,
    })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  if (loading) return <Spinner />

  const filtered = regionFilter === 'All'
    ? branches
    : branches.filter((b) => b.region === regionFilter)

  const borderPath = pathFromCoords(PK_BORDER)
  const northPath = pathFromCoords(PK_NORTH)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: theme.text,
            margin: 0,
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            BRANCH NETWORK MAP
          </h1>
          <p style={{ fontSize: 12, color: theme.textSecondary, margin: '4px 0 0' }}>
            {filtered.length.toLocaleString()} branches plotted
            {regionFilter !== 'All' ? ` in ${regionFilter}` : ' across Pakistan'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.textSecondary,
          }}>
            Region
          </label>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            style={{
              backgroundColor: theme.bg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 13,
              fontFamily: theme.mono,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main layout: Map + Stats */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Map Area */}
        <div style={{
          flex: '7 1 0',
          minWidth: 0,
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: 16,
          position: 'relative',
        }}>
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{
              backgroundColor: theme.bg,
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              display: 'block',
            }}
          >
            {/* Pakistan border outline */}
            <path
              d={borderPath + ' Z'}
              fill="none"
              stroke={theme.border}
              strokeWidth={1.2}
              strokeOpacity={0.6}
            />
            <path
              d={northPath}
              fill="none"
              stroke={theme.border}
              strokeWidth={1.2}
              strokeOpacity={0.6}
            />

            {/* Branch circles */}
            {filtered.map((b) => {
              const lat = b.latitude
              const lng = b.longitude
              if (lat == null || lng == null) return null
              const cx = toX(lng)
              const cy = toY(lat)
              const ces = b.cash_efficiency_score || 0
              const color = cesColor(ces)
              const r = circleRadius(b.daily_transactions || 0)

              return (
                <circle
                  key={b.branch_id}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={color}
                  fillOpacity={0.85}
                  stroke={theme.bg}
                  strokeWidth={0.8}
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(e) => handleMouseMove(e, b)}
                  onMouseLeave={handleMouseLeave}
                />
              )
            })}

            {/* City labels */}
            {CITY_LABELS.map((city) => {
              const x = toX(city.lng)
              const y = toY(city.lat)
              return (
                <g key={city.name}>
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    fill={theme.textSecondary}
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="'Space Grotesk', sans-serif"
                    style={{ pointerEvents: 'none' }}
                  >
                    {city.name}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              position: 'absolute',
              left: tooltip.x + 16,
              top: tooltip.y,
              backgroundColor: '#1a2130',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '12px 14px',
              pointerEvents: 'none',
              zIndex: 50,
              minWidth: 200,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}>
              <div style={{
                fontSize: 11,
                fontFamily: theme.mono,
                color: '#06b6d4',
                marginBottom: 4,
              }}>
                {tooltip.branch.branch_id}
              </div>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: theme.text,
                marginBottom: 2,
              }}>
                {tooltip.branch.name || tooltip.branch.branch_id}
              </div>
              <div style={{
                fontSize: 11,
                color: theme.textSecondary,
                marginBottom: 8,
              }}>
                {tooltip.branch.city}, {tooltip.branch.region}
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                marginBottom: 3,
              }}>
                <span style={{ color: theme.textSecondary }}>Efficiency</span>
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: cesColor(tooltip.branch.cash_efficiency_score || 0),
                }}>
                  {((tooltip.branch.cash_efficiency_score || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
              }}>
                <span style={{ color: theme.textSecondary }}>Idle Cash</span>
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: (tooltip.branch.idle_cash || 0) > 0 ? theme.red : theme.green,
                }}>
                  {(tooltip.branch.idle_cash || 0) > 0
                    ? 'PKR ' + fmt(tooltip.branch.idle_cash)
                    : 'None'}
                </span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{
            display: 'flex',
            gap: 20,
            marginTop: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            {[
              { label: 'CES >= 80%', color: theme.green },
              { label: 'CES 50-80%', color: theme.gold },
              { label: 'CES < 50%', color: theme.red },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: color,
                }} />
                <span style={{
                  fontSize: 10,
                  fontFamily: theme.mono,
                  color: theme.textSecondary,
                }}>
                  {label}
                </span>
              </div>
            ))}
            <div style={{
              marginLeft: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ fontSize: 10, color: theme.textSecondary }}>Size = daily transactions</span>
            </div>
          </div>
        </div>

        {/* Stats Panel */}
        <div style={{
          flex: '3 1 0',
          minWidth: 260,
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
        }}>
          <StatsPanel branches={filtered} />
        </div>
      </div>
    </div>
  )
}
