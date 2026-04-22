# COE — INTERACTIVE COMMAND CENTER
# ══════════════════════════════════════════════════════════════
# Builds into the EXISTING React + FastAPI app. No new frameworks.
#
# EXACT STACK (already installed — add NOTHING):
#   Frontend: React 19.2, Vite 7.3, TailwindCSS 4.2, Zustand 5.0,
#             Recharts 3.8, Axios, Lucide React
#   Backend:  FastAPI, SQLAlchemy, SQLite, pandas, numpy, scipy
#
# DO NOT install Plotly, D3, Streamlit, or any other library.
# DO NOT use inline style={{}}. Use Tailwind classes exclusively.
# DO NOT use emoji for icons. Use Lucide React components.
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
Build an interactive Command Center page in the EXISTING React + FastAPI app.
It demonstrates live UC-03 netting with before/after state tracking.

Frontend stack (ALREADY INSTALLED — do not add anything):
  React 19.2 + Vite 7.3 + TailwindCSS 4.2 + Zustand 5.0 + Recharts 3.8 + Axios + Lucide React

## ═══════════════════════════════════════════════════════
## BACKEND — 2 files
## ═══════════════════════════════════════════════════════

### FILE 1: backend/app/services/netting_state.py

```python
"""
NettingStateManager — in-memory mutable state for Command Center.
Holds baseline (frozen) + current (mutated by actions).
KDTree for O(log n) spatial matching. P&L delta tracking.
All amounts PKR Millions. KIBOR 10.50%.
"""
import numpy as np
import pandas as pd
from scipy.spatial import KDTree
from datetime import datetime

_state = None

KIBOR = 0.1050
BSC_RATE = 0.0012    # SBP-BSC 0.12% service charge
CIT_COST = 0.015     # PKR 15K per trip in millions


class NettingStateManager:

    def __init__(self, branches_df: pd.DataFrame):
        self.baseline = branches_df.copy()
        self.current = branches_df.copy()
        self.log = []
        self.totals = {
            "idle_freed": 0.0, "bsc_avoided": 0.0,
            "cit_saved": 0.0, "transfers": 0
        }
        coords = np.column_stack([
            branches_df['lat'].values * 111,
            branches_df['lng'].values * 95
        ])
        self.tree = KDTree(coords)

    # ── SNAPSHOT — everything the frontend needs in one call ──

    def snapshot(self) -> dict:
        c, b = self.current, self.baseline
        ci = float(c['idle_cash'].sum())
        bi = float(b['idle_cash'].sum())
        freed = bi - ci
        ces_now = float(c['cash_efficiency_score'].mean())
        ces_base = float(b['cash_efficiency_score'].mean())

        # CES bucket chart data
        ces = c['cash_efficiency_score']
        ces_buckets = [
            {"name": "Critical", "count": int((ces < 0.4).sum()), "fill": "#ef4444"},
            {"name": "Poor",     "count": int(((ces >= 0.4) & (ces < 0.6)).sum()), "fill": "#f59e0b"},
            {"name": "Fair",     "count": int(((ces >= 0.6) & (ces < 0.75)).sum()), "fill": "#d4a853"},
            {"name": "Good",     "count": int(((ces >= 0.75) & (ces < 0.9)).sum()), "fill": "#22d3ee"},
            {"name": "Optimal",  "count": int((ces >= 0.9).sum()), "fill": "#10b981"},
        ]

        # Waterfall chart data
        bsc_ann = self.totals['bsc_avoided'] * 300
        cit_ann = self.totals['cit_saved'] * 300
        waterfall = [
            {"name": "Baseline Loss", "value": round(-bi * KIBOR, 1), "fill": "#ef4444"},
            {"name": "Netting Gain",  "value": round(freed * KIBOR, 1), "fill": "#10b981"},
            {"name": "BSC Avoided",   "value": round(bsc_ann, 2), "fill": "#10b981"},
            {"name": "CIT Saved",     "value": round(cit_ann, 2), "fill": "#22d3ee"},
        ]

        # Branch scatter (for map)
        branches_geo = []
        for _, r in c.iterrows():
            pct = r['current_vault_balance'] / max(r['vault_capacity'], 1)
            status = "surplus" if pct > 0.8 else ("deficit" if pct < 0.35 else "normal")
            branches_geo.append({
                "id": r['branch_id'], "name": r['name'], "city": r.get('city', ''),
                "lat": round(float(r['lat']), 4), "lng": round(float(r['lng']), 4),
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
                "kibor": KIBOR * 100,
            },
            "charts": {
                "cesBuckets": ces_buckets,
                "waterfall": waterfall,
            },
            "branchesGeo": branches_geo,
        }

    # ── FIND OPPORTUNITIES — KDTree spatial search ──

    def find_opportunities(self, radius_km=15.0, min_amount=3.0, max_results=20) -> list:
        c = self.current
        surplus = c[c['current_vault_balance'] > c['vault_capacity'] * 0.8]
        deficit = c[c['current_vault_balance'] < c['vault_capacity'] * 0.35]

        if len(surplus) == 0 or len(deficit) == 0:
            return []

        d_coords = np.column_stack([deficit['lat'].values * 111, deficit['lng'].values * 95])
        d_tree = KDTree(d_coords)

        matches = []
        for _, s in surplus.iterrows():
            excess = float(s['idle_cash'])
            if excess < min_amount:
                continue
            s_coord = np.array([s['lat'] * 111, s['lng'] * 95])
            nearby = d_tree.query_ball_point(s_coord, r=radius_km)

            for di in nearby:
                d = deficit.iloc[di]
                shortfall = max(0, float(d['optimal_vault_balance'] - d['current_vault_balance']))
                transfer = min(excess, shortfall)
                if transfer < min_amount:
                    continue

                dist = ((float(s['lat'] - d['lat']))**2 + (float(s['lng'] - d['lng']))**2)**0.5 * 111
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

    # ── EXECUTE TRANSFER — mutates state, returns result ──

    def execute(self, from_id: str, to_id: str, amount: float) -> dict:
        fi = self.current.index[self.current['branch_id'] == from_id]
        ti = self.current.index[self.current['branch_id'] == to_id]
        if len(fi) == 0 or len(ti) == 0:
            return {"error": "Branch not found"}
        fi, ti = fi[0], ti[0]

        pre = {
            "fromVault": round(float(self.current.at[fi, 'current_vault_balance']), 1),
            "fromIdle":  round(float(self.current.at[fi, 'idle_cash']), 1),
            "toVault":   round(float(self.current.at[ti, 'current_vault_balance']), 1),
            "toIdle":    round(float(self.current.at[ti, 'idle_cash']), 1),
        }

        # Mutate
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
            "fromId": from_id, "fromName": self.current.at[fi, 'name'],
            "toId": to_id, "toName": self.current.at[ti, 'name'],
            "amount": round(amount, 1),
            "idleFreed": round(freed, 1),
            "bscPkr": int(bsc * 1e6),
            "citPkr": int(CIT_COST * 1e6),
            "kiborAnnual": round(freed * KIBOR, 2),
            "pre": pre,
            "post": {
                "fromVault": round(float(self.current.at[fi, 'current_vault_balance']), 1),
                "fromIdle":  round(float(self.current.at[fi, 'idle_cash']), 1),
                "toVault":   round(float(self.current.at[ti, 'current_vault_balance']), 1),
                "toIdle":    round(float(self.current.at[ti, 'idle_cash']), 1),
            },
            "timestamp": datetime.now().isoformat(),
        }
        self.log.append(result)
        return result

    # ── RESET ──

    def reset(self):
        self.current = self.baseline.copy()
        self.log = []
        self.totals = {"idle_freed": 0.0, "bsc_avoided": 0.0, "cit_saved": 0.0, "transfers": 0}


def get_state(db) -> NettingStateManager:
    global _state
    if _state is None:
        branches = pd.read_sql('SELECT * FROM branches', db.bind)
        _state = NettingStateManager(branches)
    return _state

def reset_state():
    global _state
    _state = None
```

