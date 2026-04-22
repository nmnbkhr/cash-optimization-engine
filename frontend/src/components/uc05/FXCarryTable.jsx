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

const headerStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  fontFamily: theme.font,
  color: theme.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: `1px solid ${theme.border}`,
  backgroundColor: '#0d1117',
}

const cellStyle = {
  padding: '10px 12px',
  fontSize: '12px',
  fontFamily: theme.font,
  color: theme.text,
  borderBottom: `1px solid ${theme.border}`,
}

export default function FXCarryTable({ data }) {
  const carries = data?.currencies || data?.carry_analysis || (Array.isArray(data) ? data : [])

  // Sort by absolute opportunity descending
  const sorted = [...carries].sort(
    (a, b) => Math.abs(b.annual_carry_income_pkr ?? b.annual_opportunity ?? 0) - Math.abs(a.annual_carry_income_pkr ?? a.annual_opportunity ?? 0)
  )

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
        FX CARRY ANALYSIS
      </div>
      <div style={{
        color: theme.textSecondary,
        fontSize: '11px',
        fontFamily: theme.font,
        marginBottom: '16px',
      }}>
        Interest Rate Differential & Carry Trade Opportunities
      </div>

      {sorted.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          Run FX Carry Analysis to view results.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}>
            <thead>
              <tr>
                <th style={headerStyle}>Currency</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>PKR Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Foreign O/N Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Carry Spread</th>
                <th style={headerStyle}>Direction</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Annual Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const spread = row.carry_spread_pct ?? row.carry_spread ?? 0
                const spreadColor = spread >= 0 ? theme.green : theme.red
                const opportunity = row.annual_carry_income_pkr ?? row.annual_opportunity ?? 0
                const oppColor = opportunity >= 0 ? theme.green : theme.red
                const pkrRate = row.fx_rate_pkr ?? row.pkr_rate
                const foreignRate = row.foreign_overnight_rate_pct ?? row.foreign_overnight_rate
                const direction = (row.carry_direction ?? row.direction ?? '').toUpperCase() || (spread >= 0 ? 'POSITIVE' : 'NEGATIVE')

                return (
                  <tr
                    key={row.currency || i}
                    style={{
                      backgroundColor: i % 2 === 0 ? 'transparent' : '#0d111780',
                    }}
                  >
                    <td style={cellStyle}>
                      <span style={{ color: theme.teal, fontWeight: 600 }}>
                        {row.currency || '--'}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {pkrRate != null ? pkrRate.toFixed(2) : '--'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {foreignRate != null
                        ? `${foreignRate.toFixed(2)}%`
                        : '--'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', color: spreadColor, fontWeight: 600 }}>
                      {spread >= 0 ? '+' : ''}{spread.toFixed(2)}%
                    </td>
                    <td style={cellStyle}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        fontFamily: theme.font,
                        backgroundColor: (direction === 'POSITIVE')
                          ? theme.green + '20'
                          : theme.red + '20',
                        color: (direction === 'POSITIVE')
                          ? theme.green
                          : theme.red,
                        border: `1px solid ${direction === 'POSITIVE' ? theme.green : theme.red}40`,
                      }}>
                        {direction}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', color: oppColor, fontWeight: 600 }}>
                      {formatPKR(opportunity)} PKR
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(data?.total_annual_carry_income_pkr ?? data?.total_carry_opportunity) != null && (
        <div style={{
          marginTop: '12px',
          padding: '10px 16px',
          backgroundColor: '#0a0e17',
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
            fontWeight: 600,
          }}>
            TOTAL ANNUAL CARRY INCOME
          </span>
          <span style={{
            color: theme.green,
            fontSize: '16px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            {formatPKR(data.total_annual_carry_income_pkr ?? data.total_carry_opportunity)} PKR
          </span>
        </div>
      )}
    </div>
  )
}
