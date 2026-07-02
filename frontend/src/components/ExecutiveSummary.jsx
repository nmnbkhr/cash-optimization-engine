import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import {
  TrendingUp, DollarSign, Target, Zap, ChevronRight,
  Vault, CreditCard, GitBranch, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3,
} from 'lucide-react'
import { fetchExecutiveSummary } from '../hooks/useAPI'
import useAppStore from '../stores/appStore'
import formatPKR from '../utils/formatPKR'

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  cardHover: '#1a2230',
  border: '#1e293b',
  gold: '#d4a853',
  green: '#10b981',
  cyan: '#06b6d4',
  red: '#ef4444',
  text: '#e8eaed',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  font: "'JetBrains Mono', monospace",
}

const ucIconMap = {
  'UC-01': Vault, 'UC-02': CreditCard, 'UC-03': GitBranch,
  'UC-04': TrendingUp, 'UC-05': Globe, 'UC-06': Shield,
  'UC-07': Layers, 'UC-08': Truck, 'UC-09': Smartphone, 'UC-10': BarChart3,
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      backgroundColor: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: '6px', padding: '10px 14px', fontFamily: theme.font, fontSize: '11px',
    }}>
      <p style={{ color: theme.text, fontWeight: 700, marginBottom: '4px' }}>{d.uc}: {d.title}</p>
      <p style={{ color: theme.gold, margin: 0 }}>Savings: {formatPKR(d.savings)} PKR</p>
      <p style={{ color: theme.textSecondary, margin: '2px 0 0', fontSize: '10px' }}>{d.metric_label}</p>
    </div>
  )
}

