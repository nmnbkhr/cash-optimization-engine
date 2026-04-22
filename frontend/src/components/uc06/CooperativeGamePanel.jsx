import formatPKR from '../../utils/formatPKR'
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

export default function CooperativeGamePanel({ data }) {
  if (!data) return null

  const players = data.players || data.shapley_values || []
  const individualLaRSum = data.individual_lar_sum ?? data.sum_individual_lar ?? players.reduce((s, p) => s + (p.individual_lar_30d ?? p.individual_lar ?? 0), 0)
  const pooledLaR = data.pooled_lar ?? data.grand_coalition_lar ?? 0
  const totalPoolingBenefit = data.total_pooling_benefit ?? data.diversification_benefit ?? (individualLaRSum - pooledLaR)

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
        COOPERATIVE GAME -- SHAPLEY VALUE ANALYSIS
      </div>

      {/* Summary strip: Individual vs Pooled */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <div style={{
          backgroundColor: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          padding: '12px 16px',
          borderLeft: `3px solid ${theme.red}`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Sum of Individual LaR
          </div>
          <div style={{ color: theme.red, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKR(individualLaRSum)}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>
            PKR (standalone reserves needed)
          </div>
        </div>
        <div style={{
          backgroundColor: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          padding: '12px 16px',
          borderLeft: `3px solid ${theme.teal}`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Pooled LaR
          </div>
          <div style={{ color: theme.teal, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKR(pooledLaR)}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>
            PKR (diversified reserve)
          </div>
        </div>
        <div style={{
          backgroundColor: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          padding: '12px 16px',
          borderLeft: `3px solid ${theme.green}`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Total Pooling Benefit
          </div>
          <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKR(totalPoolingBenefit)}
          </div>
          <div style={{
            display: 'inline-block',
            marginTop: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 700,
            fontFamily: theme.font,
            backgroundColor: theme.green + '20',
            color: theme.green,
            border: `1px solid ${theme.green}40`,
          }}>
            {individualLaRSum > 0 ? `${((totalPoolingBenefit / individualLaRSum) * 100).toFixed(1)}% REDUCTION` : 'DIVERSIFICATION GAIN'}
          </div>
        </div>
      </div>

      {/* Shapley allocation table */}
      {Array.isArray(players) && players.length > 0 && (
        <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.font, fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: theme.textSecondary, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}>
                  Bank Name
                </th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: theme.textSecondary, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}>
                  Individual LaR
                </th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: theme.textSecondary, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}>
                  Pooled LaR
                </th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: theme.textSecondary, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}>
                  Diversification Benefit
                </th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: theme.textSecondary, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}>
                  Shapley Allocation
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, idx) => {
                const indivLar = player.individual_lar_30d ?? player.individual_lar ?? 0
                const pooledPlayerLar = player.pooled_lar ?? player.allocated_lar ?? 0
                const benefit = indivLar - pooledPlayerLar
                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: `1px solid ${theme.border}20`,
                      backgroundColor: idx % 2 === 0 ? 'transparent' : theme.bg + '40',
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: theme.text, fontWeight: 500 }}>
                      {player.bank_name || player.name}
                    </td>
                    <td style={{ padding: '8px 10px', color: theme.red, textAlign: 'right' }}>
                      {formatPKR(indivLar)}
                    </td>
                    <td style={{ padding: '8px 10px', color: theme.teal, textAlign: 'right' }}>
                      {formatPKR(pooledPlayerLar || player.individual_stable)}
                    </td>
                    <td style={{ padding: '8px 10px', color: theme.green, textAlign: 'right' }}>
                      {formatPKR(benefit > 0 ? benefit : 0)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: theme.gold + '15',
                        color: theme.gold,
                        fontWeight: 600,
                        border: `1px solid ${theme.gold}30`,
                      }}>
                        {formatPKR(player.shapley_value ?? player.shapley_allocation)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* No data state */}
      {(!Array.isArray(players) || players.length === 0) && (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          No player-level Shapley data available. Summary metrics shown above.
        </div>
      )}
    </div>
  )
}
