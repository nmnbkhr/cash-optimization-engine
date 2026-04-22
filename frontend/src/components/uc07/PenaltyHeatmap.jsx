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

function getRiskColor(risk) {
  if (risk >= 0.7) return theme.red
  if (risk >= 0.4) return '#f59e0b'
  return theme.green
}

function getRiskBg(risk) {
  if (risk >= 0.7) return theme.red + '15'
  if (risk >= 0.4) return '#f59e0b15'
  return theme.green + '15'
}

export default function PenaltyHeatmap({ data }) {
  if (!data || !data.length) {
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
        No penalty heatmap data available. Click "View Penalty Heatmap" to load.
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))

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
        marginBottom: '16px',
      }}>
        CITY-LEVEL SBP PENALTY RISK HEATMAP
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: theme.font,
          fontSize: '11px',
        }}>
          <thead>
            <tr>
              {['City', 'Branches at Risk', 'Est. Penalty (PKR)', 'Soiled Ratio', 'Risk Score'].map(h => (
                <th key={h} style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: theme.textSecondary,
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: `1px solid ${theme.border}`,
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const risk = row.risk_score || 0
              const riskColor = getRiskColor(risk)
              const riskBg = getRiskBg(risk)
              return (
                <tr key={i} style={{
                  borderBottom: `1px solid ${theme.border}`,
                  transition: 'background-color 0.15s',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.border + '40'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '10px 12px', color: theme.text, fontWeight: 600 }}>
                    {row.city}
                  </td>
                  <td style={{ padding: '10px 12px', color: theme.text }}>
                    {row.branches_at_risk || 0}
                  </td>
                  <td style={{ padding: '10px 12px', color: theme.red, fontWeight: 600 }}>
                    {row.estimated_penalty != null
                      ? `${(row.estimated_penalty / 1e6).toFixed(1)}M`
                      : '--'
                    }
                  </td>
                  <td style={{ padding: '10px 12px', color: theme.text }}>
                    {row.soiled_ratio != null
                      ? `${(row.soiled_ratio * 100).toFixed(1)}%`
                      : '--'
                    }
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: '4px',
                      backgroundColor: riskBg,
                      color: riskColor,
                      fontWeight: 700,
                      fontSize: '10px',
                      border: `1px solid ${riskColor}40`,
                    }}>
                      {(risk * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