### FILE 2: backend/app/api/command_center.py

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.services.netting_state import get_state, reset_state

router = APIRouter(prefix="/api/command-center", tags=["Command Center"])

class TransferReq(BaseModel):
    from_id: str
    to_id: str
    amount: float

@router.get("/snapshot")
def snapshot(db: Session = Depends(get_db)):
    return get_state(db).snapshot()

@router.get("/opportunities")
def opportunities(
    radius: float = Query(15.0), min_amt: float = Query(3.0),
    db: Session = Depends(get_db)
):
    return get_state(db).find_opportunities(radius, min_amt)

@router.post("/execute")
def execute(req: TransferReq, db: Session = Depends(get_db)):
    return get_state(db).execute(req.from_id, req.to_id, req.amount)

@router.post("/reset")
def reset(db: Session = Depends(get_db)):
    reset_state()
    return get_state(db).snapshot()

@router.get("/log")
def get_log(db: Session = Depends(get_db)):
    s = get_state(db)
    return {"transfers": s.log, "totals": s.totals}
```

Register in main.py:
```python
from app.api.command_center import router as cc_router
app.include_router(cc_router)
```

## ═══════════════════════════════════════════════════════
## FRONTEND — 2 files
## ═══════════════════════════════════════════════════════

Use ONLY: TailwindCSS classes, Recharts, Lucide React, Zustand, Axios.
NO inline styles. NO Plotly. NO D3. NO emoji icons.

### FILE 3: src/stores/commandCenterStore.js

```javascript
import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000/api/command-center' })

