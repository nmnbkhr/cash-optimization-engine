import { useState } from 'react'
import { Play, Loader2, Brain } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import useAppStore from '../../stores/appStore'
import { runDQNRecommend } from '../../hooks/useAPI'

const BAR_COLORS = { DQN: '#d4a853', '(s,S)': '#2dd4bf', Baseline: '#6b7280' }

export default function DQNComparisonCard() {
  const { selectedATM, dqnResult, setDQNResult } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    if (!selectedATM || loading) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await runDQNRecommend(selectedATM.atm_id)
      setDQNResult(data)
    } catch (err) {
      setError('DQN recommendation failed. Check backend.')
      console.error('DQN error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCost = (v) => {
    if (v == null) return '--'
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`
    return v.toFixed?.(0) ?? v
  }

  // Build chart data from result — handle both flat and nested response shapes
  const comp = dqnResult?.comparison || {}
  const dqnCost = dqnResult?.dqn_cost_30d || comp.dqn_cost || 0
  const ssCost = dqnResult?.ss_cost_30d || comp.ss_cost || 0
  const baselineCost = dqnResult?.baseline_cost_30d || comp.baseline_cost || 0
  const chartData = dqnResult
    ? [
        { name: 'DQN', cost: dqnCost },
        { name: '(s,S)', cost: ssCost },
        { name: 'Baseline', cost: baselineCost },
      ]
    : []

  const savingsPct = baselineCost
    ? (((baselineCost - dqnCost) / baselineCost) * 100).toFixed(1)
    : null

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: '#d4a853' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
            DQN vs (s,S) Comparison
          </h3>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold cursor-pointer transition-opacity"
          style={{
            backgroundColor: '#d4a853',
            color: '#0a0e17',
            opacity: loading || !selectedATM ? 0.6 : 1,
          }}
          onClick={handleRun}
          disabled={loading || !selectedATM}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          RUN DQN AGENT
        </button>
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {!dqnResult ? (
        <div
          className="flex items-center justify-center rounded"
          style={{ minHeight: 220, backgroundColor: '#0f1419' }}
        >
          <p className="text-sm" style={{ color: '#6b7280' }}>
            {selectedATM ? 'Click RUN DQN AGENT to compare strategies' : 'Select an ATM first'}
          </p>
        </div>
      ) : (
        <>
          {/* Recommended action */}
          <div
            className="mb-3 p-3 rounded"
            style={{ backgroundColor: '#0f1419', border: '1px solid #d4a85330' }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold" style={{ color: '#d4a853' }}>
                Recommended Action
              </span>
              {savingsPct && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}
                >
                  {savingsPct}% savings vs baseline
                </span>
              )}
            </div>
            <p
              className="text-xs font-semibold"
              style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {dqnResult.action_name || dqnResult.recommended_action || 'No action needed'}
            </p>
          </div>

          {/* Q-values */}
          {dqnResult.q_values && (
            <div className="mb-3 flex gap-2 flex-wrap">
              {Object.entries(dqnResult.q_values).map(([action, qval]) => (
                <span
                  key={action}
                  className="text-[10px] px-2 py-1 rounded"
                  style={{
                    backgroundColor: action === dqnResult.recommended_action ? '#d4a85320' : '#0a0e17',
                    color: action === dqnResult.recommended_action ? '#d4a853' : '#6b7280',
                    border: `1px solid ${action === dqnResult.recommended_action ? '#d4a85340' : '#1e293b'}`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {action}: Q={typeof qval === 'number' ? qval.toFixed(2) : qval}
                </span>
              ))}
            </div>
          )}

          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                stroke="#1e293b"
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                stroke="#1e293b"
                tickFormatter={formatCost}
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
                formatter={(value) => [`PKR ${formatCost(value)}`, '30-Day Cost']}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={BAR_COLORS[entry.name] || '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* State description */}
          {dqnResult.state_description && (
            <p
              className="text-[10px] mt-2 px-2"
              style={{ color: '#6b7280', fontFamily: "'DM Sans', sans-serif" }}
            >
              State: {typeof dqnResult.state_description === 'string'
                ? dqnResult.state_description
                : JSON.stringify(dqnResult.state_description)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
