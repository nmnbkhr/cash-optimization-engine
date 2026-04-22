# COE — GLOBAL BEST PRACTICES, RESEARCH, UI/UX & DAILY OPERATIONS
# ══════════════════════════════════════════════════════════════
# Broken into 6 independent pieces. Execute one at a time.
# ══════════════════════════════════════════════════════════════

---

# PIECE 1 OF 6: RESEARCH-BACKED TECHNIQUES TO ADD

## What the best banks in the world actually use (with papers)

### UC-01 Vault Forecasting — Upgrade Path

**Current:** LSTM / statistical fallback
**Best-in-class:** Ensemble of Prophet + XGBoost + Conformalized Quantile Regression

Research basis:
- "Improving cash logistics in bank branches by coupling ML and robust optimization"
  (Expert Systems with Applications, 2017) — Spanish bank, 2,000 branches
  Key finding: Coupling ML forecasts with robust optimization reduced idle cash 22%
  and emergency trips 35% vs pure ML forecast alone.

- "ATM Cash Flow Prediction Using Local and Global Model Approaches"  
  (Pattern Recognition & Image Analysis, 2022) — Russian bank
  Key finding: Per-ATM local models outperform global models by 15% MAPE, but 
  a hierarchical approach (global model + local residual correction) beats both.

- "Modelling ATM cash-loading under stochastic demand" (Discover Analytics, 2024)
  Key finding: Markov Decision Process outperformed (s,S) policy by 18% on cost.

**WHAT TO ADD:**
```
PROMPT PIECE 1A — Paste into Claude Code:

Upgrade UC-01 forecasting in services/uc01_vault_forecast.py.

Add a HIERARCHICAL ENSEMBLE approach:
1. Global model: XGBoost trained on ALL branches (captures common patterns)
2. Local correction: per-branch residual model (captures branch-specific behavior)  
3. Uncertainty: Conformalized Quantile Regression (gives valid prediction intervals
   regardless of distribution — better than Gaussian assumption)

The combined forecast should be:
  forecast = global_xgboost_prediction + local_residual_correction
  confidence_interval = conformal_quantile_band (guaranteed 95% coverage)

Implementation:
- pip install xgboost mapie  (MAPIE for conformal prediction)
- Train global XGBoost on fact_gl_daily across ALL branches
- Features: day_of_week, day_of_month, month, is_salary, is_friday,
  is_eid, is_ramadan, branch_type_encoded, rolling_7d_mean, rolling_7d_std,
  lag_1, lag_7, lag_30, deposit_withdrawal_ratio
- Train per-branch residual model: residual = actual - global_prediction
- Use MAPIE ConformalizedQuantileRegressor for prediction intervals
- Compare MAPE: old LSTM vs new ensemble on last 30 days of vault_history

This is what Sesami (planfocus.sesami.io) uses for banks like TBC Bank Georgia.
```

### UC-02 ATM — Upgrade Path

**Current:** DQN + (s,S) policy
**Best-in-class:** Multi-Armed Contextual Bandit + Days-of-Cash optimization

Research: Indonesian bank case (Valiance Solutions, 2024) — 400 branches, 3,000 ATMs
- Forecast deposits/withdrawals daily at branch + ATM + RCM level
- Optimal dates for cash-in determined by minimizing:
  transport_cost + central_bank_interest_on_excess + stockout_penalty
- Key metric: "Days of Cash" (DoC) reduced from 4.2 to 2.1 days
- Result: 40% reduction in cash-in-transit, 25% reduction in idle interest cost

**WHAT TO ADD:**
```
PROMPT PIECE 1B:

Add "Days of Cash" (DoC) as the PRIMARY ATM metric in UC-02.
DoC = current_cash / avg_daily_dispense

Target DoC by ATM type:
- Lobby ATMs (high traffic): DoC = 1.5-2.0 days
- Offsite ATMs: DoC = 2.0-2.5 days  
- Mall ATMs (weekend spikes): DoC = 2.5-3.0 days
- Rural ATMs: DoC = 3.0-4.0 days (longer CIT cycle)

Break-even analysis: 
  DoC_optimal = sqrt(2 × CIT_trip_cost / (cassette_capacity × KIBOR_daily))
  This is the Economic Order Quantity (EOQ) formula adapted for ATM cash.

Add a "Cash Velocity" metric per ATM:
  velocity = total_dispensed_30d / avg_cash_held
  Higher velocity = more efficient ATM
```

