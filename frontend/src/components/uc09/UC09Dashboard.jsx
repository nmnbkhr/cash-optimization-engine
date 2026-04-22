import { useEffect, useState } from 'react'
import { Smartphone, DollarSign, TrendingUp, Users, Zap, Sparkles, Target, BarChart3 } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchIncentiveSummary, fetchSegmentDashboard,
  runIncentiveOptimize, runEquilibrium, runROICalc,
  runABTest, fetchUC09AIBrief,
} from '../../hooks/useAPI'
import SegmentDashboard from './SegmentDashboard'
import ABSimulator from './ABSimulator'
import BudgetSankey from './BudgetSankey'
import ROICalculator from './ROICalculator'

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  gold: '#d4a853',
  teal: '#2dd4bf',
  red: '#ef4444',
  green: '#10b981',
  purple: '#a855f7',
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

const btnStyle = (color, disabled) => ({
  padding: '8px 20px',
  borderRadius: '6px',
  border: `1px solid ${color}60`,
  backgroundColor: color + '15',
  color: color,
  fontFamily: theme.font,
  fontSize: '12px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  transition: 'all 0.2s',
})

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

const SEGMENTS = ['Mass Retail', 'SME', 'Corporate', 'Premium', 'Rural']
const ARMS = ['Cashback 1%', 'Cashback 2%', 'Fee Waiver', 'Loyalty Points', 'Cash Voucher', 'No Incentive']

