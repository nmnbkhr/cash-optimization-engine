import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
      {payload[0]?.payload?.expected_income != null && (
        <div style={{ color: theme.green, marginTop: '4px', borderTop: `1px solid ${theme.border}`, paddingTop: '4px' }}>
          Expected Income: {formatPKR(payload[0].payload.expected_income)} PKR/yr
        </div>
      )}
    </div>
  )
}

export default function DeploymentChart({ data }) {
  if (!data) return null

  const accounts = data.accounts || data.breakdown || (Array.isArray(data) ? data : [])
  if (!Array.isArray(accounts) || accounts.length === 0) return null

  const chartData = accounts.map((acct) => {
    // Handle nested deployment object from optimize-deployment endpoint
    const dep = typeof acct.deployment === 'object' ? acct.deployment : null
    const inc = typeof acct.income === 'object' ? acct.income : null
    return {
      name: acct.bank_name || acct.name || acct.account,
      'T-Bills': dep?.tbills ?? acct.tbills ?? acct.t_bills ?? 0,
      'Overnight': dep?.overnight ?? acct.overnight ?? acct.overnight_placement ?? 0,
      'Buffer': dep?.buffer ?? acct.buffer ?? acct.liquidity_buffer ?? 0,
      expected_income: inc?.total_expected_annual ?? acct.expected_annual_income ?? acct.expected_income ?? 0,
    }
  })

  const totalIncome = chartData.reduce((sum, d) => sum + (d.expected_income || 0), 0)

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
          DEPLOYMENT BREAKDOWN BY ACCOUNT
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
        }}>
          <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font }}>
            TOTAL EXPECTED INCOME
          </span>
          <span style={{ color: theme.green, fontSize: '16px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKR(totalIncome)}
          </span>
          <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font }}>PKR/yr</span>
        </div>
      </div>

      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
            <XAxis
              dataKey="name"
              tick={{ fill: theme.textSecondary, fontSize: 9, fontFamily: theme.font }}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              height={70}
              interval={0}
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
            <Bar dataKey="T-Bills" stackId="deploy" fill={theme.gold} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Overnight" stackId="deploy" fill={theme.teal} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Buffer" stackId="deploy" fill="#4b5563" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary legend strip */}
      <div style={{
        display: 'flex',
        gap: '24px',
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: `1px solid ${theme.border}`,
      }}>
        {[
          { label: 'T-Bills (Govt Securities)', color: theme.gold },
          { label: 'Overnight Placements', color: theme.teal },
          { label: 'Liquidity Buffer', color: '#4b5563' },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              backgroundColor: item.color,
            }} />
            <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
