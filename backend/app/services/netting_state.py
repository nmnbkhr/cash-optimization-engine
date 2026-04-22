"""
NettingStateManager — in-memory mutable state for Command Center.
Holds baseline (frozen) + current (mutated by actions).
KDTree for O(log n) spatial matching. P&L delta tracking.
All amounts PKR Millions internally. DB stores raw PKR.
"""
import numpy as np
import pandas as pd
from scipy.spatial import KDTree
from datetime import datetime

_state = None

# Use live KIBOR if available
try:
    from app.core.sbp_data import get_sbp_service
    KIBOR = get_sbp_service().get_overnight_kibor()
except Exception:
    KIBOR = 0.1050

BSC_RATE = 0.0012
CIT_COST = 0.015  # PKR M per trip


def M(v):
    """Raw PKR -> PKR Millions."""
    return (v or 0) / 1e6


class NettingStateManager:

    def __init__(self, branches_df: pd.DataFrame):
        # Convert raw PKR fields to PKR Millions for internal use
        df = branches_df.copy()
        for col in ['current_vault_balance', 'optimal_vault_balance', 'idle_cash', 'vault_capacity',
                     'avg_daily_deposits', 'avg_daily_withdrawals']:
            if col in df.columns:
                df[col] = df[col] / 1e6

        # Rename lat/lng for convenience
        if 'latitude' in df.columns:
            df['lat'] = df['latitude']
            df['lng'] = df['longitude']

        self.baseline = df.copy()
        self.current = df.copy()
        self.log = []
        self.totals = {"idle_freed": 0.0, "bsc_avoided": 0.0, "cit_saved": 0.0, "transfers": 0}

        coords = np.column_stack([
            df['lat'].fillna(30.0).values * 111,
            df['lng'].fillna(70.0).values * 95
        ])
        self.tree = KDTree(coords)

    def snapshot(self) -> dict:
        c, b = self.current, self.baseline
        ci = float(c['idle_cash'].sum())
        bi = float(b['idle_cash'].sum())
        freed = bi - ci
        ces_now = float(c['cash_efficiency_score'].mean())
        ces_base = float(b['cash_efficiency_score'].mean())

        ces = c['cash_efficiency_score']
        ces_buckets = [
            {"name": "Critical", "count": int((ces < 0.4).sum()), "fill": "#ef4444"},
            {"name": "Poor", "count": int(((ces >= 0.4) & (ces < 0.6)).sum()), "fill": "#f59e0b"},
            {"name": "Fair", "count": int(((ces >= 0.6) & (ces < 0.75)).sum()), "fill": "#d4a853"},
            {"name": "Good", "count": int(((ces >= 0.75) & (ces < 0.9)).sum()), "fill": "#22d3ee"},
            {"name": "Optimal", "count": int((ces >= 0.9).sum()), "fill": "#10b981"},
        ]

        bsc_ann = self.totals['bsc_avoided'] * 300
        cit_ann = self.totals['cit_saved'] * 300
        waterfall = [
            {"name": "Baseline Loss", "value": round(-bi * KIBOR, 1), "fill": "#ef4444"},
            {"name": "Netting Gain", "value": round(freed * KIBOR, 1), "fill": "#10b981"},
            {"name": "BSC Avoided", "value": round(bsc_ann, 2), "fill": "#10b981"},
            {"name": "CIT Saved", "value": round(cit_ann, 2), "fill": "#22d3ee"},
        ]

        branches_geo = []
        for _, r in c.iterrows():
            cap = r.get('vault_capacity', 1)
            pct = r['current_vault_balance'] / max(cap, 0.01)
            status = "surplus" if pct > 0.8 else ("deficit" if pct < 0.35 else "normal")
            branches_geo.append({
                "id": r['branch_id'], "name": r['name'], "city": r.get('city', ''),
                "lat": round(float(r.get('lat', 30.0)), 4),
                "lng": round(float(r.get('lng', 70.0)), 4),
                "idle": round(float(r['idle_cash']), 1),
                "vault": round(float(r['current_vault_balance']), 1),
                "ces": round(float(r['cash_efficiency_score']), 3),
                "status": status,
            })

        return {
            "kpis": {
                "currentIdle": round(ci, 1),
                "baselineIdle": round(bi, 1),
                "idleFreed": round(freed, 1),
                "idleFreedPct": round(freed / max(bi, 1) * 100, 1),
                "annualLoss": round(ci * KIBOR, 1),
                "baselineLoss": round(bi * KIBOR, 1),
                "annualSaved": round(freed * KIBOR, 1),
                "avgCes": round(ces_now * 100, 1),
                "cesDelta": round((ces_now - ces_base) * 100, 1),
                "transfers": self.totals['transfers'],
                "bscAvoidedPkr": int(self.totals['bsc_avoided'] * 1e6),
                "citTripsSaved": self.totals['transfers'],
                "citSavedPkr": int(self.totals['cit_saved'] * 1e6),
                "surplusCount": int((c['current_vault_balance'] > c['vault_capacity'] * 0.8).sum()),
                "deficitCount": int((c['current_vault_balance'] < c['vault_capacity'] * 0.35).sum()),
                "kibor": round(KIBOR * 100, 2),
            },
            "charts": {"cesBuckets": ces_buckets, "waterfall": waterfall},
            "branchesGeo": branches_geo,
        }

    def find_opportunities(self, radius_km=15.0, min_amount=3.0, max_results=20) -> list:
        c = self.current
        surplus = c[c['idle_cash'] > min_amount]
        deficit = c[(c['optimal_vault_balance'] > 0) & (c['current_vault_balance'] < c['optimal_vault_balance'] * 0.8)]

        if len(surplus) == 0 or len(deficit) == 0:
            return []

        d_coords = np.column_stack([
            deficit['lat'].fillna(30.0).values * 111,
            deficit['lng'].fillna(70.0).values * 95
        ])
        d_tree = KDTree(d_coords)

        matches = []
        for _, s in surplus.iterrows():
            excess = float(s['idle_cash'])
            if excess < min_amount:
                continue
            s_coord = np.array([float(s.get('lat', 30.0)) * 111, float(s.get('lng', 70.0)) * 95])
            nearby = d_tree.query_ball_point(s_coord, r=radius_km)

            for di in nearby:
                d = deficit.iloc[di]
                shortfall = max(0, float(d['optimal_vault_balance'] - d['current_vault_balance']))
                transfer = min(excess, shortfall)
                if transfer < min_amount:
                    continue

                dist = ((float(s.get('lat', 30) - d.get('lat', 30)))**2 +
                        (float(s.get('lng', 70) - d.get('lng', 70)))**2)**0.5 * 111
                bsc = transfer * BSC_RATE

                matches.append({
                    "fromId": s['branch_id'], "fromName": s['name'],
                    "fromCity": s.get('city', ''), "fromIdle": round(excess, 1),
                    "toId": d['branch_id'], "toName": d['name'],
                    "toCity": d.get('city', ''), "toShortfall": round(shortfall, 1),
                    "amount": round(transfer, 1),
                    "distanceKm": round(dist, 1),
                    "bscPkr": int(bsc * 1e6),
                    "citPkr": int(CIT_COST * 1e6),
                    "kiborAnnual": round(transfer * KIBOR, 2),
                    "totalSavingPkr": int((bsc + CIT_COST) * 1e6),
                })

        matches.sort(key=lambda x: x['totalSavingPkr'], reverse=True)
        return matches[:max_results]

    def execute(self, from_id: str, to_id: str, amount: float) -> dict:
        fi = self.current.index[self.current['branch_id'] == from_id]
        ti = self.current.index[self.current['branch_id'] == to_id]
        if len(fi) == 0 or len(ti) == 0:
            return {"error": "Branch not found"}
        fi, ti = fi[0], ti[0]

        pre = {
            "fromVault": round(float(self.current.at[fi, 'current_vault_balance']), 1),
            "fromIdle": round(float(self.current.at[fi, 'idle_cash']), 1),
            "toVault": round(float(self.current.at[ti, 'current_vault_balance']), 1),
            "toIdle": round(float(self.current.at[ti, 'idle_cash']), 1),
        }

        self.current.at[fi, 'current_vault_balance'] -= amount
        self.current.at[fi, 'idle_cash'] = max(0, self.current.at[fi, 'idle_cash'] - amount)
        self.current.at[ti, 'current_vault_balance'] += amount
        opt = self.current.at[ti, 'optimal_vault_balance']
        self.current.at[ti, 'idle_cash'] = max(0, self.current.at[ti, 'current_vault_balance'] - opt)

        for idx in [fi, ti]:
            v = self.current.at[idx, 'current_vault_balance']
            idle = self.current.at[idx, 'idle_cash']
            self.current.at[idx, 'cash_efficiency_score'] = round(1 - idle / max(v, 0.01), 3)

        freed = max(0, pre['fromIdle'] - float(self.current.at[fi, 'idle_cash']))
        bsc = amount * BSC_RATE

        self.totals['idle_freed'] += freed
        self.totals['bsc_avoided'] += bsc
        self.totals['cit_saved'] += CIT_COST
        self.totals['transfers'] += 1

        result = {
            "id": f"NET-{self.totals['transfers']:04d}",
            "fromId": from_id, "fromName": str(self.current.at[fi, 'name']),
            "toId": to_id, "toName": str(self.current.at[ti, 'name']),
            "amount": round(amount, 1),
            "idleFreed": round(freed, 1),
            "bscPkr": int(bsc * 1e6),
            "citPkr": int(CIT_COST * 1e6),
            "kiborAnnual": round(freed * KIBOR, 2),
            "pre": pre,
            "post": {
                "fromVault": round(float(self.current.at[fi, 'current_vault_balance']), 1),
                "fromIdle": round(float(self.current.at[fi, 'idle_cash']), 1),
                "toVault": round(float(self.current.at[ti, 'current_vault_balance']), 1),
                "toIdle": round(float(self.current.at[ti, 'idle_cash']), 1),
            },
            "timestamp": datetime.now().isoformat(),
        }
        self.log.append(result)
        return result

    def reset(self):
        self.current = self.baseline.copy()
        self.log = []
        self.totals = {"idle_freed": 0.0, "bsc_avoided": 0.0, "cit_saved": 0.0, "transfers": 0}


def get_state(db) -> NettingStateManager:
    global _state
    if _state is None:
        import pandas as pd
        import sqlite3
        from pathlib import Path
        db_path = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")
        con = sqlite3.connect(db_path)
        branches = pd.read_sql_query('SELECT * FROM branches', con)
        con.close()
        _state = NettingStateManager(branches)
    return _state


def reset_state():
    global _state
    _state = None
