import { useState } from 'react'
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
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

const cellStyle = {
  padding: '8px 12px',
  fontSize: '11px',
  fontFamily: theme.font,
  color: theme.text,
  borderBottom: `1px solid ${theme.border}`,
}

const columns = [
  { key: 'bank_name', label: 'Bank', align: 'left' },
  { key: 'currency', label: 'CCY', align: 'left' },
  { key: 'balance', label: 'Balance', align: 'right', format: formatPKR },
  { key: 'required_minimum', label: 'Req. Min', align: 'right', format: formatPKR },
  { key: 'excess', label: 'Excess', align: 'right', format: formatPKR },
  { key: 'overnight_rate', label: 'O/N Rate', align: 'right', format: (v) => v != null ? `${Number(v).toFixed(2)}%` : '--' },
  { key: 'mdp_recommendation', label: 'MDP Action', align: 'left' },
]

export default function NostroAccountTable({ data }) {
  const [sortKey, setSortKey] = useState('excess')
  const [sortAsc, setSortAsc] = useState(false)

  const accounts = data || []

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...accounts].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1
    if (typeof aVal === 'string') {
      return sortAsc
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }
    return sortAsc ? aVal - bVal : bVal - aVal
  })

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
        marginBottom: '4px',
      }}>
        <div style={{
          color: theme.text,
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: theme.font,
        }}>
          NOSTRO ACCOUNT PORTFOLIO
        </div>
        <span style={{
          color: theme.textSecondary,
          fontSize: '10px',
          fontFamily: theme.font,
        }}>
          {accounts.length} accounts
        </span>
      </div>
      <div style={{
        color: theme.textSecondary,
        fontSize: '11px',
        fontFamily: theme.font,
        marginBottom: '16px',
      }}>
        Click column headers to sort -- Green = excess, Red = below minimum
      </div>

      {accounts.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          Load portfolio data to view accounts.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      ...headerStyle,
                      textAlign: col.align || 'left',
                    }}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span style={{ marginLeft: '4px', fontSize: '8px' }}>
                        {sortAsc ? '\u25B2' : '\u25BC'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((acct, i) => {
                const excess = acct.excess || 0
                const isBelow = excess < 0
                const rowBg = isBelow
                  ? theme.red + '08'
                  : i % 2 === 0
                    ? 'transparent'
                    : '#0d111780'

                return (
                  <tr key={acct.id || `${acct.bank_name}-${acct.currency}-${i}`} style={{ backgroundColor: rowBg }}>
                    <td style={{ ...cellStyle, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acct.bank_name || '--'}
                    </td>
                    <td style={cellStyle}>
                      <span style={{ color: theme.teal, fontWeight: 600 }}>
                        {acct.currency || '--'}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {formatPKR(acct.balance)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', color: theme.textSecondary }}>
                      {formatPKR(acct.required_minimum)}
                    </td>
                    <td style={{
                      ...cellStyle,
                      textAlign: 'right',
                      color: excess >= 0 ? theme.green : theme.red,
                      fontWeight: 600,
                    }}>
                      {excess >= 0 ? '+' : ''}{formatPKR(excess)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {acct.overnight_rate != null ? `${acct.overnight_rate.toFixed(2)}%` : '--'}
                    </td>
                    <td style={cellStyle}>
                      {acct.mdp_recommendation ? (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '9px',
                          fontWeight: 700,
                          fontFamily: theme.font,
                          backgroundColor: getMdpColor(acct.mdp_recommendation) + '20',
                          color: getMdpColor(acct.mdp_recommendation),
                          border: `1px solid ${getMdpColor(acct.mdp_recommendation)}40`,
                        }}>
                          {typeof acct.mdp_recommendation === 'object' ? JSON.stringify(acct.mdp_recommendation) : acct.mdp_recommendation}
                        </span>
                      ) : (
                        <span style={{ color: theme.textSecondary }}>--</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function getMdpColor(rec) {
  if (!rec) return theme.textSecondary
  const upper = String(rec).toUpperCase()
  if (upper.includes('REPATRIATE') || upper.includes('REDUCE')) return '#ef4444'
  if (upper.includes('HOLD') || upper.includes('MAINTAIN')) return '#d4a853'
  if (upper.includes('INCREASE') || upper.includes('ADD')) return '#10b981'
  return '#2dd4bf'
}
