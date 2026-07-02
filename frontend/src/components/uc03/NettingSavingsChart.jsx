import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Text } from 'recharts'
import { TrendingDown } from 'lucide-react'
import formatPKR, { formatYAxis } from '../../utils/formatPKR'


// UC-03 cost fields (central_vault_cost, direct_netting_cost) are returned in RAW PKR.
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-lg p-3 border text-xs"
      style={{ backgroundColor: '#141a23', borderColor: '#374151', color: '#e8eaed' }}
    >
      <p className="font-bold mb-1">{d.name}</p>
      <p style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        PKR {formatPKR(d.cost)}
      </p>
    </div>
  )
}

export default function NettingSavingsChart({ summary }) {
  // Use summary data — check both netting result and network summary shapes
  const centralVaultCost = summary?.central_vault_cost || 0
  const directNettingCost = summary?.direct_netting_cost || summary?.total_logistics_cost || 0
  const savings = centralVaultCost - directNettingCost
  const savingsPct = centralVaultCost > 0 ? ((savings / centralVaultCost) * 100).toFixed(1) : 0

  const chartData = [
    { name: 'Central Vault', cost: centralVaultCost, color: '#6b7280' },
    { name: 'Direct Netting', cost: directNettingCost, color: '#22c55e' },
  ]

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingDown size={14} style={{ color: '#22c55e' }} />
          <h3 className="text-sm font-bold" style={{ color: '#e8eaed' }}>Netting Cost Comparison</h3>
        </div>
        {savings > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-1 rounded"
            style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}
          >
            {savingsPct}% savings
          </span>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#8b949e', fontSize: 11 }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#8b949e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
              tickFormatter={(v) => formatYAxis(v)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={80}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Savings annotation */}
      {savings > 0 && (
        <div
          className="mt-3 p-3 rounded flex items-center justify-between"
          style={{ backgroundColor: '#22c55e10', border: '1px solid #22c55e30' }}
        >
          <span className="text-xs" style={{ color: '#8b949e' }}>Estimated Annual Savings</span>
          <span
            className="text-sm font-bold"
            style={{ color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}
          >
            PKR {formatPKR(savings)}
          </span>
        </div>
      )}
    </div>
  )
}