export default function ExecutiveSummary() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const setCurrentUC = useAppStore((s) => s.setCurrentUC)

  useEffect(() => {
    fetchExecutiveSummary()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ color: theme.textSecondary, fontFamily: theme.font, fontSize: '13px' }}>
          Loading executive summary...
        </div>
      </div>
    )
  }

  if (!data) return null

  const chartData = [...data.use_cases].sort((a, b) => b.savings - a.savings)
  const pieData = data.use_cases
    .filter((uc) => uc.savings > 0)
    .map((uc) => ({ name: uc.uc, value: uc.savings, color: uc.color }))

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
          Executive Strategy Summary
        </h2>
        <p style={{ color: theme.textMuted, fontSize: '13px' }}>
          Aggregate savings and optimization strategy across all {data.uc_count} engines
        </p>
      </div>

      {/* Hero KPI Strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px',
      }}>
        {/* Total Savings */}
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.gold}40`,
          borderRadius: '8px', padding: '20px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
            background: `linear-gradient(90deg, ${theme.gold}, ${theme.gold}00)`,
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <DollarSign size={14} style={{ color: theme.gold }} />
            <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Annual Savings
            </span>
          </div>
          <div style={{ color: theme.gold, fontSize: '24px', fontWeight: 700, fontFamily: theme.font }}>
            {formatPKR(data.total_annual_savings)}
          </div>
          <div style={{ color: theme.textMuted, fontSize: '10px', fontFamily: theme.font, marginTop: '4px' }}>
            PKR {(data.total_annual_savings / 1e9).toFixed(1)}B annualized
          </div>
        </div>

        {/* Engines Active */}
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Zap size={14} style={{ color: theme.cyan }} />
            <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Engines Active
            </span>
          </div>
          <div style={{ color: theme.text, fontSize: '24px', fontWeight: 700, fontFamily: theme.font }}>
            {data.uc_count}/10
          </div>
          <div style={{ color: theme.textMuted, fontSize: '10px', fontFamily: theme.font, marginTop: '4px' }}>
            All optimization modules online
          </div>
        </div>

        {/* Top Contributor */}
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Target size={14} style={{ color: theme.green }} />
            <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Top Contributor
            </span>
          </div>
          <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
            {data.top_contributors[0]?.uc}
          </div>
          <div style={{ color: theme.green, fontSize: '16px', fontWeight: 700, fontFamily: theme.font, marginTop: '2px' }}>
            {formatPKR(data.top_contributors[0]?.savings)} PKR
          </div>
          <div style={{ color: theme.textMuted, fontSize: '10px', fontFamily: theme.font, marginTop: '2px' }}>
            {data.top_contributors[0]?.title}
          </div>
        </div>

        {/* Savings as % of Deposits */}
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <TrendingUp size={14} style={{ color: theme.cyan }} />
            <span style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Savings / Deposit Base
            </span>
          </div>
          <div style={{ color: theme.text, fontSize: '24px', fontWeight: 700, fontFamily: theme.font }}>
            {/* savings is raw PKR; deposit base 851,038 M -> convert to raw PKR (x1e6) */}
            {((data.total_annual_savings / (851038 * 1e6)) * 100).toFixed(2)}%
          </div>
          <div style={{ color: theme.textMuted, fontSize: '10px', fontFamily: theme.font, marginTop: '4px' }}>
            of PKR 851B total deposits
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px',
      }}>
        {/* Savings by UC Bar Chart */}
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px',
        }}>
          <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font, marginBottom: '4px' }}>
            SAVINGS BY USE CASE
          </div>
          <div style={{ color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font, marginBottom: '16px' }}>
            Annual savings potential (PKR) -- ranked by impact
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
                  axisLine={{ stroke: theme.border }}
                  tickLine={false}
                  tickFormatter={(v) => formatPKR(v)}
                />
                <YAxis
                  type="category" dataKey="uc" width={50}
                  tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
                  axisLine={{ stroke: theme.border }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="savings" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px',
        }}>
          <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font, marginBottom: '4px' }}>
            SAVINGS SHARE
          </div>
          <div style={{ color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font, marginBottom: '16px' }}>
            Proportional contribution by engine
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="45%" innerRadius={55} outerRadius={90}
                  paddingAngle={2} strokeWidth={0}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Legend
                  wrapperStyle={{ fontSize: '10px', fontFamily: theme.font }}
                  iconSize={8}
                  formatter={(value) => <span style={{ color: theme.textSecondary }}>{value}</span>}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme.card, border: `1px solid ${theme.border}`,
                    borderRadius: '6px', fontFamily: theme.font, fontSize: '11px',
                  }}
                  formatter={(val) => [formatPKR(val) + ' PKR', 'Savings']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Strategy Table */}
      <div style={{
        backgroundColor: theme.card, border: `1px solid ${theme.border}`,
        borderRadius: '8px', padding: '20px', marginBottom: '24px',
      }}>
        <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font, marginBottom: '4px' }}>
          OPTIMIZATION STRATEGY MATRIX
        </div>
        <div style={{ color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font, marginBottom: '16px' }}>
          Engine-level savings, methodology, and key metrics
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: theme.bg, borderRadius: '6px' }}>
            <thead>
              <tr>
                {['Engine', 'Annual Savings', 'What', 'Strategy', 'Detail'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: h === 'Annual Savings' ? 'right' : 'left',
                    fontSize: '10px', fontWeight: 700, fontFamily: theme.font, color: theme.textSecondary,
                    textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.use_cases.map((uc) => {
                const Icon = ucIconMap[uc.uc] || BarChart3
                const ucId = uc.uc.toLowerCase().replace('-', '')
                return (
                  <tr
                    key={uc.uc}
                    style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                    onClick={() => setCurrentUC(ucId)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.cardHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{
                      padding: '10px 12px', fontSize: '12px', fontFamily: theme.font, color: theme.text,
                      borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '4px',
                          backgroundColor: uc.color + '20', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={12} style={{ color: uc.color }} />
                        </div>
                        <div>
                          <span style={{ color: uc.color, fontSize: '10px', fontWeight: 700 }}>{uc.uc}</span>
                          <span style={{ color: theme.textSecondary, fontSize: '10px', marginLeft: '6px' }}>{uc.title}</span>
                        </div>
                        <ChevronRight size={10} style={{ color: theme.textMuted }} />
                      </div>
                    </td>
                    <td style={{
                      padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700,
                      fontFamily: theme.font, color: theme.green,
                      borderBottom: `1px solid ${theme.border}`,
                    }}>
                      {formatPKR(uc.savings)}
                    </td>
                    <td style={{
                      padding: '10px 12px', fontSize: '10px', fontFamily: theme.font, color: theme.textSecondary,
                      borderBottom: `1px solid ${theme.border}`, maxWidth: '200px',
                    }}>
                      {uc.metric_label}
                    </td>
                    <td style={{
                      padding: '10px 12px', fontSize: '10px', fontFamily: theme.font, color: theme.cyan,
                      borderBottom: `1px solid ${theme.border}`,
                    }}>
                      {uc.strategy}
                    </td>
                    <td style={{
                      padding: '10px 12px', fontSize: '10px', fontFamily: theme.font, color: theme.textMuted,
                      borderBottom: `1px solid ${theme.border}`,
                    }}>
                      {uc.detail}
                    </td>
                  </tr>
                )
              })}
              {/* Total Row */}
              <tr style={{ backgroundColor: theme.card }}>
                <td style={{
                  padding: '12px', fontSize: '12px', fontWeight: 700,
                  fontFamily: theme.font, color: theme.gold, borderBottom: 'none',
                }}>
                  TOTAL SAVINGS
                </td>
                <td style={{
                  padding: '12px', textAlign: 'right', fontSize: '14px', fontWeight: 700,
                  fontFamily: theme.font, color: theme.gold, borderBottom: 'none',
                }}>
                  {formatPKR(data.total_annual_savings)}
                </td>
                <td colSpan={3} style={{
                  padding: '12px', fontSize: '11px', fontFamily: theme.font,
                  color: theme.textSecondary, borderBottom: 'none',
                }}>
                  {data.strategy_summary}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
