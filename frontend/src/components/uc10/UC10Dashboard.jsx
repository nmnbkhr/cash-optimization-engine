import { useEffect, useState } from 'react'
import { BarChart3, DollarSign, Building2, Receipt, TrendingUp, Shield, Sparkles } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchPnLSummary, fetchPnLWaterfall, fetchBranchRanking,
  fetchCostTreemap, runTransferPricing, fetchALCOReport,
  fetchUC10AIBrief,
} from '../../hooks/useAPI'
import PnLWaterfall from './PnLWaterfall'
import BranchRankingTable from './BranchRankingTable'
import CostTreemap from './CostTreemap'
import TransferPricingDash from './TransferPricingDash'
import ALCOReport from './ALCOReport'
import DataSourceBadge from '../common/DataSourceBadge'
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

export default function UC10Dashboard() {
  const {
    pnlSummary, setPnLSummary,
    pnlWaterfall, setPnLWaterfall,
    branchRanking, setBranchRanking,
    costTreemap, setCostTreemap,
    transferPricing, setTransferPricing,
    alcoReport, setALCOReport,
    uc10AIBrief, setUC10AIBrief,
    isTransferPricingLoading, setIsTransferPricingLoading,
    isALCOLoading, setIsALCOLoading,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [error, setError] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, waterfallRes, rankingRes, treemapRes] = await Promise.allSettled([
          fetchPnLSummary(),
          fetchPnLWaterfall(),
          fetchBranchRanking(),
          fetchCostTreemap(),
        ])
        if (summaryRes.status === 'fulfilled') setPnLSummary(summaryRes.value.data)
        if (waterfallRes.status === 'fulfilled') setPnLWaterfall(waterfallRes.value.data)
        if (rankingRes.status === 'fulfilled') setBranchRanking(rankingRes.value.data)
        if (treemapRes.status === 'fulfilled') setCostTreemap(treemapRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-10 data:', err)
      }
    }
    loadData()
  }, [setPnLSummary, setPnLWaterfall, setBranchRanking, setCostTreemap])

  const handleTransferPricing = async () => {
    setIsTransferPricingLoading(true)
    setError(null)
    try {
      const res = await runTransferPricing()
      setTransferPricing(res.data)
    } catch (err) {
      console.error('Transfer pricing failed:', err)
      setError('Transfer pricing computation failed. Check backend logs.')
    } finally {
      setIsTransferPricingLoading(false)
    }
  }

  const handleALCOReport = async () => {
    setIsALCOLoading(true)
    setError(null)
    try {
      const res = await fetchALCOReport()
      setALCOReport(res.data)
    } catch (err) {
      console.error('ALCO report failed:', err)
      setError('ALCO report generation failed. Check backend logs.')
    } finally {
      setIsALCOLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC10AIBrief()
      setUC10AIBrief(res.data)
    } catch (err) {
      console.error('UC-10 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  const s = pnlSummary || {}

  // Derive fields with fallbacks for backend field name differences
  const totalCashCost = s.total_cash_cost ?? s.net_cash_cost ?? s.gross_cost ?? null
  const costPerBranch = s.cost_per_branch ?? null
  const costPerTransaction = s.cost_per_transaction ?? null
  // net_deployment_income may not exist; derive from income_items or total_benefits
  const netDeploymentIncome = s.net_deployment_income ?? s.total_benefits ?? (s.income_items
    ? Object.values(s.income_items).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
    : null)
  // ALCO score: backend may not return it in summary; derive from idle_cash_ratio if possible
  const idleRatio = s.idle_cash_ratio_pct ?? (s.total_idle_cash && s.total_vault_balance
    ? (s.total_idle_cash / s.total_vault_balance) * 100 : null)
  const alcoScore = s.alco_score ?? (idleRatio != null ? Math.max(0, 100 - idleRatio * 2) : null)
  // YoY trend
  const yoyChange = s.yoy_trend?.change_pct ?? null

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
            backgroundColor: '#8b5cf620',
            color: '#8b5cf6',
            border: '1px solid #8b5cf640',
          }}>
            UC-10
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            Cash P&L Attribution
          </h1>
          {s.lineage && <DataSourceBadge lineage={s.lineage} />}
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          ABC Costing on reconciled ledger -- Transfer Pricing -- Branch Tournament
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
          label="Total Cash Cost"
          value={totalCashCost != null ? formatPKR(totalCashCost) : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.red}
          badge={yoyChange != null
            ? { text: `YoY ${yoyChange > 0 ? '+' : ''}${yoyChange.toFixed(1)}%`, color: yoyChange <= 0 ? theme.green : theme.red }
            : null
          }
        />
        <KPICard
          label="Cost / Branch"
          value={costPerBranch != null ? formatPKR(costPerBranch) : '--'}
          suffix="PKR"
          icon={Building2}
          color={theme.gold}
          badge={costPerBranch != null
            ? costPerBranch < 5e6
              ? { text: 'EFFICIENT', color: theme.green }
              : { text: 'REVIEW', color: theme.gold }
            : null
          }
        />
        <KPICard
          label="Cost / Transaction"
          value={costPerTransaction != null ? `${Number(costPerTransaction).toFixed(0)}` : '--'}
          suffix="PKR"
          icon={Receipt}
          color={theme.teal}
        />
        <KPICard
          label="Net Deployment Income"
          value={netDeploymentIncome != null ? formatPKR(netDeploymentIncome) : '--'}
          suffix="PKR"
          icon={TrendingUp}
          color={theme.green}
          badge={netDeploymentIncome != null
            ? netDeploymentIncome > 0
              ? { text: 'POSITIVE', color: theme.green }
              : { text: 'NEGATIVE', color: theme.red }
            : null
          }
        />
        <KPICard
          label="ALCO Score"
          value={alcoScore != null ? `${Number(alcoScore).toFixed(1)}` : '--'}
          suffix="/100"
          icon={Shield}
          color={
            alcoScore != null
              ? alcoScore >= 75 ? theme.green
                : alcoScore >= 50 ? theme.gold
                : theme.red
              : theme.text
          }
          badge={alcoScore != null
            ? alcoScore >= 75
              ? { text: 'STRONG', color: theme.green }
              : alcoScore >= 50
                ? { text: 'ADEQUATE', color: theme.gold }
                : { text: 'AT RISK', color: theme.red }
            : null
          }
        />
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'center',
      }}>
        <button
          onClick={handleTransferPricing}
          disabled={isTransferPricingLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.teal}60`,
            backgroundColor: theme.teal + '15',
            color: theme.teal,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isTransferPricingLoading ? 'not-allowed' : 'pointer',
            opacity: isTransferPricingLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isTransferPricingLoading ? 'Computing...' : 'Run Transfer Pricing'}
        </button>

        <button
          onClick={handleALCOReport}
          disabled={isALCOLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.gold}60`,
            backgroundColor: theme.gold + '15',
            color: theme.gold,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isALCOLoading ? 'not-allowed' : 'pointer',
            opacity: isALCOLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isALCOLoading ? 'Loading Report...' : 'View ALCO Report'}
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

      {/* P&L Waterfall */}
      <div style={{ marginBottom: '16px' }}>
        <PnLWaterfall data={pnlWaterfall} />
      </div>

      {/* Branch Ranking */}
      <div style={{ marginBottom: '16px' }}>
        <BranchRankingTable data={branchRanking} />
      </div>

      {/* Cost Treemap */}
      <div style={{ marginBottom: '16px' }}>
        <CostTreemap data={costTreemap} />
      </div>

      {/* Transfer Pricing Results */}
      {transferPricing && (
        <div style={{ marginBottom: '16px' }}>
          <TransferPricingDash data={transferPricing} />
        </div>
      )}

      {/* ALCO Report */}
      {alcoReport && (
        <div style={{ marginBottom: '16px' }}>
          <ALCOReport data={alcoReport} />
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

        {uc10AIBrief ? (
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
            {uc10AIBrief.content || uc10AIBrief.brief || uc10AIBrief.summary || (typeof uc10AIBrief === 'string' ? uc10AIBrief : JSON.stringify(uc10AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textSecondary,
            fontSize: '12px',
            fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for Cash P&L Attribution results.
          </div>
        )}
      </div>
    </div>
  )
}
