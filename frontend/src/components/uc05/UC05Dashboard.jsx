import { useEffect, useState } from 'react'
import { Globe, DollarSign, AlertTriangle, TrendingUp, BarChart3, Sparkles } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchNostroSummary, fetchNostroPortfolio, fetchCurrencyBreakdown,
  runNostroOptimize, runNashBargaining, runFXCarry, fetchUC05AIBrief,
} from '../../hooks/useAPI'
import CurrencyTreemap from './CurrencyTreemap'
import FXCarryTable from './FXCarryTable'
import NostroAccountTable from './NostroAccountTable'
import NashBargainingPanel from './NashBargainingPanel'
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

export default function UC05Dashboard() {
  const {
    nostroSummary, setNostroSummary,
    nostroPortfolio, setNostroPortfolio,
    currencyBreakdown, setCurrencyBreakdown,
    nostroOptimal, setNostroOptimal,
    nashBargaining, setNashBargaining,
    fxCarry, setFXCarry,
    uc05AIBrief, setUC05AIBrief,
    isNostroOptimizing, setIsNostroOptimizing,
    isNashLoading, setIsNashLoading,
    isFXCarryLoading, setIsFXCarryLoading,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [error, setError] = useState(null)

  // Load summary, portfolio, and currency breakdown on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, portfolioRes, breakdownRes] = await Promise.allSettled([
          fetchNostroSummary(),
          fetchNostroPortfolio(),
          fetchCurrencyBreakdown(),
        ])
        if (summaryRes.status === 'fulfilled') setNostroSummary(summaryRes.value.data)
        if (portfolioRes.status === 'fulfilled') setNostroPortfolio(portfolioRes.value.data)
        if (breakdownRes.status === 'fulfilled') setCurrencyBreakdown(breakdownRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-05 data:', err)
      }
    }
    loadData()
  }, [setNostroSummary, setNostroPortfolio, setCurrencyBreakdown])

  const handleOptimize = async () => {
    setIsNostroOptimizing(true)
    setError(null)
    try {
      const res = await runNostroOptimize()
      setNostroOptimal(res.data)
    } catch (err) {
      console.error('Nostro optimize failed:', err)
      setError('MDP optimization failed. Check backend logs.')
    } finally {
      setIsNostroOptimizing(false)
    }
  }

  const handleNashBargaining = async () => {
    setIsNashLoading(true)
    setError(null)
    try {
      const res = await runNashBargaining()
      setNashBargaining(res.data)
    } catch (err) {
      console.error('Nash bargaining failed:', err)
      setError('Nash bargaining failed. Check backend logs.')
    } finally {
      setIsNashLoading(false)
    }
  }

  const handleFXCarry = async () => {
    setIsFXCarryLoading(true)
    setError(null)
    try {
      const res = await runFXCarry()
      setFXCarry(res.data)
    } catch (err) {
      console.error('FX carry analysis failed:', err)
      setError('FX carry analysis failed. Check backend logs.')
    } finally {
      setIsFXCarryLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC05AIBrief()
      setUC05AIBrief(res.data)
    } catch (err) {
      console.error('UC-05 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  const raw = nostroSummary || {}
  // Flatten nested summary structure from API
  const s = {
    total_balance_pkr: raw.totals?.total_balance_pkr ?? raw.total_balance_pkr,
    total_excess_pkr: raw.totals?.total_excess_pkr ?? raw.total_excess_pkr,
    repatriation_opportunity_pkr: raw.totals?.potential_repatriation_income_annual_pkr ?? raw.repatriation_opportunity_pkr,
    accounts_below_minimum: raw.compliance?.accounts_below_minimum ?? raw.accounts_below_minimum,
    total_accounts: raw.totals?.total_accounts ?? raw.total_accounts ?? 35,
    portfolio_hhi: raw.concentration?.hhi_by_currency ?? raw.portfolio_hhi,
    hhi_interpretation: raw.concentration?.hhi_interpretation,
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
            backgroundColor: '#2dd4bf20',
            color: '#2dd4bf',
            border: '1px solid #2dd4bf40',
          }}>
            UC-05
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            Nostro Balance Optimization
          </h1>
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          Multi-Currency MDP + GARCH -- 35 Correspondent Banks across 7 Currencies
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
          label="Total Nostro Balances"
          value={s.total_balance_pkr != null ? formatPKR(s.total_balance_pkr) : '--'}
          suffix="PKR equiv"
          icon={Globe}
          color={theme.teal}
        />
        <KPICard
          label="Total Excess"
          value={s.total_excess_pkr != null ? formatPKR(s.total_excess_pkr) : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.green}
          badge={s.total_excess_pkr > 0 ? { text: 'REPATRIABLE', color: theme.green } : null}
        />
        <KPICard
          label="Repatriation Opportunity"
          value={s.repatriation_opportunity_pkr != null ? formatPKR(s.repatriation_opportunity_pkr) : '--'}
          suffix="PKR/yr"
          icon={TrendingUp}
          color={theme.gold}
        />
        <KPICard
          label="Accounts Below Min"
          value={s.accounts_below_minimum != null ? s.accounts_below_minimum : '--'}
          suffix={`of ${s.total_accounts || 35}`}
          icon={AlertTriangle}
          color={(s.accounts_below_minimum || 0) > 0 ? theme.red : theme.green}
          badge={(s.accounts_below_minimum || 0) > 0
            ? { text: 'ATTENTION', color: theme.red }
            : { text: 'ALL CLEAR', color: theme.green }
          }
        />
        <KPICard
          label="Portfolio HHI"
          value={s.portfolio_hhi != null ? s.portfolio_hhi.toFixed(4) : '--'}
          icon={BarChart3}
          color={theme.teal}
          badge={s.portfolio_hhi != null
            ? s.portfolio_hhi > 0.25
              ? { text: 'CONCENTRATED', color: theme.red }
              : { text: s.hhi_interpretation || 'DIVERSIFIED', color: theme.green }
            : null
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
          onClick={handleOptimize}
          disabled={isNostroOptimizing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.teal}60`,
            backgroundColor: theme.teal + '15',
            color: theme.teal,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isNostroOptimizing ? 'not-allowed' : 'pointer',
            opacity: isNostroOptimizing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isNostroOptimizing ? 'Running MDP Optimizer...' : 'Run MDP Optimizer'}
        </button>
        <button
          onClick={handleNashBargaining}
          disabled={isNashLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.gold}60`,
            backgroundColor: theme.gold + '15',
            color: theme.gold,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isNashLoading ? 'not-allowed' : 'pointer',
            opacity: isNashLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isNashLoading ? 'Running Nash Bargaining...' : 'Nash Bargaining'}
        </button>
        <button
          onClick={handleFXCarry}
          disabled={isFXCarryLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid #3b82f660`,
            backgroundColor: '#3b82f615',
            color: '#3b82f6',
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isFXCarryLoading ? 'not-allowed' : 'pointer',
            opacity: isFXCarryLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isFXCarryLoading ? 'Analyzing FX Carry...' : 'FX Carry Analysis'}
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

      {/* Currency Treemap */}
      <div style={{ marginBottom: '16px' }}>
        <CurrencyTreemap data={currencyBreakdown?.breakdown || currencyBreakdown} />
      </div>

      {/* MDP Optimization Results */}
      {nostroOptimal && (() => {
        const mdpSummary = nostroOptimal.summary || nostroOptimal
        const totalRepatriation = mdpSummary.total_repatriate_pkr ?? mdpSummary.net_rebalance_pkr ?? nostroOptimal.total_repatriation
        const annualIncome = mdpSummary.potential_annual_income_pkr ?? nostroOptimal.annual_income_gain
        const totalAccounts = mdpSummary.total_accounts ?? nostroOptimal.accounts_optimized
        const actionDist = mdpSummary.action_distribution
        const repatriateCount = actionDist?.repatriate ?? 0

        return (
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
              MDP OPTIMIZATION RESULT
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
            }}>
              {totalRepatriation != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    TOTAL REPATRIATION
                  </div>
                  <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatPKR(totalRepatriation)} PKR
                  </div>
                </div>
              )}
              {annualIncome != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    ANNUAL INCOME GAIN
                  </div>
                  <div style={{ color: theme.gold, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatPKR(annualIncome)} PKR
                  </div>
                </div>
              )}
              {totalAccounts != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    ACCOUNTS OPTIMIZED
                  </div>
                  <div style={{ color: theme.teal, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {totalAccounts}
                  </div>
                </div>
              )}
              {actionDist && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    REPATRIATE / HOLD
                  </div>
                  <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {repatriateCount} / {actionDist.hold ?? 0}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* FX Carry Table */}
      {fxCarry && (
        <div style={{ marginBottom: '16px' }}>
          <FXCarryTable data={fxCarry} />
        </div>
      )}

      {/* Nash Bargaining Panel */}
      {nashBargaining && (
        <div style={{ marginBottom: '16px' }}>
          <NashBargainingPanel data={nashBargaining} />
        </div>
      )}

      {/* Nostro Account Table */}
      <div style={{ marginBottom: '16px' }}>
        <NostroAccountTable
          data={(() => {
            const accounts = nostroPortfolio?.accounts || (Array.isArray(nostroPortfolio) ? nostroPortfolio : [])
            if (!nostroOptimal?.accounts) return accounts
            // Merge MDP optimal_action into portfolio accounts
            const optMap = {}
            for (const a of nostroOptimal.accounts) {
              optMap[a.account_id] = a
            }
            return accounts.map(a => {
              const opt = optMap[a.account_id]
              return opt ? {
                ...a,
                mdp_recommendation: opt.optimal_action,
                overnight_rate: a.overnight_rate ?? a.overnight_rate_pct,
              } : { ...a, overnight_rate: a.overnight_rate ?? a.overnight_rate_pct }
            })
          })()}
        />
      </div>

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

        {uc05AIBrief ? (
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
            {uc05AIBrief.content || uc05AIBrief.brief || (typeof uc05AIBrief === 'string' ? uc05AIBrief : JSON.stringify(uc05AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textSecondary,
            fontSize: '12px',
            fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for nostro optimization results.
          </div>
        )}
      </div>
    </div>
  )
}
