import { useState, useMemo } from 'react'
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
  cursor: 'pointer',
}

const cellStyle = {
  padding: '8px 12px',
  fontSize: '11px',
  fontFamily: theme.font,
  color: theme.text,
  borderBottom: `1px solid ${theme.border}`,
}

const quartileColor = (q) => {
  if (q === 'Q1') return theme.green
  if (q === 'Q2') return theme.teal
  if (q === 'Q3') return theme.gold
  return theme.red
}

export default function BranchRankingTable({ data }) {
  const [sortKey, setSortKey] = useState('efficiency_rank')
  const [sortAsc, setSortAsc] = useState(true)

  const branches = useMemo(() => {
    if (!data?.branches) return []
    const sorted = [...data.branches].sort((a, b) => {
      const aVal = a[sortKey] ?? 0
      const bVal = b[sortKey] ?? 0
      return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
    })
    return sorted.slice(0, 50)
  }, [data, sortKey, sortAsc])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  if (!data || !data.branches || data.branches.length === 0) {
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
        No branch ranking data available. Load P&L summary first.
      </div>
    )
  }

  const columns = [
    { key: 'efficiency_rank', label: 'Rank' },
    { key: 'branch_id', label: 'Branch' },
    { key: 'city', label: 'City' },
    { key: 'branch_type', label: 'Type' },
    { key: 'net_cash_cost', label: 'Net Cash Cost' },
    { key: 'cost_per_million_txn_value', label: 'Cost/M Txn' },
    { key: 'quartile', label: 'Quartile' },
  ]

  const sortIndicator = (key) => {
    if (sortKey !== key) return ''
    return sortAsc ? ' ^' : ' v'
  }

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px 12px',
        color: theme.text,
        fontSize: '14px',
        fontWeight: 700,
        fontFamily: theme.font,
      }}>
        BRANCH PERFORMANCE RANKING
        <span style={{
          color: theme.textSecondary,
          fontSize: '10px',
          fontWeight: 400,
          marginLeft: '12px',
        }}>
          Top 50 of {data.total_branches || data.branches.length}
        </span>
      </div>

      <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.bg }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={headerStyle}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branches.map((b, idx) => (
              <tr
                key={b.branch_id || idx}
                style={{
                  backgroundColor: idx % 2 === 0 ? 'transparent' : theme.bg + '40',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.border + '30')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'transparent' : theme.bg + '40')}
              >
                <td style={{ ...cellStyle, color: theme.gold, fontWeight: 700, width: '60px' }}>
                  #{b.efficiency_rank ?? b.rank ?? idx + 1}
                </td>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{b.branch_id}</td>
                <td style={{ ...cellStyle, color: theme.textSecondary }}>{b.city}</td>
                <td style={cellStyle}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 700,
                    backgroundColor: theme.teal + '15',
                    color: theme.teal,
                    border: `1px solid ${theme.teal}30`,
                  }}>
                    {typeof (b.branch_type ?? b.type) === 'object' ? JSON.stringify(b.branch_type ?? b.type) : (b.branch_type ?? b.type ?? '--')}
                  </span>
                </td>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{formatPKR(b.net_cash_cost)} PKR</td>
                <td style={{ ...cellStyle, color: theme.textSecondary }}>{formatPKR(b.cost_per_txn ?? b.cost_per_million_txn_value)} PKR</td>
                <td style={cellStyle}>
                  <span style={{
                    padding: '2px 10px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 700,
                    backgroundColor: quartileColor(String(b.quartile)) + '20',
                    color: quartileColor(String(b.quartile)),
                    border: `1px solid ${quartileColor(String(b.quartile))}40`,
                  }}>
                    {typeof b.quartile === 'object' ? JSON.stringify(b.quartile) : (b.quartile || '--')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
