import { useEffect, useState } from 'react'
import {
  Search, CreditCard, MapPin, Activity, AlertTriangle,
  Loader2, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react'
import useAppStore from '../../stores/appStore'
import { fetchATMs, fetchUC02NetworkSummary, fetchATMAIBrief } from '../../hooks/useAPI'
import KPIStrip from '../KPIStrip'
import CassetteVisualizer from './CassetteVisualizer'
import DQNComparisonCard from './DQNComparisonCard'
import StackelbergTable from './StackelbergTable'
import ATMForecastChart from './ATMForecastChart'
import formatPKR from '../../utils/formatPKR'

const TYPE_FILTERS = ['All', 'Lobby', 'Offsite', 'Mall']

const TYPE_COLORS = {
  Lobby: '#3b82f6',
  Offsite: '#f59e0b',
  Mall: '#a855f7',
}

// The API returns location_type lowercase ("lobby"); the filters/colors above are
// capitalized. Normalize so the type filter buttons and badge colors actually match.
const capType = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

function getFillColor(pct) {
  if (pct < 20) return '#ef4444'
  if (pct < 40) return '#f59e0b'
  if (pct < 60) return '#d4a853'
  return '#22c55e'
}

function ATMAISummaryPanel({ selectedATM }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleAsk = async () => {
    if (result) { setExpanded(!expanded); return }
    if (!selectedATM) return
    setExpanded(true)
    setLoading(true)
    setError(null)
    try {
      const { data } = await fetchATMAIBrief(selectedATM.atm_id)
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
        disabled={!selectedATM}
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
export default function UC02Dashboard() {
  const {
    atms, setATMs,
    selectedATM, setSelectedATM,
    atmFilter, setATMFilter,
    uc02NetworkSummary, setUC02NetworkSummary,
  } = useAppStore()

  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [atmRes, summaryRes] = await Promise.allSettled([
          fetchATMs(),
          fetchUC02NetworkSummary(),
        ])
        if (atmRes.status === 'fulfilled') setATMs(atmRes.value.data)
        if (summaryRes.status === 'fulfilled') setUC02NetworkSummary(summaryRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-02 data:', err)
      }
    }
    loadData()
  }, [setATMs, setUC02NetworkSummary])

  // Filter ATMs
  const filteredATMs = atms.filter((a) => {
    const matchesType = atmFilter === 'All' || capType(a.location_type) === atmFilter
    const matchesSearch =
      !searchQuery ||
      a.atm_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.city?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesSearch
  })

  // KPI calculations
  const totalATMs = atms.length
  const avgUptime = totalATMs > 0
    ? atms.reduce((s, a) => s + (a.uptime_pct || 0), 0) / totalATMs
    : 0
  const totalCapacity = atms.reduce((s, a) => s + (a.total_capacity || 0), 0)
  const avgDispense = totalATMs > 0
    ? atms.reduce((s, a) => s + (a.avg_daily_dispense || 0), 0) / totalATMs
    : 0
  const needReplenishment = atms.filter((a) => (a.fill_pct || 0) < 30).length

  const kpiMetrics = [
    { label: 'ATMs', value: totalATMs.toLocaleString(), color: '#e8eaed' },
    { label: 'Avg Uptime', value: `${avgUptime.toFixed(1)}%`, color: '#22c55e' },
    { label: 'Total Capacity', value: `PKR ${formatPKR(totalCapacity)}`, color: '#3b82f6' },
    { label: 'Avg Dispense/Day', value: `PKR ${formatPKR(avgDispense)}`, color: '#d4a853' },
    { label: 'Need Replenishment', value: needReplenishment.toString(), color: needReplenishment > 0 ? '#ef4444' : '#22c55e' },
  ]

  return (
    <div style={{ backgroundColor: '#0a0e17', minHeight: '100vh' }}>
      {/* KPI Strip */}
      <div className="mb-4">
        <KPIStrip metrics={kpiMetrics} />
      </div>

      {/* Main layout */}
      <div className="flex" style={{ height: 'calc(100vh - 130px)' }}>
        {/* Left sidebar */}
        <div
          className="flex-shrink-0 overflow-y-auto border-r"
          style={{ width: 280, borderColor: '#1e293b', backgroundColor: '#0f1419' }}
        >
          {/* Search */}
          <div className="p-3">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded"
              style={{ backgroundColor: '#141a23', border: '1px solid #1e293b' }}
            >
              <Search size={14} style={{ color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Search ATMs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-xs outline-none"
                style={{
                  backgroundColor: 'transparent',
                  color: '#e8eaed',
                  border: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
            </div>
          </div>

          {/* Type filters */}
          <div className="flex gap-1 px-3 pb-3">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                className="flex-1 text-[10px] font-bold py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: atmFilter === f ? '#d4a85320' : '#141a23',
                  color: atmFilter === f ? '#d4a853' : '#8b949e',
                  border: `1px solid ${atmFilter === f ? '#d4a85340' : '#1e293b'}`,
                }}
                onClick={() => setATMFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {/* ATM list */}
          <div className="px-2 pb-2">
            {filteredATMs.map((atm) => {
              const isSelected = selectedATM?.atm_id === atm.atm_id
              const fillColor = getFillColor(atm.fill_pct || 0)
              const typeColor = TYPE_COLORS[capType(atm.location_type)] || '#8b949e'

              return (
                <button
                  key={atm.atm_id}
                  className="w-full text-left p-3 rounded-lg mb-1 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isSelected ? '#141a23' : 'transparent',
                    border: isSelected ? '1px solid #d4a85340' : '1px solid transparent',
                  }}
                  onClick={() => setSelectedATM(atm)}
                >
                  {/* ATM ID + City */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-bold"
                      style={{ color: isSelected ? '#d4a853' : '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {atm.atm_id}
                    </span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: typeColor + '20', color: typeColor }}
                    >
                      {capType(atm.location_type)}
                    </span>
                  </div>

                  {/* City */}
                  <div className="flex items-center gap-1 mb-2">
                    <MapPin size={10} style={{ color: '#6b7280' }} />
                    <span className="text-[10px]" style={{ color: '#8b949e' }}>
                      {atm.city}
                    </span>
                  </div>

                  {/* Fill level bar */}
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 rounded-full overflow-hidden"
                      style={{ height: 4, backgroundColor: '#0a0e17' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(atm.fill_pct || 0, 100)}%`,
                          backgroundColor: fillColor,
                        }}
                      />
                    </div>
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: fillColor, fontFamily: "'JetBrains Mono', monospace", minWidth: 30, textAlign: 'right' }}
                    >
                      {(atm.fill_pct || 0).toFixed(0)}%
                    </span>
                  </div>

                  {/* Uptime indicator */}
                  <div className="flex items-center gap-1 mt-1">
                    <Activity size={9} style={{ color: atm.uptime_pct >= 95 ? '#22c55e' : '#f59e0b' }} />
                    <span
                      className="text-[9px]"
                      style={{
                        color: atm.uptime_pct >= 95 ? '#22c55e' : '#f59e0b',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {(atm.uptime_pct || 0).toFixed(1)}% uptime
                    </span>
                  </div>
                </button>
              )
            })}

            {filteredATMs.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: '#6b7280' }}>
                No ATMs found
              </p>
            )}
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {selectedATM ? (
            <>
              {/* ATM Header */}
              <div
                className="rounded-lg border p-4 mb-4"
                style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: '#3b82f620' }}
                    >
                      <CreditCard size={20} style={{ color: '#3b82f6' }} />
                    </div>
                    <div>
                      <h2
                        className="text-lg font-bold"
                        style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {selectedATM.atm_id}
                      </h2>
                      <div className="flex items-center gap-2">
                        <MapPin size={11} style={{ color: '#8b949e' }} />
                        <span className="text-xs" style={{ color: '#8b949e' }}>{selectedATM.city}</span>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: (TYPE_COLORS[capType(selectedATM.location_type)] || '#8b949e') + '20',
                            color: TYPE_COLORS[capType(selectedATM.location_type)] || '#8b949e',
                          }}
                        >
                          {capType(selectedATM.location_type)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Status badge */}
                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded"
                    style={{
                      backgroundColor: selectedATM.status === 'Active' ? '#22c55e20' : '#f59e0b20',
                      color: selectedATM.status === 'Active' ? '#22c55e' : '#f59e0b',
                    }}
                  >
                    {selectedATM.status || 'Unknown'}
                  </span>
                </div>

                {/* Metrics row */}
                <div
                  className="grid grid-cols-4 gap-3 p-3 rounded"
                  style={{ backgroundColor: '#0f1419' }}
                >
                  <div className="text-center">
                    <p
                      className="text-sm font-bold"
                      style={{ color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatPKR(selectedATM.total_capacity)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Capacity</p>
                  </div>
                  <div className="text-center">
                    <p
                      className="text-sm font-bold"
                      style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatPKR(selectedATM.avg_daily_dispense)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Avg Dispense/Day</p>
                  </div>
                  <div className="text-center">
                    <p
                      className="text-sm font-bold"
                      style={{
                        color: (selectedATM.uptime_pct || 0) >= 95 ? '#22c55e' : '#f59e0b',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {(selectedATM.uptime_pct || 0).toFixed(1)}%
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Uptime</p>
                  </div>
                  <div className="text-center">
                    <p
                      className="text-sm font-bold"
                      style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {selectedATM.last_loaded || '--'}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Last Loaded</p>
                  </div>
                </div>
              </div>

              {/* Top row: Cassettes + Forecast */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <CassetteVisualizer />
                <ATMForecastChart />
              </div>

              {/* Bottom row: DQN + Stackelberg */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <DQNComparisonCard />
                <StackelbergTable />
              </div>

              {/* AI Summary */}
              <ATMAISummaryPanel selectedATM={selectedATM} />
            </>
          ) : (
            <>
              {/* Network overview */}
              <div
                className="rounded-lg p-6 border mb-4"
                style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
              >
                <h2 className="text-lg font-bold mb-2" style={{ color: '#e8eaed' }}>
                  ATM Cash Replenishment Optimization
                </h2>
                <p className="text-sm" style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}>
                  DQN + (s,S) Policy engine for {totalATMs.toLocaleString()} ATMs.
                  Select an ATM from the sidebar to run forecasting, inventory optimization, and game theory analysis.
                </p>
              </div>

              {/* ATMs needing attention */}
              {needReplenishment > 0 && (
                <div
                  className="rounded-lg border p-4 mb-4"
                  style={{ backgroundColor: '#141a23', borderColor: '#ef444430' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                    <h3 className="text-sm font-semibold" style={{ color: '#ef4444' }}>
                      ATMs Below 30% Fill Level ({needReplenishment})
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {atms
                      .filter((a) => (a.fill_pct || 0) < 30)
                      .slice(0, 9)
                      .map((a) => (
                        <button
                          key={a.atm_id}
                          className="text-left p-2 rounded cursor-pointer transition-colors"
                          style={{ backgroundColor: '#0f1419', border: '1px solid #1e293b' }}
                          onClick={() => setSelectedATM(a)}
                        >
                          <span
                            className="text-[10px] font-bold block"
                            style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {a.atm_id}
                          </span>
                          <span className="text-[9px]" style={{ color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>
                            {(a.fill_pct || 0).toFixed(0)}% fill
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Network summary stats */}
              {uc02NetworkSummary && (
                <div
                  className="rounded-lg border p-4"
                  style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
                >
                  <h3 className="text-sm font-semibold mb-3" style={{ color: '#e8eaed' }}>
                    Network Summary
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.entries(uc02NetworkSummary)
                      .filter(([, value]) => typeof value !== 'object' || value === null)
                      .map(([key, value]) => (
                      <div key={key} className="text-center p-2 rounded" style={{ backgroundColor: '#0f1419' }}>
                        <p
                          className="text-sm font-bold"
                          style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {typeof value === 'number' ? formatPKR(value) : String(value)}
                        </p>
                        <p className="text-[10px] mt-0.5 capitalize" style={{ color: '#8b949e' }}>
                          {key.replace(/_/g, ' ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
