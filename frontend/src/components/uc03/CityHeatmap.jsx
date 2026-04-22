import { MapPin } from 'lucide-react'
import formatPKR from '../../utils/formatPKR'

export default function CityHeatmap({ data: rawCities }) {
  if (!rawCities || rawCities.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}>
        <p className="text-xs" style={{ color: '#6b7280' }}>No heatmap data available</p>
      </div>
    )
  }

  // Sort by absolute net position, take top 15
  const cities = [...rawCities]
    .sort((a, b) => Math.abs(b.net_position ?? b.net ?? 0) - Math.abs(a.net_position ?? a.net ?? 0))
    .slice(0, 15)

  // Find max values for bar scaling
  const maxSurplus = Math.max(...cities.map((c) => Math.abs(c.surplus || 0)), 1)
  const maxDeficit = Math.max(...cities.map((c) => Math.abs(c.deficit || 0)), 1)
  const maxVal = Math.max(maxSurplus, maxDeficit)

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin size={14} style={{ color: '#d4a853' }} />
          <h3 className="text-sm font-bold" style={{ color: '#e8eaed' }}>City Surplus/Deficit Heatmap</h3>
        </div>
        <span className="text-[10px]" style={{ color: '#6b7280' }}>Top 15 by imbalance</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
          <span className="text-[10px]" style={{ color: '#8b949e' }}>Surplus</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-[10px]" style={{ color: '#8b949e' }}>Deficit</span>
        </div>
      </div>

      {/* Table header */}
      <div
        className="grid gap-2 px-2 py-1.5 rounded-t text-[10px] font-bold"
        style={{
          gridTemplateColumns: '100px 40px 1fr 70px',
          backgroundColor: '#0f1419',
          color: '#d4a853',
        }}
      >
        <span>City</span>
        <span className="text-center">Br.</span>
        <span className="text-center">Surplus / Deficit</span>
        <span className="text-right">Net</span>
      </div>

      {/* City rows */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {cities.map((city, idx) => {
          const surplusPct = Math.abs(city.surplus || 0) / maxVal * 100
          const deficitPct = Math.abs(city.deficit || 0) / maxVal * 100
          const net = (city.net_position ?? city.net) || 0
          const netColor = net >= 0 ? '#22c55e' : '#ef4444'
          // Intensity based on magnitude
          const intensity = Math.min(Math.abs(net) / maxVal, 1)
          const bgOpacity = (0.03 + intensity * 0.07).toFixed(2)

          return (
            <div
              key={city.city}
              className="grid gap-2 px-2 py-2 border-b items-center"
              style={{
                gridTemplateColumns: '100px 40px 1fr 70px',
                borderColor: '#1e293b',
                backgroundColor: idx % 2 === 0 ? 'transparent' : `rgba(255,255,255,${bgOpacity})`,
              }}
            >
              {/* City name */}
              <span
                className="text-[11px] font-medium truncate"
                style={{ color: '#e8eaed' }}
              >
                {city.city}
              </span>

              {/* Branch count */}
              <span
                className="text-[10px] text-center"
                style={{ color: '#8b949e', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {city.branch_count || city.branches || '--'}
              </span>

              {/* Dual bar */}
              <div className="flex items-center gap-1">
                {/* Surplus bar (green, grows right) */}
                <div className="flex-1 flex justify-end">
                  <div
                    className="rounded-sm"
                    style={{
                      height: 8,
                      width: `${Math.max(surplusPct, 2)}%`,
                      backgroundColor: '#22c55e',
                      opacity: 0.4 + intensity * 0.6,
                    }}
                  />
                </div>
                <div style={{ width: 1, height: 12, backgroundColor: '#374151' }} />
                {/* Deficit bar (red, grows right) */}
                <div className="flex-1">
                  <div
                    className="rounded-sm"
                    style={{
                      height: 8,
                      width: `${Math.max(deficitPct, 2)}%`,
                      backgroundColor: '#ef4444',
                      opacity: 0.4 + intensity * 0.6,
                    }}
                  />
                </div>
              </div>

              {/* Net position */}
              <span
                className="text-[10px] font-bold text-right"
                style={{ color: netColor, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {net >= 0 ? '+' : ''}{formatPKR(net)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
