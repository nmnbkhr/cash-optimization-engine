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
  padding: '8px 12px',
  fontSize: '11px',
  fontFamily: theme.font,
  color: theme.text,
  borderBottom: `1px solid ${theme.border}`,
}

export default function NashBargainingPanel({ data }) {
  const negotiations = data?.negotiations || data?.results || []
  const totalSavings = data?.total_annual_savings_pkr ?? data?.total_annual_savings

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
        NASH BARGAINING -- MINIMUM BALANCE NEGOTIATIONS
      </div>
      <div style={{
        color: theme.textSecondary,
        fontSize: '11px',
        fontFamily: theme.font,
        marginBottom: '16px',
      }}>
        Recommended renegotiated minimums using Nash Bargaining Solution
      </div>

      {negotiations.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          Run Nash Bargaining to view negotiation results.
        </div>
      ) : (
        <>
          {/* Total savings highlight */}
          {totalSavings != null && (
            <div style={{
              marginBottom: '16px',
              padding: '14px 20px',
              backgroundColor: theme.green + '10',
              border: `1px solid ${theme.green}30`,
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{
                  color: theme.textSecondary,
                  fontSize: '10px',
                  fontFamily: theme.font,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginBottom: '2px',
                }}>
                  Total Annual Savings from Renegotiation
                </div>
                <div style={{
                  color: theme.green,
                  fontSize: '24px',
                  fontWeight: 700,
                  fontFamily: theme.font,
                }}>
                  {formatPKR(totalSavings)} PKR
                </div>
              </div>
              <div style={{
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: theme.font,
                backgroundColor: theme.green + '20',
                color: theme.green,
                border: `1px solid ${theme.green}40`,
              }}>
                NEGOTIABLE
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={headerStyle}>Bank / Account</th>
                  <th style={headerStyle}>CCY</th>
                  <th style={{ ...headerStyle, textAlign: 'right' }}>Current Min</th>
                  <th style={{ ...headerStyle, textAlign: 'right' }}>Recommended Min</th>
                  <th style={{ ...headerStyle, textAlign: 'right' }}>Reduction</th>
                  <th style={{ ...headerStyle, textAlign: 'right' }}>Annual Savings</th>
                </tr>
              </thead>
              <tbody>
                {negotiations.map((row, i) => {
                  const br = row.bargaining_result || {}
                  const recommendedMin = br.negotiated_minimum ?? row.recommended_minimum
                  const reduction = br.reduction ?? ((row.current_minimum || 0) - (recommendedMin || 0))
                  const savings = br.ubl_annual_savings_pkr ?? row.annual_savings ?? 0

                  return (
                    <tr
                      key={row.bank_name || i}
                      style={{
                        backgroundColor: i % 2 === 0 ? 'transparent' : '#0d111780',
                      }}
                    >
                      <td style={{ ...cellStyle, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.bank_name || '--'}
                      </td>
                      <td style={cellStyle}>
                        <span style={{ color: theme.teal, fontWeight: 600 }}>
                          {row.currency || '--'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: theme.textSecondary }}>
                        {formatPKR(row.current_minimum)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: theme.gold, fontWeight: 600 }}>
                        {formatPKR(recommendedMin)}
                      </td>
                      <td style={{
                        ...cellStyle,
                        textAlign: 'right',
                        color: reduction > 0 ? theme.green : theme.textSecondary,
                        fontWeight: 600,
                      }}>
                        {reduction > 0 ? `-${formatPKR(reduction)}` : '--'}
                      </td>
                      <td style={{
                        ...cellStyle,
                        textAlign: 'right',
                        color: savings > 0 ? theme.green : theme.textSecondary,
                        fontWeight: 600,
                      }}>
                        {savings > 0 ? formatPKR(savings) : '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
