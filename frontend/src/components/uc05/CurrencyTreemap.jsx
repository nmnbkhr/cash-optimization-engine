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

const currencyColors = {
  USD: '#3b82f6',
  EUR: '#8b5cf6',
  GBP: '#ec4899',
  JPY: '#ef4444',
  CNY: '#f97316',
  AED: '#d4a853',
  SAR: '#10b981',
  CHF: '#06b6d4',
  CAD: '#a855f7',
  AUD: '#22c55e',
}

export default function CurrencyTreemap({ data }) {
  const breakdown = data || []

  if (!breakdown.length) {
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
          marginBottom: '4px',
        }}>
          CURRENCY BREAKDOWN
        </div>
        <div style={{
          color: theme.textSecondary,
          fontSize: '11px',
          fontFamily: theme.font,
          marginBottom: '20px',
        }}>
          Portfolio Composition by Currency
        </div>
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          Load summary data to view currency breakdown.
        </div>
      </div>
    )
  }

  const totalBalance = breakdown.reduce((sum, c) => sum + (c.total_balance_pkr || 0), 0)
  // Compute excess_ratio from data if not present
  const enriched = breakdown.map(c => ({
    ...c,
    excess_ratio: c.excess_ratio ?? (c.total_balance_pkr > 0 ? (c.total_excess_pkr || 0) / c.total_balance_pkr : 0),
    carry_rate: c.carry_rate ?? c.carry_spread_pct,
  }))
  const maxExcessRatio = Math.max(...enriched.map(c => c.excess_ratio || 0), 1)

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
        marginBottom: '4px',
      }}>
        CURRENCY BREAKDOWN
      </div>
      <div style={{
        color: theme.textSecondary,
        fontSize: '11px',
        fontFamily: theme.font,
        marginBottom: '16px',
      }}>
        Portfolio Composition by Currency -- Block Size = Balance Weight
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '8px',
      }}>
        {enriched.map((curr) => {
          const pct = totalBalance > 0 ? ((curr.total_balance_pkr || 0) / totalBalance) * 100 : 0
          const baseColor = currencyColors[curr.currency] || theme.teal
          const excessRatio = (curr.excess_ratio || 0) / maxExcessRatio
          const opacity = 0.3 + excessRatio * 0.7
          const minHeight = Math.max(80, Math.min(180, 60 + pct * 3))

          return (
            <div
              key={curr.currency}
              style={{
                backgroundColor: baseColor + Math.round(opacity * 40).toString(16).padStart(2, '0'),
                border: `1px solid ${baseColor}60`,
                borderRadius: '6px',
                padding: '12px',
                minHeight: `${minHeight}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s',
              }}
            >
              <div>
                <div style={{
                  color: baseColor,
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: theme.font,
                }}>
                  {curr.currency}
                </div>
                <div style={{
                  color: theme.text,
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: theme.font,
                  marginTop: '4px',
                }}>
                  {formatPKR(curr.total_balance_pkr)}
                </div>
              </div>
              <div>
                <div style={{
                  color: theme.textSecondary,
                  fontSize: '10px',
                  fontFamily: theme.font,
                  marginTop: '8px',
                }}>
                  {pct.toFixed(1)}% of portfolio
                </div>
                {curr.carry_rate != null && (
                  <div style={{
                    color: curr.carry_rate >= 0 ? theme.green : theme.red,
                    fontSize: '10px',
                    fontFamily: theme.font,
                    marginTop: '2px',
                  }}>
                    Carry: {curr.carry_rate >= 0 ? '+' : ''}{curr.carry_rate.toFixed(2)}%
                  </div>
                )}
                {curr.account_count != null && (
                  <div style={{
                    color: theme.textSecondary,
                    fontSize: '9px',
                    fontFamily: theme.font,
                    marginTop: '2px',
                  }}>
                    {curr.account_count} account{curr.account_count !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

