import { useEffect } from 'react'
import { useCommandStore } from '../../stores/commandCenterStore'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, CartesianGrid,
} from 'recharts'
import {
  Zap, RefreshCw, ArrowRight, CheckCircle2, Activity,
  TrendingDown, TrendingUp, Banknote, Shield, Truck,
} from 'lucide-react'
import formatPKR from '../../utils/formatPKR'

/* ------------------------------------------------------------------ */
/*  KPI Card                                                           */
/* ------------------------------------------------------------------ */

function KPICard({ icon: Icon, label, value, delta, deltaLabel }) {
  const isPositive = delta > 0
  return (
    <div className="flex-1 min-w-[180px] rounded-lg border border-gray-800 bg-gray-900/80 p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold text-amber-400 font-mono leading-tight">
        {value}
      </span>
      {delta != null && delta !== 0 && (
        <span className={`text-xs font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{typeof delta === 'number' ? delta.toLocaleString() : delta}
          {deltaLabel ? ` ${deltaLabel}` : ''}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Opportunity Card                                                   */
/* ------------------------------------------------------------------ */

function OpportunityCard({ opp, onExecute, loading }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 mb-3">
      {/* From -> Amount -> To */}
      <div className="flex items-center gap-3 mb-3">
        {/* From branch */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-200 truncate">{opp.fromName}</p>
          <p className="text-[11px] text-gray-500">{opp.fromCity}</p>
          <p className="text-xs font-mono text-red-400 mt-0.5">
            Idle: {formatPKR(opp.fromIdle * 1e6)}
          </p>
        </div>

        {/* Arrow + amount + distance */}
        <div className="flex flex-col items-center gap-0.5 px-2 shrink-0">
          <span className="text-lg font-bold font-mono text-amber-400">
            {formatPKR(opp.amount * 1e6)}
          </span>
          <ArrowRight size={16} className="text-amber-400" />
          <span className="text-[10px] text-gray-500 font-mono">{opp.distanceKm.toFixed(1)} km</span>
        </div>

        {/* To branch */}
        <div className="flex-1 min-w-0 text-right">
          <p className="text-sm font-semibold text-gray-200 truncate">{opp.toName}</p>
          <p className="text-[11px] text-gray-500">{opp.toCity}</p>
          <p className="text-xs font-mono text-emerald-400 mt-0.5">
            Shortfall: {formatPKR(opp.toShortfall * 1e6)}
          </p>
        </div>
      </div>

      {/* Savings row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex gap-4 text-[11px] font-mono">
          <span className="text-emerald-400">
            BSC: {formatPKR(opp.bscPkr)}
          </span>
          <span className="text-emerald-400">
            CIT: {formatPKR(opp.citPkr)}
          </span>
          <span className="text-emerald-400">
            KIBOR/yr: {formatPKR(opp.kiborAnnual * 1e6)}
          </span>
        </div>
      </div>

      {/* Execute button */}
      <button
        onClick={() => onExecute(opp.fromId, opp.toId, opp.amount)}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-bold font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-amber-400/10 text-amber-400 border border-amber-400/30 hover:bg-amber-400/20 hover:border-amber-400/50"
      >
        <Zap size={14} />
        Execute Transfer
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Success Toast                                                      */
/* ------------------------------------------------------------------ */

function SuccessToast({ action, onDismiss }) {
  if (!action) return null
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 p-4 mb-5 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-400">
              Transfer Executed
              {action.transferId && (
                <span className="ml-2 text-xs font-mono text-emerald-500">#{action.transferId}</span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {action.fromName || action.from_id} <ArrowRight size={10} className="inline mx-1" /> {action.toName || action.to_id}
              {' | '}Amount: {formatPKR((action.amount ?? 0) * 1e6)}
            </p>
            <div className="flex gap-4 mt-1.5 text-[11px] font-mono text-emerald-400/80">
              {action.idleFreed != null && <span>Idle freed: {formatPKR(action.idleFreed * 1e6)}</span>}
              {action.bscPkr != null && <span>BSC: {formatPKR(action.bscPkr)}</span>}
              {action.citPkr != null && <span>CIT: {formatPKR(action.citPkr)}</span>}
              {action.kiborAnnual != null && <span>KIBOR/yr: {formatPKR(action.kiborAnnual * 1e6)}</span>}
            </div>
            {(action.vaultBefore != null || action.vaultAfter != null) && (
              <p className="text-[11px] text-gray-500 mt-1 font-mono">
                Vault: {action.vaultBefore?.toFixed(1) ?? '--'}M {' -> '} {action.vaultAfter?.toFixed(1) ?? '--'}M
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Chart Tooltips                                                     */
/* ------------------------------------------------------------------ */

function CESTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg p-2.5 border border-gray-700 bg-gray-900 text-xs">
      <p className="font-bold text-gray-200 mb-0.5">{d.name}</p>
      <p className="font-mono text-amber-400">{d.count} branches</p>
    </div>
  )
}

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg p-2.5 border border-gray-700 bg-gray-900 text-xs">
      <p className="font-bold text-gray-200 mb-0.5">{d.name}</p>
      <p className="font-mono text-amber-400">PKR {d.value?.toFixed(1)}M</p>
    </div>
  )
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg p-2.5 border border-gray-700 bg-gray-900 text-xs">
      <p className="font-bold text-gray-200 mb-0.5">{d.name || d.id}</p>
      <p className="text-gray-400">{d.city}</p>
      <p className="font-mono text-amber-400">Idle: {formatPKR(d.idle * 1e6)}</p>
      <p className="font-mono text-gray-400">CES: {d.ces?.toFixed(1)}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Charts Panel (right column)                                        */
/* ------------------------------------------------------------------ */

function ChartsPanel({ charts, branchesGeo }) {
  const cesBuckets = charts?.cesBuckets || []
  const waterfall = charts?.waterfall || []
  const geoData = branchesGeo || []

  const statusColor = (status) => {
    if (status === 'surplus') return '#22c55e'
    if (status === 'deficit') return '#ef4444'
    return '#6b7280'
  }

  return (
    <div className="flex flex-col gap-4">
      {/* CES Distribution */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-gray-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            CES Distribution
          </h3>
        </div>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cesBuckets} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#8b949e', fontSize: 10 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
              />
              <Tooltip content={<CESTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={48}>
                {cesBuckets.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* P&L Waterfall */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={14} className="text-gray-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            P&L Waterfall (Annualized)
          </h3>
        </div>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfall} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#8b949e', fontSize: 9 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
                tickFormatter={(v) => `${v.toFixed(0)}M`}
              />
              <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={48}>
                {waterfall.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Branch Scatter */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={14} className="text-gray-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Branch Network
          </h3>
          <div className="flex gap-3 ml-auto text-[10px]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              Surplus
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              Deficit
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
              Normal
            </span>
          </div>
        </div>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="lng"
                name="Longitude"
                tick={{ fill: '#8b949e', fontSize: 9 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
              />
              <YAxis
                type="number"
                dataKey="lat"
                name="Latitude"
                tick={{ fill: '#8b949e', fontSize: 9 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
              />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#374151' }} />
              <Scatter data={geoData} fill="#6b7280">
                {geoData.map((entry, idx) => (
                  <Cell key={idx} fill={statusColor(entry.status)} fillOpacity={0.7} r={4} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Audit Log                                                          */
/* ------------------------------------------------------------------ */

function AuditLog({ log }) {
  if (!log || log.length === 0) return null
  return (
    <details className="mt-5 rounded-lg border border-gray-800 bg-gray-900/40">
      <summary className="px-4 py-3 cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 select-none">
        Audit Log ({log.length} transfer{log.length !== 1 ? 's' : ''})
      </summary>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-800">
              <th className="py-2 pr-3">ID</th>
              <th className="py-2 pr-3">From</th>
              <th className="py-2 pr-3">To</th>
              <th className="py-2 pr-3 text-right">Amount</th>
              <th className="py-2 pr-3 text-right">Freed</th>
              <th className="py-2 pr-3 text-right">BSC</th>
              <th className="py-2 text-right">KIBOR/yr</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry, idx) => (
              <tr key={idx} className="border-b border-gray-800/50 text-gray-300">
                <td className="py-2 pr-3 text-amber-400">{entry.transferId || entry.id || idx + 1}</td>
                <td className="py-2 pr-3">{entry.fromName || entry.from_id}</td>
                <td className="py-2 pr-3">{entry.toName || entry.to_id}</td>
                <td className="py-2 pr-3 text-right text-amber-400">
                  {formatPKR((entry.amount ?? 0) * 1e6)}
                </td>
                <td className="py-2 pr-3 text-right text-emerald-400">
                  {entry.idleFreed != null ? formatPKR(entry.idleFreed * 1e6) : '--'}
                </td>
                <td className="py-2 pr-3 text-right text-emerald-400">
                  {entry.bscPkr != null ? formatPKR(entry.bscPkr) : '--'}
                </td>
                <td className="py-2 text-right text-emerald-400">
                  {entry.kiborAnnual != null ? formatPKR(entry.kiborAnnual * 1e6) : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/* ------------------------------------------------------------------ */
/*  Loading Spinner                                                    */
/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="w-9 h-9 border-3 border-gray-700 border-t-amber-400 rounded-full animate-spin" />
      <span className="text-gray-500 font-mono text-sm">Loading Command Center...</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CommandCenter() {
  const {
    snapshot, opportunities, log, lastAction, loading, toastVisible,
    radius, minAmount,
    fetchAll, executeTransfer, resetAll, setRadius, setMinAmount, dismissToast,
  } = useCommandStore()

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const kpis = snapshot?.kpis
  const charts = snapshot?.charts
  const branchesGeo = snapshot?.branchesGeo

  if (!snapshot && loading) return <Spinner />

  const nettableTotal = opportunities.reduce((s, o) => s + o.amount, 0)

  return (
    <div className="min-h-full bg-[#0a0e17] text-gray-200 p-6">
      {/* ============================================================ */}
      {/*  Header Bar                                                   */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Zap size={18} className="text-gray-900" />
          </div>
          <div>
            <h1 className="text-lg font-bold uppercase tracking-widest text-amber-400 leading-tight">
              Command Center
            </h1>
            <p className="text-[11px] text-gray-500 font-mono">
              UC-03 PEER-TO-PEER NETTING
              {kpis?.kibor != null && <> &middot; KIBOR {kpis.kibor.toFixed(2)}%</>}
              {' '}&middot; PKR MILLIONS
            </p>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-5 flex-wrap">
          {/* Radius slider */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Radius
            </label>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-24 accent-amber-400 cursor-pointer"
            />
            <span className="text-xs font-mono text-amber-400 w-10 text-right">{radius} km</span>
          </div>

          {/* Min amount slider */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Min Amt
            </label>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={minAmount}
              onChange={(e) => setMinAmount(Number(e.target.value))}
              className="w-24 accent-amber-400 cursor-pointer"
            />
            <span className="text-xs font-mono text-amber-400 w-10 text-right">{minAmount}M</span>
          </div>

          {/* Reset button */}
          <button
            onClick={resetAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold font-mono uppercase tracking-wider border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} />
            Reset
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  KPI Strip                                                    */}
      {/* ============================================================ */}
      <div className="flex gap-3 flex-wrap mb-5">
        <KPICard
          icon={Banknote}
          label="Total Idle Cash"
          value={kpis ? formatPKR(kpis.currentIdle * 1e6) : '--'}
          delta={kpis?.idleFreed ? -kpis.idleFreed : null}
          deltaLabel="M freed"
        />
        <KPICard
          icon={TrendingDown}
          label="Annual KIBOR Loss"
          value={kpis ? formatPKR(kpis.annualLoss * 1e6) : '--'}
          delta={kpis?.annualSaved ? kpis.annualSaved : null}
          deltaLabel="M saved"
        />
        <KPICard
          icon={Activity}
          label="Avg CES"
          value={kpis?.avgCes != null ? `${kpis.avgCes.toFixed(1)}` : '--'}
          delta={kpis?.cesDelta || null}
          deltaLabel="pts"
        />
        <KPICard
          icon={Shield}
          label="BSC Avoided"
          value={kpis ? formatPKR(kpis.bscAvoidedPkr) : '--'}
          delta={null}
        />
        <KPICard
          icon={Truck}
          label="CIT Trips Saved"
          value={kpis?.citTripsSaved != null ? kpis.citTripsSaved.toLocaleString() : '--'}
          delta={kpis?.citSavedPkr ? kpis.citSavedPkr : null}
          deltaLabel="PKR saved"
        />
      </div>

      {/* ============================================================ */}
      {/*  Success Toast                                                */}
      {/* ============================================================ */}
      {toastVisible && lastAction && (
        <SuccessToast action={lastAction} onDismiss={dismissToast} />
      )}

      {/* ============================================================ */}
      {/*  Main Area: 7 + 5 grid                                       */}
      {/* ============================================================ */}
      <div className="grid grid-cols-12 gap-4 mb-5">
        {/* LEFT: Opportunities (col-span-7) */}
        <div className="col-span-12 lg:col-span-7">
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-amber-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300">
                  AI-Recommended Transfers
                </h2>
                <span className="text-[10px] font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {opportunities.length} match{opportunities.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <span className="text-xs font-mono text-amber-400">
                Nettable: {formatPKR(nettableTotal * 1e6)}
              </span>
            </div>

            {/* Scrollable list */}
            <div className="max-h-[520px] overflow-y-auto pr-1">
              {opportunities.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Zap size={24} className="text-gray-700" />
                  <p className="text-sm text-gray-600">No transfer opportunities found</p>
                  <p className="text-xs text-gray-700">Adjust radius or min amount filters</p>
                </div>
              )}
              {opportunities.map((opp, idx) => (
                <OpportunityCard
                  key={`${opp.fromId}-${opp.toId}-${idx}`}
                  opp={opp}
                  onExecute={executeTransfer}
                  loading={loading}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Charts (col-span-5) */}
        <div className="col-span-12 lg:col-span-5">
          <ChartsPanel charts={charts} branchesGeo={branchesGeo} />
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Audit Log                                                    */}
      {/* ============================================================ */}
      <AuditLog log={log} />
    </div>
  )
}