### UC-03 Netting — Upgrade Path

**Current:** Haversine distance + simple matching
**Best-in-class:** Spatial KDTree + Maximum Weight Bipartite Matching

**WHAT TO ADD:**
```
PROMPT PIECE 1C:

Replace the current netting logic with scipy KDTree for O(n log n) 
nearest-neighbor search and networkx maximum_weight_matching for 
optimal surplus→deficit pairing.

from scipy.spatial import KDTree
import networkx as nx

# Build KDTree from branch lat/lng
coords = branches[['lat','lng']].values
tree = KDTree(coords)

# For each surplus branch, find all deficit branches within 15km
# Build bipartite graph: edge weight = net_saving (BSC charge + CIT saved)
# Solve maximum weight matching → globally optimal netting plan

This replaces the O(n²) nested loop with O(n log n) spatial search.
For 1,527 branches, drops from ~2.3M comparisons to ~50K lookups.
```

### UC-04 CRR — Upgrade Path

**Best practice from IMF Liquidity Forecasting Handbook (2025):**
- Lagged Reserve Accounting: compute CRR base from PREVIOUS period's liabilities
  (SBP already uses this — verify current SBP circular for exact lag period)
- Intraday liquidity buffer: model deposit inflows/outflows HOURLY not daily
- Friday→Thursday maintenance: model as 7-stage Bellman equation
- Reference: IMF TA Handbook "Liquidity Forecasting Part I" (2025)

### UC-09 Digital Shift — Upgrade Path

**Best practice from India (SBI, HDFC):**
- SBI's "Yono" platform reduced branch footfall 30% in 2 years
- Key technique: RFM (Recency, Frequency, Monetary) segmentation on cash transactions
- Cluster customers by cash_frequency × cash_amount → identify top 5% "cash addicts"
- Target with channel-specific nudges (not generic "use digital")
- Indian banks report PKR 80-120 cost per cash txn vs PKR 5-8 digital

```
PROMPT PIECE 1D:

Add RFM clustering to UC-09:
- Recency: days since last cash transaction
- Frequency: cash transactions per month  
- Monetary: average cash transaction amount

Use KMeans(n_clusters=5) on RFM features from fact_transactions:
  Cluster 0: Digital-first (low R, low F for cash) → ignore
  Cluster 1: Occasional cash (moderate F) → gentle nudge
  Cluster 2: Habitual cash (high F, low M) → fee-based nudge  
  Cluster 3: High-value cash (high F, high M) → personal relationship mgr
  Cluster 4: Cash-only (very high F) → dedicated migration program

Compute per-cluster: migration_cost vs perpetual_cash_handling_cost
Only target clusters where ROI > 200% within 12 months.
```

---

# PIECE 2 OF 6: UI/UX ENHANCEMENT LAYER

## Paste this into Claude Code:

