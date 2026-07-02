/**
 * Format a PKR value for display.
 * UC service APIs return raw PKR, dashboard APIs return PKR Millions.
 * This formatter auto-detects scale and formats with T/B/M/K suffix.
 */
export default function formatPKR(val) {
  if (val == null || isNaN(val)) return '--'
  const abs = Math.abs(val)
  if (abs >= 1e12) return `${(val / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}K`
  return val.toFixed(0)
}

/**
 * Format a PKR value that is ALREADY expressed in Millions.
 * All /api/business/* endpoints return money in PKR Millions (e.g. 146299 = 146.3 B).
 * Use this on business pages; use formatPKR() only for raw-PKR fields (/api/branches, UC APIs).
 */
export function formatPKRM(millions) {
  if (millions == null || isNaN(millions)) return '--'
  return formatPKR(millions * 1e6)
}

/**
 * Format a chart Y-axis value that is ALREADY expressed in Millions.
 */
export function formatYAxisM(millions) {
  if (millions == null || isNaN(millions)) return ''
  return formatYAxis(millions * 1e6)
}

/**
 * Format Y-axis values for charts.
 */
export function formatYAxis(v) {
  if (v == null) return ''
  const abs = Math.abs(v)
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${(v / 1e9).toFixed(0)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return v
}
