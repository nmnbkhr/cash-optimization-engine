import { useEffect, useState } from 'react'
import { Layers, DollarSign, AlertTriangle, TrendingUp, BarChart3, Sparkles, Activity } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchDenomSummary, fetchPenaltyHeatmap,
  runDenomOptimize, fetchUC07AIBrief,
} from '../../hooks/useAPI'
import ParetoScatter from './ParetoScatter'
import DenominationBars from './DenominationBars'
import PenaltyHeatmap from './PenaltyHeatmap'
import SeasonalOverlay from './SeasonalOverlay'
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

export default function UC07Dashboard() {
  const {
    denomSummary, setDenomSummary,
    penaltyHeatmap, setPenaltyHeatmap,
    denomOptimal, setDenomOptimal,
    uc07AIBrief, setUC07AIBrief,
    isDenomOptimizing, setIsDenomOptimizing,
    isHeatmapLoading, setIsHeatmapLoading,
    selectedScenario, setSelectedScenario,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [error, setError] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes] = await Promise.allSettled([
          fetchDenomSummary(),
        ])
        if (summaryRes.status === 'fulfilled') setDenomSummary(summaryRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-07 data:', err)
      }
    }
    loadData()
  }, [setDenomSummary])

  const handleOptimize = async () => {
    setIsDenomOptimizing(true)
    setError(null)
    try {
      const res = await runDenomOptimize(null, selectedScenario)
      setDenomOptimal(res.data)
    } catch (err) {
      console.error('NSGA-II optimization failed:', err)
      setError('NSGA-II optimization failed. Check backend logs.')
    } finally {
      setIsDenomOptimizing(false)
    }
  }

  const handleHeatmap = async () => {
    setIsHeatmapLoading(true)
    setError(null)
    try {
      const res = await fetchPenaltyHeatmap()
      setPenaltyHeatmap(res.data)
    } catch (err) {
      console.error('Penalty heatmap failed:', err)
      setError('Penalty heatmap failed. Check backend logs.')
    } finally {
      setIsHeatmapLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC07AIBrief()
      setUC07AIBrief(res.data)
    } catch (err) {
      console.error('UC-07 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  // --- Map backend API fields to what the frontend expects ---
  const raw = denomSummary || {}
  const s = {
    total_notes_value: raw.total_value,
    fit_soiled_ratio: raw.overall_soiled_ratio != null && raw.overall_soiled_ratio > 0
      ? (1 - raw.overall_soiled_ratio) / raw.overall_soiled_ratio   // fit/soiled ratio
      : null,
    annual_penalty_exposure: raw.penalty_risk?.estimated_annual_penalty ?? null,
    branches_at_risk: Array.isArray(raw.top_risk_branches) ? raw.top_risk_branches.length : null,
    total_branches: 1547,
    optimization_potential: raw.demand_profile
      ? raw.demand_profile.reduce((sum, d) => sum + Math.abs(d.demand_pct - (100 / 7)), 0) / 2
      : null,
    // Pass through for DenominationBars — build {5000: pct, 1000: pct, ...} from demand_profile
    current_allocation: Array.isArray(raw.demand_profile)
      ? raw.demand_profile.reduce((acc, d) => { acc[String(d.denomination)] = d.demand_pct; return acc }, {})
      : null,
    seasonal_profiles: raw.seasonal_profiles || null,
  }

  const rawOpt = denomOptimal || {}
  // Flatten pareto_frontier entries so ParetoScatter gets the fields it expects
  const paretoSolutions = Array.isArray(rawOpt.pareto_frontier)
    ? rawOpt.pareto_frontier.map((p) => ({
        ...p,
        mismatch_cost: p.objectives?.mismatch_cost ?? 0,
        penalty_risk: p.objectives?.penalty_risk_pkr ?? 0,
        sorting_time: p.objectives?.sorting_time_index ?? 0,
        is_knee: !!p.is_recommended,
      }))
    : null

  const bestMismatch = paretoSolutions
    ? Math.min(...paretoSolutions.map(p => p.mismatch_cost))
    : null
  const bestPenalty = paretoSolutions
    ? Math.min(...paretoSolutions.map(p => p.penalty_risk))
    : null
  const baselinePenalty = rawOpt.recommended?.objectives?.penalty_risk_pkr

  // Build recommended allocation as {5000: pct, ...} from recommended.allocation array
  const recommendedAlloc = Array.isArray(rawOpt.recommended?.allocation)
    ? rawOpt.recommended.allocation.reduce((acc, d) => { acc[String(d.denomination)] = d.recommended_pct; return acc }, {})
    : null

  // Build demand-based current allocation from demand_profile_used {"Rs.5,000": 34.86, ...}
  const demandAlloc = rawOpt.demand_profile_used
    ? Object.entries(rawOpt.demand_profile_used).reduce((acc, [k, v]) => {
        const num = k.replace(/[^0-9]/g, '')
        acc[num] = v
        return acc
      }, {})
    : null

  const optimal = {
    pareto_solutions: paretoSolutions,
    total_solutions: rawOpt.optimization?.pareto_solutions ?? null,
    best_mismatch_cost: bestMismatch,
    best_penalty_risk: bestPenalty,
    penalty_reduction_pct: baselinePenalty && bestPenalty != null
      ? ((baselinePenalty - bestPenalty) / baselinePenalty) * 100
      : null,
    recommended_allocation: recommendedAlloc,
    current_allocation: demandAlloc || s.current_allocation,
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
            backgroundColor: '#ec489920',
            color: '#ec4899',
            border: '1px solid #ec489940',
          }}>
            UC-07
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            Denomination Mix Optimization
          </h1>
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          NSGA-II Pareto Optimization -- 7 Denominations with Eid/Ramadan Scenarios
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
          label="Total Notes Value"
          value={s.total_notes_value != null ? formatPKR(s.total_notes_value) : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.teal}
        />
        <KPICard
          label="Fit / Soiled Ratio"
          value={s.fit_soiled_ratio != null ? s.fit_soiled_ratio.toFixed(2) : '--'}
          suffix="ratio"
          icon={Activity}
          color={theme.green}
          badge={s.fit_soiled_ratio != null
            ? s.fit_soiled_ratio >= 3.0
              ? { text: 'HEALTHY', color: theme.green }
              : { text: 'BELOW TARGET', color: theme.red }
            : null
          }
        />
        <KPICard
          label="Annual Penalty Exposure"
          value={s.annual_penalty_exposure != null ? formatPKR(s.annual_penalty_exposure) : '--'}
          suffix="PKR"
          icon={AlertTriangle}
          color={theme.red}
          badge={s.annual_penalty_exposure != null
            ? s.annual_penalty_exposure > 100e6
              ? { text: 'HIGH RISK', color: theme.red }
              : { text: 'MANAGEABLE', color: theme.green }
            : null
          }
        />
        <KPICard
          label="Branches at Risk"
          value={s.branches_at_risk != null ? s.branches_at_risk : '--'}
          suffix={`of ${s.total_branches || 1547}`}
          icon={Layers}
          color={(s.branches_at_risk || 0) > 50 ? theme.red : theme.gold}
        />
        <KPICard
          label="Optimization Potential"
          value={s.optimization_potential != null ? `${s.optimization_potential.toFixed(1)}` : '--'}
          suffix="%"
          icon={TrendingUp}
          color={theme.gold}
          badge={s.optimization_potential != null
            ? s.optimization_potential > 15
              ? { text: 'HIGH OPPORTUNITY', color: theme.gold }
              : { text: 'MODERATE', color: theme.teal }
            : null
          }
        />
      </div>

      {/* Scenario selector + Action buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'center',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
            fontWeight: 600,
          }}>
            SCENARIO:
          </span>
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              color: theme.text,
              fontFamily: theme.font,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="normal">Normal</option>
            <option value="eid">Eid</option>
            <option value="ramadan">Ramadan</option>
          </select>
        </div>

        <button
          onClick={handleOptimize}
          disabled={isDenomOptimizing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.teal}60`,
            backgroundColor: theme.teal + '15',
            color: theme.teal,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isDenomOptimizing ? 'not-allowed' : 'pointer',
            opacity: isDenomOptimizing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isDenomOptimizing ? 'Running NSGA-II...' : 'Run NSGA-II Optimizer'}
        </button>

        <button
          onClick={handleHeatmap}
          disabled={isHeatmapLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.gold}60`,
            backgroundColor: theme.gold + '15',
            color: theme.gold,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isHeatmapLoading ? 'not-allowed' : 'pointer',
            opacity: isHeatmapLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isHeatmapLoading ? 'Loading Heatmap...' : 'View Penalty Heatmap'}
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

      {/* NSGA-II Optimization Results */}
      {denomOptimal && (denomOptimal.pareto_frontier || denomOptimal.pareto_solutions) && (
        <div style={{ marginBottom: '16px' }}>
          {/* Summary metrics */}
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
              NSGA-II OPTIMIZATION RESULT
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
            }}>
              {optimal.total_solutions != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    PARETO SOLUTIONS
                  </div>
                  <div style={{ color: theme.teal, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {optimal.total_solutions}
                  </div>
                </div>
              )}
              {optimal.best_mismatch_cost != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    BEST MISMATCH COST
                  </div>
                  <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatPKR(optimal.best_mismatch_cost)} PKR
                  </div>
                </div>
              )}
              {optimal.best_penalty_risk != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    BEST PENALTY RISK
                  </div>
                  <div style={{ color: theme.gold, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatPKR(optimal.best_penalty_risk)} PKR
                  </div>
                </div>
              )}
              {optimal.penalty_reduction_pct != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    PENALTY REDUCTION
                  </div>
                  <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {optimal.penalty_reduction_pct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pareto Scatter */}
          <ParetoScatter data={optimal.pareto_solutions} />
        </div>
      )}

      {/* Denomination Bars — Current vs Optimal */}
      <div style={{ marginBottom: '16px' }}>
        <DenominationBars
          current={s.current_allocation || optimal.current_allocation}
          optimal={optimal.recommended_allocation || optimal.knee_allocation}
        />
      </div>

      {/* Seasonal Overlay */}
      <div style={{ marginBottom: '16px' }}>
        <SeasonalOverlay data={optimal.seasonal_profiles || s.seasonal_profiles} />
      </div>

      {/* Penalty Heatmap */}
      {penaltyHeatmap && (
        <div style={{ marginBottom: '16px' }}>
          <PenaltyHeatmap data={
            (penaltyHeatmap.cities || penaltyHeatmap || []).map
              ? (penaltyHeatmap.cities || penaltyHeatmap).map(c => ({
                  ...c,
                  risk_score: c.risk_score ?? c.penalty_probability ?? 0,
                  branches_at_risk: c.branches_at_risk ?? c.branch_count ?? 0,
                  estimated_penalty: c.estimated_penalty ?? c.estimated_annual_penalty ?? 0,
                }))
              : penaltyHeatmap.cities || penaltyHeatmap
          } />
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

        {uc07AIBrief ? (
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
            {uc07AIBrief.content || uc07AIBrief.brief || uc07AIBrief.summary || (typeof uc07AIBrief === 'string' ? uc07AIBrief : JSON.stringify(uc07AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textSecondary,
            fontSize: '12px',
            fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for denomination mix optimization results.
          </div>
        )}
      </div>
    </div>
  )
}
