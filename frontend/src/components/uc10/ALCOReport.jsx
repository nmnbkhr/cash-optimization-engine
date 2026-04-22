import { Shield, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react'
import formatPKR from '../../utils/formatPKR'

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  gold: '#d4a853',
  teal: '#2dd4bf',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  text: '#e8eaed',
  textSecondary: '#9ca3af',
  font: "'JetBrains Mono', monospace",
}

function riskColor(level) {
  const l = (level || '').toLowerCase()
  if (l === 'high' || l === 'critical') return theme.red
  if (l === 'medium' || l === 'moderate') return theme.yellow
  return theme.green
}

function RiskIcon({ level }) {
  const l = (level || '').toLowerCase()
  if (l === 'high' || l === 'critical') return <AlertTriangle size={14} style={{ color: theme.red }} />
  if (l === 'medium' || l === 'moderate') return <AlertTriangle size={14} style={{ color: theme.yellow }} />
  return <CheckCircle size={14} style={{ color: theme.green }} />
}

export default function ALCOReport({ data }) {
  if (!data) {
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
        No ALCO report data available. Load the ALCO report first.
      </div>
    )
  }

  // Backend returns executive_summary as dict; convert to metrics array for display
  const rawMetrics = data.metrics || []
  const execSummary = data.executive_summary || {}
  const metrics = rawMetrics.length > 0 ? rawMetrics : (Object.keys(execSummary).length > 0 ? [
    { label: 'Network Branches', value: execSummary.network_branches, suffix: '' },
    { label: 'Gross Cash Cost', value: execSummary.gross_cash_cost_pkr, suffix: 'PKR' },
    { label: 'Net Cash Cost', value: execSummary.net_cash_cost_pkr, suffix: 'PKR', color: theme.red },
    { label: 'Cost Per Branch', value: execSummary.cost_per_branch_pkr, suffix: 'PKR', color: theme.gold },
    { label: 'Cost Per Transaction', value: execSummary.cost_per_transaction_pkr, suffix: 'PKR', color: theme.teal },
    { label: 'Idle Cash Ratio', value: execSummary.idle_cash_ratio_pct != null ? `${execSummary.idle_cash_ratio_pct.toFixed(1)}%` : null, suffix: '' },
    { label: 'YoY Change', value: execSummary.yoy_trend?.change_pct != null ? `${execSummary.yoy_trend.change_pct > 0 ? '+' : ''}${execSummary.yoy_trend.change_pct.toFixed(1)}%` : null, suffix: '', color: execSummary.yoy_trend?.change_pct <= 0 ? theme.green : theme.red },
  ].filter(m => m.value != null) : [])

  // Backend returns risk_flags with severity/category/description; frontend expected risk_indicators with level/name/description
  const rawRisks = data.risk_indicators || data.risk_flags || []
  const risks = rawRisks.map(r => ({
    level: r.level || r.severity || 'medium',
    name: r.name || r.category || '',
    description: r.description || '',
  }))

  // Backend returns recommendations with action/description/potential_savings_pkr; frontend expected title/detail/impact
  const rawRecs = data.recommendations || []
  const recommendations = rawRecs.map(r => ({
    title: r.title || r.action || '',
    detail: r.detail || r.description || '',
    impact: r.impact || (r.potential_savings_pkr != null ? formatPKR(r.potential_savings_pkr) + ' PKR savings' : null),
    priority: r.priority,
  }))

  return (
    <div style={{
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <Shield size={20} style={{ color: theme.gold }} />
        <div>
          <div style={{
            color: theme.text,
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            ALCO EXECUTIVE REPORT
          </div>
          <div style={{
            color: theme.textSecondary,
            fontSize: '10px',
            fontFamily: theme.font,
          }}>
            Asset-Liability Committee -- Cash Operations Review
          </div>
        </div>
        {data.report_date && (
          <div style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: theme.bg,
            border: `1px solid ${theme.border}`,
            color: theme.textSecondary,
            fontSize: '10px',
            fontFamily: theme.font,
          }}>
            {data.report_date}
          </div>
        )}
      </div>

      {/* Key Metrics */}
      {metrics.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            color: theme.textSecondary,
            fontSize: '10px',
            fontFamily: theme.font,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px',
          }}>
            Key Metrics
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px',
          }}>
            {metrics.map((m, idx) => (
              <div key={idx} style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                padding: '12px',
              }}>
                <div style={{
                  color: theme.textSecondary,
                  fontSize: '9px',
                  fontFamily: theme.font,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginBottom: '4px',
                }}>
                  {m.label}
                </div>
                <div style={{
                  color: m.color ? m.color : theme.text,
                  fontSize: '20px',
                  fontWeight: 700,
                  fontFamily: theme.font,
                }}>
                  {typeof m.value === 'number' ? formatPKR(m.value) : typeof m.value === 'object' ? JSON.stringify(m.value) : String(m.value ?? '--')}
                  {m.suffix && (
                    <span style={{ fontSize: '10px', color: theme.textSecondary, marginLeft: '4px' }}>
                      {m.suffix}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Indicators */}
      {risks.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            color: theme.textSecondary,
            fontSize: '10px',
            fontFamily: theme.font,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px',
          }}>
            Risk Indicators
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '8px',
          }}>
            {risks.map((r, idx) => {
              const color = riskColor(r.level)
              return (
                <div key={idx} style={{
                  backgroundColor: color + '10',
                  border: `1px solid ${color}30`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <RiskIcon level={r.level} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: theme.text,
                      fontSize: '11px',
                      fontFamily: theme.font,
                      fontWeight: 600,
                    }}>
                      {r.name}
                    </div>
                    <div style={{
                      color: theme.textSecondary,
                      fontSize: '9px',
                      fontFamily: theme.font,
                    }}>
                      {typeof r.description === 'object' ? JSON.stringify(r.description) : r.description}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 700,
                    fontFamily: theme.font,
                    backgroundColor: color + '20',
                    color,
                    border: `1px solid ${color}40`,
                    textTransform: 'uppercase',
                  }}>
                    {r.level}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <div style={{
            color: theme.textSecondary,
            fontSize: '10px',
            fontFamily: theme.font,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px',
          }}>
            Recommendations
          </div>
          <div style={{
            backgroundColor: theme.bg,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            padding: '14px',
          }}>
            {recommendations.map((rec, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 0',
                borderBottom: idx < recommendations.length - 1 ? `1px solid ${theme.border}30` : 'none',
              }}>
                <TrendingUp size={12} style={{ color: theme.gold, marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{
                    color: theme.text,
                    fontSize: '11px',
                    fontFamily: theme.font,
                    fontWeight: 600,
                    marginBottom: '2px',
                  }}>
                    {rec.title || (typeof rec === 'object' ? JSON.stringify(rec) : rec)}
                  </div>
                  {rec.detail && (
                    <div style={{
                      color: theme.textSecondary,
                      fontSize: '10px',
                      fontFamily: theme.font,
                      lineHeight: '1.5',
                    }}>
                      {typeof rec.detail === 'object' ? JSON.stringify(rec.detail) : rec.detail}
                    </div>
                  )}
                  {rec.impact && (
                    <span style={{
                      display: 'inline-block',
                      marginTop: '4px',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '8px',
                      fontWeight: 700,
                      fontFamily: theme.font,
                      backgroundColor: theme.green + '15',
                      color: theme.green,
                      border: `1px solid ${theme.green}30`,
                    }}>
                      Impact: {typeof rec.impact === 'object' ? JSON.stringify(rec.impact) : rec.impact}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
