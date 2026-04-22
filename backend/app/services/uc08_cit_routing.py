"""
UC-08: CIT Route Optimization
==============================
Optimizes Cash-in-Transit routes across UBL's branch network using VRPTW.

Classes:
    CITRouteOptimizer  - VRPTW solver (greedy NN + 2-opt, OR-Tools optional)
    EmergencyRerouter  - Emergency stop insertion with cost/delay estimation
Functions:
    get_cit_summary, get_fleet_dashboard, get_route_comparison
"""
import logging, datetime, random
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import (
    CIT_COST_PER_TRIP, CIT_COST_PER_KM, CIT_EMERGENCY_COST,
    CIT_MAX_VALUE_PER_TRIP, CIT_MAX_STOPS, CIT_FLEET_SIZE,
)
from app.core.game_theory import shapley_value
from app.models.cit_trip import CITTrip
from app.models.branch import Branch

logger = logging.getLogger(__name__)

_MAX_BRANCHES = 50
_DEFAULT_CITY = "Karachi"
_SVC_TIME_H = 0.5          # 30 min service per stop
_WIN_OPEN, _WIN_CLOSE = 9.0, 17.0
_AVG_SPEED = 30.0          # km/h city driving
_SHAPLEY_PERMS = 100
_ORTOOLS_TIMEOUT = 10
_SEED = 42


