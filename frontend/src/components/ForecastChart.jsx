import { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { Play, Loader2 } from 'lucide-react'
import axios from 'axios'
import useAppStore from '../stores/appStore'
import { formatYAxis } from '../utils/formatPKR'

export default function ForecastChart() {
  const {
    selectedBranch,
    forecastData,
    setForecastData,
    isForecasting,
    setIsForecasting,
  } = useAppStore()

  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)

  const handleRunForecast = async () => {
    if (!selectedBranch || isForecasting) return
    setIsForecasting(true)
    setError(null)
    try {
      // Frozen T3 managed-level model (h=1..7) with conformal band — the validated
      // forecaster that replaced the legacy LSTM. Values come back in PKR Millions;
      // scale to raw PKR so the shared axis/optimal-line formatting stays consistent.
      const { data } = await axios.post(
        'http://localhost:8000/api/uc01/managed-level-forecast',
        { branch_ids: [selectedBranch.branch_id] },
      )
      const path = data.forecasts?.[0]?.path || []
      const chartData = path.map(p => ({
        date: p.target_date,
        forecast: p.predicted != null ? p.predicted * 1e6 : null,
        confidence_upper: p.upper != null ? p.upper * 1e6 : null,
        confidence_lower: p.lower != null ? p.lower * 1e6 : null,
        actual: p.actual != null ? p.actual * 1e6 : null,
      }))
      setForecastData(chartData)
      const bands = path.map(p => p.band_pct).filter(x => x != null)
      const avgBand = bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : null
      setMetrics({
        band: avgBand,
        horizon: path.length,
        origin: data.origin_date,
        model: data.model_version,
      })
    } catch (err) {
      setError('Failed to run forecast. Check backend connection.')
      console.error('Forecast error:', err)
    } finally {
      setIsForecasting(false)
    }
  }

  // Optimal vault level reference (raw PKR), tolerant of either field name.
  const optimalLevel = selectedBranch?.optimal_vault_balance ?? selectedBranch?.optimal_balance ?? null

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header with button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
            7-Day Managed Cash Level (T3)
          </h3>
          {metrics?.origin && (
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              color: '#10b981', background: '#10b98118', border: '1px solid #10b98144',
              borderRadius: 5, padding: '1px 6px', textTransform: 'uppercase',
            }}>
              ● reconciled · as-of {metrics.origin}
            </span>
          )}
        </div>
        <button
          className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold cursor-pointer transition-opacity"
          style={{
            backgroundColor: '#d4a853',
            color: '#0a0e17',
            opacity: isForecasting || !selectedBranch ? 0.6 : 1,
          }}
          onClick={handleRunForecast}
          disabled={isForecasting || !selectedBranch}
        >
          {isForecasting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          RUN FORECAST
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {/* Chart or placeholder */}
      {forecastData.length === 0 ? (
        <div
          className="flex items-center justify-center rounded"
          style={{ minHeight: 300, backgroundColor: '#0f1419' }}
        >
          <p className="text-sm" style={{ color: '#6b7280' }}>
            {selectedBranch ? 'Click RUN FORECAST to generate prediction' : 'Select a branch first'}
          </p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={forecastData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                stroke="#1e293b"
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                stroke="#1e293b"
                tickFormatter={formatYAxis}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#141a23',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#e8eaed',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                labelStyle={{ color: '#8b949e' }}
                formatter={(value) => [`PKR ${formatYAxis(value)}`, undefined]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}
              />

              {/* 95% Confidence band */}
              <Area
                dataKey="confidence_upper"
                stroke="none"
                fill="#d4a853"
                fillOpacity={0.1}
                name="95% CI Upper"
              />
              <Area
                dataKey="confidence_lower"
                stroke="none"
                fill="#0a0e17"
                fillOpacity={1}
                name="95% CI Lower"
              />

              {/* Actual realized level */}
              <Line
                dataKey="actual"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="Actual Level"
              />

              {/* T3 managed-level forecast line */}
              <Line
                dataKey="forecast"
                stroke="#d4a853"
                strokeWidth={2}
                dot={false}
                name="T3 Forecast"
                strokeDasharray="6 3"
              />

              {/* Optimal vault level reference line */}
              {optimalLevel && (
                <ReferenceLine
                  y={optimalLevel}
                  stroke="#22c55e"
                  strokeDasharray="8 4"
                  strokeWidth={1.5}
                  label={{
                    value: 'Optimal',
                    fill: '#22c55e',
                    fontSize: 10,
                    position: 'right',
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Conformal-band summary (frozen T3 model) */}
          {metrics && (
            <div
              className="grid grid-cols-3 gap-3 mt-4 p-3 rounded"
              style={{ backgroundColor: '#0f1419' }}
            >
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}>
                  {metrics.band != null ? `±${metrics.band.toFixed(0)}%` : '--'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                  Avg conformal band
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#2dd4bf', fontFamily: "'JetBrains Mono', monospace" }}>
                  {metrics.horizon || 7}d
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                  Horizon
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}>
                  {metrics.origin || '--'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                  Origin date
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
