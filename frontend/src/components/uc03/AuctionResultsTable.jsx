import { Zap, Shield, TrendingUp, TrendingDown } from 'lucide-react'
import formatPKR, { formatPKRM } from '../../utils/formatPKR'
// UC-03 auction: total_volume / match amount / supplier-buyer volume are RAW PKR;
// welfare_gain and per-match welfare_gain/surplus are PKR Millions (backend ÷1e6).

export default function AuctionResultsTable({ result }) {
  if (!result) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}>
        <p className="text-xs" style={{ color: '#6b7280' }}>Run VCG auction to see results</p>
      </div>
    )
  }

  const matches = result.auction_results || result.matches || []
  const stats = {
    total_volume: result.total_volume || 0,
    welfare_gain: result.total_welfare_gain || 0,
    market_efficiency: result.market_efficiency || 0,
    avg_clearing_price: result.avg_clearing_price_pct || 0,
  }
  const topSuppliers = (result.top_suppliers || []).slice(0, 5)
  const topBuyers = (result.top_buyers || []).slice(0, 5)

  return (
    <div
      className="rounded-lg border"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: '#d4a853' }} />
          <h3 className="text-sm font-bold" style={{ color: '#e8eaed' }}>VCG Auction Results</h3>
        </div>
        <div className="flex items-center gap-2">
          <Shield size={12} style={{ color: '#2dd4bf' }} />
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: '#2dd4bf20', color: '#2dd4bf' }}
          >
            Truthful -- VCG mechanism
          </span>
        </div>
      </div>

      {/* Market stats */}
      <div
        className="grid grid-cols-4 gap-3 p-4 border-b"
        style={{ borderColor: '#1e293b', backgroundColor: '#0f1419' }}
      >
        <div className="text-center">
          <p
            className="text-sm font-bold"
            style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatPKR(stats.total_volume || 0)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Total Volume</p>
        </div>
        <div className="text-center">
          <p
            className="text-sm font-bold"
            style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatPKRM(stats.welfare_gain || 0)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Welfare Gain</p>
        </div>
        <div className="text-center">
          <p
            className="text-sm font-bold"
            style={{ color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {stats.market_efficiency != null ? `${(stats.market_efficiency <= 1 ? stats.market_efficiency * 100 : stats.market_efficiency).toFixed(1)}%` : '--'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Market Efficiency</p>
        </div>
        <div className="text-center">
          <p
            className="text-sm font-bold"
            style={{ color: '#2dd4bf', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {stats.avg_clearing_price != null ? `${stats.avg_clearing_price.toFixed(2)}%` : '--'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#8b949e' }}>Avg Clearing Price</p>
        </div>
      </div>

      {/* Matches table header */}
      <div
        className="grid px-4 py-2 text-[10px] font-bold"
        style={{
          gridTemplateColumns: '1fr 1fr 90px 80px 80px 90px 70px',
          backgroundColor: '#0a0e17',
          color: '#d4a853',
        }}
      >
        <span>Supplier</span>
        <span>Buyer</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Ask Price</span>
        <span className="text-right">Bid Price</span>
        <span className="text-right">Clearing</span>
        <span className="text-right">Surplus</span>
      </div>

      {/* Matches rows */}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {matches.map((m, idx) => (
          <div
            key={idx}
            className="grid px-4 py-2 border-b items-center"
            style={{
              gridTemplateColumns: '1fr 1fr 90px 80px 80px 90px 70px',
              borderColor: '#1e293b',
              backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}
          >
            <span
              className="text-[11px] font-medium truncate"
              style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {m.supplier || '--'}
            </span>
            <span
              className="text-[11px] font-medium truncate"
              style={{ color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {m.buyer || '--'}
            </span>
            <span
              className="text-[11px] text-right font-bold"
              style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {formatPKR(m.amount)}
            </span>
            <span
              className="text-[10px] text-right"
              style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {m.ask_price != null ? `${m.ask_price.toFixed(2)}%` : '--'}
            </span>
            <span
              className="text-[10px] text-right"
              style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {m.bid_price != null ? `${m.bid_price.toFixed(2)}%` : '--'}
            </span>
            <span
              className="text-[10px] text-right font-bold"
              style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {m.clearing_price != null ? `${m.clearing_price.toFixed(2)}%` : '--'}
            </span>
            <span
              className="text-[10px] text-right"
              style={{ color: '#2dd4bf', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {formatPKRM(m.welfare_gain ?? m.surplus)}
            </span>
          </div>
        ))}
        {matches.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: '#6b7280' }}>
            No auction matches available
          </p>
        )}
      </div>

      {/* Top Suppliers & Buyers */}
      {(topSuppliers.length > 0 || topBuyers.length > 0) && (
        <div className="grid grid-cols-2 gap-4 p-4 border-t" style={{ borderColor: '#1e293b' }}>
          {/* Top Suppliers */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <TrendingUp size={12} style={{ color: '#22c55e' }} />
              <span className="text-[10px] font-bold" style={{ color: '#22c55e' }}>Top 5 Suppliers</span>
            </div>
            {topSuppliers.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 border-b"
                style={{ borderColor: '#1e293b' }}
              >
                <span
                  className="text-[10px]"
                  style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {s.branch || s.branch_id || '--'}
                </span>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatPKR(s.volume || s.amount || s.surplus)}
                </span>
              </div>
            ))}
          </div>

          {/* Top Buyers */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <TrendingDown size={12} style={{ color: '#ef4444' }} />
              <span className="text-[10px] font-bold" style={{ color: '#ef4444' }}>Top 5 Buyers</span>
            </div>
            {topBuyers.map((b, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 border-b"
                style={{ borderColor: '#1e293b' }}
              >
                <span
                  className="text-[10px]"
                  style={{ color: '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {b.branch || b.branch_id || '--'}
                </span>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatPKR(b.volume || b.amount || b.deficit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
