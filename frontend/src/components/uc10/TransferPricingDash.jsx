import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
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
          {p.name}: {formatPKRM(p.value)} PKR
        </div>
      ))}
    </div>
  )
}

export default function TransferPricingDash({ data }) {
  // Backend may return a flat array of branches or an object with {branches: [...]}
  const branches = Array.isArray(data) ? data : (data?.branches || [])

  if (!data || branches.length === 0) {
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
        No transfer pricing data available. Run transfer pricing engine first.
      </div>
    )
  }

  // Derive summary metrics from branches if top-level fields are missing
  const dataObj = Array.isArray(data) ? {} : data
  const totalCharges = dataObj.total_capital_charge || branches.reduce((s, b) => s + (b.capital_charge_annual ?? b.capital_charge ?? 0), 0)
  const totalIncome = dataObj.total_overnight_income || branches.reduce((s, b) => s + (b.overnight_credit ?? b.overnight_income ?? 0), 0)
  const totalDigital = dataObj.total_digital_savings || branches.reduce((s, b) => s + (b.digital_credit ?? b.digital_savings ?? 0), 0)
  const totalCredits = totalIncome + totalDigital
  const netPosition = dataObj.net_position ?? (totalCredits - totalCharges)

  // Chart data (top 20 branches by tp_net_pnl)
  const sortedBranches = [...branches].sort((a, b) => Math.abs(b.tp_net_pnl ?? b.net_transfer_price ?? 0) - Math.abs(a.tp_net_pnl ?? a.net_transfer_price ?? 0))
  const chartBranches = sortedBranches.slice(0, 20).map((b) => ({
    name: b.branch_id,
    capital_charge: Math.abs(b.capital_charge_annual ?? b.capital_charge ?? 0),
    overnight_income: b.overnight_credit ?? b.overnight_income ?? 0,
    digital_savings: b.digital_credit ?? b.digital_savings ?? 0,
    net_transfer_price: b.tp_net_pnl ?? b.net_transfer_price ?? 0,
  }))

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
        TRANSFER PRICING P&L
      </div>

      {/* Summary Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <div style={{
          backgroundColor: theme.bg,
          borderRadius: '6px',
          padding: '12px',
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Capital Charge
          </div>
          <div style={{ color: theme.red, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKRM(totalCharges)}
          </div>
        </div>
        <div style={{
          backgroundColor: theme.bg,
          borderRadius: '6px',
          padding: '12px',
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Overnight Income
          </div>
          <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKRM(totalIncome)}
          </div>
        </div>
        <div style={{
          backgroundColor: theme.bg,
          borderRadius: '6px',
          padding: '12px',
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Digital Savings
          </div>
          <div style={{ color: theme.teal, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKRM(totalDigital)}
          </div>
        </div>
        <div style={{
          backgroundColor: theme.bg,
          borderRadius: '6px',
          padding: '12px',
          border: `1px solid ${netPosition >= 0 ? theme.green : theme.red}30`,
        }}>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
            Net Position
          </div>
          <div style={{
            color: netPosition >= 0 ? theme.green : theme.red,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            {netPosition >= 0 ? '+' : ''}{formatPKRM(netPosition)}
          </div>
        </div>
      </div>

      {/* Charges vs Credits Chart */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          color: theme.textSecondary,
          fontSize: '10px',
          fontFamily: theme.font,
          fontWeight: 600,
          marginBottom: '8px',
          textTransform: 'uppercase',
        }}>
          Branch-Level Charges vs Credits (Top 20)
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartBranches} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: theme.textSecondary, fontSize: 8, fontFamily: theme.font }}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tickFormatter={(v) => formatYAxisM(v)}
              tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontFamily: theme.font, fontSize: '10px' }}
              iconType="square"
              iconSize={8}
            />
            <Bar dataKey="capital_charge" name="Capital Charge" fill={theme.red + 'cc'} radius={[2, 2, 0, 0]} />
            <Bar dataKey="overnight_income" name="Overnight Income" fill={theme.green + 'cc'} radius={[2, 2, 0, 0]} />
            <Bar dataKey="digital_savings" name="Digital Savings" fill={theme.teal + 'cc'} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Net Position Highlight */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '6px',
      }}>
        {sortedBranches.slice(0, 10).map((b) => {
          const net = b.tp_net_pnl ?? b.net_transfer_price ?? 0
          const isPositive = net >= 0
          return (
            <div key={b.branch_id} style={{
              backgroundColor: theme.bg,
              border: `1px solid ${isPositive ? theme.green : theme.red}25`,
              borderRadius: '4px',
              padding: '8px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: theme.text, fontSize: '10px', fontFamily: theme.font, fontWeight: 600 }}>
                {b.branch_id}
              </span>
              <span style={{
                color: isPositive ? theme.green : theme.red,
                fontSize: '10px',
                fontFamily: theme.font,
                fontWeight: 700,
              }}>
                {isPositive ? '+' : ''}{formatPKRM(net)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
