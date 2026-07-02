import { useState, useEffect } from 'react'
import axios from 'axios'
import useAppStore from '../stores/appStore'
import Badge from './common/Badge'
import Metric from './common/Metric'
import ProgressBar from './common/ProgressBar'
import ConstitutionBadge from './common/ConstitutionBadge'
import formatPKR from '../utils/formatPKR'

const bandColor = (b) => (b >= 70 ? '#ef4444' : b >= 50 ? '#f97316' : '#d4a853')

/* "Why this forecast" — top-3 SHAP drivers, band, constitution status (Phase 5) */
function ForecastExplain({ branchId }) {
  const [ov, setOv] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (!branchId) return
    setState('loading')
    axios.get(`http://localhost:8000/api/uc01/branch-oversight/${branchId}`)
      .then(r => { setOv(r.data); setState('ok') })
      .catch(() => setState('error'))
  }, [branchId])

  if (state === 'loading') return <div style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>Loading forecast explanation…</div>
  if (state === 'error' || !ov || ov.h1_predicted_m == null) return null

  const band = ov.h1_band_pct
  const con = ov.constitution
  return (
    <div className="mt-4 rounded-lg p-4 border" style={{ backgroundColor: '#0f1419', borderColor: '#1e293b' }}>
      <div className="flex items-center justify-between mb-3">
        <h4 style={{ color: '#d4a853', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Why this forecast
        </h4>
        <span style={{ color: '#64748b', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
          {ov.model_version}
        </span>
      </div>

      {/* predicted + band */}
      <div className="flex items-baseline gap-3 mb-3">
        <span style={{ color: '#e8eaed', fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          PKR {Number(ov.h1_predicted_m).toFixed(1)} M
        </span>
        <span style={{ color: '#8b949e', fontSize: 12 }}>tomorrow's managed level</span>
        <span style={{ marginLeft: 'auto', color: bandColor(band), fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          ±{Math.round(band)}% band
        </span>
      </div>

      {/* top-3 signed drivers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {(ov.drivers || []).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 70, color: d.direction === 'up' ? '#22c55e' : '#ef4444', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}>
              {d.contribution_m >= 0 ? '+' : ''}{Number(d.contribution_m).toFixed(1)}M
            </span>
            <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(d.pct, 100)}%`, height: '100%', background: '#d4a853' }} />
            </div>
            <span style={{ width: 44, textAlign: 'right', color: '#64748b', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{d.pct}%</span>
            <span style={{ width: 130, color: '#c9d1d9', fontSize: 12 }}>{d.label}</span>
          </div>
        ))}
      </div>

      {/* constitution status on the current vault position */}
      {con && (
        <div className="pt-3" style={{ borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ConstitutionBadge status={con.status} violations={con.violations || []} />
          <span style={{ color: '#64748b', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            vault {Number(con.current_vault_m).toFixed(0)}M · insured max {Number(con.insured_limit_m).toFixed(0)}M · min {Number(con.vault_min_m).toFixed(0)}M
          </span>
        </div>
      )}
      <p style={{ color: '#475569', fontSize: 10, marginTop: 10 }}>
        Drivers are SHAP contributions of the frozen T3 model; band is the conformal interval; constitution checks the live vault position.
      </p>
    </div>
  )
}

export default function BranchDetail() {
  const selectedBranch = useAppStore((s) => s.selectedBranch)

  if (!selectedBranch) {
    return (
      <div
        className="rounded-lg p-6 border text-center"
        style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
      >
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Select a branch from the list to view details.
        </p>
      </div>
    )
  }

  const b = selectedBranch
  // Tolerate either field-naming convention (API sends *_vault_balance / cash_efficiency_score).
  const currentBal = b.current_vault_balance ?? b.current_balance ?? null
  const optimalBal = b.optimal_vault_balance ?? b.optimal_balance ?? null
  const cesRaw = b.cash_efficiency_score ?? b.ces_score ?? 0
  const cesScore = cesRaw <= 1 ? cesRaw * 100 : cesRaw   // stored 0–1, shown as %
  const idleCash = b.idle_cash ?? 0
  const annualSavings = idleCash > 0 ? (idleCash * 0.11) : 0


  const metrics = [
    { value: b.vault_capacity ? formatPKR(b.vault_capacity) : '--', label: 'Vault Capacity', color: '#3b82f6' },
    { value: currentBal != null ? formatPKR(currentBal) : '--', label: 'Current Balance', color: '#e8eaed' },
    { value: optimalBal != null ? formatPKR(optimalBal) : '--', label: 'Optimal Balance', color: '#22c55e' },
    { value: idleCash ? formatPKR(idleCash) : '--', label: 'Idle Cash', color: idleCash > 0 ? '#ef4444' : '#22c55e' },
    { value: `${cesScore.toFixed(1)}%`, label: 'CES Score', color: '#d4a853' },
    { value: annualSavings > 0 ? `PKR ${formatPKR(annualSavings)}` : '--', label: 'Annual Savings', color: '#22c55e' },
  ]

  return (
    <div
      className="rounded-lg p-5 border"
      style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold" style={{ color: '#e8eaed' }}>
            {b.name || b.branch_id}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-xs"
              style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {b.branch_id}
            </span>
            <span className="text-xs" style={{ color: '#6b7280' }}>&middot;</span>
            <span className="text-xs" style={{ color: '#8b949e' }}>{b.city}</span>
            <Badge
              label={typeof b.branch_type === 'object' ? JSON.stringify(b.branch_type) : (b.branch_type || 'Unknown')}
              color={
                String(b.branch_type) === 'Surplus' ? '#22c55e'
                  : String(b.branch_type) === 'Deficit' ? '#ef4444'
                  : String(b.branch_type) === 'Hub' ? '#3b82f6'
                  : '#d4a853'
              }
            />
          </div>
        </div>
      </div>

      {/* Manager */}
      {b.manager_name && (
        <p className="text-xs mb-4" style={{ color: '#8b949e' }}>
          Manager: {b.manager_name}
        </p>
      )}

      {/* Metrics grid - 6 items in 3 columns */}
      <div
        className="grid grid-cols-3 gap-3 p-4 rounded-lg"
        style={{ backgroundColor: '#0f1419' }}
      >
        {metrics.map((m, i) => (
          <Metric key={i} value={m.value} label={m.label} color={m.color} />
        ))}
      </div>

      {/* Phase 5: per-branch explainability + oversight */}
      <ForecastExplain branchId={b.branch_id} />
    </div>
  )
}
