import { useEffect, useState } from 'react'
import {
  GitBranch, Loader2, Sparkles, ChevronDown, ChevronUp,
  Network, TrendingDown, TrendingUp, Zap, BarChart3,
} from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchUC03NetworkSummary, solveNetting, runVCGAuction,
  fetchCityHeatmap, fetchUC03AIBrief,
} from '../../hooks/useAPI'
import KPIStrip from '../KPIStrip'
import CityHeatmap from './CityHeatmap'
import NettingSavingsChart from './NettingSavingsChart'
import NettingFlowTable from './NettingFlowTable'
import AuctionResultsTable from './AuctionResultsTable'
import formatPKR from '../../utils/formatPKR'

function UC03AIBriefPanel() {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleAsk = async () => {
    if (result) { setExpanded(!expanded); return }
    setExpanded(true)
    setLoading(true)
    setError(null)
    try {
      const { data } = await fetchUC03AIBrief()
      setResult(data.brief || data.summary || data.message || JSON.stringify(data))
    } catch {
      setError('AI unavailable -- all results above are locally computed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border" style={{ backgroundColor: '#0f1419', borderColor: '#374151' }}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: 'none', border: 'none', color: '#8b949e' }}
        onClick={handleAsk}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: '#6b7280' }} />
          <span className="text-xs font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#374151' }}>
          {loading && (
            <div className="flex items-center gap-2 py-4">
              <Loader2 size={14} className="animate-spin" style={{ color: '#6b7280' }} />
              <span className="text-xs" style={{ color: '#6b7280' }}>Generating executive brief...</span>
            </div>
          )}
          {error && <p className="text-xs py-3" style={{ color: '#6b7280' }}>{error}</p>}
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

/* ---------- Main Dashboard ---------- */
export default function UC03Dashboard() {
  const {
    uc03NetworkSummary, setUC03NetworkSummary,
    nettingResult, setNettingResult,
    auctionResult, setAuctionResult,
    cityHeatmapData, setCityHeatmapData,
    isNetting, setIsNetting,
    isAuctioning, setIsAuctioning,
  } = useAppStore()

  const [error, setError] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, heatmapRes] = await Promise.allSettled([
          fetchUC03NetworkSummary(),
          fetchCityHeatmap(),
        ])
        if (summaryRes.status === 'fulfilled') setUC03NetworkSummary(summaryRes.value.data)
        if (heatmapRes.status === 'fulfilled') setCityHeatmapData(heatmapRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-03 data:', err)
      }
    }
    loadData()
  }, [setUC03NetworkSummary, setCityHeatmapData])

  const handleSolveNetting = async () => {
    setIsNetting(true)
    setError(null)
    try {
      const { data } = await solveNetting()
      setNettingResult(data)
    } catch (err) {
      setError('Netting solver failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setIsNetting(false)
    }
  }

  const handleRunAuction = async () => {
    setIsAuctioning(true)
    setError(null)
    try {
      const { data } = await runVCGAuction()
      setAuctionResult(data)
    } catch (err) {
      setError('VCG auction failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setIsAuctioning(false)
    }
  }

  // KPI data
  const summary = uc03NetworkSummary || {}
  const kpiMetrics = [
    { label: 'Surplus Branches', value: summary.surplus_branches?.toLocaleString() || '--', color: '#22c55e' },
    { label: 'Deficit Branches', value: summary.deficit_branches?.toLocaleString() || '--', color: '#ef4444' },
    { label: 'Nettable Amount', value: summary.nettable_amount ? `PKR ${formatPKR(summary.nettable_amount)}` : '--', color: '#d4a853' },
    { label: 'Est. Savings', value: (summary.estimated_annual_savings || summary.estimated_savings) ? `PKR ${formatPKR(summary.estimated_annual_savings || summary.estimated_savings)}` : '--', color: '#2dd4bf' },
    { label: 'Efficiency', value: (summary.netting_efficiency ?? summary.network_efficiency) != null ? `${((summary.netting_efficiency ?? summary.network_efficiency) * 100).toFixed(1)}%` : '--', color: '#3b82f6' },
  ]

  return (
    <div style={{ backgroundColor: '#0a0e17', minHeight: '100vh' }}>
      {/* KPI Strip */}
      <div className="mb-4">
        <KPIStrip metrics={kpiMetrics} />
      </div>

      {/* Full-width content */}
      <div className="px-4 pb-4">
        {/* Network overview header */}
        <div
          className="rounded-lg border p-4 mb-4"
          style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#22c55e20' }}
            >
              <GitBranch size={20} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#e8eaed' }}>
                Inter-Branch Cash Netting
              </h2>
              <p className="text-xs" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                Network Flow + VCG Auction for {summary.total_branches?.toLocaleString() || '--'} branches
              </p>
            </div>
          </div>

          {/* Summary stats */}
          {uc03NetworkSummary && (
            <div
              className="grid grid-cols-4 gap-3 p-3 rounded mt-3"
              style={{ backgroundColor: '#0f1419' }}
            >
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatPKR(summary.total_surplus)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Total Surplus</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatPKR(summary.total_deficit)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Total Deficit</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatPKR(summary.nettable_amount)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Nettable Amount</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: '#2dd4bf', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatPKR(summary.estimated_annual_savings || summary.estimated_savings)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Annual Savings</p>
              </div>
            </div>
          )}
        </div>

        {/* Top section: CityHeatmap + NettingSavingsChart */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <CityHeatmap data={cityHeatmapData} />
          <NettingSavingsChart summary={nettingResult || uc03NetworkSummary} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-4 mb-4">
          <button
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm cursor-pointer transition-all"
            style={{
              backgroundColor: isNetting ? '#1e293b' : '#d4a853',
              color: isNetting ? '#8b949e' : '#0a0e17',
              border: 'none',
              opacity: isNetting ? 0.7 : 1,
            }}
            onClick={handleSolveNetting}
            disabled={isNetting}
          >
            {isNetting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Network size={16} />
            )}
            {isNetting ? 'SOLVING...' : 'SOLVE NETTING'}
          </button>

          <button
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm cursor-pointer transition-all"
            style={{
              backgroundColor: isAuctioning ? '#1e293b' : '#d4a853',
              color: isAuctioning ? '#8b949e' : '#0a0e17',
              border: 'none',
              opacity: isAuctioning ? 0.7 : 1,
            }}
            onClick={handleRunAuction}
            disabled={isAuctioning}
          >
            {isAuctioning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Zap size={16} />
            )}
            {isAuctioning ? 'RUNNING...' : 'RUN VCG AUCTION'}
          </button>

          {error && (
            <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>
          )}
        </div>

        {/* Netting Flow Table */}
        {nettingResult && (
          <div className="mb-4">
            <NettingFlowTable result={nettingResult} />
          </div>
        )}

        {/* Auction Results Table */}
        {auctionResult && (
          <div className="mb-4">
            <AuctionResultsTable result={auctionResult} />
          </div>
        )}

        {/* AI Summary */}
        <UC03AIBriefPanel />
      </div>
    </div>
  )
}
