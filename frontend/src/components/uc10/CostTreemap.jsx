import { formatPKRM } from '../../utils/formatPKR'
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

function colorScale(value, max) {
  if (max === 0) return theme.textSecondary
  const ratio = value / max
  if (ratio > 0.7) return theme.red
  if (ratio > 0.4) return theme.gold
  return theme.green
}

export default function CostTreemap({ data }) {
  if (!data || !data.regions || data.regions.length === 0) {
    return (
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        color: theme.textSecondary,
        fontSize: '12px',
        fontFamily: theme.font,
      }}>
        No cost treemap data available. Load P&L summary first.
      </div>
    )
  }

  const totalCost = data.total_net_cost || data.regions.reduce((sum, r) => sum + (r.total_cost ?? r.net_cash_cost ?? 0), 0)
  const maxRegionCost = Math.max(...data.regions.map((r) => r.total_cost ?? r.net_cash_cost ?? 0))

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '20px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{
          color: theme.text,
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: theme.font,
        }}>
          COST BREAKDOWN BY REGION
        </div>
        <div style={{
          color: theme.textSecondary,
          fontSize: '10px',
          fontFamily: theme.font,
        }}>
          Total: {formatPKRM(totalCost)} PKR
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '8px',
      }}>
        {data.regions.map((region) => {
          const regionCost = region.total_cost ?? region.net_cash_cost ?? 0
          const pct = totalCost > 0 ? ((regionCost / totalCost) * 100).toFixed(1) : 0
          const baseColor = colorScale(regionCost, maxRegionCost)

          return (
            <div
              key={region.name}
              style={{
                backgroundColor: baseColor + '15',
                border: `1px solid ${baseColor}40`,
                borderRadius: '6px',
                padding: '14px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Background intensity bar */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: `${pct}%`,
                height: '3px',
                backgroundColor: baseColor,
                borderRadius: '0 0 0 6px',
              }} />

              <div style={{
                color: baseColor,
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: theme.font,
                marginBottom: '6px',
              }}>
                {region.name}
              </div>

              <div style={{
                color: theme.text,
                fontSize: '18px',
                fontWeight: 700,
                fontFamily: theme.font,
                marginBottom: '4px',
              }}>
                {formatPKRM(regionCost)}
                <span style={{ fontSize: '10px', color: theme.textSecondary, marginLeft: '4px' }}>PKR</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{
                  color: theme.textSecondary,
                  fontSize: '9px',
                  fontFamily: theme.font,
                }}>
                  {region.branches ?? region.branch_count ?? 0} branches
                </span>
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 700,
                  fontFamily: theme.font,
                  backgroundColor: baseColor + '20',
                  color: baseColor,
                }}>
                  {pct}%
                </span>
              </div>

              {/* City breakdown */}
              {region.cities && region.cities.length > 0 && (
                <div style={{ marginTop: '8px', borderTop: `1px solid ${theme.border}40`, paddingTop: '6px' }}>
                  {region.cities.slice(0, 3).map((city) => (
                    <div key={city.name} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2px 0',
                    }}>
                      <span style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>
                        {city.name}
                      </span>
                      <span style={{ color: theme.text, fontSize: '9px', fontFamily: theme.font, fontWeight: 600 }}>
                        {formatPKRM(city.cost ?? city.net_cash_cost)}
                      </span>
                    </div>
                  ))}
                  {region.cities.length > 3 && (
                    <div style={{ color: theme.textSecondary, fontSize: '8px', fontFamily: theme.font, marginTop: '2px' }}>
                      +{region.cities.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
