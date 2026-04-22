import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const theme = {
  bg: '#0a0e17',
  card: '#0f1419',
  border: '#1e293b',
  gold: '#d4a853',
  green: '#10b981',
  red: '#ef4444',
  orange: '#f59e0b',
  yellow: '#eab308',
  text: '#e8eaed',
  textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
}

const SEVERITY_CONFIG = {
  CRITICAL: { color: theme.red, bg: 'rgba(239,68,68,0.12)', label: 'Critical' },
  HIGH:     { color: theme.orange, bg: 'rgba(245,158,11,0.12)', label: 'High' },
  MEDIUM:   { color: theme.yellow, bg: 'rgba(234,179,8,0.12)', label: 'Medium' },
  LOW:      { color: theme.textSecondary, bg: 'rgba(139,148,158,0.1)', label: 'Low' },
}

const TAB_ORDER = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

/* ------------------------------------------------------------------ */
/*  Relative time helper                                               */
/* ------------------------------------------------------------------ */

function timeAgo(timestamp) {
  if (!timestamp) return ''
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
}

/* ------------------------------------------------------------------ */
/*  Spinner                                                            */
/* ------------------------------------------------------------------ */

function Spinner({ message }) {
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
        animation: 'alert-spin 0.8s linear infinite',
      }} />
      <span style={{
        color: theme.textSecondary,
        fontFamily: theme.mono,
        fontSize: 13,
      }}>
        {message || 'Loading alerts...'}
      </span>
      <style>{`@keyframes alert-spin { to { transform: rotate(360deg) } }`}</style>
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
          Failed to load alerts
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
/*  Severity badge                                                     */
/* ------------------------------------------------------------------ */

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.LOW
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      minWidth: 44,
    }}>
      <div style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: cfg.color,
        boxShadow: `0 0 8px ${cfg.color}60`,
      }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Single alert card                                                  */
/* ------------------------------------------------------------------ */

