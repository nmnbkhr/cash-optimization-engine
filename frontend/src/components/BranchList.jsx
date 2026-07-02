import { useState } from 'react'
import { Search } from 'lucide-react'
import useAppStore from '../stores/appStore'
import useBranches from '../hooks/useBranches'
import ProgressBar from './common/ProgressBar'

const BRANCH_TYPES = ['All', 'Surplus', 'Deficit', 'Balanced', 'Seasonal', 'Hub']

export default function BranchList() {
  const [search, setSearch] = useState('')
  const { branchFilter, setBranchFilter, selectedBranch, setSelectedBranch } = useAppStore()
  const branches = useBranches()

  const filtered = branches.filter((b) => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      (b.name || '').toLowerCase().includes(q) ||
      (b.branch_id || '').toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q)
    const matchesFilter =
      branchFilter === 'All' || String(b.branch_type || '').toLowerCase() === branchFilter.toLowerCase()
    return matchesSearch && matchesFilter
  })

  return (
    <div
      className="flex flex-col h-full border-r"
      style={{ backgroundColor: '#0f1419', borderColor: '#1e293b', width: 280 }}
    >
      {/* Search */}
      <div className="p-3 border-b" style={{ borderColor: '#1e293b' }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded"
          style={{ backgroundColor: '#141a23', border: '1px solid #1e293b' }}
        >
          <Search size={14} style={{ color: '#6b7280' }} />
          <input
            type="text"
            placeholder="Search branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: '#e8eaed', fontFamily: "'DM Sans', sans-serif" }}
          />
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1.5 p-3 border-b" style={{ borderColor: '#1e293b' }}>
        {BRANCH_TYPES.map((type) => {
          const isActive = branchFilter === type
          return (
            <button
              key={type}
              className="text-xs px-2.5 py-1 rounded cursor-pointer transition-colors font-medium"
              style={{
                backgroundColor: isActive ? '#d4a853' : 'transparent',
                color: isActive ? '#0a0e17' : '#8b949e',
                border: isActive ? '1px solid #d4a853' : '1px solid #1e293b',
                fontFamily: "'DM Sans', sans-serif",
              }}
              onClick={() => setBranchFilter(type)}
            >
              {type}
            </button>
          )
        })}
      </div>

      {/* Branch list */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        {filtered.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {branches.length === 0 ? 'Connect to backend to load branches.' : 'No branches match filter.'}
            </p>
          </div>
        ) : (
          filtered.map((b) => {
            const isSelected = selectedBranch?.branch_id === b.branch_id
            const cesRaw = b.cash_efficiency_score ?? b.ces_score ?? 0
            const cesScore = cesRaw <= 1 ? cesRaw * 100 : cesRaw   // stored 0–1, shown as %
            const idleCash = b.idle_cash ?? 0
            return (
              <div
                key={b.branch_id}
                className="px-3 py-3 cursor-pointer transition-colors"
                style={{
                  backgroundColor: isSelected ? '#1a2230' : 'transparent',
                  borderLeft: isSelected ? '3px solid #d4a853' : '3px solid transparent',
                  borderBottom: '1px solid #1e293b',
                }}
                onClick={() => setSelectedBranch(b)}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#141a23'
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <p
                  className="text-xs mb-0.5"
                  style={{ color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {b.branch_id}
                </p>
                <p className="text-sm font-medium" style={{ color: '#e8eaed' }}>
                  {b.name || b.branch_id}
                </p>
                <p className="text-xs mb-2" style={{ color: '#6b7280' }}>
                  {b.city}
                </p>

                {/* CES progress bar */}
                <div className="mb-1.5">
                  <ProgressBar
                    value={cesScore}
                    max={100}
                    color="#d4a853"
                    height={4}
                  />
                </div>

                {/* Idle cash indicator */}
                {idleCash != null && (
                  <p
                    className="text-xs font-bold"
                    style={{
                      color: idleCash > 0 ? '#ef4444' : '#22c55e',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {idleCash > 0 ? 'Idle: ' : ''}{idleCash > 0 ? `+${(idleCash / 1e6).toFixed(1)}M` : 'No idle cash'}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
