import formatPKR from '../../utils/formatPKR'
const styles = {
  card: {
    backgroundColor: '#111827',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px',
  },
  title: {
    color: '#e8eaed',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: '4px',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: '16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'center',
    color: '#9ca3af',
    fontWeight: 600,
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1e293b',
  },
  td: {
    padding: '10px 12px',
    textAlign: 'center',
    color: '#e8eaed',
    borderBottom: '1px solid #1e293b20',
  },
  nashCell: {
    padding: '10px 12px',
    textAlign: 'center',
    color: '#d4a853',
    fontWeight: 700,
    borderBottom: '1px solid #1e293b20',
    backgroundColor: '#d4a85310',
    border: '1px solid #d4a85340',
    borderRadius: '4px',
  },
  rowHeader: {
    padding: '10px 12px',
    textAlign: 'left',
    color: '#2dd4bf',
    fontWeight: 600,
    fontSize: '11px',
    borderBottom: '1px solid #1e293b20',
  },
  recommendation: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#0a0e17',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#9ca3af',
    lineHeight: '1.6',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#d4a85320',
    color: '#d4a853',
    border: '1px solid #d4a85340',
    marginLeft: '8px',
  },
}

export default function StrategyGamePanel({ data }) {
  // Build matrix from API response or use defaults
  const matrix = (() => {
    if (data?.payoff_matrix?.rows) return data.payoff_matrix
    const rows = data?.bank_strategies || ['Conservative', 'Moderate', 'Aggressive']
    const cols = data?.sbp_intensities || ['Low', 'Medium', 'High']
    const bankRaw = data?.bank_payoffs_raw || []
    const sbpRaw = data?.sbp_payoffs_raw || []
    const payoffs = rows.map((_, ri) =>
      cols.map((_, ci) => [
        formatPKR(bankRaw[ri]?.[ci] ?? 0),
        formatPKR(sbpRaw[ci]?.[ri] ?? sbpRaw[ri]?.[ci] ?? 0),
      ])
    )
    return { rows, cols, payoffs }
  })()

  // Find Nash equilibrium indices
  const nashEq = data?.nash_equilibria?.[0]
  const bankStrats = data?.bank_strategies || matrix.rows
  const sbpStrats = data?.sbp_intensities || matrix.cols
  const nashRow = nashEq
    ? bankStrats.indexOf(nashEq.bank_strategy)
    : (data?.nash_equilibrium?.row ?? 1)
  const nashCol = nashEq
    ? sbpStrats.indexOf(nashEq.sbp_intensity)
    : (data?.nash_equilibrium?.col ?? 1)

  const rec = data?.recommendation
  const recommendation = rec
    ? (typeof rec === 'string' ? rec : `${rec.strategy || ''}: ${rec.explanation || rec.rationale || JSON.stringify(rec)}`)
    : 'Click "Run Strategy Game" to compute Nash equilibrium.'

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <div style={styles.title}>STRATEGY GAME: BANK vs SBP</div>
        <span style={styles.badge}>NASH EQ</span>
      </div>
      <div style={styles.subtitle}>3x3 Payoff Matrix (Bank Strategy vs SBP Audit Intensity)</div>

      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, textAlign: 'left' }}>Bank \ SBP</th>
              {matrix.cols.map((col, i) => (
                <th key={i} style={styles.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, ri) => (
              <tr key={ri}>
                <td style={styles.rowHeader}>{row}</td>
                {matrix.payoffs[ri].map((payoff, ci) => {
                  const isNash = ri === nashRow && ci === nashCol
                  return (
                    <td key={ci} style={isNash ? styles.nashCell : styles.td}>
                      <div>
                        <span style={{ color: isNash ? '#d4a853' : '#10b981' }}>
                          {payoff[0]}
                        </span>
                        <span style={{ color: '#374151', margin: '0 4px' }}>/</span>
                        <span style={{ color: isNash ? '#d4a853' : '#ef4444' }}>
                          {payoff[1]}
                        </span>
                      </div>
                      {isNash && (
                        <div style={{
                          fontSize: '9px',
                          color: '#d4a853',
                          marginTop: '2px',
                          fontWeight: 700,
                        }}>
                          NASH EQ
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.recommendation}>
        <span style={{ color: '#d4a853', fontWeight: 700 }}>RECOMMENDATION: </span>
        {typeof recommendation === 'object' ? JSON.stringify(recommendation) : recommendation}
      </div>
    </div>
  )
}