export const useCommandStore = create((set, get) => ({
  snapshot: null,
  opportunities: [],
  log: [],
  lastAction: null,
  loading: false,
  toastVisible: false,
  radius: 15,
  minAmount: 3,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const [snapRes, oppsRes] = await Promise.all([
        api.get('/snapshot'),
        api.get('/opportunities', {
          params: { radius: get().radius, min_amt: get().minAmount }
        }),
      ])
      set({ snapshot: snapRes.data, opportunities: oppsRes.data, loading: false })
    } catch (err) {
      console.error('Fetch failed:', err)
      set({ loading: false })
    }
  },

  executeTransfer: async (fromId, toId, amount) => {
    set({ loading: true })
    try {
      const { data } = await api.post('/execute', {
        from_id: fromId, to_id: toId, amount
      })
      if (data.error) {
        console.error(data.error)
        set({ loading: false })
        return
      }
      set({ lastAction: data, toastVisible: true })
      setTimeout(() => set({ toastVisible: false }), 6000)
      await get().fetchAll()
      const logRes = await api.get('/log')
      set({ log: logRes.data.transfers, loading: false })
    } catch (err) {
      console.error('Execute failed:', err)
      set({ loading: false })
    }
  },

  resetAll: async () => {
    set({ loading: true })
    try {
      const { data } = await api.post('/reset')
      set({ snapshot: data, lastAction: null, log: [], toastVisible: false, loading: false })
      await get().fetchAll()
    } catch (err) {
      console.error('Reset failed:', err)
      set({ loading: false })
    }
  },

  setRadius: (v) => set({ radius: v }),
  setMinAmount: (v) => set({ minAmount: v }),
  dismissToast: () => set({ toastVisible: false }),
}))
```

### FILE 4: src/pages/CommandCenter.jsx

```jsx
import { useEffect } from 'react'
import { useCommandStore } from '../stores/commandCenterStore'
import {
  Zap, RefreshCw, ArrowRight, CheckCircle2, Activity,
  TrendingDown, TrendingUp, Banknote, Shield, Truck
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, CartesianGrid
} from 'recharts'
import { formatPKR } from '../utils/formatPKR'

