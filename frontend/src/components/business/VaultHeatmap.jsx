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

const CES_GREEN = '#10b981'
const CES_GOLD = '#d4a853'
const CES_RED = '#ef4444'

function cesColor(score) {
  if (score == null) return theme.border
  if (score >= 0.8) return CES_GREEN
  if (score >= 0.5) return CES_GOLD
  return CES_RED
}

function cesLabel(score) {
  if (score == null) return '--'
  return `${(score * 100).toFixed(0)}%`
}

function formatPKR(val) {
  // Input is RAW PKR (from /api/branches). Fixed: previously mislabeled raw/1e6 as "B".
  if (val == null) return '--'
  const a = Math.abs(val)
  if (a >= 1e9) return `PKR ${(val / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `PKR ${(val / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `PKR ${(val / 1e3).toFixed(1)}K`
  return `PKR ${val.toFixed(0)}`
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
      minHeight: 260,
      backgroundColor: theme.bg,
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.gold,
        borderRadius: '50%',
        animation: 'vhSpin 0.8s linear infinite',
      }} />
      <style>{`@keyframes vhSpin { to { transform: rotate(360deg); } }`}</style>
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
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

function Tooltip({ branch, position }) {
  if (!branch || !position) return null
  const ces = branch.cash_efficiency_score
  return (
    <div style={{
      position: 'fixed',
      left: position.x + 14,
      top: position.y - 10,
      zIndex: 9999,
      backgroundColor: '#181d25',
      border: `1px solid ${theme.border}`,
      borderRadius: 6,
      padding: '10px 14px',
      pointerEvents: 'none',
      minWidth: 200,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: theme.text,
        marginBottom: 4,
        fontFamily: theme.mono,
      }}>
        {branch.branch_id}
      </div>
      <div style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 2 }}>
        {branch.name || '--'}
      </div>
      <div style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>
        {branch.city} &middot; {branch.branch_type || '--'}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: theme.mono,
          color: cesColor(ces),
        }}>
          CES: {cesLabel(ces)}
        </span>
        <div style={{
          flex: 1,
          height: 4,
          backgroundColor: theme.border,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${(ces || 0) * 100}%`,
            height: '100%',
            backgroundColor: cesColor(ces),
            borderRadius: 2,
          }} />
        </div>
      </div>
      <div style={{
        fontSize: 10,
        fontFamily: theme.mono,
        color: theme.textSecondary,
      }}>
        Idle: {formatPKR(branch.idle_cash)}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function VaultHeatmap() {
  const [branches, setBranches] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredBranch, setHoveredBranch] = useState(null)
  const [mousePos, setMousePos] = useState(null)
  const containerRef = useRef(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    axios.get('http://localhost:8000/api/branches')
      .then((res) => setBranches(res.data))
      .catch((err) => setError(err.message || 'Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  if (loading) return <Spinner />
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />
  if (!branches || branches.length === 0) return null

  // Sort by city, then CES ascending (worst first) within each city
  const sorted = [...branches].sort((a, b) => {
    const cityA = (a.city || '').toLowerCase()
    const cityB = (b.city || '').toLowerCase()
    if (cityA < cityB) return -1
    if (cityA > cityB) return 1
    return (a.cash_efficiency_score || 0) - (b.cash_efficiency_score || 0)
  })

  // Build city groups
  const cityGroups = []
  let currentCity = null
  for (const branch of sorted) {
    const city = branch.city || 'Unknown'
    if (city !== currentCity) {
      cityGroups.push({ city, branches: [] })
      currentCity = city
    }
    cityGroups[cityGroups.length - 1].branches.push(branch)
  }

  // Summary counts
  const totalCount = sorted.length
  const greenCount = sorted.filter(b => (b.cash_efficiency_score || 0) >= 0.8).length
  const goldCount = sorted.filter(b => {
    const s = b.cash_efficiency_score || 0
    return s >= 0.5 && s < 0.8
  }).length
  const redCount = sorted.filter(b => (b.cash_efficiency_score || 0) < 0.5).length

  const CELL_SIZE = 10
  const CELL_GAP = 2
  const COLS = 55

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        padding: '24px 28px',
        width: '100%',
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: theme.text,
          }}>
            Vault Health
          </span>
          <span style={{
            fontSize: 12,
            fontFamily: theme.mono,
            color: theme.textSecondary,
          }}>
            {totalCount.toLocaleString()} branches
          </span>
        </div>
        {/* Summary strip */}
        <div style={{
          display: 'flex',
          gap: 16,
          fontSize: 11,
          fontFamily: theme.mono,
        }}>
          <span style={{ color: CES_GREEN }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: CES_GREEN,
              marginRight: 5,
              verticalAlign: 'middle',
            }} />
            {greenCount} optimized
          </span>
          <span style={{ color: CES_GOLD }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: CES_GOLD,
              marginRight: 5,
              verticalAlign: 'middle',
            }} />
            {goldCount} need attention
          </span>
          <span style={{ color: CES_RED }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: CES_RED,
              marginRight: 5,
              verticalAlign: 'middle',
            }} />
            {redCount} critical
          </span>
        </div>
      </div>

      {/* Heatmap grid */}
      <div
        ref={containerRef}
        style={{
          maxHeight: 520,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: 4,
        }}
      >
        {cityGroups.map((group, gi) => {
          const cells = group.branches
          return (
            <div key={group.city} style={{
              marginBottom: 6,
            }}>
              {/* City label */}
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: theme.textSecondary,
                marginBottom: 3,
                marginTop: gi === 0 ? 0 : 6,
                borderTop: gi === 0 ? 'none' : `1px solid ${theme.border}`,
                paddingTop: gi === 0 ? 0 : 6,
              }}>
                {group.city}
                <span style={{
                  fontWeight: 400,
                  marginLeft: 6,
                  color: `${theme.textSecondary}99`,
                  fontFamily: theme.mono,
                }}>
                  ({cells.length})
                </span>
              </div>
              {/* Grid of cells */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: CELL_GAP,
              }}>
                {cells.map((branch) => {
                  const isHovered = hoveredBranch && hoveredBranch.branch_id === branch.branch_id
                  return (
                    <div
                      key={branch.branch_id}
                      onMouseEnter={() => setHoveredBranch(branch)}
                      onMouseLeave={() => setHoveredBranch(null)}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        borderRadius: 2,
                        backgroundColor: cesColor(branch.cash_efficiency_score),
                        opacity: isHovered ? 1 : 0.8,
                        transform: isHovered ? 'scale(1.6)' : 'scale(1)',
                        transition: 'transform 0.15s ease, opacity 0.15s ease',
                        cursor: 'pointer',
                        zIndex: isHovered ? 10 : 1,
                        position: 'relative',
                        boxShadow: isHovered
                          ? `0 0 8px ${cesColor(branch.cash_efficiency_score)}80`
                          : 'none',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        marginTop: 16,
        paddingTop: 12,
        borderTop: `1px solid ${theme.border}`,
        fontSize: 10,
        fontFamily: theme.mono,
        color: theme.textSecondary,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: CES_GREEN,
          }} />
          Optimized (CES &gt; 80%)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: CES_GOLD,
          }} />
          Moderate (50-80%)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: CES_RED,
          }} />
          Critical (&lt; 50%)
        </div>
      </div>

      {/* Tooltip (portal-free, fixed position) */}
      {hoveredBranch && mousePos && (
        <Tooltip branch={hoveredBranch} position={mousePos} />
      )}
    </div>
  )
}