def _py(v):
    """Convert numpy types for JSON serialization."""
    if isinstance(v, (np.integer,)):   return int(v)
    if isinstance(v, (np.floating,)):  return float(v)
    if isinstance(v, np.ndarray):      return v.tolist()
    if isinstance(v, dict):            return {k: _py(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):   return [_py(x) for x in v]
    return v


def _div(a, b, d=0.0):
    return a / b if b else d


def _haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/lng points."""
    R = 6371.0
    r1, r2 = radians(lat1), radians(lat2)
    dl, dn = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dl / 2) ** 2 + cos(r1) * cos(r2) * sin(dn / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _dist_matrix(branches):
    n = len(branches)
    d = np.zeros((n, n))
    lats = [b.latitude or 0.0 for b in branches]
    lngs = [b.longitude or 0.0 for b in branches]
    for i in range(n):
        for j in range(i + 1, n):
            v = _haversine(lats[i], lngs[i], lats[j], lngs[j])
            d[i, j] = d[j, i] = v
    return d


def _rdist(route, dm):
    if len(route) < 2: return 0.0
    return sum(dm[route[i], route[i + 1]] for i in range(len(route) - 1))


def _cost(dist_km, emergency=False):
    return (CIT_EMERGENCY_COST if emergency else CIT_COST_PER_TRIP) + CIT_COST_PER_KM * dist_km


def _duration(dist_km, stops):
    return dist_km / _AVG_SPEED + stops * _SVC_TIME_H if _AVG_SPEED else stops * _SVC_TIME_H


# ---------------------------------------------------------------------------
# Greedy nearest-neighbor + 2-opt
# ---------------------------------------------------------------------------
def _greedy_nn(dm, demands, depot=0):
    """Build routes via nearest-neighbor with capacity/stop/time constraints."""
    n = dm.shape[0]
    visited, routes = {depot}, []
    unvisited = set(range(n)) - visited
    window = _WIN_CLOSE - _WIN_OPEN

    while unvisited:
        route, load, stops, cur = [depot], 0.0, 0, depot
        while unvisited and stops < CIT_MAX_STOPS:
            best, bd = None, float("inf")
            for nd in unvisited:
                if load + demands[nd] > CIT_MAX_VALUE_PER_TRIP:
                    continue
                d = dm[cur, nd]
                if _duration(_rdist(route, dm) + d, stops + 1) > window:
                    continue
                if d < bd:
                    bd, best = d, nd
            if best is None:
                break
            route.append(best); load += demands[best]; stops += 1
            visited.add(best); unvisited.remove(best); cur = best

        route.append(depot)
        if len(route) > 2:
            routes.append(route)
        elif unvisited:
            forced = min(unvisited, key=lambda nd: dm[depot, nd])
            routes.append([depot, forced, depot])
            visited.add(forced); unvisited.remove(forced)
    return routes


def _two_opt(route, dm, iters=100):
    if len(route) <= 4: return route
    best, bd = route[:], _rdist(route, dm)
    for _ in range(iters):
        improved = False
        for i in range(1, len(best) - 2):
            for j in range(i + 1, len(best) - 1):
                c = best[:i] + best[i:j + 1][::-1] + best[j + 1:]
                cd = _rdist(c, dm)
                if cd < bd - 1e-6:
                    best, bd, improved = c, cd, True; break
            if improved: break
        if not improved: break
    return best


# ---------------------------------------------------------------------------
# OR-Tools VRPTW (optional)
# ---------------------------------------------------------------------------
def _solve_ortools(dm, demands, n_vehicles, depot=0):
    try:
        from ortools.constraint_solver import routing_enums_pb2, pywrapcp
    except ImportError:
        return None
    try:
        n = dm.shape[0]
        idm = (dm * 1000).astype(int)
        mgr = pywrapcp.RoutingIndexManager(n, n_vehicles, depot)
        model = pywrapcp.RoutingModel(mgr)

        def dist_cb(fi, ti):
            return idm[mgr.IndexToNode(fi)][mgr.IndexToNode(ti)]
        model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback(dist_cb))

        def dem_cb(fi):
            return int(demands[mgr.IndexToNode(fi)])
        model.AddDimensionWithVehicleCapacity(
            model.RegisterUnaryTransitCallback(dem_cb), 0,
            [int(CIT_MAX_VALUE_PER_TRIP)] * n_vehicles, True, "Cap")

        def cnt_cb(fi):
            return 0 if mgr.IndexToNode(fi) == depot else 1
        model.AddDimensionWithVehicleCapacity(
            model.RegisterUnaryTransitCallback(cnt_cb), 0,
            [CIT_MAX_STOPS] * n_vehicles, True, "Stops")

        def time_cb(fi, ti):
            fn, tn = mgr.IndexToNode(fi), mgr.IndexToNode(ti)
            t = int(dm[fn][tn] / _AVG_SPEED * 60)
            return t + (0 if tn == depot else int(_SVC_TIME_H * 60))
        wm = int((_WIN_CLOSE - _WIN_OPEN) * 60)
        model.AddDimension(model.RegisterTransitCallback(time_cb), 30, wm, False, "Time")
        td = model.GetDimensionOrDie("Time")
        for i in range(n):
            td.CumulVar(mgr.NodeToIndex(i)).SetRange(0, wm)

        sp = pywrapcp.DefaultRoutingSearchParameters()
        sp.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        sp.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        sp.time_limit.seconds = _ORTOOLS_TIMEOUT

        sol = model.SolveWithParameters(sp)
        if not sol: return None
        routes = []
        for vid in range(n_vehicles):
            idx, r = model.Start(vid), []
            while not model.IsEnd(idx):
                r.append(mgr.IndexToNode(idx)); idx = sol.Value(model.NextVar(idx))
            r.append(mgr.IndexToNode(idx))
            if len(r) > 2: routes.append(r)
        return routes
    except Exception as e:
        logger.warning("OR-Tools failed: %s", e); return None


# ---------------------------------------------------------------------------
# CITRouteOptimizer
# ---------------------------------------------------------------------------
class CITRouteOptimizer:
    """150 vehicles, VRPTW. Capacity PKR 100M, 12 stops max. ALL LOCAL."""

    def optimize_routes(self, db: Session, city: Optional[str] = None,
                        use_ortools: bool = True) -> Dict[str, Any]:
        try:
            tc = city or _DEFAULT_CITY
            branches = db.query(Branch).filter(
                Branch.city == tc, Branch.latitude.isnot(None), Branch.longitude.isnot(None)
            ).limit(_MAX_BRANCHES).all()
            if len(branches) < 2:
                return {"city": tc, "error": f"<2 branches in {tc}",
                        "routes": [], "total_distance_km": 0, "total_cost_pkr": 0, "vehicles_used": 0}

            dm = _dist_matrix(branches)
            demands = np.array([b.current_vault_balance or 0.0 for b in branches])
            demands[0] = 0.0
            n = len(branches)
            nv = min(CIT_FLEET_SIZE, max(1, n // 3))

            raw, solver = None, "greedy_nn_2opt"
            if use_ortools:
                raw = _solve_ortools(dm, demands, nv)
                if raw: solver = "ortools_vrptw"
            if raw is None:
                raw = _greedy_nn(dm, demands); solver = "greedy_nn_2opt"
                raw = [_two_opt(r, dm) for r in raw]

            results, td, tc_cost, tv = [], 0.0, 0.0, 0.0
            for idx, route in enumerate(raw):
                stops = [i for i in route if i != 0]
                if not stops: continue
                dist = _rdist(route, dm)
                val = sum(demands[i] for i in stops)
                c = _cost(dist); dur = _duration(dist, len(stops))
                results.append({
                    "route_index": idx, "vehicle_id": f"CIT-{idx+1:03d}",
                    "num_stops": len(stops), "distance_km": round(dist, 2),
                    "cost_pkr": round(c, 2), "value_carried_pkr": round(float(val), 2),
                    "duration_hours": round(dur, 2),
                    "branch_sequence": [
                        {"branch_id": branches[i].branch_id, "branch_name": branches[i].name,
                         "latitude": branches[i].latitude, "longitude": branches[i].longitude,
                         "value_pickup": round(float(demands[i]), 2)} for i in stops],
                    "time_window": f"{int(_WIN_OPEN)}:00 - {int(_WIN_CLOSE)}:00",
                })
                td += dist; tc_cost += c; tv += val

            nr = len(results)
            return _py({
                "city": city or _DEFAULT_CITY, "solver": solver, "branches_count": n,
                "vehicles_used": nr, "fleet_size": CIT_FLEET_SIZE,
                "fleet_utilization_pct": round(nr / CIT_FLEET_SIZE * 100, 2),
                "total_distance_km": round(td, 2), "total_cost_pkr": round(tc_cost, 2),
                "total_value_carried_pkr": round(float(tv), 2),
                "avg_stops_per_route": round(_div(sum(r["num_stops"] for r in results), nr), 1),
                "avg_distance_per_route_km": round(_div(td, nr), 2),
                "constraints": {"max_value_per_trip": CIT_MAX_VALUE_PER_TRIP,
                                "max_stops_per_trip": CIT_MAX_STOPS,
                                "time_window": f"{int(_WIN_OPEN)}:00 - {int(_WIN_CLOSE)}:00",
                                "service_time_min": int(_SVC_TIME_H * 60)},
                "routes": results, "optimization_date": datetime.date.today().isoformat(),
            })
        except Exception as e:
            logger.error("optimize_routes: %s", e, exc_info=True)
            return {"error": str(e), "city": city, "routes": []}

    def compute_cost_allocation(self, routes: List[Dict],
                                branches: List[Branch]) -> Dict[str, Any]:
        """Shapley-value cost allocation. Exact for <=5 stops, sampled otherwise."""
        try:
            bmap = {b.branch_id: b for b in branches}
            allocs = []
            for ri in routes:
                seq = ri.get("branch_sequence", [])
                rc = ri.get("cost_pkr", 0.0)
                bids = [s["branch_id"] for s in seq]
                np_ = len(bids)
                if not np_: continue

                if np_ == 1:
                    allocs.append({"route_index": ri.get("route_index", 0), "total_cost": round(rc, 2),
                                   "allocations": [{"branch_id": bids[0], "shapley_value": round(rc, 2),
                                                    "share_pct": 100.0}]})
                    continue

                sv = self._exact_shapley(bids, bmap, rc) if np_ <= 5 else self._approx_shapley(bids, bmap, rc)
                ts = sum(sv)
                allocs.append({
                    "route_index": ri.get("route_index", 0), "total_cost": round(rc, 2),
                    "allocations": [{"branch_id": bids[i], "shapley_value": round(sv[i], 2),
                                     "share_pct": round(_div(sv[i], ts) * 100, 2)} for i in range(np_)]
                })
            return _py({"cost_allocations": allocs})
        except Exception as e:
            logger.error("cost_allocation: %s", e, exc_info=True)
            return {"error": str(e), "cost_allocations": []}

    def _coords(self, bids, bmap):
        return [(bmap[b].latitude if bmap.get(b) and bmap[b].latitude else 0.0,
                 bmap[b].longitude if bmap.get(b) and bmap[b].longitude else 0.0) for b in bids]

    def _coalition_cost(self, coords, indices):
        if not indices: return 0.0
        d = sum(_haversine(coords[indices[i]][0], coords[indices[i]][1],
                           coords[indices[i+1]][0], coords[indices[i+1]][1])
                for i in range(len(indices)-1))
        return _cost(d)

    def _exact_shapley(self, bids, bmap, rc):
        n = len(bids)
        coords = self._coords(bids, bmap)
        cf = {}
        for mask in range(1 << n):
            ps = frozenset(j for j in range(n) if mask & (1 << j))
            cf[ps] = self._coalition_cost(coords, sorted(ps))
        sv = shapley_value(cf, n)
        s = sv.sum()
        return (sv * rc / s).tolist() if s > 0 else [rc / n] * n

    def _approx_shapley(self, bids, bmap, rc):
        n = len(bids)
        coords = self._coords(bids, bmap)
        rng = random.Random(_SEED)
        mg = np.zeros(n)
        for _ in range(_SHAPLEY_PERMS):
            perm = list(range(n)); rng.shuffle(perm)
            coal, prev = [], 0.0
            for p in perm:
                coal.append(p)
                nc = self._coalition_cost(coords, sorted(coal))
                mg[p] += nc - prev; prev = nc
        mg /= _SHAPLEY_PERMS
        s = mg.sum()
        return (mg * rc / s).tolist() if s > 0 else [rc / n] * n


# ---------------------------------------------------------------------------
# EmergencyRerouter
# ---------------------------------------------------------------------------
class EmergencyRerouter:
    """Cheapest insertion of an emergency stop into an existing route."""

    def simulate_emergency(self, db: Session, route_id: int,
                           failed_stop_index: int) -> Dict[str, Any]:
        try:
            trip = db.query(CITTrip).filter(CITTrip.id == route_id).first()
            if not trip: return {"error": f"CITTrip id={route_id} not found"}
            rbids = trip.route or []
            if not rbids: return {"error": "Trip has no route data"}
            if failed_stop_index < 0 or failed_stop_index >= len(rbids):
                return {"error": f"Invalid index {failed_stop_index}, route has {len(rbids)} stops"}

            branches = db.query(Branch).filter(Branch.branch_id.in_(rbids)).all()
            bmap = {b.branch_id: b for b in branches}
            ebid = rbids[failed_stop_index]
            eb = bmap.get(ebid)
            if not eb: return {"error": f"Branch {ebid} not found"}

            # Coordinates for current route
            coords = [(bmap[bid].latitude if bmap.get(bid) and bmap[bid].latitude else 0.0,
                        bmap[bid].longitude if bmap.get(bid) and bmap[bid].longitude else 0.0)
                       for bid in rbids]
            orig_dist = sum(_haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
                            for i in range(len(coords)-1))

            # Find cheapest insertion
            best_pos, best_extra = None, float("inf")
            for pos in range(len(rbids) + 1):
                if pos in (failed_stop_index, failed_stop_index + 1): continue
                nr = rbids[:pos] + [ebid] + rbids[pos:]
                nc = [(bmap[b].latitude if bmap.get(b) and bmap[b].latitude else 0.0,
                       bmap[b].longitude if bmap.get(b) and bmap[b].longitude else 0.0) for b in nr]
                nd = sum(_haversine(nc[i][0], nc[i][1], nc[i+1][0], nc[i+1][1])
                         for i in range(len(nc)-1))
                extra = nd - orig_dist
                if extra < best_extra: best_extra, best_pos = extra, pos

            if best_pos is None:
                best_pos = len(rbids)
                elat, elng = eb.latitude or 0.0, eb.longitude or 0.0
                best_extra = _haversine(coords[-1][0], coords[-1][1], elat, elng) * 2

            new_route = rbids[:best_pos] + [ebid] + rbids[best_pos:]
            add_cost = CIT_EMERGENCY_COST + CIT_COST_PER_KM * best_extra
            add_time = _duration(best_extra, 1)
            orig_cost = trip.cost or _cost(orig_dist)

            return _py({
                "trip_id": trip.trip_id, "original_route": rbids,
                "emergency_branch_id": ebid, "emergency_branch_name": eb.name,
                "insertion_position": best_pos, "new_route": new_route,
                "original_distance_km": round(orig_dist, 2),
                "additional_distance_km": round(best_extra, 2),
                "original_cost_pkr": round(orig_cost, 2),
                "additional_cost_pkr": round(add_cost, 2),
                "new_total_cost_pkr": round(orig_cost + add_cost, 2),
                "additional_time_hours": round(add_time, 2),
                "original_duration_hours": round(trip.duration_hours or 0, 2),
                "new_duration_hours": round((trip.duration_hours or 0) + add_time, 2),
                "emergency_surcharge_pkr": CIT_EMERGENCY_COST,
            })
        except Exception as e:
            logger.error("simulate_emergency: %s", e, exc_info=True)
            return {"error": str(e), "route_id": route_id}


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------
def get_cit_summary(db: Session) -> Dict[str, Any]:
    """Network-wide CIT summary with cost breakdown and optimization comparison."""
    try:
        trips = db.query(CITTrip).all()
        today = datetime.date.today().isoformat()
        if not trips:
            return {"total_trips": 0, "total_distance_km": 0, "total_cost_pkr": 0,
                    "avg_stops_per_trip": 0, "fleet_utilization_pct": 0,
                    "cost_breakdown": {}, "optimization_comparison": {}, "analysis_date": today}

        nt = len(trips)
        td = sum(t.total_distance_km or 0 for t in trips)
        tc = sum(t.cost or 0 for t in trips)
        ts = sum(t.num_stops or 0 for t in trips)
        uv = len({t.vehicle_id for t in trips if t.vehicle_id})
        emer = [t for t in trips if t.status == "emergency"]

        base_c = nt * CIT_COST_PER_TRIP
        dist_c = td * CIT_COST_PER_KM
        emer_c = len(emer) * CIT_EMERGENCY_COST

        opt = CITRouteOptimizer().optimize_routes(db, city=_DEFAULT_CITY, use_ortools=False)
        opt_cost = opt.get("total_cost_pkr", 0)
        ct = [t for t in trips if _DEFAULT_CITY.lower() in str(t.route).lower()]
        cc = sum(t.cost or 0 for t in ct) if ct else tc * 0.25

        return _py({
            "total_trips": nt, "total_distance_km": round(td, 2),
            "total_cost_pkr": round(tc, 2), "avg_stops_per_trip": round(_div(ts, nt), 1),
            "avg_distance_per_trip_km": round(_div(td, nt), 2),
            "avg_cost_per_trip_pkr": round(_div(tc, nt), 2),
            "total_value_carried_pkr": round(sum(t.total_value_carried or 0 for t in trips), 2),
            "fleet_utilization": {
                "fleet_size": CIT_FLEET_SIZE, "active_vehicles": uv,
                "utilization_pct": round(_div(uv, CIT_FLEET_SIZE) * 100, 2)},
            "cost_breakdown": {
                "base_trip_cost_pkr": round(base_c, 2), "distance_cost_pkr": round(dist_c, 2),
                "emergency_cost_pkr": round(emer_c, 2), "emergency_trip_count": len(emer),
                "other_pkr": round(max(tc - base_c - dist_c - emer_c, 0), 2),
                "total_pkr": round(tc, 2)},
            "optimization_comparison": {
                "sample_city": _DEFAULT_CITY,
                "current_estimated_cost_pkr": round(cc, 2),
                "optimized_cost_pkr": round(opt_cost, 2),
                "optimized_distance_km": round(opt.get("total_distance_km", 0), 2),
                "potential_savings_pct": round(_div(cc - opt_cost, cc) * 100, 2) if cc > 0 else 0,
                "vehicles_in_optimized": opt.get("vehicles_used", 0)},
            "trip_status_breakdown": {
                s: len([t for t in trips if t.status == s])
                for s in {t.status for t in trips}},
            "analysis_date": today,
        })
    except Exception as e:
        logger.error("get_cit_summary: %s", e, exc_info=True)
        return {"error": str(e), "total_trips": 0}


def get_fleet_dashboard(db: Session) -> Dict[str, Any]:
    """Vehicle-level stats: trips, distance, value per vehicle."""
    try:
        trips = db.query(CITTrip).all()
        today = datetime.date.today().isoformat()
        if not trips:
            return {"vehicles": [], "summary": {}, "analysis_date": today}

        vs: Dict[str, Dict] = {}
        for t in trips:
            vid = t.vehicle_id or "unknown"
            if vid not in vs:
                vs[vid] = dict(tc=0, td=0.0, tv=0.0, tco=0.0, ts=0, th=0.0)
            s = vs[vid]
            s["tc"] += 1; s["td"] += t.total_distance_km or 0
            s["tv"] += t.total_value_carried or 0; s["tco"] += t.cost or 0
            s["ts"] += t.num_stops or 0; s["th"] += t.duration_hours or 0

        vehicles = [{
            "vehicle_id": vid,
            "trip_count": s["tc"],
            "total_distance_km": round(s["td"], 2),
            "avg_distance_km": round(_div(s["td"], s["tc"]), 2),
            "total_value_pkr": round(s["tv"], 2),
            "avg_value_pkr": round(_div(s["tv"], s["tc"]), 2),
            "total_cost_pkr": round(s["tco"], 2),
            "avg_cost_pkr": round(_div(s["tco"], s["tc"]), 2),
            "avg_stops": round(_div(s["ts"], s["tc"]), 1),
            "total_duration_hours": round(s["th"], 2),
        } for vid, s in vs.items()]

        vehicles.sort(key=lambda v: -v["trip_count"])
        top_n = min(10, len(vehicles))
        nv = len(vehicles)
        tt = sum(v["trip_count"] for v in vehicles)

        return _py({
            "summary": {
                "total_active_vehicles": nv, "fleet_size": CIT_FLEET_SIZE,
                "idle_vehicles": max(CIT_FLEET_SIZE - nv, 0),
                "utilization_pct": round(_div(nv, CIT_FLEET_SIZE) * 100, 2),
                "total_trips": tt, "avg_trips_per_vehicle": round(_div(tt, nv), 1),
                "avg_distance_per_vehicle_km": round(
                    _div(sum(v["total_distance_km"] for v in vehicles), nv), 2)},
            "top_utilized": vehicles[:top_n],
            "underutilized": sorted(vehicles, key=lambda v: v["trip_count"])[:top_n],
            "vehicles": vehicles, "analysis_date": today,
        })
    except Exception as e:
        logger.error("get_fleet_dashboard: %s", e, exc_info=True)
        return {"error": str(e), "vehicles": []}


def get_route_comparison(db: Session, city: Optional[str] = None) -> Dict[str, Any]:
    """Compare current vs optimized routes for a city."""
    try:
        tc = city or _DEFAULT_CITY
        trips = db.query(CITTrip).all()
        cbs = db.query(Branch).filter(Branch.city == tc).all()
        cbids = {b.branch_id for b in cbs}

        ct = [t for t in trips if any(bid in cbids for bid in (t.route or []))]
        cur = {
            "trip_count": len(ct),
            "total_distance_km": round(sum(t.total_distance_km or 0 for t in ct), 2),
            "total_cost_pkr": round(sum(t.cost or 0 for t in ct), 2),
            "avg_stops": round(_div(sum(t.num_stops or 0 for t in ct), max(len(ct), 1)), 1),
            "total_value_pkr": round(sum(t.total_value_carried or 0 for t in ct), 2),
        }

        optimizer = CITRouteOptimizer()
        opt = optimizer.optimize_routes(db, city=tc)
        opt_s = {
            "trip_count": opt.get("vehicles_used", 0),
            "total_distance_km": opt.get("total_distance_km", 0),
            "total_cost_pkr": opt.get("total_cost_pkr", 0),
            "avg_stops": opt.get("avg_stops_per_route", 0),
            "total_value_pkr": opt.get("total_value_carried_pkr", 0),
            "solver": opt.get("solver", "unknown"),
        }

        cs = cur["total_cost_pkr"] - opt_s["total_cost_pkr"]
        ds = cur["total_distance_km"] - opt_s["total_distance_km"]

        alloc = {}
        if opt.get("routes"):
            alloc = optimizer.compute_cost_allocation(opt["routes"], cbs)

        return _py({
            "city": tc, "branches_in_city": len(cbids),
            "current": cur, "optimized": opt_s,
            "savings": {
                "cost_saving_pkr": round(cs, 2),
                "cost_saving_pct": round(_div(cs, cur["total_cost_pkr"]) * 100, 2),
                "distance_saving_km": round(ds, 2),
                "distance_saving_pct": round(_div(ds, cur["total_distance_km"]) * 100, 2),
                "route_reduction": cur["trip_count"] - opt_s["trip_count"]},
            "optimized_routes": opt.get("routes", []),
            "cost_allocation": alloc.get("cost_allocations", []),
            "analysis_date": datetime.date.today().isoformat(),
        })
    except Exception as e:
        logger.error("get_route_comparison: %s", e, exc_info=True)
        return {"error": str(e), "city": city}