// ── Reusable KPI Card ──
function KpiCard({ icon: Icon, label, value, delta, deltaLabel, positive }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-mono font-bold text-amber-400 leading-none">{value}</div>
      {delta != null && delta !== 0 && (
        <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{delta} {deltaLabel}</span>
        </div>
      )}
    </div>
  )
}

// ── Opportunity Card ──
function OpportunityCard({ opp, onExecute, loading }) {
  return (
    <div className="bg-gray-900 border border-gray-800 border-l-2 border-l-amber-500/70 rounded-r-lg p-3 hover:border-gray-700 transition-colors">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-4">
          <p className="text-xs font-semibold text-white truncate">{opp.fromName}</p>
          <p className="text-[10px] font-mono text-gray-500 truncate">
            {opp.fromCity} · Idle: {formatPKR(opp.fromIdle)}
          </p>
        </div>
        <div className="col-span-3 text-center">
          <p className="text-sm font-mono font-bold text-amber-400">{formatPKR(opp.amount)}</p>
          <div className="flex items-center justify-center gap-1 text-gray-600">
            <ArrowRight className="w-3 h-3" />
            <span className="text-[9px] font-mono">{opp.distanceKm} km</span>
          </div>
        </div>
        <div className="col-span-3">
          <p className="text-xs font-semibold text-white truncate">{opp.toName}</p>
          <p className="text-[10px] font-mono text-gray-500 truncate">
            {opp.toCity} · Need: {formatPKR(opp.toShortfall)}
          </p>
        </div>
        <div className="col-span-2">
          <button
            onClick={() => onExecute(opp.fromId, opp.toId, opp.amount)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-mono font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-gray-900 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-wait transition-all"
          >
            <Zap className="w-3 h-3" />
            Execute
          </button>
        </div>
      </div>
      <div className="flex gap-4 mt-1.5 text-[9px] font-mono text-emerald-500/80">
        <span>BSC: PKR {opp.bscPkr?.toLocaleString()}</span>
        <span>CIT: PKR {opp.citPkr?.toLocaleString()}</span>
        <span>KIBOR/yr: {formatPKR(opp.kiborAnnual)}</span>
      </div>
    </div>
  )
}

// ── Custom Recharts Tooltip ──
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-[10px] font-mono text-gray-300 shadow-xl">
      <p className="text-white font-semibold">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color }}>
          {p.name || p.dataKey}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════

