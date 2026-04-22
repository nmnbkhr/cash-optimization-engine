export default function KPIStrip({ metrics = [] }) {
  return (
    <div
      className="flex gap-3 p-3 rounded-lg overflow-x-auto"
      style={{ backgroundColor: '#0f1419' }}
    >
      {metrics.map((m, i) => (
        <div
          key={i}
          className="flex-1 min-w-[120px] text-center px-4 py-3 rounded-lg"
          style={{ backgroundColor: '#141a23', border: '1px solid #1e293b' }}
        >
          <p
            className="text-lg font-bold"
            style={{
              color: m.color || '#d4a853',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {m.value}
            {m.suffix && (
              <span className="text-xs ml-1" style={{ color: '#6b7280' }}>
                {m.suffix}
              </span>
            )}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: '#8b949e', fontFamily: "'DM Sans', sans-serif" }}
          >
            {m.label}
          </p>
        </div>
      ))}
    </div>
  )
}
