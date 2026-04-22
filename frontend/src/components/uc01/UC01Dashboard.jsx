import { useEffect } from 'react'
import useAppStore from '../../stores/appStore'
import { fetchBranches, fetchUC01NetworkSummary } from '../../hooks/useAPI'
import KPIStrip from '../KPIStrip'
import BranchList from '../BranchList'
import BranchDetail from '../BranchDetail'
import ForecastChart from '../ForecastChart'
import VaultChart from '../VaultChart'
import GameTheoryCard from '../GameTheoryCard'
import AISummaryPanel from '../AISummaryPanel'
import OptimizerPanel from './OptimizerPanel'
import formatPKR from '../../utils/formatPKR'

export default function UC01Dashboard() {
  const {
    branches,
    setBranches,
    selectedBranch,
    uc01NetworkSummary,
    setUC01NetworkSummary,
  } = useAppStore()

  // Load branches and network summary on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [branchRes, summaryRes] = await Promise.allSettled([
          fetchBranches(),
          fetchUC01NetworkSummary(),
        ])
        if (branchRes.status === 'fulfilled') {
          setBranches(branchRes.value.data)
        }
        if (summaryRes.status === 'fulfilled') {
          setUC01NetworkSummary(summaryRes.value.data)
        }
      } catch (err) {
        console.error('Failed to load UC-01 data:', err)
      }
    }
    loadData()
  }, [setBranches, setUC01NetworkSummary])


  // Compute KPI metrics from data
  const totalBranches = branches.length
  const totalIdleCash = branches.reduce((sum, b) => sum + (b.idle_cash || 0), 0)
  const avgCES = totalBranches > 0
    ? branches.reduce((sum, b) => sum + (b.ces_score || 0), 0) / totalBranches
    : 0
  const totalSavings = totalIdleCash * 0.11
  const kibor = uc01NetworkSummary?.kibor_rate ?? 11.0

  const kpiMetrics = [
    { label: 'Active Branches', value: totalBranches.toLocaleString(), color: '#e8eaed' },
    { label: 'Total Idle Cash', value: formatPKR(totalIdleCash), color: '#ef4444' },
    { label: 'Avg CES Score', value: `${avgCES.toFixed(1)}%`, color: '#d4a853' },
    { label: 'Potential Savings', value: `PKR ${formatPKR(totalSavings)}`, color: '#22c55e' },
    { label: 'KIBOR Rate', value: `${kibor.toFixed(1)}%`, color: '#2dd4bf' },
  ]

  return (
    <div style={{ backgroundColor: '#0a0e17', minHeight: '100vh' }}>
      {/* KPI Strip */}
      <div className="mb-4">
        <KPIStrip metrics={kpiMetrics} />
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex" style={{ height: 'calc(100vh - 130px)' }}>
        {/* Left sidebar: Branch List */}
        <div className="flex-shrink-0">
          <BranchList />
        </div>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {selectedBranch ? (
            <>
              {/* Branch detail header */}
              <div className="mb-4">
                <BranchDetail />
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <ForecastChart />
                <VaultChart />
              </div>

              {/* Analysis row */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <GameTheoryCard />
                <OptimizerPanel />
              </div>

              {/* AI Summary - collapsed */}
              <AISummaryPanel />
            </>
          ) : (
            <>
              {/* Network overview when no branch selected */}
              <div
                className="rounded-lg p-6 border mb-4"
                style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
              >
                <h2 className="text-lg font-bold mb-2" style={{ color: '#e8eaed' }}>
                  Branch Vault Cash Forecasting
                </h2>
                <p className="text-sm" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                  LSTM + Stochastic Optimization engine for {totalBranches.toLocaleString()} branches.
                  Select a branch from the sidebar to run forecasting, optimization, and game theory analysis.
                </p>
              </div>

              {/* Vault utilization overview */}
              <VaultChart />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
