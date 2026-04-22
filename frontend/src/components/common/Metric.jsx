export default function Metric({ value, label, color = '#d4a853' }) {
  return (
    <div className="text-center">
      <p
        className="text-xl font-bold"
        style={{
          color,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {value}
      </p>
      <p
        className="text-xs mt-1"
        style={{
          color: '#8b949e',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {label}
      </p>
    </div>
  )
}
