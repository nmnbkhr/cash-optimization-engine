const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  gold: '#d4a853',
  teal: '#2dd4bf',
  red: '#ef4444',
  green: '#10b981',
  text: '#e8eaed',
  textSecondary: '#9ca3af',
  font: "'JetBrains Mono', monospace",
}

const vehicleColors = [
  '#2dd4bf', '#d4a853', '#3b82f6', '#ef4444', '#10b981',
  '#a855f7', '#f97316', '#ec4899', '#06b6d4', '#f59e0b',
  '#8b5cf6', '#22c55e', '#e11d48', '#14b8a6', '#eab308',
]

export default function RouteMapSVG({ routes, emergency }) {
  if (!routes || routes.length === 0) {
    return (
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
      }}>
        <div style={{ color: theme.textSecondary, fontSize: '12px', fontFamily: theme.font }}>
          No route data available. Run optimization to view route map.
        </div>
      </div>
    )
  }

  const svgWidth = 800
  const svgHeight = 500
  const padding = 60

  // Collect all stops with coordinates
  const allStops = []
  routes.forEach((route) => {
    const stops = route.stops || route.branches || []
    stops.forEach((stop) => {
      allStops.push({
        ...stop,
        lat: stop.lat || stop.latitude || (24.8 + Math.random() * 2),
        lng: stop.lng || stop.longitude || (67.0 + Math.random() * 4),
      })
    })
  })

  if (allStops.length === 0) return null

  const minLat = Math.min(...allStops.map(s => s.lat))
  const maxLat = Math.max(...allStops.map(s => s.lat))
  const minLng = Math.min(...allStops.map(s => s.lng))
  const maxLng = Math.max(...allStops.map(s => s.lng))
  const latRange = maxLat - minLat || 1
  const lngRange = maxLng - minLng || 1

  const scaleX = (lng) => padding + ((lng - minLng) / lngRange) * (svgWidth - 2 * padding)
  const scaleY = (lat) => svgHeight - padding - ((lat - minLat) / latRange) * (svgHeight - 2 * padding)

  const failedStopIndex = emergency?.failed_stop
  const failedRouteId = emergency?.original_route_id

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '20px',
    }}>
      <div style={{
        color: theme.text,
        fontSize: '14px',
        fontWeight: 700,
        fontFamily: theme.font,
        marginBottom: '12px',
      }}>
        ROUTE MAP VISUALIZATION
      </div>

      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}` }}
      >
        {/* Routes as lines */}
        {routes.map((route, ri) => {
          const stops = route.stops || route.branches || []
          if (stops.length < 2) return null
          const color = vehicleColors[ri % vehicleColors.length]
          const isFailedRoute = route.route_id === failedRouteId || route.id === failedRouteId
          const points = stops.map(stop => ({
            x: scaleX(stop.lng || stop.longitude || (67.0 + Math.random() * 4)),
            y: scaleY(stop.lat || stop.latitude || (24.8 + Math.random() * 2)),
          }))

          return (
            <g key={`route-${ri}`}>
              {points.map((p, i) => {
                if (i === 0) return null
                const prev = points[i - 1]
                const isFailedSegment = isFailedRoute && (i === failedStopIndex || i - 1 === failedStopIndex)
                return (
                  <line
                    key={`line-${ri}-${i}`}
                    x1={prev.x}
                    y1={prev.y}
                    x2={p.x}
                    y2={p.y}
                    stroke={isFailedSegment ? theme.red : color}
                    strokeWidth={isFailedSegment ? 3 : 2}
                    strokeOpacity={isFailedSegment ? 1 : 0.7}
                    strokeDasharray={isFailedSegment ? '6,3' : 'none'}
                  />
                )
              })}
            </g>
          )
        })}

        {/* Stop nodes */}
        {routes.map((route, ri) => {
          const stops = route.stops || route.branches || []
          const color = vehicleColors[ri % vehicleColors.length]
          const isFailedRoute = route.route_id === failedRouteId || route.id === failedRouteId

          return stops.map((stop, si) => {
            const x = scaleX(stop.lng || stop.longitude || (67.0 + Math.random() * 4))
            const y = scaleY(stop.lat || stop.latitude || (24.8 + Math.random() * 2))
            const isFailedStop = isFailedRoute && si === failedStopIndex
            const nodeColor = isFailedStop ? theme.red : color
            const radius = isFailedStop ? 8 : 6

            return (
              <g key={`stop-${ri}-${si}`}>
                {isFailedStop && (
                  <circle cx={x} cy={y} r={12} fill={theme.red} fillOpacity={0.2} stroke={theme.red} strokeWidth={1} />
                )}
                <circle cx={x} cy={y} r={radius} fill={nodeColor} fillOpacity={0.9} stroke="#0a0e17" strokeWidth={1.5} />
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0a0e17"
                  fontSize="8"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {si + 1}
                </text>
              </g>
            )
          })
        })}
      </svg>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginTop: '12px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {routes.slice(0, 10).map((route, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: vehicleColors[ri % vehicleColors.length],
            }} />
            <span style={{
              color: theme.textSecondary,
              fontSize: '10px',
              fontFamily: theme.font,
            }}>
              {route.vehicle_id || route.route_id || `Route ${ri + 1}`}
            </span>
          </div>
        ))}
        {emergency && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: theme.red,
              border: `2px solid ${theme.red}`,
            }} />
            <span style={{
              color: theme.red,
              fontSize: '10px',
              fontFamily: theme.font,
              fontWeight: 700,
            }}>
              Failed Stop
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
