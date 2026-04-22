import { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { Play, Loader2 } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { runForecast } from '../hooks/useAPI'
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
      const { data } = await runForecast(selectedBranch.branch_id)
      // Transform API response into chart-ready format
      let chartData = data.forecast_data || data.data || []
      if (chartData.length === 0 && data.forecast_dates) {
        // Build from separate arrays
        const hist = (data.historical || []).map(h => ({
          date: h.date,
          actual: h.actual,
          forecast: h.predicted,
        }))
        const forecast = data.forecast_dates.map((d, i) => ({
          date: d,
          forecast: data.predicted_demand?.[i],
          confidence_upper: data.confidence_upper?.[i],
          confidence_lower: data.confidence_lower?.[i],
        }))
        chartData = [...hist, ...forecast]
      }
      setForecastData(chartData)
      setMetrics(data.model_metrics || data.metrics || null)
    } catch (err) {
      setError('Failed to run forecast. Check backend connection.')
      console.error('Forecast error:', err)
    } finally {
      setIsForecasting(false)
    }
  }

  // Calculate optimal level from branch data
  const optimalLevel = selectedBranch?.optimal_balance || null

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header with button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
          Cash Demand Forecast
        </h3>
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

              {/* Actual demand line */}
              <Line
                dataKey="actual"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="Actual Demand"
              />

              {/* LSTM forecast line */}
              <Line
                dataKey="forecast"
                stroke="#d4a853"
                strokeWidth={2}
                dot={false}
                name="LSTM Forecast"
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

          {/* Metrics below chart */}
          {metrics && (
            <div
              className="grid grid-cols-3 gap-3 mt-4 p-3 rounded"
              style={{ backgroundColor: '#0f1419' }}
            >
              {metrics.mape != null && (
                <div className="text-center">
                  <p
                    className="text-sm font-bold"
                    style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {typeof metrics.mape === 'number' ? `${metrics.mape.toFixed(2)}%` : metrics.mape}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                    MAPE
                  </p>
                </div>
              )}
              {metrics.mae != null && (
                <div className="text-center">
                  <p
                    className="text-sm font-bold"
                    style={{ color: '#2dd4bf', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {typeof metrics.mae === 'number' ? formatYAxis(metrics.mae) : metrics.mae}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                    MAE
                  </p>
                </div>
              )}
              {metrics.rmse != null && (
                <div className="text-center">
                  <p
                    className="text-sm font-bold"
                    style={{ color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {typeof metrics.rmse === 'number' ? formatYAxis(metrics.rmse) : metrics.rmse}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                    RMSE
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
