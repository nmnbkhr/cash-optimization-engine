import { useEffect, useState } from 'react'
import { Shield, DollarSign, TrendingUp, AlertTriangle, BarChart3, Sparkles } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchVostroSummary, fetchVostroPortfolio, fetchDeploymentBreakdown,
  runComputeLaR, runOptimizeDeployment, runCooperativeGame, fetchUC06AIBrief,
} from '../../hooks/useAPI'
import LaRIndicators from './LaRIndicators'
import DeploymentChart from './DeploymentChart'
import CooperativeGamePanel from './CooperativeGamePanel'
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

export default function UC06Dashboard() {
  const {
    vostroSummary, setVostroSummary,
    vostroPortfolio, setVostroPortfolio,
    deploymentBreakdown, setDeploymentBreakdown,
    vostroLaR, setVostroLaR,
    vostroDeployment, setVostroDeployment,
    cooperativeGame, setCooperativeGame,
    uc06AIBrief, setUC06AIBrief,
    isLaRComputing, setIsLaRComputing,
    isDeploymentOptimizing, setIsDeploymentOptimizing,
    isCooperativeLoading, setIsCooperativeLoading,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [error, setError] = useState(null)

  // Load summary, portfolio, and deployment breakdown on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, portfolioRes, breakdownRes] = await Promise.allSettled([
          fetchVostroSummary(),
          fetchVostroPortfolio(),
          fetchDeploymentBreakdown(),
        ])
        if (summaryRes.status === 'fulfilled') setVostroSummary(summaryRes.value.data)
        if (portfolioRes.status === 'fulfilled') setVostroPortfolio(portfolioRes.value.data)
        if (breakdownRes.status === 'fulfilled') setDeploymentBreakdown(breakdownRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-06 data:', err)
      }
    }
    loadData()
  }, [setVostroSummary, setVostroPortfolio, setDeploymentBreakdown])

  const handleComputeLaR = async () => {
    setIsLaRComputing(true)
    setError(null)
    try {
      const res = await runComputeLaR()
      setVostroLaR(res.data)
    } catch (err) {
      console.error('LaR computation failed:', err)
      setError('LaR computation failed. Check backend logs.')
    } finally {
      setIsLaRComputing(false)
    }
  }

  const handleOptimizeDeployment = async () => {
    setIsDeploymentOptimizing(true)
    setError(null)
    try {
      const res = await runOptimizeDeployment()
      setVostroDeployment(res.data)
    } catch (err) {
      console.error('Deployment optimization failed:', err)
      setError('Deployment optimization failed. Check backend logs.')
    } finally {
      setIsDeploymentOptimizing(false)
    }
  }

  const handleCooperativeGame = async () => {
    setIsCooperativeLoading(true)
    setError(null)
    try {
      const res = await runCooperativeGame()
      setCooperativeGame(res.data)
    } catch (err) {
      console.error('Cooperative game analysis failed:', err)
      setError('Cooperative game analysis failed. Check backend logs.')
    } finally {
      setIsCooperativeLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC06AIBrief()
      setUC06AIBrief(res.data)
    } catch (err) {
      console.error('UC-06 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  const raw = vostroSummary || {}
  // Flatten nested summary structure from API
  const s = {
    total_vostro_balance: raw.totals?.total_balance ?? raw.total_vostro_balance,
    stable_portion: raw.totals?.total_stable ?? raw.stable_portion,
    volatile_portion: raw.totals?.total_volatile ?? raw.volatile_portion,
    stable_pct: raw.totals?.stable_pct ?? raw.stable_pct,
    total_accounts: raw.totals?.total_accounts ?? raw.total_accounts ?? 20,
    current_deployment_income: raw.deployment?.current_annual_income ?? raw.current_deployment_income,
    optimal_deployment_income: raw.deployment?.optimal_annual_income ?? raw.optimal_deployment_income,
    optimization_gap: raw.deployment?.income_gap ?? raw.optimization_gap,
  }

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
            backgroundColor: '#f59e0b20',
            color: '#f59e0b',
            border: '1px solid #f59e0b40',
          }}>
            UC-06
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            Vostro Liability Optimization
          </h1>
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          Liquidity-at-Risk + Cooperative Game -- {s.total_accounts} Respondent Banks
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
          label="Total Vostro Balances"
          value={s.total_vostro_balance != null ? formatPKR(s.total_vostro_balance) : '--'}
          suffix="PKR"
          icon={Shield}
          color={theme.gold}
        />
        <KPICard
          label="Stable Portion"
          value={s.stable_portion != null ? formatPKR(s.stable_portion) : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.green}
          badge={s.stable_pct != null
            ? { text: `${s.stable_pct.toFixed(1)}% STABLE`, color: theme.green }
            : null
          }
        />
        <KPICard
          label="Volatile Portion"
          value={s.volatile_portion != null ? formatPKR(s.volatile_portion) : '--'}
          suffix="PKR"
          icon={AlertTriangle}
          color={theme.red}
          badge={s.volatile_portion > 0
            ? { text: 'RESERVE NEEDED', color: theme.red }
            : null
          }
        />
        <KPICard
          label="Current Deployment Income"
          value={s.current_deployment_income != null ? formatPKR(s.current_deployment_income) : '--'}
          suffix="PKR/yr"
          icon={TrendingUp}
          color={theme.teal}
        />
        <KPICard
          label="Optimization Gap"
          value={s.optimization_gap != null ? formatPKR(s.optimization_gap) : '--'}
          suffix="PKR/yr"
          icon={BarChart3}
          color={theme.gold}
          badge={s.optimization_gap > 0
            ? { text: 'UPSIDE AVAILABLE', color: theme.gold }
            : { text: 'OPTIMAL', color: theme.green }
          }
        />
      </div>

      {/* Action buttons row */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <button
          onClick={handleComputeLaR}
          disabled={isLaRComputing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.red}60`,
            backgroundColor: theme.red + '15',
            color: theme.red,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isLaRComputing ? 'not-allowed' : 'pointer',
            opacity: isLaRComputing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isLaRComputing ? 'Computing LaR...' : 'Compute LaR'}
        </button>
        <button
          onClick={handleOptimizeDeployment}
          disabled={isDeploymentOptimizing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.teal}60`,
            backgroundColor: theme.teal + '15',
            color: theme.teal,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isDeploymentOptimizing ? 'not-allowed' : 'pointer',
            opacity: isDeploymentOptimizing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isDeploymentOptimizing ? 'Optimizing Deployment...' : 'Optimize Deployment'}
        </button>
        <button
          onClick={handleCooperativeGame}
          disabled={isCooperativeLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.gold}60`,
            backgroundColor: theme.gold + '15',
            color: theme.gold,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isCooperativeLoading ? 'not-allowed' : 'pointer',
            opacity: isCooperativeLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isCooperativeLoading ? 'Running Cooperative Game...' : 'Cooperative Game'}
        </button>
      </div>

      {error && (
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
          {error}
        </div>
      )}

      {/* LaR Indicators */}
      {vostroLaR && (
        <div style={{ marginBottom: '16px' }}>
          <LaRIndicators data={vostroLaR} />
        </div>
      )}

      {/* Deployment Chart */}
      {(vostroDeployment || deploymentBreakdown) && (
        <div style={{ marginBottom: '16px' }}>
          <DeploymentChart data={vostroDeployment || deploymentBreakdown} />
        </div>
      )}

      {/* Cooperative Game Panel */}
      {cooperativeGame && (
        <div style={{ marginBottom: '16px' }}>
          <CooperativeGamePanel data={cooperativeGame} />
        </div>
      )}

      {/* Vostro Portfolio Table */}
      {vostroPortfolio && Array.isArray(vostroPortfolio.accounts || vostroPortfolio) && (
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
            VOSTRO ACCOUNT PORTFOLIO
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.font, fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                  {['Bank Name', 'Balance', 'Stable', 'Volatile', 'Stability %', 'Deployed'].map((h) => (
                    <th key={h} style={{
                      textAlign: h === 'Bank Name' ? 'left' : 'right',
                      padding: '8px 10px',
                      color: theme.textSecondary,
                      fontWeight: 600,
                      fontSize: '10px',
                      textTransform: 'uppercase',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(vostroPortfolio.accounts || vostroPortfolio).map((acct, idx) => {
                  const stablePct = acct.stable_pct ?? (acct.stability_ratio != null ? acct.stability_ratio * 100 : null)
                  const deployed = typeof acct.deployment === 'object'
                    ? (acct.deployment.tbills || 0) + (acct.deployment.overnight || 0)
                    : (acct.deployed ?? acct.deployment)
                  return (
                    <tr key={idx} style={{
                      borderBottom: `1px solid ${theme.border}20`,
                      backgroundColor: idx % 2 === 0 ? 'transparent' : theme.bg + '40',
                    }}>
                      <td style={{ padding: '8px 10px', color: theme.text }}>{acct.bank_name || acct.name}</td>
                      <td style={{ padding: '8px 10px', color: theme.text, textAlign: 'right' }}>{formatPKR(acct.balance)}</td>
                      <td style={{ padding: '8px 10px', color: theme.green, textAlign: 'right' }}>{formatPKR(acct.stable_portion ?? acct.stable)}</td>
                      <td style={{ padding: '8px 10px', color: theme.red, textAlign: 'right' }}>{formatPKR(acct.volatile_portion ?? acct.volatile)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <span style={{
                          color: (stablePct || 0) > 70 ? theme.green : (stablePct || 0) > 40 ? theme.gold : theme.red,
                        }}>
                          {stablePct != null ? `${stablePct.toFixed(0)}%` : '--'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: theme.teal, textAlign: 'right' }}>{formatPKR(deployed)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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

        {uc06AIBrief ? (
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
            {uc06AIBrief.content || uc06AIBrief.brief || (typeof uc06AIBrief === 'string' ? uc06AIBrief : JSON.stringify(uc06AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textSecondary,
            fontSize: '12px',
            fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for vostro liability optimization results.
          </div>
        )}
      </div>
    </div>
  )
}