```
Add a highly intuitive visualization layer to the COE app. These are 
NEW components that sit in the business pages, not the technical UC dashboards.

### 1. LIVE CASH PULSE (Home Page Hero)

A real-time animated visualization showing cash flowing through the bank's network.
Think of it as a "weather map" for money.

Build as a React component: src/components/business/CashPulse.jsx

Visual: Pakistan map outline (SVG) with:
- Glowing dots for each major city (size = total vault cash in that city)
- Animated arcs between cities showing cash flows (CIT movements)
- Color coding: 
  - Green pulse = cash flowing to productive deployment (repo, lending)
  - Gold pulse = cash sitting idle in vaults
  - Red pulse = cash in emergency CIT transit
- Bottom ticker showing: "PKR 3.2M earned in last hour from freed cash at KIBOR 10.50%"

Simplified version if map is too complex:
- Horizontal flow diagram: Branches → Vault → CIT → SBP/Repo
- Animated particles flowing left-to-right
- Numbers updating every 10 seconds (simulated from API data)

### 2. VAULT HEALTH HEATMAP (Branch Manager View)

Build: src/components/business/VaultHeatmap.jsx

A grid of 1,527 tiny squares, each representing a branch.
- Color: green (optimized) → yellow → orange → red (over-funded)
- Hover: shows branch name, idle cash, CES score
- Click: navigates to that branch's daily plan
- Grouped by city (Karachi cluster, Lahore cluster, etc.)
- Top bar shows: "832 branches optimized | 412 need attention | 283 critical"

This is inspired by GitHub's contribution heatmap — instantly shows 
system-wide health at a glance.

### 3. P&L WATERFALL (Executive View)

Build: src/components/business/PnLWaterfall.jsx

Classic McKinsey-style waterfall chart showing how value is created:

Idle Cash (start)
  ↓ [red bar down] Vault freed: -5,167M
  ↓ [green bar up] Repo income: +312M
  ↓ [green bar up] T-bill income: +85M
  ↓ [green bar up] CRR float: +48M
  ↓ [green bar up] Nostro sweep: +4M
  ↓ [blue bar down] CIT cost saved: +3M
  ↓ [blue bar down] Digital shift: +10M
  ↓ [gray bar down] Ops cost: -45M
  ═══════════════
  Net Value: +477M/month

Use Recharts BarChart with custom rendering for waterfall effect.
Each bar should have a hover tooltip explaining the calculation.

### 4. CRR GAUGE (Treasury View)

Build: src/components/business/CRRGauge.jsx

A large circular gauge (speedometer style):
- Red zone: 0-4% (below daily minimum — VIOLATION)
- Yellow zone: 4-5% (below weekly avg — MONITOR)
- Green zone: 5-6% (on track)
- Blue zone: 6%+ (over-funding — MONEY WASTED)
- Needle shows current CRR percentage
- Below gauge: "FREE PKR 13,062M — Deploy in overnight repo NOW"
- Animated: needle moves as data updates

### 5. NOSTRO WORLD MAP (Treasury View)

Build: src/components/business/NostroMap.jsx

SVG world map (simplified — just country outlines for relevant countries):
- USA, UK, Germany, UAE, Saudi Arabia, China, Japan, Switzerland
- Each country has a circle showing nostro balance
- Circle color: green (optimized) / gold (idle) / red (needs funding)
- Lines from Pakistan to each country showing flow direction
- Click a country → shows bank details + recommended action

### 6. BRANCH SCORECARD CARD (Branch Plan View)

Build: src/components/business/BranchScorecard.jsx

Single-branch view showing performance as a "report card":

┌─────────────────────────────────┐
│  SADDAR MAIN — APRIL 2026      │
│  ★★★★☆  RANK: 342 / 1,527     │
├─────────────────────────────────┤
│  Cash Efficiency    ████████░░  75% │
│  Model Adherence    ███████░░░  68% │
│  SBP Compliance     ██████████ 100% │
│  Digital Adoption   ████░░░░░░  35% │
│  Cost Efficiency    ███████░░░  72% │
├─────────────────────────────────┤
│  Monthly Savings: PKR 0.48 M    │
│  vs Target:       PKR 0.55 M    │
│  Status: ⚠️ SLIGHTLY BELOW     │
│                                 │
│  [Print Daily Plan] [View Details]│
└─────────────────────────────────┘

Use radial progress bars or horizontal bar indicators.
Print-friendly (renders clean on A4 paper).
```

---

# PIECE 3 OF 6: DAILY OPERATIONS SETUP

## How to run the app daily and keep data fresh

```
PROMPT PIECE 3 — Paste into Claude Code:

Set up the COE app for daily automated operations. The app should:
1. Fetch fresh SBP data every morning
2. Recompute optimizations daily
3. Generate today's action plans for all branches
4. Send alerts for exceptions

### Create: backend/app/services/daily_runner.py

```python
"""
Daily Operations Runner
═══════════════════════
Runs every morning at 6:00 AM via cron.
Fetches latest SBP rates, recomputes all optimizations,
generates daily plans, flags exceptions.
"""

import logging
from datetime import date, datetime
from app.database import SessionLocal
from app.core.sbp_data import get_sbp_service
from app.services.business_output import CashOptimizationEngine

logger = logging.getLogger(__name__)

