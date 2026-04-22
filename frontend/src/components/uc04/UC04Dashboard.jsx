import { useEffect, useState } from 'react'
import { Activity, Shield, Zap, DollarSign, CheckCircle, Sparkles } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchCRRSummary, fetchCRRTimeline, runCRROptimize,
  runCRRStrategyGame, fetchUC04AIBrief,
} from '../../hooks/useAPI'
import CRRTimelineChart from './CRRTimelineChart'
import FreedLiquidityChart from './FreedLiquidityChart'
import StrategyGamePanel from './StrategyGamePanel'
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

const kpiCardStyle = {
  backgroundColor: theme.card,
  border: `1px solid ${theme.border}`,
  borderRadius: '8px',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

function KPICard({ label, value, suffix, icon: Icon, color, badge }) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          color: theme.textSecondary,
          fontSize: '10px',
          fontFamily: theme.font,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
        {Icon && <Icon size={14} style={{ color: theme.textSecondary, opacity: 0.5 }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{
          color: color || theme.text,
          fontSize: '22px',
          fontWeight: 700,
          fontFamily: theme.font,
        }}>
          {value}
        </span>
        {suffix && (
          <span style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
          }}>
            {suffix}
          </span>
        )}
      </div>
      {badge && (
        <span style={{
          display: 'inline-block',
          width: 'fit-content',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '9px',
          fontWeight: 700,
          fontFamily: theme.font,
          backgroundColor: badge.color + '20',
          color: badge.color,
          border: `1px solid ${badge.color}40`,
          marginTop: '2px',
        }}>
          {badge.text}
        </span>
      )}
    </div>
  )
}

