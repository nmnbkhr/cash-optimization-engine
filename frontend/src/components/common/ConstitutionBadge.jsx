/*
 * ConstitutionBadge — renders the Cash Constitution critique() result on a recommendation.
 *   CLEAR     -> green  "✓ Passes constitution"
 *   ANNOTATED -> gold   "● Soft-annotated"  (+ soft rules)
 *   BLOCKED   -> red    "⛔ BLOCKED — not actionable"  (+ hard rule + breach magnitude)
 * A blocked recommendation must never read as actionable; the badge makes that explicit.
 */
const C = {
  CLEAR: { color: '#22c55e', label: '✓ Passes constitution' },
  ANNOTATED: { color: '#d4a853', label: '● Soft-annotated' },
  BLOCKED: { color: '#ef4444', label: '⛔ BLOCKED — not actionable' },
}

export default function ConstitutionBadge({ status, violations = [], compact = false }) {
  const meta = C[status] || { color: '#64748b', label: status || 'unknown' }
  const hard = violations.filter(v => v.severity === 'hard')
  const soft = violations.filter(v => v.severity === 'soft')

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: meta.color + '22', color: meta.color,
        border: `1px solid ${meta.color}55`, borderRadius: 6,
        padding: compact ? '2px 8px' : '4px 10px',
        fontSize: compact ? 11 : 12, fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
      }}>
        {meta.label}
      </span>
      {!compact && (hard.length > 0 || soft.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {hard.map((v, i) => (
            <span key={`h${i}`} style={{ color: '#ef4444', fontSize: 11, lineHeight: 1.4 }}>
              • {v.rule}
              {v.breach_magnitude_m != null && (
                <span style={{ color: '#fca5a5' }}> — over by {Number(v.breach_magnitude_m).toFixed(1)} M</span>
              )}
            </span>
          ))}
          {soft.map((v, i) => (
            <span key={`s${i}`} style={{ color: '#d4a853', fontSize: 11, lineHeight: 1.4 }}>
              • {v.rule}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