class DailyRunner:
    
    def run_morning_cycle(self):
        """Complete morning cycle — run at 6 AM daily."""
        db = SessionLocal()
        start = datetime.now()
        logger.info(f"═══ DAILY CYCLE STARTED: {start} ═══")
        
        try:
            # Phase 1: Refresh external data (5 min)
            self.refresh_sbp_data()
            
            # Phase 2: Compute today's plans (10 min)
            engine = CashOptimizationEngine(db)
            plans = self.compute_daily_plans(engine)
            
            # Phase 3: Generate exception alerts (2 min)
            alerts = self.check_exceptions(engine)
            
            # Phase 4: Store results for API consumption (1 min)
            self.store_daily_results(db, plans, alerts)
            
            elapsed = (datetime.now() - start).total_seconds()
            logger.info(f"═══ DAILY CYCLE COMPLETE: {elapsed:.0f}s ═══")
            
            return {
                "status": "ok",
                "date": str(date.today()),
                "elapsed_seconds": elapsed,
                "plans_generated": len(plans),
                "alerts": len(alerts),
            }
        finally:
            db.close()
    
    def refresh_sbp_data(self):
        """Fetch latest KIBOR, FX, policy rate from SBP EasyData."""
        sbp = get_sbp_service()
        rates = sbp.get_all_rates_summary()
        logger.info(f"  SBP rates refreshed: KIBOR={rates['kibor_overnight']}, USD={rates['fx']['USD']}")
    
    def compute_daily_plans(self, engine):
        """Generate vault recommendation for every branch."""
        from app.models.branch import Branch
        branches = engine.db.query(Branch).all()
        plans = []
        for b in branches:
            try:
                plan = engine.vault_recommendation(b.branch_id)
                plans.append(plan)
            except Exception as e:
                logger.warning(f"  Plan failed for {b.branch_id}: {e}")
        logger.info(f"  Generated {len(plans)} daily plans")
        return plans
    
    def check_exceptions(self, engine):
        """Flag branches that need immediate attention."""
        alerts = []
        crr = engine.crr_deployment()
        if crr['risk']['compliance_status'] != 'ON_TRACK':
            alerts.append({
                'type': 'CRR_WARNING',
                'severity': 'HIGH',
                'message': f"CRR compliance at risk: {crr['position']['avg_pct_so_far']}%",
            })
        
        nostro = engine.nostro_vostro_actions()
        for action in nostro['actions']:
            if action['action'] == 'FUND':
                alerts.append({
                    'type': 'NOSTRO_UNDERFUNDED',
                    'severity': 'MEDIUM',
                    'message': f"{action['bank']} needs PKR {action['amount']}M funding",
                })
        
        logger.info(f"  {len(alerts)} alerts generated")
        return alerts
    
    def store_daily_results(self, db, plans, alerts):
        """Store in daily_results table for API to serve."""
        # Store as JSON in a simple key-value table
        pass  # implement with SQLAlchemy
```

### Create cron job:

```bash
# Add to crontab (crontab -e):
# Run daily at 6:00 AM Pakistan time (UTC+5)
0 1 * * * cd ~/projects/cash-optimization-engine && conda run -n coe python -c "from backend.app.services.daily_runner import DailyRunner; DailyRunner().run_morning_cycle()" >> logs/daily_$(date +\%Y\%m\%d).log 2>&1

# Run SBP data refresh at 5:30 AM (before daily cycle)
30 0 * * * cd ~/projects/cash-optimization-engine && conda run -n coe python -c "from backend.app.core.sbp_easydata import cmd_update; cmd_update()" >> logs/sbp_$(date +\%Y\%m\%d).log 2>&1
```

### Makefile targets:

```makefile
daily-run:
	cd backend && python -c "from app.services.daily_runner import DailyRunner; DailyRunner().run_morning_cycle()"

daily-test:
	cd backend && python -c "from app.services.daily_runner import DailyRunner; r = DailyRunner().run_morning_cycle(); print(r)"
