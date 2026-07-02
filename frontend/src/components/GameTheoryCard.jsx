import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { runGameTheory } from '../hooks/useAPI'
import ProgressBar from './common/ProgressBar'

export default function GameTheoryCard() {
  const {
    selectedBranch,
    gameTheoryResult,
    setGameTheoryResult,
    isAnalyzing,
    setIsAnalyzing,
  } = useAppStore()

  const [error, setError] = useState(null)

  const handleRunAnalysis = async () => {
    if (!selectedBranch || isAnalyzing) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const { data } = await runGameTheory(selectedBranch.branch_id)
      setGameTheoryResult(data)
    } catch (err) {
      setError('Failed to run game theory analysis.')
      console.error('Game theory error:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const result = gameTheoryResult
  const ne = result?.nash_equilibrium || {}

  // Build combined payoff matrix from separate manager/treasury matrices
  const mgrMatrix = ne.payoff_matrix_manager || result?.payoff_matrix || []
  const trsMatrix = ne.payoff_matrix_treasury || []
  const matrix = mgrMatrix.length > 0
    ? mgrMatrix.map((row, r) =>
        row.map((cell, c) =>
          trsMatrix[r]?.[c] != null ? [cell, trsMatrix[r][c]] : cell
        )
      )
    : []

  const nashIndices = ne.nash_equilibria || result?.nash_indices || []
  // Scores are stored as 0–1 fractions; render as a percentage (0–100).
  const toPct = (v) => (v == null ? null : v <= 1 ? v * 100 : v)
  const cesScore = toPct(result?.cash_efficiency_score ?? result?.ces_score
    ?? selectedBranch?.cash_efficiency_score ?? selectedBranch?.ces_score ?? null)
  const bmisScore = toPct(result?.branch_manager_incentive_score ?? result?.bmis_score ?? null)
  const branchRank = result?.peer_rank ?? result?.branch_rank ?? null
  const totalBranches = result?.total_branches ?? 1532
  const explanation = ne.explanation ?? result?.explanation ?? null

  const rowLabels = ne.manager_strategies || result?.manager_strategies || ['Conservative', 'Moderate', 'Aggressive']
  const colLabels = ne.treasury_strategies || result?.treasury_strategies || ['Tight', 'Normal', 'Loose']

  const isNash = (r, c) =>
    Array.isArray(nashIndices[0])
      ? nashIndices.some(([nr, nc]) => nr === r && nc === c)
      : nashIndices[0] === r && nashIndices[1] === c

  return (
    <div
      className="rounded-lg p-5 border"
      style={{
        backgroundColor: '#141a23',
        borderColor: '#1e293b',
        borderLeft: '3px solid #2dd4bf',
      }}
    >
      {/* Header with button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: '#2dd4bf' }}>
            Game Theory Analysis
          </h3>
          <span
            title="Stylised Nash payoff matrix — methodology demonstration, not driven by reconciled ledger data"
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
              color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa44',
              borderRadius: 5, padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}
          >
            Methodology · illustrative
          </span>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold cursor-pointer transition-opacity"
          style={{
            backgroundColor: 'transparent',
            color: '#2dd4bf',
            border: '1px solid #2dd4bf',
            opacity: isAnalyzing || !selectedBranch ? 0.6 : 1,
          }}
          onClick={handleRunAnalysis}
          disabled={isAnalyzing || !selectedBranch}
        >
          {isAnalyzing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          RUN ANALYSIS
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {matrix.length === 0 ? (
        <p className="text-xs" style={{ color: '#6b7280' }}>
          {selectedBranch ? 'Click RUN ANALYSIS to compute game theory payoffs.' : 'Select a branch first.'}
        </p>
      ) : (
        <>
          {/* Player labels */}
          <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
            <span>Rows: Branch Manager</span>
            <span>Cols: Treasury</span>
          </div>

          {/* 3x3 Payoff Matrix */}
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <thead>
                <tr>
                  <th
                    className="px-3 py-2 text-left"
                    style={{ color: '#6b7280', borderBottom: '1px solid #1e293b' }}
                  />
                  {colLabels.map((label, c) => (
                    <th
                      key={c}
                      className="px-3 py-2 text-center"
                      style={{ color: '#8b949e', borderBottom: '1px solid #1e293b' }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, r) => (
                  <tr key={r}>
                    <td
                      className="px-3 py-2 font-medium"
                      style={{ color: '#8b949e', borderBottom: '1px solid #1e293b' }}
                    >
                      {rowLabels[r] || `S${r + 1}`}
                    </td>
                    {row.map((cell, c) => {
                      const nash = isNash(r, c)
                      return (
                        <td
                          key={c}
                          className="px-3 py-2 text-center"
                          style={{
                            backgroundColor: nash ? '#d4a85320' : 'transparent',
                            border: nash ? '1px solid #d4a853' : undefined,
                            borderBottom: nash ? '1px solid #d4a853' : '1px solid #1e293b',
                            color: nash ? '#d4a853' : '#e8eaed',
                            fontWeight: nash ? 600 : 400,
                          }}
                        >
                          {Array.isArray(cell)
                            ? `(${cell[0]}, ${cell[1]})`
                            : typeof cell === 'object' && cell !== null
                              ? JSON.stringify(cell)
                              : cell}
                          {nash && (
                            <span className="ml-1 text-xs" style={{ color: '#d4a853' }}>
                              NE
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Nash legend */}
          <p className="text-xs mb-4" style={{ color: '#6b7280', fontFamily: "'DM Sans', sans-serif" }}>
            NE = Nash Equilibrium (highlighted cell)
          </p>

          {/* CES Score progress bar */}
          {cesScore != null && (
            <div className="mb-3">
              <ProgressBar
                value={cesScore}
                max={100}
                color="#d4a853"
                height={8}
                label="CES Score"
              />
            </div>
          )}

          {/* BMIS Score progress bar */}
          {bmisScore != null && (
            <div className="mb-3">
              <ProgressBar
                value={bmisScore}
                max={100}
                color="#2dd4bf"
                height={8}
                label="BMIS Score"
              />
            </div>
          )}

          {/* Branch ranking */}
          {branchRank != null && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: '#1e293b' }}>
              <p className="text-xs" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Branch Ranking
              </p>
              <p
                className="text-lg font-bold"
                style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
              >
                Rank {branchRank}
                <span className="text-xs ml-1" style={{ color: '#6b7280' }}>
                  of {totalBranches.toLocaleString()}
                </span>
              </p>
            </div>
          )}

          {/* Explanation text */}
          {explanation && (
            <p
              className="text-xs mt-3 leading-relaxed"
              style={{ color: '#6b7280', fontFamily: "'DM Sans', sans-serif" }}
            >
              {typeof explanation === 'object' ? JSON.stringify(explanation) : explanation}
            </p>
          )}
        </>
      )}
    </div>
  )
}