function AlertCard({ alert, onDismiss }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.LOW

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 0,
      backgroundColor: cfg.bg,
      border: `1px solid ${cfg.color}30`,
      borderRadius: 8,
      padding: '14px 16px',
      transition: 'opacity 0.2s',
    }}>
      {/* Severity icon */}
      <SeverityBadge severity={alert.severity} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 4,
        }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: cfg.color,
          }}>
            {alert.type?.replace(/_/g, ' ')}
          </span>
          {alert.branch_id && (
            <span style={{
              fontFamily: theme.mono,
              fontSize: 11,
              color: theme.gold,
              backgroundColor: `${theme.gold}15`,
              padding: '1px 8px',
              borderRadius: 4,
            }}>
              {alert.branch_id}
            </span>
          )}
        </div>
        <p style={{
          margin: '0 0 6px',
          fontSize: 13,
          lineHeight: 1.5,
          color: theme.text,
        }}>
          {alert.message}
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{
            fontFamily: theme.mono,
            fontSize: 11,
            color: theme.textSecondary,
          }}>
            {timeAgo(alert.timestamp)}
          </span>
          {alert.value != null && (
            <span style={{
              fontFamily: theme.mono,
              fontSize: 11,
              color: cfg.color,
              fontWeight: 600,
            }}>
              PKR {alert.value.toFixed(1)}M
            </span>
          )}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(alert.id)}
        title="Dismiss alert"
        style={{
          background: 'none',
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          color: theme.textSecondary,
          cursor: 'pointer',
          padding: '4px 10px',
          fontSize: 12,
          fontFamily: theme.mono,
          fontWeight: 600,
          lineHeight: 1,
          flexShrink: 0,
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = theme.red
          e.currentTarget.style.borderColor = theme.red
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = theme.textSecondary
          e.currentTarget.style.borderColor = theme.border
        }}
      >
        &#x2715;
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState(null)
  const [counts, setCounts] = useState(null)
  const [activeTab, setActiveTab] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [alertsRes, countsRes] = await Promise.all([
        axios.get('http://localhost:8000/api/business/alerts'),
        axios.get('http://localhost:8000/api/business/alerts/count'),
      ])
      setAlerts(alertsRes.data)
      setCounts(countsRes.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await axios.post('http://localhost:8000/api/business/alerts/generate')
      await fetchAlerts()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Generate failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleDismiss = async (id) => {
    try {
      await axios.post(`http://localhost:8000/api/business/alerts/${id}/dismiss`)
      setAlerts((prev) => prev.filter((a) => a.id !== id))
      // Update counts
      const dismissed = alerts?.find((a) => a.id === id)
      if (dismissed && counts) {
        setCounts((prev) => ({
          ...prev,
          [dismissed.severity]: Math.max(0, (prev[dismissed.severity] || 0) - 1),
          total: Math.max(0, (prev.total || 0) - 1),
        }))
      }
    } catch (err) {
      // Silently handle — optimistic removal
      setAlerts((prev) => prev.filter((a) => a.id !== id))
    }
  }

  const filtered = alerts
    ? activeTab === 'ALL'
      ? alerts
      : alerts.filter((a) => a.severity === activeTab)
    : []

  const hasAlerts = alerts && alerts.length > 0
  const neverLoaded = !loading && alerts !== null && alerts.length === 0 && !error

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h2 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: theme.gold,
          }}>
            Alerts &amp; Exceptions
          </h2>
          {counts?.total != null && (
            <span style={{
              fontFamily: theme.mono,
              fontSize: 12,
              fontWeight: 700,
              color: theme.bg,
              backgroundColor: counts.total > 0 ? theme.red : theme.green,
              borderRadius: 12,
              padding: '3px 12px',
              minWidth: 28,
              textAlign: 'center',
            }}>
              {counts.total}
            </span>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            backgroundColor: theme.gold,
            color: theme.bg,
            border: 'none',
            padding: '10px 24px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            fontFamily: theme.mono,
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.6 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {generating ? 'Scanning...' : 'Generate Alerts'}
        </button>
      </div>

      {/* Loading state */}
      {loading && <Spinner />}

      {/* Error state */}
      {error && !loading && <ErrorBanner message={error} onRetry={fetchAlerts} />}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Never-loaded prompt */}
          {neverLoaded && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 60,
              gap: 14,
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
            }}>
              <span style={{ fontSize: 36, opacity: 0.4 }}>&#128276;</span>
              <span style={{
                color: theme.textSecondary,
                fontSize: 14,
              }}>
                Click "Generate Alerts" to scan for exceptions
              </span>
            </div>
          )}

          {/* Alerts present */}
          {hasAlerts && (
            <>
              {/* Severity filter tabs */}
              <div style={{
                display: 'flex',
                gap: 4,
                marginBottom: 20,
                borderBottom: `1px solid ${theme.border}`,
                paddingBottom: 0,
              }}>
                {TAB_ORDER.map((tab) => {
                  const isActive = activeTab === tab
                  const cfg = SEVERITY_CONFIG[tab]
                  const tabColor = cfg ? cfg.color : theme.text
                  const tabCount = tab === 'ALL'
                    ? counts?.total ?? alerts.length
                    : counts?.[tab] ?? alerts.filter((a) => a.severity === tab).length

                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: 'none',
                        border: 'none',
                        borderBottom: isActive ? `2px solid ${tabColor}` : '2px solid transparent',
                        color: isActive ? tabColor : theme.textSecondary,
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'color 0.15s, border-color 0.15s',
                      }}
                    >
                      {tab === 'ALL' ? 'All' : cfg?.label || tab}
                      <span style={{
                        fontFamily: theme.mono,
                        fontSize: 11,
                        backgroundColor: isActive ? `${tabColor}20` : `${theme.border}`,
                        color: isActive ? tabColor : theme.textSecondary,
                        borderRadius: 10,
                        padding: '1px 8px',
                        minWidth: 22,
                        textAlign: 'center',
                      }}>
                        {tabCount}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Alert list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.length > 0 ? (
                  filtered.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onDismiss={handleDismiss}
                    />
                  ))
                ) : (
                  /* Empty after filtering */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 48,
                    gap: 12,
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                  }}>
                    <span style={{ fontSize: 28, color: theme.green }}>&#10003;</span>
                    <span style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                    }}>
                      No active alerts. System healthy.
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
