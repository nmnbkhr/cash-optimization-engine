import { useState, useEffect } from 'react'
import { useForecastStore } from '../../stores/forecastStore'
import useAppStore from '../../stores/appStore'
import axios from 'axios'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Line,
} from 'recharts'
import {
  TrendingUp, RefreshCw, Activity, Zap, AlertTriangle, CheckCircle2, FlaskConical,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

const theme = {
  bg: '#0a0e17',
  card: '#0f1419',
  border: '#1e293b',
  gold: '#d4a853',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  text: '#e8eaed',
  textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
  sans: "'Space Grotesk', sans-serif",
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(isoString) {
  if (!isoString) return ''
  const then = new Date(isoString)
  const now = new Date()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function formatM(val) {
  if (val == null) return '--'
  return `${val.toFixed(1)}M`
}

/* ------------------------------------------------------------------ */
/*  Spinner                                                            */
/* ------------------------------------------------------------------ */

function Spinner({ size = 32 }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200,
    }}>
      <div style={{
        width: size,
        height: size,
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.gold,
        borderRadius: '50%',
        animation: 'fdSpin 0.8s linear infinite',
      }} />
      <style>{`@keyframes fdSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline Spinner for buttons                                         */
/* ------------------------------------------------------------------ */

function InlineSpinner({ size = 14, color = theme.bg }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: `2px solid transparent`,
      borderTopColor: color,
      borderRightColor: color,
      borderRadius: '50%',
      animation: 'fdSpin 0.6s linear infinite',
      flexShrink: 0,
    }} />
  )
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null

  const row = payload[0]?.payload
  if (!row) return null

  const items = [
    { label: 'Deposits', value: row.predicted_deposits, color: theme.green,
      range: row.deposits_lower_95 != null ? `[${row.deposits_lower_95?.toFixed(1)} - ${row.deposits_upper_95?.toFixed(1)}]` : null },
    { label: 'Withdrawals', value: row.predicted_withdrawals, color: theme.amber,
      range: row.withdrawals_lower_95 != null ? `[${row.withdrawals_lower_95?.toFixed(1)} - ${row.withdrawals_upper_95?.toFixed(1)}]` : null },
    { label: 'Net', value: row.predicted_net, color: theme.text },
    { label: 'Rec. Vault', value: row.recommended_vault, color: theme.gold },
  ]

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 11,
      fontFamily: theme.mono,
      lineHeight: 1.7,
    }}>
      <div style={{ color: theme.text, fontWeight: 600, marginBottom: 4 }}>
        {row.day_name} &mdash; {label}
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: it.color, flexShrink: 0 }} />
          <span style={{ color: theme.textSecondary }}>{it.label}:</span>
          <span style={{ color: it.color, fontWeight: 600 }}>
            {it.value != null ? `${it.value.toFixed(1)}M` : '--'}
          </span>
          {it.range && (
            <span style={{ color: theme.textSecondary, fontSize: 10 }}>{it.range}</span>
          )}
        </div>
      ))}
      {row.is_salary_day && (
        <div style={{ color: theme.gold, fontSize: 10, marginTop: 4, fontWeight: 600 }}>SALARY DAY</div>
      )}
      {row.is_friday && (
        <div style={{ color: theme.cyan, fontSize: 10, marginTop: 2, fontWeight: 600 }}>FRIDAY</div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Model Status Bar                                                   */
/* ------------------------------------------------------------------ */

function ModelStatusBar({ modelStatus, training, predictingAll, onTrain, onPredictAll }) {
  const trained = modelStatus?.is_trained
  const metrics = modelStatus?.metrics || {}

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: '14px 20px',
      flexWrap: 'wrap',
    }}>
      {/* Left: status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {trained ? (
          <CheckCircle2 size={16} color={theme.green} />
        ) : (
          <AlertTriangle size={16} color={theme.red} />
        )}
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: trained ? theme.green : theme.red,
          padding: '3px 10px',
          borderRadius: 4,
          backgroundColor: trained ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
        }}>
          {trained ? 'Trained' : 'Not Trained'}
        </span>
        {trained && modelStatus?.trained_at && (
          <span style={{ fontSize: 11, color: theme.textSecondary, fontFamily: theme.mono }}>
            {relativeTime(modelStatus.trained_at)}
          </span>
        )}
      </div>

      {/* Center: metrics */}
      {trained && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <MetricPill label="MAPE Dep." value={`${metrics.mape_deposits?.toFixed(1) || '--'}%`} color={theme.green} />
          <MetricPill label="MAPE Wdr." value={`${metrics.mape_withdrawals?.toFixed(1) || '--'}%`} color={theme.amber} />
          <MetricPill label="Coverage Dep." value={`${metrics.coverage_deposits?.toFixed(1) || '--'}%`} color={theme.cyan} />
          <MetricPill label="Coverage Wdr." value={`${metrics.coverage_withdrawals?.toFixed(1) || '--'}%`} color={theme.cyan} />
          <MetricPill label="Forecast Rows" value={modelStatus.forecast_rows?.toLocaleString() || '0'} color={theme.text} />
        </div>
      )}

      {/* Right: buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onTrain}
          disabled={training}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: theme.bg,
            backgroundColor: theme.gold,
            border: 'none',
            borderRadius: 6,
            cursor: training ? 'not-allowed' : 'pointer',
            opacity: training ? 0.7 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {training ? <InlineSpinner size={14} color={theme.bg} /> : <Zap size={14} />}
          {training ? 'Training...' : 'Train Model'}
        </button>
        <button
          onClick={onPredictAll}
          disabled={predictingAll || !trained}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: !trained ? theme.textSecondary : theme.gold,
            backgroundColor: 'transparent',
            border: `1px solid ${!trained ? theme.border : theme.gold}`,
            borderRadius: 6,
            cursor: predictingAll || !trained ? 'not-allowed' : 'pointer',
            opacity: predictingAll ? 0.7 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {predictingAll ? <InlineSpinner size={14} color={theme.gold} /> : <RefreshCw size={14} />}
          {predictingAll ? 'Predicting...' : 'Predict All'}
        </button>
      </div>
    </div>
  )
}

function MetricPill({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono }}>{label}</span>
      <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: theme.mono }}>{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Forecast Chart                                                     */
/* ------------------------------------------------------------------ */

function ForecastChart({ forecast }) {
  const data = forecast.forecasts || []
  if (data.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
          <XAxis
            dataKey="day_name"
            tick={{ fill: theme.textSecondary, fontSize: 11, fontFamily: theme.mono }}
            stroke={theme.border}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.mono }}
            stroke={theme.border}
            tickLine={false}
            tickFormatter={(v) => `${v.toFixed(0)}M`}
          />
          <Tooltip content={<ForecastTooltip />} />

          {/* Deposits confidence band */}
          <Area dataKey="deposits_upper_95" stroke="none" fill={theme.green} fillOpacity={0.15} name="Dep. Upper 95%" />
          <Area dataKey="deposits_lower_95" stroke="none" fill={theme.card} fillOpacity={1} name="Dep. Lower 95%" />
          <Line dataKey="predicted_deposits" stroke={theme.green} strokeWidth={2} dot={{ r: 3, fill: theme.green }} name="Deposits" />

          {/* Withdrawals confidence band */}
          <Area dataKey="withdrawals_upper_95" stroke="none" fill={theme.amber} fillOpacity={0.15} name="Wdr. Upper 95%" />
          <Area dataKey="withdrawals_lower_95" stroke="none" fill={theme.card} fillOpacity={1} name="Wdr. Lower 95%" />
          <Line dataKey="predicted_withdrawals" stroke={theme.amber} strokeWidth={2} dot={{ r: 3, fill: theme.amber }} name="Withdrawals" />

          {/* Reference lines */}
          {forecast.recommended_vault != null && (
            <ReferenceLine
              y={forecast.recommended_vault}
              stroke={theme.gold}
              strokeDasharray="8 4"
              strokeWidth={1.5}
              label={{ value: 'Recommended', fill: theme.gold, fontSize: 10, position: 'right' }}
            />
          )}
          {forecast.current_vault != null && (
            <ReferenceLine
              y={forecast.current_vault}
              stroke={theme.textSecondary}
              strokeDasharray="8 4"
              strokeWidth={1}
              label={{ value: 'Current', fill: theme.textSecondary, fontSize: 10, position: 'right' }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Forecast Table                                                     */
/* ------------------------------------------------------------------ */

function ForecastTable({ forecasts }) {
  if (!forecasts || forecasts.length === 0) return null

  const cols = [
    { key: 'date', label: 'Date', width: '13%' },
    { key: 'day_name', label: 'Day', width: '10%' },
    { key: 'deposits', label: 'Deposits (PKR M)', width: '22%' },
    { key: 'withdrawals', label: 'Withdrawals (PKR M)', width: '22%' },
    { key: 'predicted_net', label: 'Net (M)', width: '13%' },
    { key: 'recommended_vault', label: 'Rec. Vault (M)', width: '13%' },
  ]

  const thStyle = {
    padding: '8px 10px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.textSecondary,
    fontFamily: theme.mono,
    textAlign: 'left',
    borderBottom: `1px solid ${theme.border}`,
  }

  const tdStyle = {
    padding: '7px 10px',
    fontSize: 11,
    fontFamily: theme.mono,
    color: theme.text,
    borderBottom: `1px solid ${theme.border}`,
  }

  return (
    <div style={{
      marginTop: 16,
      overflowX: 'auto',
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: theme.card }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={{ ...thStyle, width: c.width }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {forecasts.map((row, idx) => {
            const rowBg = row.is_salary_day
              ? 'rgba(212,168,83,0.08)'
              : row.is_friday
              ? 'rgba(6,182,212,0.06)'
              : idx % 2 === 0
              ? theme.card
              : theme.bg

            return (
              <tr key={idx} style={{ backgroundColor: rowBg }}>
                <td style={tdStyle}>{row.date}</td>
                <td style={{
                  ...tdStyle,
                  color: row.is_salary_day ? theme.gold : row.is_friday ? theme.cyan : theme.text,
                  fontWeight: (row.is_salary_day || row.is_friday) ? 700 : 400,
                }}>
                  {row.day_name}
                  {row.is_salary_day && <span style={{ color: theme.gold, fontSize: 9, marginLeft: 4 }}>$</span>}
                  {row.is_friday && <span style={{ color: theme.cyan, fontSize: 9, marginLeft: 4 }}>F</span>}
                </td>
                <td style={tdStyle}>
                  <span style={{ color: theme.green, fontWeight: 600 }}>
                    {row.predicted_deposits?.toFixed(1)}
                  </span>
                  <span style={{ color: theme.textSecondary, fontSize: 10, marginLeft: 6 }}>
                    [{row.deposits_lower_95?.toFixed(1)}-{row.deposits_upper_95?.toFixed(1)}]
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: theme.amber, fontWeight: 600 }}>
                    {row.predicted_withdrawals?.toFixed(1)}
                  </span>
                  <span style={{ color: theme.textSecondary, fontSize: 10, marginLeft: 6 }}>
                    [{row.withdrawals_lower_95?.toFixed(1)}-{row.withdrawals_upper_95?.toFixed(1)}]
                  </span>
                </td>
                <td style={{
                  ...tdStyle,
                  color: (row.predicted_net || 0) >= 0 ? theme.green : theme.red,
                  fontWeight: 600,
                }}>
                  {row.predicted_net?.toFixed(1)}
                </td>
                <td style={{ ...tdStyle, color: theme.gold, fontWeight: 600 }}>
                  {row.recommended_vault?.toFixed(1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Action Card                                                        */
/* ------------------------------------------------------------------ */

function ActionCard({ forecast }) {
  if (!forecast) return null

  const action = forecast.action || 'HOLD'
  const amount = forecast.action_amount || 0

  let actionColor = theme.gold
  let actionBg = 'rgba(212,168,83,0.10)'
  let actionLabel = 'HOLD'

  if (action === 'RELEASE') {
    actionColor = theme.green
    actionBg = 'rgba(16,185,129,0.10)'
    actionLabel = `RELEASE PKR ${formatM(amount)}`
  } else if (action === 'REQUEST') {
    actionColor = theme.red
    actionBg = 'rgba(239,68,68,0.10)'
    actionLabel = `REQUEST PKR ${formatM(amount)}`
  }

  return (
    <div style={{
      marginTop: 16,
      backgroundColor: actionBg,
      border: `1px solid ${actionColor}40`,
      borderRadius: 8,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Activity size={20} color={actionColor} />
        <span style={{
          fontSize: 18,
          fontWeight: 800,
          fontFamily: theme.mono,
          color: actionColor,
          letterSpacing: '0.03em',
        }}>
          {actionLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono, textTransform: 'uppercase' }}>
            Current Vault
          </div>
          <div style={{ fontSize: 14, color: theme.text, fontWeight: 700, fontFamily: theme.mono }}>
            PKR {formatM(forecast.current_vault)}
          </div>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: theme.border }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono, textTransform: 'uppercase' }}>
            Recommended
          </div>
          <div style={{ fontSize: 14, color: theme.gold, fontWeight: 700, fontFamily: theme.mono }}>
            PKR {formatM(forecast.recommended_vault)}
          </div>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: theme.border }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono, textTransform: 'uppercase' }}>
            Optimal
          </div>
          <div style={{ fontSize: 14, color: theme.cyan, fontWeight: 700, fontFamily: theme.mono }}>
            PKR {formatM(forecast.optimal_vault)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ForecastDashboard() {
  const {
    modelStatus, forecast, training, predicting, predictingAll,
    fetchStatus, trainModel, fetchForecast, predictAll,
  } = useForecastStore()

  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [branchError, setBranchError] = useState(null)
  const [trainError, setTrainError] = useState(null)

  // Fetch model status on mount
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Fetch branch list on mount
  useEffect(() => {
    axios.get('http://localhost:8000/api/branches')
      .then((res) => {
        const list = res.data?.branches || res.data || []
        setBranches(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        console.error('Branch list fetch failed:', err)
        setBranchError('Failed to load branch list')
      })
  }, [])

  // Fetch forecast when branch selected
  const handleBranchChange = (e) => {
    const branchId = e.target.value
    setSelectedBranch(branchId)
    if (branchId) {
      fetchForecast(branchId)
    }
  }

  const handleTrain = async () => {
    setTrainError(null)
    try {
      await trainModel()
    } catch (e) {
      setTrainError('Training failed. Check backend logs.')
    }
  }

  const handlePredictAll = async () => {
    try {
      await predictAll()
    } catch (e) {
      console.error('Predict all failed:', e)
    }
  }

  const trained = modelStatus?.is_trained

  return (
    <div style={{
      backgroundColor: theme.bg,
      minHeight: '100%',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TrendingUp size={22} color={theme.gold} />
        <div>
          <h1 style={{
            fontSize: 18,
            fontWeight: 700,
            color: theme.text,
            fontFamily: theme.sans,
            margin: 0,
          }}>
            Forecast Dashboard
          </h1>
          <p style={{
            fontSize: 12,
            color: theme.textSecondary,
            margin: '2px 0 0',
            fontFamily: theme.mono,
          }}>
            XGBoost + Conformal Prediction &mdash; 7-day branch cash forecasts
          </p>
        </div>
        <button
          onClick={() => useAppStore.getState().setCurrentUC('biz-forecast-lab')}
          title="Compare XGBoost vs ARIMA vs Prophet, tune parameters, view per-horizon accuracy, and promote a model to production"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', fontSize: 11, fontWeight: 700, fontFamily: theme.mono,
            color: theme.gold, backgroundColor: 'transparent', border: `1px solid ${theme.gold}77`,
            borderRadius: 6, cursor: 'pointer',
          }}
        >
          <FlaskConical size={14} /> Advanced: Forecast Lab →
        </button>
      </div>

      {/* Model Status Bar */}
      <ModelStatusBar
        modelStatus={modelStatus}
        training={training}
        predictingAll={predictingAll}
        onTrain={handleTrain}
        onPredictAll={handlePredictAll}
      />

      {/* Train error */}
      {trainError && (
        <div style={{
          padding: '10px 16px',
          fontSize: 12,
          fontFamily: theme.mono,
          color: theme.red,
          backgroundColor: 'rgba(239,68,68,0.08)',
          border: `1px solid ${theme.red}30`,
          borderRadius: 6,
        }}>
          {trainError}
        </div>
      )}

      {/* Branch Forecast Viewer */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '20px 24px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={16} color={theme.gold} />
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: theme.text,
              fontFamily: theme.sans,
            }}>
              Branch Forecast Viewer
            </span>
          </div>

          {/* Branch dropdown */}
          <select
            value={selectedBranch}
            onChange={handleBranchChange}
            style={{
              padding: '7px 14px',
              fontSize: 12,
              fontFamily: theme.mono,
              color: theme.text,
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              outline: 'none',
              cursor: 'pointer',
              minWidth: 240,
            }}
          >
            <option value="">-- Select branch --</option>
            {branches.map((b) => (
              <option key={b.branch_id || b.id} value={b.branch_id || b.id}>
                {b.branch_id || b.id} &mdash; {b.branch_name || b.name || b.city || ''}
              </option>
            ))}
          </select>
        </div>

        {branchError && (
          <div style={{ fontSize: 12, color: theme.red, fontFamily: theme.mono, marginBottom: 12 }}>
            {branchError}
          </div>
        )}

        {/* Loading state */}
        {predicting && <Spinner size={28} />}

        {/* No branch selected */}
        {!selectedBranch && !predicting && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            borderRadius: 8,
            backgroundColor: theme.bg,
          }}>
            <p style={{ fontSize: 13, color: theme.textSecondary, fontFamily: theme.mono }}>
              Select a branch to view its 7-day forecast
            </p>
          </div>
        )}

        {/* Forecast loaded */}
        {!predicting && selectedBranch && forecast && (
          <>
            {/* Info strip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '10px 16px',
              backgroundColor: theme.bg,
              borderRadius: 6,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: theme.textSecondary, fontFamily: theme.mono }}>Branch:</span>
                <span style={{ fontSize: 12, color: theme.text, fontWeight: 700, fontFamily: theme.mono }}>
                  {forecast.branch_name || forecast.branch_id}
                </span>
              </div>
              <div style={{ width: 1, height: 18, backgroundColor: theme.border }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: theme.textSecondary, fontFamily: theme.mono }}>Model:</span>
                <span style={{ fontSize: 11, color: theme.cyan, fontFamily: theme.mono }}>
                  {forecast.model || 'XGBoost + Conformal'}
                </span>
              </div>
              <div style={{ width: 1, height: 18, backgroundColor: theme.border }} />
              {forecast.accuracy && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono }}>MAPE Dep.</span>
                    <span style={{ fontSize: 11, color: theme.green, fontWeight: 700, fontFamily: theme.mono }}>
                      {forecast.accuracy.mape_deposits?.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: theme.textSecondary, fontFamily: theme.mono }}>MAPE Wdr.</span>
                    <span style={{ fontSize: 11, color: theme.amber, fontWeight: 700, fontFamily: theme.mono }}>
                      {forecast.accuracy.mape_withdrawals?.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Chart */}
            <ForecastChart forecast={forecast} />

            {/* Table */}
            <ForecastTable forecasts={forecast.forecasts} />

            {/* Action card */}
            <ActionCard forecast={forecast} />
          </>
        )}

        {/* Branch selected but no forecast data yet (not loading) */}
        {!predicting && selectedBranch && !forecast && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            borderRadius: 8,
            backgroundColor: theme.bg,
          }}>
            <p style={{ fontSize: 13, color: theme.textSecondary, fontFamily: theme.mono }}>
              {trained
                ? 'No forecast data available for this branch'
                : 'Train the model first to generate forecasts'}
            </p>
          </div>
        )}
      </div>

      {/* Bank-Wide Summary Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '12px 20px',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} color={theme.gold} />
          <span style={{ fontSize: 11, color: theme.textSecondary, fontFamily: theme.mono }}>
            Total forecast rows in DB:
          </span>
          <span style={{ fontSize: 12, color: theme.text, fontWeight: 700, fontFamily: theme.mono }}>
            {modelStatus?.forecast_rows?.toLocaleString() || '0'}
          </span>
        </div>
        {!trained && (
          <span style={{ fontSize: 11, color: theme.gold, fontFamily: theme.mono }}>
            Click &apos;Train Model&apos; to activate ML forecasting
          </span>
        )}
      </div>
    </div>
  )
}