export default function CommandCenter() {
  const {
    snapshot, opportunities, log, lastAction, loading, toastVisible,
    radius, minAmount,
    fetchAll, executeTransfer, resetAll, setRadius, setMinAmount, dismissToast
  } = useCommandStore()

  useEffect(() => { fetchAll() }, [])

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500 font-mono text-sm">
        <Activity className="w-5 h-5 animate-spin mr-2" /> Loading Command Center...
      </div>
    )
  }

  const { kpis, charts, branchesGeo } = snapshot
  const totalNettable = opportunities.reduce((s, o) => s + o.amount, 0)

  return (
    <div className="space-y-4">

      {/* ── HEADER ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-gray-900" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">COMMAND CENTER</h1>
            <p className="text-[9px] font-mono text-gray-500 tracking-wider">
              UC-03 PEER-TO-PEER NETTING · KIBOR {kpis.kibor}% · PKR MILLIONS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
            <span>Radius</span>
            <input type="range" min={5} max={30} value={radius}
              onChange={e => setRadius(+e.target.value)}
              onMouseUp={() => fetchAll()}
              className="w-20 accent-amber-500 h-1" />
            <span className="text-amber-400 w-8">{radius}km</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
            <span>Min</span>
            <input type="range" min={1} max={20} value={minAmount}
              onChange={e => setMinAmount(+e.target.value)}
              onMouseUp={() => fetchAll()}
              className="w-16 accent-amber-500 h-1" />
            <span className="text-amber-400 w-8">₨{minAmount}M</span>
          </div>
          <button onClick={resetAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-700 text-[10px] font-mono text-gray-400 hover:text-white hover:border-gray-500 transition">
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard icon={Banknote} label="Total Idle Cash"
          value={`₨ ${kpis.currentIdle?.toLocaleString()} M`}
          delta={kpis.idleFreed > 0 ? `-${kpis.idleFreed} M freed` : null}
          deltaLabel="" positive={true} />
        <KpiCard icon={TrendingDown} label="Annual KIBOR Loss"
          value={`₨ ${kpis.annualLoss?.toLocaleString()} M`}
          delta={kpis.annualSaved > 0 ? `-${kpis.annualSaved} M saved` : null}
          deltaLabel="" positive={true} />
        <KpiCard icon={Activity} label="Avg CES"
          value={`${kpis.avgCes}%`}
          delta={kpis.cesDelta > 0 ? `+${kpis.cesDelta}pp` : null}
          deltaLabel="" positive={true} />
        <KpiCard icon={Shield} label="BSC Avoided"
          value={`₨ ${kpis.bscAvoidedPkr?.toLocaleString()}`}
          delta={kpis.transfers > 0 ? `${kpis.transfers} transfers` : null}
          deltaLabel="" positive={true} />
        <KpiCard icon={Truck} label="CIT Trips Saved"
          value={`${kpis.citTripsSaved}`}
          delta={kpis.citSavedPkr > 0 ? `₨ ${kpis.citSavedPkr?.toLocaleString()}` : null}
          deltaLabel="saved" positive={true} />
      </div>

      {/* ── SUCCESS TOAST ── */}
      {toastVisible && lastAction && !lastAction.error && (
        <div className="bg-gradient-to-r from-emerald-900/80 to-teal-900/80 border border-emerald-700/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">
                Transfer {lastAction.id} Executed
              </p>
              <p className="text-xs text-emerald-200 mt-0.5">
                {lastAction.fromName} → {lastAction.toName} · ₨ {lastAction.amount} M
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-[10px] font-mono text-emerald-300">
                <span>Idle freed: ₨{lastAction.idleFreed}M</span>
                <span>BSC: ₨{lastAction.bscPkr?.toLocaleString()}</span>
                <span>CIT: ₨{lastAction.citPkr?.toLocaleString()}</span>
                <span>Annual KIBOR: ₨{lastAction.kiborAnnual}M</span>
              </div>
              <p className="text-[10px] font-mono text-gray-400 mt-1">
                Vault: {lastAction.pre?.fromVault}→{lastAction.post?.fromVault}M
                {' | '}
                {lastAction.pre?.toVault}→{lastAction.post?.toVault}M
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN: Opportunities (left) + Charts (right) ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* LEFT: Opportunities */}
        <div className="col-span-7 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              AI-Recommended Transfers
            </h2>
            <span className="text-[9px] font-mono text-gray-600">
              {opportunities.length} found · ₨{Math.round(totalNettable).toLocaleString()}M nettable
            </span>
          </div>

          {opportunities.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-xs text-gray-500">
              No opportunities at current parameters. Adjust radius or minimum amount.
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {opportunities.map((opp, i) => (
                <OpportunityCard key={i} opp={opp} onExecute={executeTransfer} loading={loading} />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Charts stacked */}
        <div className="col-span-5 space-y-4">

          {/* CES Distribution */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-2">
              Branch Health — Cash Efficiency
            </h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={charts.cesBuckets} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {charts.cesBuckets.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* P&L Waterfall */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-2">
              P&amp;L Impact (Annualized)
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={charts.waterfall} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={v => `${v}M`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {charts.waterfall.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Branch Scatter */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-2">
              Branch Network — Surplus vs Deficit
              <span className="ml-2 text-emerald-500">● {kpis.surplusCount}</span>
              <span className="ml-2 text-red-400">● {kpis.deficitCount}</span>
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" dataKey="lng" domain={[63, 76]}
                  tick={{ fontSize: 8, fill: '#334155' }} axisLine={false} name="Lng" />
                <YAxis type="number" dataKey="lat" domain={[24, 36]}
                  tick={{ fontSize: 8, fill: '#334155' }} axisLine={false} name="Lat" width={30} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.[0]) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[10px] font-mono shadow-xl">
                      <p className="text-white font-bold">{d.name}</p>
                      <p className="text-gray-400">{d.city} · Idle: ₨{d.idle}M · CES: {(d.ces * 100).toFixed(0)}%</p>
                    </div>
                  )
                }} />
                <Scatter data={branchesGeo}>
                  {branchesGeo.map((b, i) => (
                    <Cell key={i}
                      fill={b.status === 'surplus' ? '#10b981' : b.status === 'deficit' ? '#ef4444' : '#334155'}
                      r={Math.max(2, Math.min(b.idle * 0.3, 8))}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── AUDIT LOG ── */}
      {log.length > 0 && (
        <details className="bg-gray-900 border border-gray-800 rounded-lg">
          <summary className="px-4 py-2.5 text-[10px] font-mono text-gray-500 cursor-pointer hover:text-gray-300 transition select-none">
            Audit Log — {log.length} transfer{log.length > 1 ? 's' : ''} executed
          </summary>
          <div className="px-4 pb-3 overflow-x-auto">
            <table className="w-full text-[10px] font-mono text-gray-400">
              <thead>
                <tr className="text-gray-600 border-b border-gray-800">
                  <th className="py-1.5 text-left">ID</th>
                  <th className="text-left">From</th>
                  <th className="text-left">To</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Freed</th>
                  <th className="text-right">BSC</th>
                  <th className="text-right">KIBOR/yr</th>
                </tr>
              </thead>
              <tbody>
                {log.map(l => (
                  <tr key={l.id} className="border-b border-gray-800/40 hover:bg-gray-800/30">
                    <td className="py-1 text-amber-400">{l.id}</td>
                    <td className="text-gray-300">{l.fromName}</td>
                    <td className="text-gray-300">{l.toName}</td>
                    <td className="text-right">₨{l.amount}M</td>
                    <td className="text-right text-emerald-400">₨{l.idleFreed}M</td>
                    <td className="text-right">₨{l.bscPkr?.toLocaleString()}</td>
                    <td className="text-right text-amber-400">₨{l.kiborAnnual}M</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
```

### ADD ROUTE

In your router file (App.jsx or routes config), add:
```jsx
import CommandCenter from './pages/CommandCenter'
// Add this route alongside existing ones:
// <Route path="/command-center" element={<CommandCenter />} />
```

### ADD NAV LINK

In your sidebar/nav component, add ABOVE the UC catalogue:
```jsx
import { Zap } from 'lucide-react'
// Add nav item:
// <NavLink to="/command-center">
//   <Zap className="w-4 h-4" />
//   <span>Command Center</span>
// </NavLink>
```

### VERIFY

```bash
# Backend test
curl -s localhost:8000/api/command-center/snapshot | python -m json.tool | head -20
curl -s localhost:8000/api/command-center/opportunities | python -m json.tool | head -30

# Execute a transfer
curl -s -X POST localhost:8000/api/command-center/execute \
  -H "Content-Type: application/json" \
  -d '{"from_id":"KHI-0001","to_id":"KHI-0005","amount":10}' | python -m json.tool

# Snapshot should now show reduced idle cash
curl -s localhost:8000/api/command-center/snapshot | python -m json.tool | grep -E "idle|transfers"

# Reset
curl -s -X POST localhost:8000/api/command-center/reset | python -m json.tool | grep idleFreed

# Frontend: open localhost:5173/command-center
# Click Execute on any opportunity card
# Watch KPIs update, toast appear, opportunity disappear
```
```
