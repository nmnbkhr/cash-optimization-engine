import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar } from 'recharts'
import { Target, Award } from 'lucide-react'

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  gold: '#d4a853',
  teal: '#2dd4bf',
  green: '#10b981',
  purple: '#a855f7',
  red: '#ef4444',
  text: '#e8eaed',
  textSecondary: '#9ca3af',
  font: "'JetBrains Mono', monospace",
}

export default function ABSimulator({ data }) {
  if (!data) return null

  const armA = data.arm_a || data.arms?.[0] || {}
  const armB = data.arm_b || data.arms?.[1] || {}
  const testResult = data.test_result || {}
  const costEff = data.cost_efficiency || {}

  // Backend returns mean_lift (absolute %) not conversion rate (0-1 fraction)
  const armAMeanLift = armA.mean_lift ?? armA.conversion ?? armA.mean ?? 0
  const armBMeanLift = armB.mean_lift ?? armB.conversion ?? armB.mean ?? 0
  // Determine if values are already in percentage scale (>1) vs fraction (0-1)
  const isPercentScale = Math.abs(armAMeanLift) > 1 || Math.abs(armBMeanLift) > 1

  const winner = data.winner || testResult.winner || (armAMeanLift > armBMeanLift ? 'A' : 'B')
  // winner from backend is arm name string, map to A/B
  const winnerIsA = winner === 'A' || winner === (armA.name || armA.arm)
  const winnerLabel = winnerIsA ? 'A' : 'B'

  const effectSize = data.effect_size ?? testResult.cohens_d ?? Math.abs(armAMeanLift - armBMeanLift)
  const pValue = data.p_value ?? testResult.p_value ?? data.significance ?? null
  const significant = data.significant ?? testResult.significant_at_005 ?? (pValue != null ? pValue < 0.05 : null)
  const confidencePct = testResult.confidence_pct ?? null
  const verdict = testResult.verdict ?? null

  const chartData = [
    {
      name: String(armA.name || armA.arm || 'Arm A'),
      conversion: isPercentScale ? armAMeanLift : armAMeanLift * 100,
      ci_lower: isPercentScale
        ? armAMeanLift - (armA.std ?? 2)
        : ((armA.ci_lower ?? armAMeanLift - 0.02)) * 100,
      ci_upper: isPercentScale
        ? armAMeanLift + (armA.std ?? 2)
        : ((armA.ci_upper ?? armAMeanLift + 0.02)) * 100,
    },
    {
      name: String(armB.name || armB.arm || 'Arm B'),
      conversion: isPercentScale ? armBMeanLift : armBMeanLift * 100,
      ci_lower: isPercentScale
        ? armBMeanLift - (armB.std ?? 2)
        : ((armB.ci_lower ?? armBMeanLift - 0.02)) * 100,
      ci_upper: isPercentScale
        ? armBMeanLift + (armB.std ?? 2)
        : ((armB.ci_upper ?? armBMeanLift + 0.02)) * 100,
    },
  ]

  // Calculate error bar values (distance from value to CI bounds)
  chartData.forEach(d => {
    d.errorY = [d.conversion - d.ci_lower, d.ci_upper - d.conversion]
  })

  const winnerColor = winnerLabel === 'A' ? theme.cyan : theme.purple

  return (
    <div style={{
      backgroundColor: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: '8px', padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Target size={16} style={{ color: theme.gold }} />
        <span style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
          A/B TEST SIMULATION
        </span>
        {data.segment && (
          <span style={{
            padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
            fontFamily: theme.font, backgroundColor: theme.cyan + '20', color: theme.cyan,
            border: `1px solid ${theme.cyan}40`, marginLeft: '8px',
          }}>
            {String(data.segment).replace(/_/g, ' ').toUpperCase()}
          </span>
        )}
      </div>

      {/* Side-by-side comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Arm A */}
        <div style={{
          padding: '16px', borderRadius: '8px',
          backgroundColor: theme.bg, border: `1px solid ${winnerLabel === 'A' ? theme.green : theme.border}`,
          position: 'relative',
        }}>
          {winnerLabel === 'A' && (
            <div style={{
              position: 'absolute', top: '-10px', right: '10px',
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '2px 10px', borderRadius: '4px',
              backgroundColor: theme.green + '20', color: theme.green,
              border: `1px solid ${theme.green}40`,
              fontSize: '9px', fontWeight: 700, fontFamily: theme.font,
            }}>
              <Award size={10} /> WINNER
            </div>
          )}
          <div style={{ color: theme.cyan, fontSize: '10px', fontWeight: 700, fontFamily: theme.font, marginBottom: '8px' }}>
            ARM A
          </div>
          <div style={{ color: theme.text, fontSize: '12px', fontWeight: 600, fontFamily: theme.font, marginBottom: '12px' }}>
            {String(armA.name || armA.arm || 'Arm A').replace(/_/g, ' ').toUpperCase()}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>MEAN LIFT</div>
            <div style={{ color: theme.cyan, fontSize: '24px', fontWeight: 700, fontFamily: theme.font }}>
              {chartData[0].conversion.toFixed(2)}%
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>{isPercentScale ? '+/- STD' : '95% CI'}</div>
            <div style={{ color: theme.text, fontSize: '12px', fontFamily: theme.font }}>
              [{(chartData[0].ci_lower).toFixed(2)}%, {(chartData[0].ci_upper).toFixed(2)}%]
            </div>
          </div>
          {(armA.sample_size ?? armA.cost_per_txn_pkr) != null && (
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>
                {armA.sample_size != null ? 'SAMPLE SIZE' : 'COST/TXN'}
              </div>
              <div style={{ color: theme.text, fontSize: '12px', fontFamily: theme.font }}>
                {armA.sample_size != null ? armA.sample_size.toLocaleString() : `${Number(armA.cost_per_txn_pkr).toLocaleString()} PKR`}
              </div>
            </div>
          )}
        </div>

        {/* VS divider */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme.textSecondary, fontSize: '16px', fontWeight: 700, fontFamily: theme.font,
        }}>
          VS
        </div>

        {/* Arm B */}
        <div style={{
          padding: '16px', borderRadius: '8px',
          backgroundColor: theme.bg, border: `1px solid ${winnerLabel === 'B' ? theme.green : theme.border}`,
          position: 'relative',
        }}>
          {winnerLabel === 'B' && (
            <div style={{
              position: 'absolute', top: '-10px', right: '10px',
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '2px 10px', borderRadius: '4px',
              backgroundColor: theme.green + '20', color: theme.green,
              border: `1px solid ${theme.green}40`,
              fontSize: '9px', fontWeight: 700, fontFamily: theme.font,
            }}>
              <Award size={10} /> WINNER
            </div>
          )}
          <div style={{ color: theme.purple, fontSize: '10px', fontWeight: 700, fontFamily: theme.font, marginBottom: '8px' }}>
            ARM B
          </div>
          <div style={{ color: theme.text, fontSize: '12px', fontWeight: 600, fontFamily: theme.font, marginBottom: '12px' }}>
            {String(armB.name || armB.arm || 'Arm B').replace(/_/g, ' ').toUpperCase()}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>MEAN LIFT</div>
            <div style={{ color: theme.purple, fontSize: '24px', fontWeight: 700, fontFamily: theme.font }}>
              {chartData[1].conversion.toFixed(2)}%
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>{isPercentScale ? '+/- STD' : '95% CI'}</div>
            <div style={{ color: theme.text, fontSize: '12px', fontFamily: theme.font }}>
              [{(chartData[1].ci_lower).toFixed(2)}%, {(chartData[1].ci_upper).toFixed(2)}%]
            </div>
          </div>
          {(armB.sample_size ?? armB.cost_per_txn_pkr) != null && (
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font }}>
                {armB.sample_size != null ? 'SAMPLE SIZE' : 'COST/TXN'}
              </div>
              <div style={{ color: theme.text, fontSize: '12px', fontFamily: theme.font }}>
                {armB.sample_size != null ? armB.sample_size.toLocaleString() : `${Number(armB.cost_per_txn_pkr).toLocaleString()} PKR`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Effect size & significance */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px',
      }}>
        <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, textAlign: 'center' }}>
          <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '4px' }}>EFFECT SIZE</div>
          <div style={{ color: theme.gold, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
            {testResult.cohens_d != null ? Number(effectSize).toFixed(3) : `${(effectSize * 100).toFixed(2)}%`}
          </div>
        </div>
        {pValue != null && (
          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '4px' }}>P-VALUE</div>
            <div style={{ color: pValue < 0.05 ? theme.green : theme.red, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
              {pValue.toFixed(4)}
            </div>
          </div>
        )}
        {significant != null && (
          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '4px' }}>SIGNIFICANCE</div>
            <div style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: '4px',
              fontSize: '11px', fontWeight: 700, fontFamily: theme.font,
              backgroundColor: significant ? theme.green + '20' : theme.red + '20',
              color: significant ? theme.green : theme.red,
              border: `1px solid ${significant ? theme.green : theme.red}40`,
            }}>
              {significant ? 'SIGNIFICANT' : 'NOT SIGNIFICANT'}
            </div>
          </div>
        )}
      </div>

      {/* Verdict */}
      {verdict && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
          backgroundColor: theme.green + '10', border: `1px solid ${theme.green}30`,
          color: theme.green, fontSize: '12px', fontWeight: 600, fontFamily: theme.font,
          textAlign: 'center',
        }}>
          {String(verdict)}
          {confidencePct != null && ` (${confidencePct}% confidence)`}
        </div>
      )}

      {/* Bar chart comparison */}
      <div style={{ height: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
            <XAxis dataKey="name" tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }} axisLine={{ stroke: theme.border }} />
            <YAxis
              tick={{ fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font }}
              axisLine={{ stroke: theme.border }}
              label={{ value: 'Conversion %', angle: -90, position: 'insideLeft', style: { fill: theme.textSecondary, fontSize: 10, fontFamily: theme.font } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.card, border: `1px solid ${theme.border}`,
                borderRadius: '6px', fontFamily: theme.font, fontSize: '11px',
              }}
              labelStyle={{ color: theme.text, fontWeight: 700 }}
              formatter={(val) => [`${val.toFixed(2)}%`, 'Conversion']}
            />
            <Bar dataKey="conversion" name="Conversion %" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => {
                const fill = i === 0 ? theme.cyan : theme.purple
                return <rect key={i} fill={fill} fillOpacity={0.8} />
              })}
              <ErrorBar dataKey="errorY" width={8} strokeWidth={2} stroke={theme.text} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
