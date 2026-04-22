import { ArrowRight, Network } from 'lucide-react'
import formatPKR from '../../utils/formatPKR'

export default function NettingFlowTable({ result }) {
  const transfers = result?.optimal_flows || result?.transfers || []

  if (!result || transfers.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}>
        <p className="text-xs" style={{ color: '#6b7280' }}>Run netting to see flow table</p>
      </div>
    )
  }
  const totalTransfers = transfers.length
  const totalAmount = transfers.reduce((s, t) => s + (t.amount || 0), 0)
  const totalCost = transfers.reduce((s, t) => s + (t.cost || 0), 0)

  return (
    <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
        <div className="flex items-center gap-2">
          <Network size={14} style={{ color: '#d4a853' }} />
          <span className="text-sm font-semibold" style={{ color: '#e8eaed' }}>Netting Flows</span>
          {result.solver_status && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}
            >
              {result.solver_status}
            </span>
          )}
        </div>
      </div>

      {/* Table header */}
      <div
        className="grid px-4 py-2 text-[10px] font-bold"
        style={{
          gridTemplateColumns: '1fr 20px 1fr 100px 80px 80px',
          backgroundColor: '#0f1419',
          color: '#d4a853',
        }}
      >
        <span>From Branch</span>
        <span />
        <span>To Branch</span>
        <span className="text-right">Amount (PKR)</span>
        <span className="text-right">Distance (km)</span>
        <span className="text-right">Cost (PKR)</span>
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {transfers.map((t, idx) => (
          <div
            key={idx}
            className="grid px-4 py-2 border-b items-center"
            style={{
              gridTemplateColumns: '1fr 20px 1fr 100px 80px 80px',
              borderColor: '#1e293b',
              backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}
          >
            <span
              className="text-[11px] font-medium"
              style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {t.from_branch || t.source || '--'}
            </span>
            <ArrowRight size={12} style={{ color: '#d4a853' }} />
            <span
              className="text-[11px] font-medium"
              style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {t.to_branch || t.destination || '--'}
            </span>
            <span
              className="text-[11px] text-right font-bold"
              style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {formatPKR(t.amount)}
            </span>
            <span
              className="text-[10px] text-right"
              style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {(t.distance_km ?? t.distance) != null ? `${(t.distance_km ?? t.distance).toFixed(0)}` : '--'}
            </span>
            <span
              className="text-[10px] text-right"
              style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {formatPKR(t.cost)}
            </span>
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div
        className="grid px-4 py-3 text-[11px] font-bold border-t"
        style={{
          gridTemplateColumns: '1fr 20px 1fr 100px 80px 80px',
          borderColor: '#374151',
          backgroundColor: '#0f1419',
        }}
      >
        <span style={{ color: '#d4a853' }}>TOTAL</span>
        <span />
        <span style={{ color: '#8b949e' }}>{totalTransfers} transfers</span>
        <span
          className="text-right"
          style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
        >
          {formatPKR(totalAmount)}
        </span>
        <span />
        <span
          className="text-right"
          style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
        >
          {formatPKR(totalCost)}
        </span>
      </div>
    </div>
  )
}
