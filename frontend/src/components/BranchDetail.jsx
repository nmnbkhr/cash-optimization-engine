import useAppStore from '../stores/appStore'
import Badge from './common/Badge'
import Metric from './common/Metric'
import ProgressBar from './common/ProgressBar'
import formatPKR from '../utils/formatPKR'

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
  const cesScore = b.ces_score ?? 0
  const idleCash = b.idle_cash ?? 0
  const annualSavings = idleCash > 0 ? (idleCash * 0.11) : 0


  const metrics = [
    { value: b.vault_capacity ? formatPKR(b.vault_capacity) : '--', label: 'Vault Capacity', color: '#3b82f6' },
    { value: b.current_balance ? formatPKR(b.current_balance) : '--', label: 'Current Balance', color: '#e8eaed' },
    { value: b.optimal_balance ? formatPKR(b.optimal_balance) : '--', label: 'Optimal Balance', color: '#22c55e' },
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
    </div>
  )
}
