import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { Play, Loader2 } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import { runOptimizer } from '../../hooks/useAPI'
import formatPKR from '../../utils/formatPKR'

export default function OptimizerPanel() {
  const {
    selectedBranch,
    optimizationResult,
    setOptimizationResult,
    isOptimizing,
    setIsOptimizing,
  } = useAppStore()

  const [error, setError] = useState(null)

  const handleRunOptimizer = async () => {
    if (!selectedBranch || isOptimizing) return
    setIsOptimizing(true)
    setError(null)
    try {
      const { data } = await runOptimizer(selectedBranch.branch_id)
      setOptimizationResult(data)
    } catch (err) {
      setError('Failed to run optimizer. Check backend connection.')
      console.error('Optimizer error:', err)
    } finally {
      setIsOptimizing(false)
    }
  }

  const result = optimizationResult
  const recommendedLevel = result?.optimal_vault_level ?? result?.recommended_vault_level ?? null
  const currentLevel = result?.current_vault_level ?? selectedBranch?.current_balance ?? null
  const annualSavings = result?.annual_savings ?? null
  const confidenceLow = result?.confidence_interval?.[0] ?? null
  const confidenceHigh = result?.confidence_interval?.[1] ?? null
  const stockoutProb = result?.stockout_probability ?? null
  const scenarioDistribution = result?.scenario_distribution ?? []
  // denomination_split can be a dict {5000: amount, 1000: amount} or a list
  const rawDenom = result?.denomination_split ?? []
  const denomSplit = (() => {
    if (Array.isArray(rawDenom)) return rawDenom
    const entries = Object.entries(rawDenom)
    const total = entries.reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0) || 1
    return entries.map(([denom, val]) => ({
      denomination: `Rs.${Number(denom).toLocaleString()}`,
      percentage: typeof val === 'number' ? (val / total) * 100 : (val?.percentage || 0),
    }))
  })()

  // Build histogram data from scenario distribution (50 bins)
  const histogramData = Array.isArray(scenarioDistribution) && scenarioDistribution.length > 0
    ? scenarioDistribution.map((val, i) => ({
        bin: i,
        frequency: typeof val === 'object' ? (val.frequency || val.count || 0) : val,
      }))
    : []

  // Build denomination stacked bar data
  const denomData = Array.isArray(denomSplit) && denomSplit.length > 0
    ? denomSplit
    : []

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header with button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
          Stochastic Vault Optimizer
        </h3>
        <button
          className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold cursor-pointer transition-opacity"
          style={{
            backgroundColor: '#d4a853',
            color: '#0a0e17',
            opacity: isOptimizing || !selectedBranch ? 0.6 : 1,
          }}
          onClick={handleRunOptimizer}
          disabled={isOptimizing || !selectedBranch}
        >
          {isOptimizing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          RUN OPTIMIZER
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {!result ? (
        <div
          className="flex items-center justify-center rounded"
          style={{ minHeight: 200, backgroundColor: '#0f1419' }}
        >
          <p className="text-sm" style={{ color: '#6b7280' }}>
            {selectedBranch ? 'Click RUN OPTIMIZER to compute optimal vault level' : 'Select a branch first'}
          </p>
        </div>
      ) : (
        <>
          {/* Key metrics: Recommended vs Current */}
          <div
            className="grid grid-cols-2 gap-4 mb-4 p-4 rounded"
            style={{ backgroundColor: '#0f1419' }}
          >
            <div className="text-center">
              <p
                className="text-2xl font-bold"
                style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {recommendedLevel != null ? formatPKR(recommendedLevel) : '--'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Recommended Vault Level
              </p>
            </div>
            <div className="text-center">
              <p
                className="text-2xl font-bold"
                style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {currentLevel != null ? formatPKR(currentLevel) : '--'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Current Vault Level
              </p>
            </div>
          </div>

          {/* Annual savings */}
          {annualSavings != null && (
            <div
              className="mb-4 p-3 rounded text-center"
              style={{ backgroundColor: '#22c55e15', border: '1px solid #22c55e30' }}
            >
              <p className="text-xs" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Annual Savings
              </p>
              <p
                className="text-xl font-bold"
                style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
              >
                PKR {formatPKR(annualSavings)}
              </p>
            </div>
          )}

          {/* Confidence interval bar */}
          {confidenceLow != null && confidenceHigh != null && (
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                95% Confidence Interval
              </p>
              <div className="relative h-8 rounded overflow-hidden" style={{ backgroundColor: '#0f1419' }}>
                {/* Calculate bar positions */}
                {(() => {
                  const min = confidenceLow * 0.8
                  const max = confidenceHigh * 1.2
                  const range = max - min
                  const lowPct = ((confidenceLow - min) / range) * 100
                  const highPct = ((confidenceHigh - min) / range) * 100
                  const recPct = recommendedLevel
                    ? ((recommendedLevel - min) / range) * 100
                    : (lowPct + highPct) / 2
                  return (
                    <>
                      <div
                        className="absolute top-0 h-full"
                        style={{
                          left: `${lowPct}%`,
                          width: `${highPct - lowPct}%`,
                          backgroundColor: '#d4a85330',
                          borderRadius: 4,
                        }}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5"
                        style={{
                          left: `${recPct}%`,
                          backgroundColor: '#d4a853',
                        }}
                      />
                    </>
                  )
                })()}
              </div>
              <div className="flex justify-between mt-1">
                <span
                  className="text-xs"
                  style={{ color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatPKR(confidenceLow)}
                </span>
                <span
                  className="text-xs"
                  style={{ color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatPKR(confidenceHigh)}
                </span>
              </div>
            </div>
          )}

          {/* Stockout probability gauge */}
          {stockoutProb != null && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                  Stockout Probability
                </span>
                <span
                  className="text-xs font-bold"
                  style={{
                    color: stockoutProb < 0.05 ? '#22c55e' : stockoutProb < 0.15 ? '#d4a853' : '#ef4444',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {(stockoutProb * 100).toFixed(1)}%
                </span>
              </div>
              <div
                className="w-full rounded-full overflow-hidden"
                style={{ backgroundColor: '#1e293b', height: 8 }}
              >
                <div
                  className="rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, stockoutProb * 100)}%`,
                    height: '100%',
                    backgroundColor: stockoutProb < 0.05 ? '#22c55e' : stockoutProb < 0.15 ? '#d4a853' : '#ef4444',
                  }}
                />
              </div>
            </div>
          )}

          {/* Scenario distribution histogram */}
          {histogramData.length > 0 && (
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Scenario Distribution (Monte Carlo)
              </p>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={histogramData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="bin"
                    tick={false}
                    stroke="#1e293b"
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                    stroke="#1e293b"
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#141a23',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      fontSize: 10,
                      color: '#e8eaed',
                    }}
                  />
                  <Bar dataKey="frequency" fill="#d4a853" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Denomination split: horizontal stacked bar */}
          {denomData.length > 0 && (
            <div>
              <p className="text-xs mb-2" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Denomination Split
              </p>
              <div className="flex rounded overflow-hidden" style={{ height: 28 }}>
                {denomData.map((d, i) => {
                  const colors = ['#d4a853', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#2dd4bf', '#f97316']
                  const pct = d.percentage || d.pct || 0
                  const label = d.denomination || d.label || d.name || ''
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-center text-xs font-bold"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: colors[i % colors.length],
                        color: '#0a0e17',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        minWidth: pct > 5 ? undefined : 0,
                      }}
                      title={`${label}: ${pct.toFixed(1)}%`}
                    >
                      {pct > 8 ? label : ''}
                    </div>
                  )
                })}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mt-2">
                {denomData.map((d, i) => {
                  const colors = ['#d4a853', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#2dd4bf', '#f97316']
                  const label = d.denomination || d.label || d.name || ''
                  const pct = d.percentage || d.pct || 0
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <div
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: colors[i % colors.length] }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}
                      >
                        {label} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
