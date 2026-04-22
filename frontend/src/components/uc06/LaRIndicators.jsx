import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
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

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.text, fontWeight: 700, marginBottom: '6px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: '2px' }}>
          {p.name}: {formatPKR(p.value)} PKR
        </div>
      ))}
    </div>
  )
}

export default function LaRIndicators({ data }) {
  if (!data) return null

  const portfolioLaR = data.portfolio_lar || data.portfolio || {}
  const horizonData = data.horizon_data || []
  const accountDetails = data.account_details || data.accounts || []

  // Build chart data: aggregate from account-level LaR if no horizon_data
  const chartData = horizonData.length > 0
    ? horizonData.map((h) => ({
        horizon: h.horizon || h.label,
        'LaR 99%': h.lar_99 || 0,
        'LaR 95%': h.lar_95 || 0,
      }))
    : (() => {
        // Try portfolio-level LaR fields first
        if (portfolioLaR.lar_99_1d || portfolioLaR.portfolio_lar_30d_99) {
          return [
            { horizon: '1-Day', 'LaR 99%': portfolioLaR.lar_99_1d || 0, 'LaR 95%': portfolioLaR.lar_95_1d || 0 },
            { horizon: '7-Day', 'LaR 99%': portfolioLaR.lar_99_7d || 0, 'LaR 95%': portfolioLaR.lar_95_7d || 0 },
            { horizon: '30-Day', 'LaR 99%': portfolioLaR.portfolio_lar_30d_99 || portfolioLaR.lar_99_30d || 0, 'LaR 95%': portfolioLaR.lar_95_30d || 0 },
          ]
        }
        // Aggregate from account-level lar objects
        if (accountDetails.length > 0 && accountDetails[0]?.lar) {
          const sum = (key) => accountDetails.reduce((s, a) => s + (a.lar?.[key] || 0), 0)
          return [
            { horizon: '1-Day', 'LaR 99%': sum('lar_99_1d'), 'LaR 95%': sum('lar_95_1d') },
            { horizon: '7-Day', 'LaR 99%': sum('lar_99_7d'), 'LaR 95%': sum('lar_95_7d') },
            { horizon: '30-Day', 'LaR 99%': sum('lar_99_30d'), 'LaR 95%': sum('lar_95_30d') },
          ]
        }
        return [
          { horizon: '1-Day', 'LaR 99%': 0, 'LaR 95%': 0 },
          { horizon: '7-Day', 'LaR 99%': 0, 'LaR 95%': 0 },
          { horizon: '30-Day', 'LaR 99%': 0, 'LaR 95%': 0 },
        ]
      })()

  const maxLaR = Math.max(...chartData.map((d) => Math.max(d['LaR 99%'], d['LaR 95%'])))

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
        LIQUIDITY-AT-RISK (LaR) ANALYSIS
      </div>

      {/* Portfolio-level summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {chartData.map((d) => {
          const severity = d['LaR 99%'] > maxLaR * 0.7 ? theme.red : d['LaR 99%'] > maxLaR * 0.4 ? theme.gold : theme.green
          return (
            <div key={d.horizon} style={{
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              padding: '12px 16px',
              borderLeft: `3px solid ${severity}`,
            }}>
              <div style={{
                color: theme.textSecondary,
                fontSize: '10px',
                fontFamily: theme.font,
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                {d.horizon} LaR
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div>
                  <div style={{ color: theme.red, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatPKR(d['LaR 99%'])}
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>99% VaR</div>
                </div>
                <div>
                  <div style={{ color: theme.gold, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatPKR(d['LaR 95%'])}
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>95% VaR</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grouped bar chart */}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
            <XAxis
              dataKey="horizon"
              tick={{ fill: theme.textSecondary, fontSize: 11, fontFamily: theme.font }}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
              tickFormatter={(v) => formatPKR(v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontFamily: theme.font, fontSize: '11px', color: theme.textSecondary }}
            />
            <Bar dataKey="LaR 99%" fill={theme.red} radius={[4, 4, 0, 0]} />
            <Bar dataKey="LaR 95%" fill={theme.gold} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Account-level details if available */}
      {accountDetails.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
            fontWeight: 600,
            marginBottom: '8px',
            textTransform: 'uppercase',
          }}>
            Account-Level LaR (30-Day, 99%)
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.font, fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: theme.textSecondary, fontWeight: 600 }}>Bank</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: theme.textSecondary, fontWeight: 600 }}>Balance</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: theme.textSecondary, fontWeight: 600 }}>LaR 99%</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: theme.textSecondary, fontWeight: 600 }}>LaR %</th>
                </tr>
              </thead>
              <tbody>
                {accountDetails.map((acct, idx) => {
                  const lar99 = acct.lar_99 ?? acct.lar?.lar_99_30d ?? 0
                  const larPct = acct.balance > 0 ? (lar99 / acct.balance) * 100 : 0
                  const color = larPct > 30 ? theme.red : larPct > 15 ? theme.gold : theme.green
                  return (
                    <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}20` }}>
                      <td style={{ padding: '6px 8px', color: theme.text }}>{acct.bank_name}</td>
                      <td style={{ padding: '6px 8px', color: theme.text, textAlign: 'right' }}>{formatPKR(acct.balance)}</td>
                      <td style={{ padding: '6px 8px', color, textAlign: 'right' }}>{formatPKR(lar99)}</td>
                      <td style={{ padding: '6px 8px', color, textAlign: 'right' }}>{larPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
