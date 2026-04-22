export default function ProgressBar({
  value = 0,
  max = 100,
  color = '#d4a853',
  height = 6,
  label,
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div>
      {label && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs" style={{ color: '#8b949e' }}>
            {label}
          </span>
          <span
            className="text-xs font-mono"
            style={{ color }}
          >
            {pct.toFixed(0)}%
          </span>
        </div>
      )}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ backgroundColor: '#1e293b', height }}
      >
        <div
          className="rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}
