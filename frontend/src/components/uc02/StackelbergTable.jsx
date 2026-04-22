import { useState } from 'react'
import { Play, Loader2, Shield } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import { runStackelberg } from '../../hooks/useAPI'

const RISK_COLORS = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#ef4444',
}

export default function StackelbergTable() {
  const { stackelbergResult, setStackelbergResult } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await runStackelberg()
      setStackelbergResult(data)
    } catch (err) {
      setError('Stackelberg analysis failed. Check backend.')
      console.error('Stackelberg error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCost = (v) => {
    if (v == null) return '--'
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`
    return v
  }

  const contracts = stackelbergResult?.contract_comparison || stackelbergResult?.contracts || []
  const recommended = stackelbergResult?.recommended_contract || stackelbergResult?.recommended || null
  const equilibrium = stackelbergResult?.stackelberg_equilibrium || stackelbergResult?.equilibrium || null

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={14} style={{ color: '#2dd4bf' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
            Stackelberg CIT Contract Analysis
          </h3>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold cursor-pointer transition-opacity"
          style={{
            backgroundColor: '#2dd4bf',
            color: '#0a0e17',
            opacity: loading ? 0.6 : 1,
          }}
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          RUN ANALYSIS
        </button>
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {contracts.length === 0 ? (
        <div
          className="flex items-center justify-center rounded"
          style={{ minHeight: 180, backgroundColor: '#0f1419' }}
        >
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Click RUN ANALYSIS for Stackelberg CIT game theory
          </p>
        </div>
      ) : (
        <>
          {/* Contract table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {['Contract Type', 'Monthly Cost', 'Expected Uptime', 'Risk Level'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 font-semibold"
                      style={{
                        color: '#8b949e',
                        borderBottom: '1px solid #1e293b',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isRecommended = c.type === recommended
                  return (
                    <tr
                      key={c.type}
                      style={{
                        borderLeft: isRecommended ? '2px solid #d4a853' : '2px solid transparent',
                      }}
                    >
                      <td
                        className="px-3 py-2.5 font-semibold"
                        style={{
                          color: isRecommended ? '#d4a853' : '#e8eaed',
                          borderBottom: '1px solid #1e293b10',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {c.type}
                          {isRecommended && (
                            <span
                              className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: '#d4a85320', color: '#d4a853' }}
                            >
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2.5"
                        style={{
                          color: '#e8eaed',
                          borderBottom: '1px solid #1e293b10',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        PKR {formatCost(c.monthly_cost)}
                      </td>
                      <td
                        className="px-3 py-2.5"
                        style={{
                          color: (c.uptime ?? c.expected_uptime ?? 0) >= 0.95 ? '#22c55e' : '#f59e0b',
                          borderBottom: '1px solid #1e293b10',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {((c.uptime ?? c.expected_uptime ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td
                        className="px-3 py-2.5"
                        style={{
                          borderBottom: '1px solid #1e293b10',
                        }}
                      >
                        {(() => {
                          const risk = c.risk_level || c.risk || ''
                          const riskLabel = risk.length > 20 ? (risk.includes('Low') ? 'Low' : risk.includes('High') ? 'High' : 'Medium') : risk
                          return (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: (RISK_COLORS[riskLabel] || '#6b7280') + '20',
                                color: RISK_COLORS[riskLabel] || '#6b7280',
                              }}
                            >
                              {riskLabel}
                            </span>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Equilibrium info */}
          {equilibrium && (
            <div
              className="mt-4 p-3 rounded"
              style={{ backgroundColor: '#0f1419', border: '1px solid #1e293b' }}
            >
              <p
                className="text-[10px] font-bold mb-1"
                style={{ color: '#2dd4bf' }}
              >
                Stackelberg Equilibrium
              </p>
              <p
                className="text-xs"
                style={{
                  color: '#e8eaed',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Leader: {typeof (equilibrium.bank ?? equilibrium.leader_strategy) === 'object' ? JSON.stringify(equilibrium.bank ?? equilibrium.leader_strategy) : ((equilibrium.bank ?? equilibrium.leader_strategy) || '--')} | Follower: {typeof (equilibrium.cit ?? equilibrium.follower_strategy) === 'object' ? JSON.stringify(equilibrium.cit ?? equilibrium.follower_strategy) : ((equilibrium.cit ?? equilibrium.follower_strategy) || '--')}
              </p>
              {(equilibrium.explanation || stackelbergResult?.explanation) && (
                <p
                  className="text-[10px] mt-1"
                  style={{ color: '#6b7280', fontFamily: "'DM Sans', sans-serif" }}
                >
                  {(() => { const exp = equilibrium.explanation || stackelbergResult?.explanation || ''; return typeof exp === 'object' ? JSON.stringify(exp) : exp })()}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
