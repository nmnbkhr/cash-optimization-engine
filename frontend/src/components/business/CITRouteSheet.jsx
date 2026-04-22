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

const fmt = (v) => v >= 1000 ? (v / 1000).toFixed(1) + ' B' : v.toFixed(1) + ' M'

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
        animation: 'cit-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        Loading route sheet...
      </span>
      <style>{`@keyframes cit-spin { to { transform: rotate(360deg) } }`}</style>
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

function MiniCard({ label, value, sub, color = theme.gold }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 140,
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: theme.textSecondary,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 22,
        fontWeight: 700,
        fontFamily: theme.mono,
        color,
        lineHeight: 1.1,
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: theme.textSecondary }}>{sub}</span>
      )}
    </div>
  )
}

function SecurityBanner({ securityNote, guardsRequired }) {
  return (
    <div style={{
      backgroundColor: 'rgba(239,68,68,0.08)',
      border: `1px solid ${theme.red}40`,
      borderRadius: 8,
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <span style={{ fontSize: 18 }}>&#9888;</span>
      <div style={{ flex: 1 }}>
        <span style={{
          color: theme.red,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: theme.mono,
        }}>
          ENHANCED SECURITY
        </span>
        <span style={{
          color: theme.textSecondary,
          fontSize: 12,
          marginLeft: 12,
        }}>
          {securityNote}
        </span>
      </div>
      {guardsRequired && (
        <Badge text={`${guardsRequired} guards`} color={theme.red} />
      )}
    </div>
  )
}

function StopTimeline({ stops }) {
  return (
    <div style={{ padding: '8px 0 4px 8px' }}>
      {stops.map((stop, idx) => {
        const isLast = idx === stops.length - 1
        const actionColor = stop.action === 'PICKUP' ? theme.green : theme.blue
        return (
          <div key={idx} style={{ display: 'flex', gap: 14, minHeight: 52 }}>
            {/* Timeline column */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 20,
              flexShrink: 0,
            }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: actionColor,
                border: `2px solid ${theme.bg}`,
                flexShrink: 0,
                zIndex: 1,
              }} />
              {!isLast && (
                <div style={{
                  width: 2,
                  flex: 1,
                  backgroundColor: theme.border,
                  marginTop: -1,
                }} />
              )}
            </div>

            {/* Stop details */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              paddingBottom: isLast ? 0 : 12,
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  <span style={{
                    color: theme.textSecondary,
                    fontFamily: theme.mono,
                    fontSize: 11,
                    marginRight: 8,
                  }}>
                    {idx + 1}.
                  </span>
                  {stop.name}
                </span>
                <span style={{
                  color: theme.textSecondary,
                  fontFamily: theme.mono,
                  fontSize: 11,
                }}>
                  {stop.branch_id}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge text={stop.action} color={actionColor} />
                <span style={{
                  fontFamily: theme.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: theme.text,
                  minWidth: 72,
                  textAlign: 'right',
                }}>
                  PKR {fmt(stop.amount)}
                </span>
                <span style={{
                  fontFamily: theme.mono,
                  fontSize: 11,
                  color: theme.textSecondary,
                  minWidth: 44,
                  textAlign: 'right',
                }}>
                  {stop.time_window}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RouteCard({ route }) {
  const [expanded, setExpanded] = useState(false)
  const insuranceOk = route.insurance_ok

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Route header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          cursor: 'pointer',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 14,
            fontWeight: 700,
            color: theme.gold,
          }}>
            {route.route_id}
          </span>
          <Badge text={`Vehicle: ${route.vehicle}`} color={theme.cyan} />
          {route.security_level === 'ENHANCED' && (
            <Badge text={`${route.guards_required} guards`} color={theme.red} />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 14,
            fontWeight: 700,
            color: theme.text,
          }}>
            PKR {fmt(route.total_value)}
          </span>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 12,
            color: theme.textSecondary,
          }}>
            {route.est_duration_hours}h
          </span>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 12,
            color: theme.textSecondary,
          }}>
            {route.stops?.length || 0} stops
          </span>
          <Badge
            text={insuranceOk ? 'INSURED OK' : 'OVER LIMIT'}
            color={insuranceOk ? theme.green : theme.red}
          />
          <span style={{
            color: theme.textSecondary,
            fontSize: 16,
            fontFamily: theme.mono,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
          }}>
            &#9660;
          </span>
        </div>
      </div>

      {/* Expandable stop list */}
      {expanded && route.stops && route.stops.length > 0 && (
        <div style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '16px 20px',
        }}>
          <StopTimeline stops={route.stops} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function CITRouteSheet() {
  const [cities, setCities] = useState([])
  const [selectedCity, setSelectedCity] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load branch list for city dropdown
  useEffect(() => {
    setCitiesLoading(true)
    axios.get('http://localhost:8000/api/branches')
      .then((res) => {
        const branches = res.data || []
        const uniqueCities = [...new Set(branches.map(b => b.city).filter(Boolean))].sort()
        setCities(uniqueCities)
        if (uniqueCities.length > 0 && !selectedCity) {
          setSelectedCity(uniqueCities[0])
        }
      })
      .catch((err) => setError(err.message || 'Failed to load branches'))
      .finally(() => setCitiesLoading(false))
  }, [])

  // Fetch route data when city changes
  useEffect(() => {
    if (!selectedCity) return
    setLoading(true)
    setError(null)
    axios.get(`http://localhost:8000/api/business/cit-routes/${encodeURIComponent(selectedCity)}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Failed to load route data'))
      .finally(() => setLoading(false))
  }, [selectedCity])

  const handleRetry = () => {
    if (selectedCity) {
      setLoading(true)
      setError(null)
      axios.get(`http://localhost:8000/api/business/cit-routes/${encodeURIComponent(selectedCity)}`)
        .then((res) => setData(res.data))
        .catch((err) => setError(err.message || 'Failed to load route data'))
        .finally(() => setLoading(false))
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={handleRetry} />

  const summary = data?.summary
  const routes = data?.routes || []
  const hasEnhanced = routes.some(r => r.security_level === 'ENHANCED')
  const maxGuards = routes.reduce((max, r) => Math.max(max, r.guards_required || 0), 0)

  return (
    <div style={{
      backgroundColor: theme.bg,
      minHeight: '100vh',
      padding: '28px 32px',
      color: theme.text,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{
            fontSize: 22,
            fontWeight: 800,
            margin: 0,
            letterSpacing: '0.04em',
            color: theme.text,
          }}>
            CIT ROUTE SHEET
          </h1>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            disabled={citiesLoading}
            style={{
              backgroundColor: theme.card,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '8px 14px',
              fontFamily: theme.mono,
              fontSize: 13,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {citiesLoading ? (
              <option>Loading...</option>
            ) : (
              cities.map(c => <option key={c} value={c}>{c}</option>)
            )}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {data?.date && (
            <span style={{
              fontFamily: theme.mono,
              fontSize: 12,
              color: theme.textSecondary,
            }}>
              {data.date}
            </span>
          )}
          {data?.operating_window && (
            <Badge text={data.operating_window} color={theme.cyan} />
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary strip */}
          {summary && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <MiniCard
                label="Vehicles"
                value={summary.total_vehicles}
                color={theme.cyan}
              />
              <MiniCard
                label="Total Stops"
                value={summary.total_stops}
                color={theme.text}
              />
              <MiniCard
                label="Cash Moved"
                value={`PKR ${fmt(summary.total_cash_moved)}`}
                color={theme.gold}
              />
              <MiniCard
                label="Total Cost"
                value={`PKR ${summary.total_cost_pkr?.toLocaleString()}`}
                color={theme.orange}
              />
              <MiniCard
                label="Pickups Needed"
                value={summary.branches_needing_pickup}
                color={theme.green}
              />
              <MiniCard
                label="Deliveries Needed"
                value={summary.branches_needing_delivery}
                color={theme.blue}
              />
            </div>
          )}

          {/* Security banner */}
          {(hasEnhanced || data.security_note) && (
            <SecurityBanner
              securityNote={data.security_note}
              guardsRequired={maxGuards}
            />
          )}

          {/* Route cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.textSecondary,
              margin: '8px 0 4px',
            }}>
              Routes ({routes.length})
            </h2>
            {routes.map((route) => (
              <RouteCard key={route.route_id} route={route} />
            ))}
            {routes.length === 0 && (
              <div style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: '32px 20px',
                textAlign: 'center',
                color: theme.textSecondary,
                fontSize: 13,
              }}>
                No routes scheduled for {selectedCity}
              </div>
            )}
          </div>

          {/* Max value constraint note */}
          {summary?.max_vehicle_value_constraint && (
            <div style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 13 }}>&#9432;</span>
              <span style={{
                fontSize: 11,
                color: theme.textSecondary,
              }}>
                Maximum cash value per vehicle:{' '}
                <span style={{
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  color: theme.gold,
                }}>
                  PKR {fmt(summary.max_vehicle_value_constraint)}
                </span>
                {' '}(insurance limit)
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          color: theme.textSecondary,
          marginTop: '20vh',
          fontSize: 14,
        }}>
          Select a city to view CIT routes
        </div>
      )}
    </div>
  )
}