function RiskGauge({ complianceProb }) {
  const prob = complianceProb ?? 97.8
  const riskLevel = prob >= 98 ? 'LOW' : prob >= 95 ? 'MEDIUM' : 'HIGH'
  const riskColor = prob >= 98 ? theme.green : prob >= 95 ? theme.gold : theme.red
  const gaugeWidth = Math.min(prob, 100)

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
        marginBottom: '4px',
      }}>
        COMPLIANCE RISK GAUGE
      </div>
      <div style={{
        color: theme.textSecondary,
        fontSize: '11px',
        fontFamily: theme.font,
        marginBottom: '20px',
      }}>
        Monte Carlo Simulation -- Compliance Probability
      </div>

      {/* Gauge bar */}
      <div style={{
        width: '100%',
        height: '24px',
        backgroundColor: '#0a0e17',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '12px',
        border: `1px solid ${theme.border}`,
      }}>
        <div style={{
          width: `${gaugeWidth}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${theme.red}, ${theme.gold}, ${theme.green})`,
          borderRadius: '12px',
          transition: 'width 0.8s ease-out',
        }} />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <span style={{
            color: riskColor,
            fontSize: '28px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            {prob.toFixed(1)}%
          </span>
          <span style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
            marginLeft: '8px',
          }}>
            compliance probability
          </span>
        </div>
        <span style={{
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: theme.font,
          backgroundColor: riskColor + '20',
          color: riskColor,
          border: `1px solid ${riskColor}40`,
        }}>
          RISK: {riskLevel}
        </span>
      </div>

      {/* Risk scale labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '8px',
        fontFamily: theme.font,
        fontSize: '9px',
        color: theme.textSecondary,
      }}>
        <span>0%</span>
        <span style={{ color: theme.red }}>HIGH RISK &lt;95%</span>
        <span style={{ color: theme.gold }}>MEDIUM 95-98%</span>
        <span style={{ color: theme.green }}>LOW &gt;98%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

export default function UC04Dashboard() {
  const {
    crrSummary, setCRRSummary,
    crrTimeline, setCRRTimeline,
    crrOptimal, setCRROptimal,
    crrStrategy, setCRRStrategy,
    uc04AIBrief, setUC04AIBrief,
    isCRROptimizing, setIsCRROptimizing,
    isCRRStrategyLoading, setIsCRRStrategyLoading,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [optimizeError, setOptimizeError] = useState(null)

  // Load summary and timeline on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, timelineRes] = await Promise.allSettled([
          fetchCRRSummary(),
          fetchCRRTimeline(),
        ])
        if (summaryRes.status === 'fulfilled') setCRRSummary(summaryRes.value.data)
        if (timelineRes.status === 'fulfilled') setCRRTimeline(timelineRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-04 data:', err)
      }
    }
    loadData()
  }, [setCRRSummary, setCRRTimeline])

  const handleOptimize = async () => {
    setIsCRROptimizing(true)
    setOptimizeError(null)
    try {
      const res = await runCRROptimize()
      setCRROptimal(res.data)
    } catch (err) {
      console.error('CRR optimize failed:', err)
      setOptimizeError('Optimization failed. Check backend logs.')
    } finally {
      setIsCRROptimizing(false)
    }
  }

  const handleStrategyGame = async () => {
    setIsCRRStrategyLoading(true)
    try {
      const res = await runCRRStrategyGame()
      setCRRStrategy(res.data)
    } catch (err) {
      console.error('CRR strategy game failed:', err)
    } finally {
      setIsCRRStrategyLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC04AIBrief()
      setUC04AIBrief(res.data)
    } catch (err) {
      console.error('UC-04 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  const s = crrSummary || {}
  const cw = s.current_week || {}
  const hist = s.historical || {}

  // Map summary fields from nested structure
  const currentCRR = cw.avg_crr_ratio_pct ?? s.current_crr_ratio ?? s.crr_weekly_avg_pct
  const weeklyAvgCRR = s.crr_weekly_avg_pct ?? cw.avg_crr_ratio_pct ?? s.weekly_avg_crr
  const freedLiq = hist.total_freed_liquidity ?? s.freed_liquidity
  const incomeEarned = hist.total_income_earned ?? s.income_earned
  const compRate = hist.compliance_rate_pct ?? s.compliance_rate

  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '4px',
        }}>
          <span style={{
            padding: '2px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: theme.font,
            backgroundColor: '#a855f720',
            color: '#a855f7',
            border: '1px solid #a855f740',
          }}>
            UC-04
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            CRR Float Engineering
          </h1>
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          Dynamic Programming + Monte Carlo -- CRR Band Optimization
        </p>
      </div>

      {/* KPI Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <KPICard
          label="Current CRR Ratio"
          value={currentCRR != null ? `${currentCRR.toFixed(2)}%` : '--'}
          icon={Activity}
          color={theme.teal}
          badge={
            cw.is_compliant != null
              ? (cw.is_compliant ? { text: 'COMPLIANT', color: theme.green } : { text: 'BREACH', color: theme.red })
              : (currentCRR ?? 6) >= 4
                ? { text: 'COMPLIANT', color: theme.green }
                : { text: 'BREACH', color: theme.red }
          }
        />
        <KPICard
          label="Weekly Avg CRR"
          value={weeklyAvgCRR != null ? `${weeklyAvgCRR.toFixed(2)}%` : '--'}
          icon={Shield}
          color={theme.gold}
        />
        <KPICard
          label="Freed Liquidity"
          value={freedLiq != null ? formatPKR(freedLiq) : '--'}
          suffix="PKR"
          icon={Zap}
          color={theme.green}
        />
        <KPICard
          label="Income Earned"
          value={incomeEarned != null ? formatPKR(incomeEarned) : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.gold}
        />
        <KPICard
          label="Compliance Rate"
          value={compRate != null ? `${compRate.toFixed(1)}%` : '--'}
          suffix={`${hist.total_weeks_analyzed || 0} weeks`}
          icon={CheckCircle}
          color={(compRate ?? 100) >= 100 ? theme.green : theme.gold}
        />
      </div>

      {/* Action buttons row */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <button
          onClick={handleOptimize}
          disabled={isCRROptimizing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.teal}60`,
            backgroundColor: theme.teal + '15',
            color: theme.teal,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isCRROptimizing ? 'not-allowed' : 'pointer',
            opacity: isCRROptimizing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isCRROptimizing ? 'Running DP Optimizer...' : 'Run DP Optimizer'}
        </button>
        <button
          onClick={handleStrategyGame}
          disabled={isCRRStrategyLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.gold}60`,
            backgroundColor: theme.gold + '15',
            color: theme.gold,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isCRRStrategyLoading ? 'not-allowed' : 'pointer',
            opacity: isCRRStrategyLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isCRRStrategyLoading ? 'Analyzing Strategies...' : 'Run Strategy Game'}
        </button>
      </div>

      {optimizeError && (
        <div style={{
          padding: '8px 16px',
          marginBottom: '12px',
          backgroundColor: theme.red + '15',
          border: `1px solid ${theme.red}40`,
          borderRadius: '6px',
          color: theme.red,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          {optimizeError}
        </div>
      )}

      {/* Charts row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '16px',
      }}>
        <CRRTimelineChart data={crrTimeline?.daily_schedule || crrTimeline?.timeline || crrOptimal?.optimal_schedule || crrOptimal?.daily_schedule} />
        <FreedLiquidityChart data={crrOptimal} summary={s} />
      </div>

      {/* Strategy Game + Risk Gauge row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.5fr 1fr',
        gap: '16px',
        marginBottom: '16px',
      }}>
        <StrategyGamePanel data={crrStrategy} />
        <RiskGauge complianceProb={crrOptimal?.compliance_probability != null ? crrOptimal.compliance_probability * 100 : (hist.compliance_rate_pct ?? s.mc_compliance_prob)} />
      </div>

      {/* Optimal Schedule Results */}
      {crrOptimal && (
        <div style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '16px',
        }}>
          <div style={{
            color: theme.text,
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: theme.font,
            marginBottom: '12px',
          }}>
            DP OPTIMIZATION RESULT
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}>
            {(crrOptimal.expected_freed_liquidity ?? crrOptimal.total_freed) != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  FREED LIQUIDITY
                </div>
                <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                  {formatPKR(crrOptimal.expected_freed_liquidity ?? crrOptimal.total_freed)} PKR
                </div>
              </div>
            )}
            {(crrOptimal.expected_income ?? crrOptimal.income_gain) != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  EXPECTED INCOME
                </div>
                <div style={{ color: theme.gold, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                  {formatPKR(crrOptimal.expected_income ?? crrOptimal.income_gain)} PKR
                </div>
              </div>
            )}
            {(crrOptimal.compliance_probability ?? crrOptimal.compliance_maintained) != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  COMPLIANCE
                </div>
                <div style={{
                  color: (crrOptimal.compliance_probability ?? 1) >= 0.95 ? theme.green : theme.red,
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: theme.font,
                }}>
                  {crrOptimal.compliance_probability != null
                    ? `${(crrOptimal.compliance_probability * 100).toFixed(1)}%`
                    : (crrOptimal.compliance_maintained ? 'MAINTAINED' : 'AT RISK')}
                </div>
              </div>
            )}
            {(crrOptimal.weekly_avg_crr_pct ?? crrOptimal.strategy) != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  WEEKLY AVG CRR
                </div>
                <div style={{ color: theme.teal, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                  {crrOptimal.weekly_avg_crr_pct != null
                    ? `${crrOptimal.weekly_avg_crr_pct.toFixed(2)}%`
                    : (typeof crrOptimal.strategy === 'object' ? JSON.stringify(crrOptimal.strategy) : crrOptimal.strategy)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Brief section */}
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
          marginBottom: '12px',
        }}>
          <div style={{
            color: theme.text,
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            AI EXECUTIVE BRIEF
          </div>
          <button
            onClick={handleAIBrief}
            disabled={isAILoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '6px',
              border: `1px solid ${theme.gold}60`,
              backgroundColor: theme.gold + '15',
              color: theme.gold,
              fontFamily: theme.font,
              fontSize: '11px',
              fontWeight: 600,
              cursor: isAILoading ? 'not-allowed' : 'pointer',
              opacity: isAILoading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            <Sparkles size={12} />
            {isAILoading ? 'Generating...' : 'Ask AI'}
          </button>
        </div>

        {uc04AIBrief ? (
          <div style={{
            padding: '16px',
            backgroundColor: '#0a0e17',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            color: theme.text,
            fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: '1.7',
            whiteSpace: 'pre-wrap',
          }}>
            {uc04AIBrief.content || uc04AIBrief.brief || (typeof uc04AIBrief === 'string' ? uc04AIBrief : JSON.stringify(uc04AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textSecondary,
            fontSize: '12px',
            fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for CRR optimization results.
          </div>
        )}
      </div>
    </div>
  )
}
