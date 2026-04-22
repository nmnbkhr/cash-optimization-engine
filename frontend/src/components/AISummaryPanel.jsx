import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { fetchAIBrief } from '../hooks/useAPI'

export default function AISummaryPanel() {
  const {
    selectedBranch,
    optimizationResult,
    gameTheoryResult,
    forecastData,
  } = useAppStore()

  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleAsk = async () => {
    if (result) {
      setExpanded(!expanded)
      return
    }

    if (!selectedBranch) return

    setExpanded(true)
    setLoading(true)
    setError(null)

    try {
      const { data } = await fetchAIBrief(selectedBranch.branch_id)
      setResult(data.brief || data.summary || data.message || JSON.stringify(data))
    } catch (err) {
      if (err.response?.status === 503 || err.response?.status === 501) {
        setError('AI unavailable \u2014 all results above are locally computed.')
      } else if (err.code === 'ERR_NETWORK') {
        setError('AI unavailable \u2014 all results above are locally computed.')
      } else {
        setError('AI unavailable \u2014 all results above are locally computed.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Reset when branch changes
  const branchId = selectedBranch?.branch_id
  const [lastBranch, setLastBranch] = useState(null)
  if (branchId !== lastBranch) {
    setLastBranch(branchId)
    setResult(null)
    setError(null)
    setExpanded(false)
  }

  return (
    <div
      className="rounded-lg border"
      style={{ backgroundColor: '#0f1419', borderColor: '#374151' }}
    >
      {/* Toggle Button */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: 'none', border: 'none', color: '#8b949e' }}
        onClick={handleAsk}
        disabled={!selectedBranch}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: '#6b7280' }} />
          <span
            className="text-xs font-medium"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {result ? 'Executive Brief' : 'Ask AI for Executive Brief'}
          </span>
        </div>
        {loading ? (
          <Loader2 size={14} className="animate-spin" style={{ color: '#6b7280' }} />
        ) : expanded ? (
          <ChevronUp size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div
          className="px-4 pb-4 border-t"
          style={{ borderColor: '#374151' }}
        >
          {loading && (
            <div className="flex items-center gap-2 py-4">
              <Loader2 size={14} className="animate-spin" style={{ color: '#6b7280' }} />
              <span className="text-xs" style={{ color: '#6b7280' }}>
                Generating executive brief...
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs py-3" style={{ color: '#6b7280' }}>
              {error}
            </p>
          )}

          {result && (
            <div
              className="text-xs leading-relaxed py-3 px-3 mt-2 rounded whitespace-pre-wrap"
              style={{
                color: '#8b949e',
                fontFamily: "'DM Sans', sans-serif",
                backgroundColor: '#141a23',
                border: '1px solid #374151',
              }}
            >
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
