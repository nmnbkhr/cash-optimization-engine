import { useEffect, useState } from 'react'
import { Truck, MapPin, DollarSign, TrendingUp, Activity, Sparkles, AlertTriangle } from 'lucide-react'
import useAppStore from '../../stores/appStore'
import {
  fetchCITSummary, fetchFleetDashboard,
  runCITOptimize, runRouteComparison,
  runEmergencyReroute, fetchUC08AIBrief,
} from '../../hooks/useAPI'
import FleetDashboard from './FleetDashboard'
import RouteMapSVG from './RouteMapSVG'
import BeforeAfterComparison from './BeforeAfterComparison'
import formatPKR from '../../utils/formatPKR'

const theme = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  gold: '#d4a853',
  teal: '#2dd4bf',
  red: '#ef4444',
  green: '#10b981',
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

const formatNum = (val, decimals = 0) => {
  if (val == null) return '--'
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(0)}K`
  return val.toFixed(decimals)
}

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

export default function UC08Dashboard() {
  const {
    citSummary, setCITSummary,
    fleetDashboard, setFleetDashboard,
    citRoutes, setCITRoutes,
    routeComparison, setRouteComparison,
    emergencyResult, setEmergencyResult,
    uc08AIBrief, setUC08AIBrief,
    isCITOptimizing, setIsCITOptimizing,
    isRouteComparing, setIsRouteComparing,
    isEmergencyLoading, setIsEmergencyLoading,
    isAILoading, setIsAILoading,
  } = useAppStore()

  const [error, setError] = useState(null)
  const [selectedCity, setSelectedCity] = useState('')
  const [emergencyRouteId, setEmergencyRouteId] = useState('')
  const [emergencyFailedStop, setEmergencyFailedStop] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, fleetRes] = await Promise.allSettled([
          fetchCITSummary(),
          fetchFleetDashboard(),
        ])
        if (summaryRes.status === 'fulfilled') setCITSummary(summaryRes.value.data)
        if (fleetRes.status === 'fulfilled') setFleetDashboard(fleetRes.value.data)
      } catch (err) {
        console.error('Failed to load UC-08 data:', err)
      }
    }
    loadData()
  }, [setCITSummary, setFleetDashboard])

  const handleOptimize = async () => {
    setIsCITOptimizing(true)
    setError(null)
    try {
      const res = await runCITOptimize(selectedCity || undefined)
      const d = res.data || {}
      // Normalize backend field names
      setCITRoutes({
        ...d,
        total_routes: d.total_routes ?? (d.routes ? d.routes.length : null),
        total_cost: d.total_cost ?? d.total_cost_pkr ?? null,
        total_distance_km: d.total_distance_km ?? null,
        vehicles_used: d.vehicles_used ?? null,
        routes: (d.routes || []).map(r => ({
          ...r,
          stops: r.stops || r.branch_sequence || r.branches || [],
        })),
      })
    } catch (err) {
      console.error('CIT route optimization failed:', err)
      setError('CIT route optimization failed. Check backend logs.')
    } finally {
      setIsCITOptimizing(false)
    }
  }

  const handleCompareRoutes = async () => {
    setIsRouteComparing(true)
    setError(null)
    try {
      const res = await runRouteComparison(selectedCity || undefined)
      const d = res.data || {}
      // Normalize current/optimized field names for BeforeAfterComparison
      const normalizeSide = (side) => {
        if (!side) return {}
        return {
          ...side,
          total_cost: side.total_cost ?? side.total_cost_pkr ?? 0,
          vehicles_used: side.vehicles_used ?? side.trip_count ?? 0,
          total_distance_km: side.total_distance_km ?? 0,
          avg_stops_per_route: side.avg_stops_per_route ?? side.avg_stops ?? 0,
        }
      }
      const normSavings = d.savings ? {
        distance_saved_km: d.savings.distance_saved_km ?? d.savings.distance_saving_km ?? 0,
        cost_saved: d.savings.cost_saved ?? d.savings.cost_saving_pkr ?? 0,
        vehicles_saved: d.savings.vehicles_saved ?? d.savings.route_reduction ?? 0,
      } : null
      setRouteComparison({
        ...d,
        current: normalizeSide(d.current),
        optimized: normalizeSide(d.optimized),
        savings: normSavings,
      })
    } catch (err) {
      console.error('Route comparison failed:', err)
      setError('Route comparison failed. Check backend logs.')
    } finally {
      setIsRouteComparing(false)
    }
  }

  const handleEmergencyReroute = async () => {
    if (!emergencyRouteId || emergencyFailedStop === '') {
      setError('Please enter Route ID and Failed Stop index.')
      return
    }
    setIsEmergencyLoading(true)
    setError(null)
    try {
      const res = await runEmergencyReroute(emergencyRouteId, parseInt(emergencyFailedStop))
      const d = res.data || {}
      // Normalize backend field names for the emergency result display
      setEmergencyResult({
        ...d,
        original_route_id: d.original_route_id ?? d.trip_id ?? emergencyRouteId,
        failed_stop: d.failed_stop ?? parseInt(emergencyFailedStop),
        reroute_distance_km: d.reroute_distance_km ?? d.additional_distance_km ?? 0,
        rerouted_stops: d.rerouted_stops ?? (d.new_route ? d.new_route.map((bid, i) => ({ branch_id: bid, name: bid })) : null),
      })
    } catch (err) {
      console.error('Emergency reroute failed:', err)
      setError('Emergency reroute simulation failed. Check backend logs.')
    } finally {
      setIsEmergencyLoading(false)
    }
  }

  const handleAIBrief = async () => {
    setIsAILoading(true)
    try {
      const res = await fetchUC08AIBrief()
      setUC08AIBrief(res.data)
    } catch (err) {
      console.error('UC-08 AI brief failed:', err)
    } finally {
      setIsAILoading(false)
    }
  }

  const raw = citSummary || {}
  // Normalize backend field names to what the frontend expects
  // Backend may return fleet_utilization as object {fleet_size, active_vehicles, utilization_pct}
  // or fleet_utilization_pct as a number (empty-data case)
  const fleetUtil = raw.fleet_utilization
  const utilizationPct = typeof raw.fleet_utilization_pct === 'number'
    ? raw.fleet_utilization_pct
    : (fleetUtil && typeof fleetUtil === 'object' ? fleetUtil.utilization_pct : null)
  const s = {
    ...raw,
    total_fleet_cost: raw.total_fleet_cost ?? raw.total_cost_pkr ?? null,
    avg_cost_per_trip: raw.avg_cost_per_trip ?? raw.avg_cost_per_trip_pkr ?? (raw.total_cost_pkr && raw.total_trips ? raw.total_cost_pkr / raw.total_trips : null),
    fleet_utilization_pct: utilizationPct,
    total_trips: raw.total_trips ?? null,
    total_distance_km: raw.total_distance_km ?? null,
  }

  const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot']

  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '4px',
        }}>
          <span style={{
            padding: '2px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: theme.font,
            backgroundColor: '#f9731620',
            color: '#f97316',
            border: '1px solid #f9731640',
          }}>
            UC-08
          </span>
          <h1 style={{
            color: theme.text,
            fontSize: '18px',
            fontWeight: 700,
            fontFamily: theme.font,
            margin: 0,
          }}>
            CIT Route Optimization
          </h1>
        </div>
        <p style={{
          color: theme.textSecondary,
          fontSize: '12px',
          fontFamily: theme.font,
          margin: 0,
        }}>
          VRPTW + Shapley Value -- 150 CIT Vehicles with Time Windows & Fair Cost Allocation
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
          label="Total Trips"
          value={s.total_trips != null ? formatNum(s.total_trips) : '--'}
          suffix="trips"
          icon={Truck}
          color={theme.teal}
        />
        <KPICard
          label="Total Distance"
          value={s.total_distance_km != null ? formatNum(s.total_distance_km) : '--'}
          suffix="km"
          icon={MapPin}
          color={theme.gold}
        />
        <KPICard
          label="Fleet Utilization"
          value={s.fleet_utilization_pct != null ? `${s.fleet_utilization_pct.toFixed(1)}` : '--'}
          suffix="%"
          icon={Activity}
          color={theme.green}
          badge={s.fleet_utilization_pct != null
            ? s.fleet_utilization_pct >= 75
              ? { text: 'OPTIMAL', color: theme.green }
              : { text: 'UNDERUTILIZED', color: theme.red }
            : null
          }
        />
        <KPICard
          label="Avg Cost / Trip"
          value={s.avg_cost_per_trip != null ? formatNum(s.avg_cost_per_trip) : '--'}
          suffix="PKR"
          icon={DollarSign}
          color={theme.text}
        />
        <KPICard
          label="Total Fleet Cost"
          value={s.total_fleet_cost != null ? formatNum(s.total_fleet_cost) : '--'}
          suffix="PKR"
          icon={TrendingUp}
          color={theme.red}
          badge={s.total_fleet_cost != null
            ? s.total_fleet_cost > 500e6
              ? { text: 'HIGH COST', color: theme.red }
              : { text: 'WITHIN BUDGET', color: theme.green }
            : null
          }
        />
      </div>

      {/* City Selector + Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
            fontWeight: 600,
          }}>
            CITY:
          </span>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              color: theme.text,
              fontFamily: theme.font,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Cities</option>
            {cities.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleOptimize}
          disabled={isCITOptimizing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.teal}60`,
            backgroundColor: theme.teal + '15',
            color: theme.teal,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isCITOptimizing ? 'not-allowed' : 'pointer',
            opacity: isCITOptimizing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isCITOptimizing ? 'Optimizing Routes...' : 'Optimize Routes'}
        </button>

        <button
          onClick={handleCompareRoutes}
          disabled={isRouteComparing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.gold}60`,
            backgroundColor: theme.gold + '15',
            color: theme.gold,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isRouteComparing ? 'not-allowed' : 'pointer',
            opacity: isRouteComparing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isRouteComparing ? 'Comparing...' : 'Compare Routes'}
        </button>
      </div>

      {/* Emergency Reroute Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            color: theme.textSecondary,
            fontSize: '11px',
            fontFamily: theme.font,
            fontWeight: 600,
          }}>
            EMERGENCY:
          </span>
          <input
            type="text"
            placeholder="Route ID"
            value={emergencyRouteId}
            onChange={(e) => setEmergencyRouteId(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              color: theme.text,
              fontFamily: theme.font,
              fontSize: '11px',
              width: '120px',
              outline: 'none',
            }}
          />
          <input
            type="number"
            placeholder="Failed Stop"
            value={emergencyFailedStop}
            onChange={(e) => setEmergencyFailedStop(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              color: theme.text,
              fontFamily: theme.font,
              fontSize: '11px',
              width: '100px',
              outline: 'none',
            }}
          />
        </div>

        <button
          onClick={handleEmergencyReroute}
          disabled={isEmergencyLoading}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: `1px solid ${theme.red}60`,
            backgroundColor: theme.red + '15',
            color: theme.red,
            fontFamily: theme.font,
            fontSize: '12px',
            fontWeight: 600,
            cursor: isEmergencyLoading ? 'not-allowed' : 'pointer',
            opacity: isEmergencyLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={12} />
            {isEmergencyLoading ? 'Simulating...' : 'Simulate Emergency'}
          </span>
        </button>
      </div>

      {error && (
        <div style={{
          padding: '8px 16px',
          marginBottom: '12px',
          backgroundColor: theme.red + '15',
          border: `1px solid ${theme.red}40`,
          borderRadius: '6px',
          color: theme.red,
          fontSize: '12px',
          fontFamily: theme.font,
        }}>
          {error}
        </div>
      )}

      {/* Optimized Routes Result */}
      {citRoutes && citRoutes.routes && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <div style={{
              color: theme.text,
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: theme.font,
              marginBottom: '12px',
            }}>
              VRPTW OPTIMIZATION RESULT
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
            }}>
              {citRoutes.total_routes != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    TOTAL ROUTES
                  </div>
                  <div style={{ color: theme.teal, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {citRoutes.total_routes}
                  </div>
                </div>
              )}
              {citRoutes.total_distance_km != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    TOTAL DISTANCE
                  </div>
                  <div style={{ color: theme.gold, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatNum(citRoutes.total_distance_km)} km
                  </div>
                </div>
              )}
              {citRoutes.total_cost != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    TOTAL COST
                  </div>
                  <div style={{ color: theme.green, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {formatNum(citRoutes.total_cost)} PKR
                  </div>
                </div>
              )}
              {citRoutes.vehicles_used != null && (
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                    VEHICLES USED
                  </div>
                  <div style={{ color: theme.text, fontSize: '18px', fontWeight: 700, fontFamily: theme.font }}>
                    {citRoutes.vehicles_used}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Route Map SVG */}
          <RouteMapSVG routes={citRoutes.routes} emergency={emergencyResult} />
        </div>
      )}

      {/* Route Comparison */}
      {routeComparison && (
        <div style={{ marginBottom: '16px' }}>
          <BeforeAfterComparison data={routeComparison} />
        </div>
      )}

      {/* Emergency Reroute Result */}
      {emergencyResult && (
        <div style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.red}40`,
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '16px',
        }}>
          <div style={{
            color: theme.red,
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: theme.font,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <AlertTriangle size={16} />
            EMERGENCY REROUTE RESULT
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}>
            {emergencyResult.original_route_id != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  ORIGINAL ROUTE
                </div>
                <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                  {typeof emergencyResult.original_route_id === 'object' ? JSON.stringify(emergencyResult.original_route_id) : emergencyResult.original_route_id}
                </div>
              </div>
            )}
            {emergencyResult.failed_stop != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  FAILED STOP
                </div>
                <div style={{ color: theme.red, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                  Stop #{emergencyResult.failed_stop}
                </div>
              </div>
            )}
            {emergencyResult.reroute_distance_km != null && (
              <div>
                <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '4px' }}>
                  REROUTE DISTANCE
                </div>
                <div style={{ color: theme.gold, fontSize: '14px', fontWeight: 700, fontFamily: theme.font }}>
                  {emergencyResult.reroute_distance_km.toFixed(1)} km
                </div>
              </div>
            )}
          </div>
          {emergencyResult.rerouted_stops && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ color: theme.textSecondary, fontSize: '10px', fontFamily: theme.font, marginBottom: '8px' }}>
                REROUTED STOPS
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {emergencyResult.rerouted_stops.map((stop, i) => (
                  <span key={i} style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: theme.font,
                    fontWeight: 600,
                    backgroundColor: i === emergencyResult.failed_stop ? theme.red + '30' : theme.teal + '20',
                    color: i === emergencyResult.failed_stop ? theme.red : theme.teal,
                    border: `1px solid ${i === emergencyResult.failed_stop ? theme.red : theme.teal}40`,
                  }}>
                    {stop.branch_id || stop.name || `Stop ${i}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fleet Dashboard */}
      {fleetDashboard && (
        <div style={{ marginBottom: '16px' }}>
          <FleetDashboard data={fleetDashboard} />
        </div>
      )}

      {/* AI Brief Section */}
      <div style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '20px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <div style={{
            color: theme.text,
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: theme.font,
          }}>
            AI EXECUTIVE BRIEF
          </div>
          <button
            onClick={handleAIBrief}
            disabled={isAILoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '6px',
              border: `1px solid ${theme.gold}60`,
              backgroundColor: theme.gold + '15',
              color: theme.gold,
              fontFamily: theme.font,
              fontSize: '11px',
              fontWeight: 600,
              cursor: isAILoading ? 'not-allowed' : 'pointer',
              opacity: isAILoading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            <Sparkles size={12} />
            {isAILoading ? 'Generating...' : 'Ask AI'}
          </button>
        </div>

        {uc08AIBrief ? (
          <div style={{
            padding: '16px',
            backgroundColor: '#0a0e17',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            color: theme.text,
            fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: '1.7',
            whiteSpace: 'pre-wrap',
          }}>
            {uc08AIBrief.content || uc08AIBrief.brief || uc08AIBrief.summary || (typeof uc08AIBrief === 'string' ? uc08AIBrief : JSON.stringify(uc08AIBrief))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textSecondary,
            fontSize: '12px',
            fontFamily: theme.font,
          }}>
            Click "Ask AI" to generate an executive brief for CIT route optimization results.
          </div>
        )}
      </div>
    </div>
  )
}