export default function UC09Dashboard() {
  const {
    incentiveSummary, setIncentiveSummary,
    segmentDashboard, setSegmentDashboard,
    incentiveOptimal, setIncentiveOptimal,
    equilibrium, setEquilibrium,
    roiResults, setROIResults,
    abTestResult, setABTestResult,
    uc09AIBrief, setUC09AIBrief,
    isIncentiveOptimizing, setIsIncentiveOptimizing,
    isEquilibriumLoading, setIsEquilibriumLoading,
    isROILoading, setIsROILoading,
    isABTestLoading, setIsABTestLoading,
    selectedSegment, setSelectedSegment,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [error, setError] = useState(null)
  const [abArmA, setAbArmA] = useState(ARMS[0])
  const [abArmB, setAbArmB] = useState(ARMS[1])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, segRes] = await Promise.allSettled([
          fetchIncentiveSummary(),
          fetchSegmentDashboard(),
        ])
        if (summaryRes.status === 'fulfilled') setIncentiveSummary(summaryRes.value.data)
        if (segRes.status === 'fulfilled') setSegmentDashboard(segRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-09 data:', err)
      }
    }
    loadData()
  }, [setIncentiveSummary, setSegmentDashboard])

  const handleOptimize = async () => {
    setIsIncentiveOptimizing(true)
    setError(null)
    try {
      const res = await runIncentiveOptimize()
      setIncentiveOptimal(res.data)
    } catch (err) {
      console.error('Thompson Sampling failed:', err)
      setError('Thompson Sampling optimization failed. Check backend logs.')
    } finally {
      setIsIncentiveOptimizing(false)
    }
  }

  const handleEquilibrium = async () => {
    setIsEquilibriumLoading(true)
    setError(null)
    try {
      const res = await runEquilibrium()
      setEquilibrium(res.data)
    } catch (err) {
      console.error('Equilibrium computation failed:', err)
      setError('Equilibrium computation failed. Check backend logs.')
    } finally {
      setIsEquilibriumLoading(false)
    }
  }

  const handleROI = async () => {
    setIsROILoading(true)
    setError(null)
    try {
      const res = await runROICalc()
      setROIResults(res.data)
    } catch (err) {
      console.error('ROI calculation failed:', err)
      setError('ROI calculation failed. Check backend logs.')
    } finally {
      setIsROILoading(false)
    }
  }

  const handleABTest = async () => {
    setIsABTestLoading(true)
    setError(null)
    try {
      const res = await runABTest(selectedSegment, abArmA, abArmB)
      setABTestResult(res.data)
    } catch (err) {
      console.error('A/B test failed:', err)
      setError('A/B test simulation failed. Check backend logs.')
    } finally {
      setIsABTestLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC09AIBrief()
      setUC09AIBrief(res.data)
    } catch (err) {
      console.error('UC-09 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  // Map nested API response to flat KPI values with fallbacks
  const raw = incentiveSummary || {}
  const s = {
    digital_adoption_pct: raw.digital_adoption_pct ?? raw.network?.current_digital_adoption_pct ?? null,
    budget_utilized: raw.budget_utilized ?? raw.budget?.allocated_pkr ?? null,
    total_budget: raw.total_budget ?? raw.budget?.annual_budget_pkr ?? null,
    expected_roi: raw.expected_roi ?? raw.roi?.overall_roi_pct ?? null,
    best_segment: raw.best_segment ?? (raw.segment_summary
      ? raw.segment_summary.reduce((best, seg) =>
          (seg.current_digital_pct ?? 0) > (best.current_digital_pct ?? 0) ? seg : best,
          raw.segment_summary[0] || {}
        ).segment
      : null) ?? null,
    avg_lift: raw.avg_lift ?? (raw.segment_summary
      ? raw.segment_summary.reduce((sum, seg) => sum + (seg.target_digital_pct ?? seg.current_digital_pct ?? 0) - (seg.current_digital_pct ?? 0), 0) / (raw.segment_summary.length || 1)
      : null) ?? null,
  }

  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <span style={{
            padding: '2px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: theme.font,
            backgroundColor: '#06b6d420',
            color: '#06b6d4',
            border: '1px solid #06b6d440',
          }}>
            UC-09
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            Digital Channel Incentivization
          </h1>
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          Thompson Sampling Bandit -- 5 Segments with Subgame Perfect Equilibrium
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
          label="Digital Adoption"
          value={s.digital_adoption_pct != null ? `${s.digital_adoption_pct.toFixed(1)}` : '--'}
          suffix="%"
          icon={Smartphone}
          color={theme.cyan}
          badge={s.digital_adoption_pct != null
            ? s.digital_adoption_pct >= 50
              ? { text: 'ABOVE TARGET', color: theme.green }
              : { text: 'BELOW TARGET', color: theme.red }
            : null
          }
        />
        <KPICard
          label="Budget Utilized"
          value={s.budget_utilized != null ? `${(s.budget_utilized / 1e6).toFixed(0)}M` : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.gold}
          badge={s.total_budget != null && s.budget_utilized != null
            ? { text: `${((s.budget_utilized / s.total_budget) * 100).toFixed(0)}% OF 500M`, color: theme.teal }
            : null
          }
        />
        <KPICard
          label="Expected ROI"
          value={s.expected_roi != null ? `${s.expected_roi.toFixed(1)}` : '--'}
          suffix="%"
          icon={TrendingUp}
          color={theme.green}
          badge={s.expected_roi != null
            ? s.expected_roi >= 100
              ? { text: 'STRONG', color: theme.green }
              : { text: 'MODERATE', color: theme.gold }
            : null
          }
        />
        <KPICard
          label="Best Segment"
          value={s.best_segment || '--'}
          icon={Users}
          color={theme.purple}
        />
        <KPICard
          label="Avg Lift"
          value={s.avg_lift != null ? `${s.avg_lift.toFixed(1)}` : '--'}
          suffix="%"
          icon={Zap}
          color={theme.cyan}
          badge={s.avg_lift != null
            ? s.avg_lift >= 15
              ? { text: 'HIGH IMPACT', color: theme.green }
              : { text: 'MODERATE', color: theme.gold }
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
        flexWrap: 'wrap',
      }}>
        <button onClick={handleOptimize} disabled={isIncentiveOptimizing} style={btnStyle(theme.cyan, isIncentiveOptimizing)}>
          {isIncentiveOptimizing ? 'Running Thompson Sampling...' : 'Run Thompson Sampling'}
        </button>
        <button onClick={handleEquilibrium} disabled={isEquilibriumLoading} style={btnStyle(theme.purple, isEquilibriumLoading)}>
          {isEquilibriumLoading ? 'Computing Equilibrium...' : 'Compute Equilibrium'}
        </button>
        <button onClick={handleROI} disabled={isROILoading} style={btnStyle(theme.green, isROILoading)}>
          {isROILoading ? 'Calculating ROI...' : 'Calculate ROI'}
        </button>
      </div>

      {/* A/B Test Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font, fontWeight: 600 }}>SEGMENT:</span>
          <select value={selectedSegment} onChange={(e) => setSelectedSegment(e.target.value)} style={{
            padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
            backgroundColor: theme.card, color: theme.text, fontFamily: theme.font, fontSize: '11px', fontWeight: 600, cursor: 'pointer', outline: 'none',
          }}>
            {SEGMENTS.map(seg => <option key={seg} value={seg}>{seg}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font, fontWeight: 600 }}>ARM A:</span>
          <select value={abArmA} onChange={(e) => setAbArmA(e.target.value)} style={{
            padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
            backgroundColor: theme.card, color: theme.text, fontFamily: theme.font, fontSize: '11px', fontWeight: 600, cursor: 'pointer', outline: 'none',
          }}>
            {ARMS.map(arm => <option key={arm} value={arm}>{arm}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '11px', fontFamily: theme.font, fontWeight: 600 }}>ARM B:</span>
          <select value={abArmB} onChange={(e) => setAbArmB(e.target.value)} style={{
            padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
            backgroundColor: theme.card, color: theme.text, fontFamily: theme.font, fontSize: '11px', fontWeight: 600, cursor: 'pointer', outline: 'none',
          }}>
            {ARMS.map(arm => <option key={arm} value={arm}>{arm}</option>)}
          </select>
        </div>
        <button onClick={handleABTest} disabled={isABTestLoading} style={btnStyle(theme.gold, isABTestLoading)}>
          {isABTestLoading ? 'Running A/B Test...' : 'Run A/B Test'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '8px 16px', marginBottom: '12px',
          backgroundColor: theme.red + '15', border: `1px solid ${theme.red}40`,
          borderRadius: '6px', color: theme.red, fontSize: '12px', fontFamily: theme.font,
        }}>
          {error}
        </div>
      )}

      {/* Thompson Sampling Results */}
      {incentiveOptimal && (() => {
        const opt = incentiveOptimal
        const nRounds = opt.iterations ?? opt.n_rounds ?? null
        const totalAllocated = opt.total_allocated_pkr ?? null
        const annualBudget = opt.annual_budget_pkr ?? null
        const nSegments = opt.n_segments ?? null
        const nArms = opt.n_arms ?? null
        // best_arm_per_segment is an object { segmentName: armName }
        const bestArmMap = opt.best_arm_per_segment || {}
        const expectedAdoption = opt.expected_adoption_pct || {}
        const budgetAlloc = opt.budget_allocation_pkr || {}
        const armFreqs = opt.arm_selection_frequencies || {}
        return (
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px', marginBottom: '16px',
        }}>
          <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font, marginBottom: '12px' }}>
            THOMPSON SAMPLING RESULT
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {nRounds != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>ROUNDS</div>
                <div style={{ color: theme.cyan, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>{Number(nRounds).toLocaleString()}</div>
              </div>
            )}
            {nSegments != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>SEGMENTS</div>
                <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>{nSegments}</div>
              </div>
            )}
            {nArms != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>ARMS</div>
                <div style={{ color: theme.gold, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>{nArms}</div>
              </div>
            )}
            {totalAllocated != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>TOTAL ALLOCATED</div>
                <div style={{ color: theme.purple, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                  {totalAllocated >= 1e6 ? `${(totalAllocated / 1e6).toFixed(1)}M` : `${(totalAllocated / 1e3).toFixed(0)}K`} PKR
                </div>
              </div>
            )}
          </div>
          {/* Best arm per segment */}
          {Object.keys(bestArmMap).length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '8px' }}>BEST ARM PER SEGMENT</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                {Object.entries(bestArmMap).map(([seg, arm], i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: '6px',
                    backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                  }}>
                    <div style={{ color: theme.text, fontSize: '11px', fontWeight: 600, fontFamily: theme.font, marginBottom: '4px' }}>
                      {String(seg).toUpperCase()}
                    </div>
                    <div style={{ color: theme.cyan, fontSize: '13px', fontWeight: 700, fontFamily: theme.font }}>
                      {String(arm)}
                    </div>
                    {expectedAdoption[seg] != null && (
                      <div style={{ color: theme.green, fontSize: '10px', fontFamily: theme.font, marginTop: '2px' }}>
                        Target: {Number(expectedAdoption[seg]).toFixed(1)}%
                      </div>
                    )}
                    {budgetAlloc[seg] != null && (
                      <div style={{ color: theme.gold, fontSize: '9px', fontFamily: theme.font }}>
                        Budget: {Number(budgetAlloc[seg]) >= 1e6 ? `${(Number(budgetAlloc[seg]) / 1e6).toFixed(1)}M` : `${(Number(budgetAlloc[seg]) / 1e3).toFixed(1)}K`} PKR
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* Equilibrium Results */}
      {equilibrium && (() => {
        const eq = equilibrium
        const eqTheory = eq.theory || 'Subgame Perfect Equilibrium'
        // segments is an object { segmentName: { switching_cost_pkr, equilibrium_incentive_pkr, bank_net_value_pkr, ... } }
        const eqSegments = eq.segments || {}
        const segEntries = Object.entries(eqSegments)
        return (
        <div style={{
          backgroundColor: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: '8px', padding: '20px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
              SUBGAME PERFECT EQUILIBRIUM
            </div>
            <span style={{
              padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
              fontFamily: theme.font, backgroundColor: theme.purple + '20', color: theme.purple,
              border: `1px solid ${theme.purple}40`,
            }}>
              {eqTheory}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>SEGMENTS ANALYZED</div>
              <div style={{ color: theme.purple, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                {segEntries.length}
              </div>
            </div>
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>TOTAL NET VALUE / MONTH</div>
              <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                {segEntries.reduce((sum, [, v]) => sum + (Number(v.bank_net_value_pkr) || 0), 0).toLocaleString()} PKR
              </div>
            </div>
          </div>
          {segEntries.length > 0 && (
            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {segEntries.map(([segName, segData], i) => (
                <div key={i} style={{
                  padding: '12px', borderRadius: '6px',
                  backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                }}>
                  <div style={{ color: theme.text, fontSize: '11px', fontWeight: 700, fontFamily: theme.font, marginBottom: '6px' }}>
                    {segName.toUpperCase()}
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>
                    Switching Cost: <span style={{ color: theme.gold }}>{Number(segData.switching_cost_pkr || 0).toLocaleString()} PKR</span>
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>
                    Equilibrium Incentive: <span style={{ color: theme.cyan }}>{Number(segData.equilibrium_incentive_pkr || 0).toLocaleString()} PKR</span>
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginBottom: '2px' }}>
                    Bank Net Value: <span style={{ color: (segData.bank_net_value_pkr || 0) >= 0 ? theme.green : theme.red }}>{Number(segData.bank_net_value_pkr || 0).toLocaleString()} PKR/mo</span>
                  </div>
                  {segData.interpretation && (
                    <div style={{ color: theme.textSecondary, fontSize: '9px', fontFamily: theme.font, marginTop: '4px', fontStyle: 'italic' }}>
                      {String(segData.interpretation)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )
      })()}

      {/* Segment Dashboard */}
      <div style={{ marginBottom: '16px' }}>
        <SegmentDashboard data={segmentDashboard} />
      </div>

      {/* Budget Sankey */}
      <div style={{ marginBottom: '16px' }}>
        <BudgetSankey data={incentiveOptimal || incentiveSummary} />
      </div>

      {/* A/B Test Results */}
      {abTestResult && (
        <div style={{ marginBottom: '16px' }}>
          <ABSimulator data={abTestResult} />
        </div>
      )}

      {/* ROI Results */}
      {roiResults && (
        <div style={{ marginBottom: '16px' }}>
          <ROICalculator data={roiResults} />
        </div>
      )}

      {/* AI Brief section */}
      <div style={{
        backgroundColor: theme.card, border: `1px solid ${theme.border}`,
        borderRadius: '8px', padding: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
            AI EXECUTIVE BRIEF
          </div>
          <button onClick={handleAIBrief} disabled={isAILoading} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 16px', borderRadius: '6px',
            border: `1px solid ${theme.gold}60`, backgroundColor: theme.gold + '15',
            color: theme.gold, fontFamily: theme.font, fontSize: '11px', fontWeight: 600,
            cursor: isAILoading ? 'not-allowed' : 'pointer', opacity: isAILoading ? 0.6 : 1, transition: 'all 0.2s',
          }}>
            <Sparkles size={12} />
            {isAILoading ? 'Generating...' : 'Ask AI'}
          </button>
        </div>
        {uc09AIBrief ? (
          <div style={{
            padding: '16px', backgroundColor: '#0a0e17', border: `1px solid ${theme.border}`,
            borderRadius: '6px', color: theme.text, fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif", lineHeight: '1.7', whiteSpace: 'pre-wrap',
          }}>
            {typeof uc09AIBrief === 'string' ? uc09AIBrief : (uc09AIBrief.summary || uc09AIBrief.content || uc09AIBrief.brief || JSON.stringify(uc09AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px', textAlign: 'center', color: theme.textSecondary, fontSize: '12px', fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for digital channel incentivization results.
          </div>
        )}
      </div>
    </div>
  )
}
