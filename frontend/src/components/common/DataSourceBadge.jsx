/*
 * DataSourceBadge — shows a panel's data lineage + freshness inline, so staleness is
 * never hidden. Pass the `lineage` block any reconciled endpoint returns:
 *   { data_source, as_of, period_start, period_end, branches, transactions_in_period }
 * Green = reads the latest ledger slice; amber if a `stale` flag is set.
 */
export default function DataSourceBadge({ lineage, compact = false }) {
  if (!lineage) return null
  const stale = lineage.stale === true || lineage.is_latest_slice === false
  const color = stale ? '#f59e0b' : '#10b981'
  const period = lineage.period_start && lineage.period_end
    ? `${lineage.period_start} → ${lineage.period_end}`
    : lineage.as_of
  const txns = lineage.transactions_in_period
    ? ` · ${Number(lineage.transactions_in_period).toLocaleString()} txns`
    : ''
  return (
    <span
      title={`${lineage.data_source}\nperiod: ${period}${txns}\n${lineage.treatment || ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: color + '14', color, border: `1px solid ${color}44`,
        borderRadius: 6, padding: compact ? '2px 7px' : '3px 9px',
        fontSize: compact ? 9 : 10, fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {stale ? 'STALE' : 'LIVE'} · {lineage.data_source?.split(' ')[0] || 'reconciled'} · as-of {lineage.as_of}
    </span>
  )
}
