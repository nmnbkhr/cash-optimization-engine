import { useState } from 'react'
import { Play, Loader2, Settings } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import { runATMOptimize } from '../../hooks/useAPI'

const DENOM_COLORS = {
  5000: '#d4a853',
  1000: '#3b82f6',
  500: '#22c55e',
  100: '#2dd4bf',
}

const DENOM_LABELS = {
  5000: 'Rs.5,000',
  1000: 'Rs.1,000',
  500: 'Rs.500',
  100: 'Rs.100',
}

function Cylinder({ denomination, capacity, currentLevel, reorderPoint, orderUpTo, optimized }) {
  const color = DENOM_COLORS[denomination] || '#8b949e'
  const fillPct = capacity > 0 ? (currentLevel / capacity) * 100 : 0
  const reorderPct = capacity > 0 ? (reorderPoint / capacity) * 100 : 0
  const orderUpToPct = capacity > 0 ? (orderUpTo / capacity) * 100 : 0
  const height = 200

  const fillColor = fillPct < 20 ? '#ef4444' : fillPct < 40 ? '#f59e0b' : color

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Percentage label */}
      <span
        className="text-xs font-bold"
        style={{ color: fillColor, fontFamily: "'JetBrains Mono', monospace" }}
      >
        {fillPct.toFixed(0)}%
      </span>

      {/* Cylinder container */}
      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          width: 52,
          height,
          backgroundColor: '#0a0e17',
          border: `1px solid ${color}30`,
        }}
      >
        {/* Red zone below reorder point */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${reorderPct}%`,
            backgroundColor: '#ef444415',
          }}
        />

        {/* Fill level */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-700"
          style={{
            height: `${fillPct}%`,
            background: `linear-gradient(to top, ${fillColor}cc, ${fillColor}88)`,
            borderRadius: '0 0 6px 6px',
          }}
        />

        {/* Reorder point (s) dashed red line */}
        <div
          className="absolute left-0 right-0"
          style={{
            bottom: `${reorderPct}%`,
            borderTop: '2px dashed #ef4444',
          }}
        >
          <span
            className="absolute text-[8px] font-bold"
            style={{
              color: '#ef4444',
              right: -1,
              top: -10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            s
          </span>
        </div>

        {/* Order-up-to (S) dashed line */}
        <div
          className="absolute left-0 right-0"
          style={{
            bottom: `${orderUpToPct}%`,
            borderTop: `2px dashed ${color}`,
          }}
        >
          <span
            className="absolute text-[8px] font-bold"
            style={{
              color,
              right: -1,
              top: -10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            S
          </span>
        </div>
      </div>

      {/* Denomination label */}
      <span
        className="text-[10px] font-bold text-center"
        style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
      >
        {DENOM_LABELS[denomination] || `Rs.${denomination}`}
      </span>

      {/* Current / Capacity */}
      <span
        className="text-[9px]"
        style={{ color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}
      >
        {currentLevel.toLocaleString()}/{capacity.toLocaleString()}
      </span>

      {/* Optimized values */}
      {optimized && (
        <div className="text-center">
          <span
            className="text-[8px] block"
            style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
          >
            s*={optimized.s?.toLocaleString()}
          </span>
          <span
            className="text-[8px] block"
            style={{ color: '#2dd4bf', fontFamily: "'JetBrains Mono', monospace" }}
          >
            S*={optimized.S?.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}

export default function CassetteVisualizer() {
  const { selectedATM, atmOptimizationResult, setATMOptimizationResult } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cassettes = selectedATM?.cassettes || []

  const handleOptimize = async () => {
    if (!selectedATM || loading) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await runATMOptimize(selectedATM.atm_id)
      setATMOptimizationResult(data)
    } catch (err) {
      setError('Optimization failed. Check backend.')
      console.error('Optimize error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Map optimized results to denominations — policies is a dict keyed by denomination
  const getOptimizedForDenom = (denom) => {
    if (!atmOptimizationResult) return null
    // Try cassettes array first, then policies dict
    if (atmOptimizationResult.cassettes) {
      return atmOptimizationResult.cassettes.find((c) => c.denomination === denom) || null
    }
    if (atmOptimizationResult.policies) {
      const p = atmOptimizationResult.policies[String(denom)]
      return p ? { s: p.s, S: p.S, denomination: denom, ...p } : null
    }
    return null
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings size={14} style={{ color: '#8b949e' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
            Cassette Levels
          </h3>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold cursor-pointer transition-opacity"
          style={{
            backgroundColor: '#d4a853',
            color: '#0a0e17',
            opacity: loading || !selectedATM ? 0.6 : 1,
          }}
          onClick={handleOptimize}
          disabled={loading || !selectedATM}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          RUN (s,S) OPTIMIZER
        </button>
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {/* Cylinders row */}
      {cassettes.length > 0 ? (
        <div className="flex items-end justify-around gap-3 pt-2">
          {cassettes.map((c) => (
            <Cylinder
              key={c.denomination}
              denomination={c.denomination}
              capacity={c.capacity}
              currentLevel={c.current_level}
              reorderPoint={c.reorder_point}
              orderUpTo={c.order_up_to}
              optimized={getOptimizedForDenom(c.denomination)}
            />
          ))}
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded"
          style={{ minHeight: 200, backgroundColor: '#0f1419' }}
        >
          <p className="text-sm" style={{ color: '#6b7280' }}>
            No cassette data available
          </p>
        </div>
      )}

      {/* Optimization summary */}
      {atmOptimizationResult && (
        <div
          className="mt-4 p-3 rounded grid grid-cols-3 gap-3"
          style={{ backgroundColor: '#0f1419' }}
        >
          {(atmOptimizationResult.total_expected_cost_current ?? atmOptimizationResult.total_holding_cost) != null && (
            <div className="text-center">
              <p
                className="text-sm font-bold"
                style={{ color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {((atmOptimizationResult.total_expected_cost_current ?? atmOptimizationResult.total_holding_cost) / 1e6).toFixed(1)}M
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>
                Current Cost/mo
              </p>
            </div>
          )}
          {(atmOptimizationResult.total_expected_cost_optimal ?? atmOptimizationResult.total_stockout_cost) != null && (
            <div className="text-center">
              <p
                className="text-sm font-bold"
                style={{ color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {((atmOptimizationResult.total_expected_cost_optimal ?? atmOptimizationResult.total_stockout_cost) / 1e6).toFixed(1)}M
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>
                Optimal Cost/mo
              </p>
            </div>
          )}
          {(atmOptimizationResult.annual_savings ?? atmOptimizationResult.savings) != null && (
            <div className="text-center">
              <p
                className="text-sm font-bold"
                style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {((atmOptimizationResult.annual_savings ?? atmOptimizationResult.savings) / 1e6).toFixed(1)}M
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>
                Annual Savings
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