```

### API endpoint for daily status:

```python
@router.get("/daily-status")
def daily_status(db: Session = Depends(get_db)):
    """Shows when the last daily cycle ran and its results."""
    # Read from daily_results table
    return {
        "last_run": "2026-04-07T06:00:15",
        "status": "ok",
        "plans_generated": 1527,
        "alerts": 3,
        "sbp_rates_fresh": True,
        "next_run": "2026-04-08T06:00:00",
    }
```
```

---

# PIECE 4 OF 6: WHAT-IF SIMULATOR

```
PROMPT PIECE 4 — Paste into Claude Code:

Add a "What-If Simulator" page that lets Treasury test scenarios:

### Scenarios to support:
1. "What if KIBOR drops 200bps?" → Recalculate all opportunity costs
2. "What if we reduce vault cash by 20% across all branches?" → Show savings + risk
3. "What if Eid is next week?" → Show cash demand surge + denomination needs
4. "What if we add CDMs to 100 more branches?" → Show CIT savings + digital shift
5. "What if PKR depreciates 5% against USD?" → Show nostro impact

### Implementation:
- Page: /simulator
- User adjusts sliders (KIBOR rate, vault reduction %, event flag)
- App recalculates business_output with modified parameters
- Shows side-by-side: CURRENT vs SIMULATED impact
- Key output: "If KIBOR drops 200bps, your annual savings drop by PKR 1.2B"
```

---

# PIECE 5 OF 6: ALERTING & NOTIFICATIONS

```
PROMPT PIECE 5 — Paste into Claude Code:

Add an in-app alert system that flags exceptions daily:

### Alert types:
- 🔴 CRITICAL: CRR breach risk, nostro account below minimum
- 🟡 WARNING: Branch vault > 150% of optimal, ATM DoC < 1 day
- 🟢 INFO: Daily plan generated, SBP rates updated

### Implementation:
- Store alerts in alerts table (timestamp, type, severity, message, branch_id, dismissed)
- API: GET /api/alerts?severity=HIGH → returns unread alerts
- Frontend: Bell icon in header with badge count
- Click → dropdown showing latest alerts
- "Dismiss" button per alert

### Auto-generated alerts from daily_runner:
- Any branch with idle_cash > 3 × optimal → CRITICAL
- Any ATM with DoC < 0.5 → CRITICAL  
- CRR avg falling below 5.5% mid-week → WARNING
- Any nostro with balance < minimum → CRITICAL
- Branch ignoring recommendation for 5+ consecutive days → WARNING
```

---

# PIECE 6 OF 6: REPORTING & EXPORT

```
PROMPT PIECE 6 — Paste into Claude Code:

Add report generation capability:

### Reports to generate:
1. Daily Branch Plan (PDF/print) — for branch managers
2. Weekly Regional Summary (PDF) — for regional heads
3. Monthly ALCO Report (DOCX) — for board/ALCO committee
4. Monthly Value Realized Report (XLSX) — for CFO

### Implementation:
- Use existing docx/pdf skills if available, or simple HTML→PDF via browser print
- API: GET /api/reports/branch-plan/{branch_id}?format=pdf
- API: GET /api/reports/regional/{city}?format=pdf
- API: GET /api/reports/alco?period=2026-03&format=docx
- Frontend: "Download Report" buttons on each business page
- ALCO report should include: P&L waterfall, CRR compliance, idle cash trend,
  top/bottom branches, nostro summary, digital shift progress
```

---

# EXECUTION ORDER

```
Step 1: PIECE 1 (Research techniques) — enhance UC algorithms
        ├── 1A: Ensemble forecasting for UC-01
        ├── 1B: DoC metric for UC-02
        ├── 1C: KDTree netting for UC-03
        └── 1D: RFM clustering for UC-09

Step 2: PIECE 2 (UI/UX) — visual layer
        One component at a time. Start with PnLWaterfall and CRRGauge.

Step 3: PIECE 3 (Daily ops) — automation
        Set up cron. Test with `make daily-test`.

Step 4: PIECE 4 (Simulator) — what-if scenarios
        One page, slider-driven.

Step 5: PIECE 5 (Alerts) — exception management
        Bell icon + alert table.

Step 6: PIECE 6 (Reports) — export capability
        PDF/DOCX generation.

Each piece is INDEPENDENT. Skip any. Reorder any. 
Each prompt is self-contained and won't break existing code.
```
