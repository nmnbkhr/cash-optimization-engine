export default function Badge({ label, color = '#6b7280' }) {
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: color + '15',
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  )
}
