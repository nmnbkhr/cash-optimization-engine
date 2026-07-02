import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { formatPKRM, formatYAxisM } from '../../utils/formatPKR'

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

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: theme.font,
      fontSize: '11px',
    }}>
      <div style={{ color: theme.text, fontWeight: 700, marginBottom: '4px' }}>{d.name}</div>
      <div style={{ color: d.amount >= 0 ? theme.red : theme.green }}>
        {d.amount >= 0 ? '+' : ''}{formatPKRM(d.amount)} PKR
      </div>
      <div style={{ color: theme.textSecondary, marginTop: '2px' }}>
        Running Total: {formatPKRM(d.runningTotal)} PKR
      </div>
    </div>
  )
}

export default function PnLWaterfall({ data }) {
  // Backend returns `steps` array; frontend originally expected `items`
  const items = data?.items || data?.steps || []

  if (!data || items.length === 0) {
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
        No waterfall data available. Load P&L summary first.
      </div>
    )
  }

  // Build waterfall chart data with invisible base bars
  // Backend fields: label/value; frontend originally expected name/amount
  let runningTotal = 0
  const nonTotalItems = items.filter((item) => (item.type || item.pool_key) !== 'total' && item.pool_key !== 'net_cash_cost')
  const chartData = nonTotalItems.map((item) => {
    const amount = item.amount ?? item.value ?? 0
    const prevTotal = runningTotal
    runningTotal += amount
    return {
      name: item.name || item.label || '',
      amount,
      runningTotal,
      base: amount >= 0 ? prevTotal : runningTotal,
      bar: Math.abs(amount),
      isPositive: amount >= 0,
    }
  })

  // Add net total bar
  chartData.push({
    name: 'Net Cost',
    amount: runningTotal,
    runningTotal,
    base: 0,
    bar: Math.abs(runningTotal),
    isPositive: runningTotal >= 0,
    isTotal: true,
  })

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
        P&L WATERFALL -- GROSS COST TO NET COST
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: theme.textSecondary, fontSize: 9, fontFamily: theme.font }}
            axisLine={{ stroke: theme.border }}
            tickLine={false}
            angle={-25}
            textAnchor="end"
            height={70}
          />
          <YAxis
            tickFormatter={(v) => formatYAxisM(v)}
            tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
            axisLine={{ stroke: theme.border }}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke={theme.border} />
          {/* Invisible base bar */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          {/* Visible amount bar */}
          <Bar dataKey="bar" stackId="waterfall" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.isTotal ? theme.gold : entry.isPositive ? theme.red + 'cc' : theme.green + 'cc'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
