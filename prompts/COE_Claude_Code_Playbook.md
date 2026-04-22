# CASH OPTIMIZATION ENGINE — Claude Code Prompt Playbook

## Godaitec × UBL | 10 Use Cases | Complete Build Guide

**Machine:** ASUS Laptop, RTX 4080 (12GB VRAM), 32GB RAM
**Environment:** WSL2 Ubuntu, VSCode, Conda, Claude Code
**Stack:** Python (FastAPI + ML) + React (Vite + TailwindCSS + Recharts)

---

# PHASE 0: ENVIRONMENT SETUP

## Claude Code Prompt — Copy & Paste into Claude Code Terminal

```
Create a complete full-stack project called "cash-optimization-engine" (COE) in my WSL2 Ubuntu environment. This is a Bloomberg Terminal-style financial application for Pakistani bank branch cash optimization.

## ENVIRONMENT SETUP

1. Create conda environment:
   - Name: coe
   - Python 3.11
   - Install: fastapi uvicorn sqlalchemy alembic pandas numpy scipy scikit-learn pytorch torchvision statsmodels prophet plotly httpx pydantic python-dotenv websockets redis celery flower ortools pulp networkx
   - pip install anthropic

2. Create project structure:
```
~/projects/cash-optimization-engine/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app entry
│   │   ├── config.py                # Settings, env vars
│   │   ├── database.py              # SQLAlchemy engine + session
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── branch.py            # Branch master data
│   │   │   ├── vault_position.py    # Daily vault snapshots
│   │   │   ├── transaction.py       # Branch transactions
│   │   │   ├── atm.py               # ATM master + cassette
│   │   │   ├── cit_trip.py          # CIT logistics
│   │   │   ├── crr_position.py      # CRR daily positions
│   │   │   ├── nostro_account.py    # Nostro balances
│   │   │   ├── vostro_account.py    # Vostro balances
│   │   │   ├── denomination.py      # Denomination inventory
│   │   │   └── forecast.py          # Forecast results
│   │   ├── schemas/                 # Pydantic request/response
│   │   │   ├── __init__.py
│   │   │   └── branch.py
│   │   ├── api/                     # Route modules
│   │   │   ├── __init__.py
│   │   │   ├── branches.py
│   │   │   ├── forecasts.py
│   │   │   ├── optimization.py
│   │   │   ├── claude_ai.py         # Claude API proxy
│   │   │   └── dashboard.py
│   │   ├── services/                # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── data_generator.py    # Synthetic UBL data
│   │   │   ├── uc01_vault_forecast.py
│   │   │   ├── uc02_atm_optimizer.py
│   │   │   ├── uc03_netting.py
│   │   │   ├── uc04_crr_float.py
│   │   │   ├── uc05_nostro.py
│   │   │   ├── uc06_vostro.py
│   │   │   ├── uc07_denomination.py
│   │   │   ├── uc08_cit_routing.py
│   │   │   ├── uc09_digital_incentive.py
│   │   │   └── uc10_pnl_attribution.py
│   │   └── core/                    # Shared utilities
│   │       ├── __init__.py
│   │       ├── constants.py         # SBP rates, CRR rules
│   │       └── game_theory.py       # Game theory engines
│   ├── alembic/
│   ├── alembic.ini
│   ├── seed_data.py                 # Populate DB with UBL data
│   └── requirements.txt
├── frontend/
│   ├── (Vite React project — created via npm)
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/
│       │   ├── Layout.jsx           # Shell, nav, header
│       │   ├── Catalogue.jsx        # UC card grid
│       │   ├── UCDetail.jsx         # UC deep dive shell
│       │   ├── BranchList.jsx       # Sidebar branch picker
│       │   ├── BranchDetail.jsx     # Selected branch panel
│       │   ├── ForecastChart.jsx    # LSTM forecast viz
│       │   ├── VaultChart.jsx       # Vault utilization
│       │   ├── ClaudePanel.jsx      # AI optimizer panel
│       │   ├── GameTheoryCard.jsx   # GT insight card
│       │   ├── KPIStrip.jsx         # Top metrics bar
│       │   └── common/
│       │       ├── Badge.jsx
│       │       ├── Metric.jsx
│       │       └── ProgressBar.jsx
│       ├── hooks/
│       │   ├── useAPI.js
│       │   └── useBranches.js
│       ├── stores/
│       │   └── appStore.js          # Zustand store
│       ├── data/
│       │   └── useCases.js          # UC metadata
│       └── styles/
│           └── theme.js             # Design tokens
├── data/
│   └── synthetic/                   # Generated CSV/JSON seeds
├── notebooks/
│   └── exploration.ipynb            # Jupyter for analysis
├── .env                             # ANTHROPIC_API_KEY, DB URL
├── docker-compose.yml               # Postgres + Redis
├── Makefile                         # dev, seed, migrate
└── README.md
```

3. Frontend setup:
   - cd frontend && npm create vite@latest . -- --template react
   - npm install zustand recharts lucide-react axios tailwindcss @tailwindcss/vite
   - Configure tailwind with dark mode, custom Bloomberg-style color palette

4. Database:
   - SQLite for dev (cash_engine.db in backend/)
   - Alembic migrations initialized

5. Create .env template:
```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=sqlite:///./cash_engine.db
SBP_POLICY_RATE=0.11
CRR_WEEKLY_AVG=0.06
CRR_DAILY_MIN=0.04
UBL_TOTAL_BRANCHES=1547
UBL_TOTAL_ATMS=2180
UBL_DEPOSIT_BASE_TRILLIONS=2.54
```

6. Create Makefile with targets:
   - `make setup` — create conda env + install deps + init DB
   - `make seed` — generate synthetic UBL data (1500 branches, 2000 ATMs)
   - `make backend` — uvicorn backend
   - `make frontend` — vite dev server
   - `make dev` — run both concurrently
   - `make migrate` — alembic upgrade head

7. Create backend/app/core/constants.py with ALL SBP regulatory constants:
   - CRR rates (daily min 4%, weekly avg 6%)
   - Policy rate (11%)
   - CDM mandate (25% by CY2028)
   - Penalty structure (PKR 100K for unprocessed notes, etc.)
   - Denomination specs (Rs.5000, Rs.1000, Rs.500, Rs.100, Rs.50, Rs.20, Rs.10)
   - CIT cost per trip estimate (PKR 15,000)
   - Vault insurance rate (0.015% of vault value)

8. Create backend/app/services/data_generator.py:
   - Generate 1,547 synthetic UBL branches across Pakistan
   - Cities: Karachi (380), Lahore (280), Islamabad (120), Rawalpindi (90), Faisalabad (85), Multan (65), Peshawar (60), Hyderabad (55), Quetta (35), Sialkot (30), Gujranwala (28), Bahawalpur (25), Sukkur (22), Abbottabad (18), remaining distributed across 50+ smaller cities
   - Each branch has: branch_id, name, city, region, type (Cash-Surplus/Deficit/Balanced/Seasonal/Hub), vault_capacity, avg_daily_deposits, avg_daily_withdrawals, current_vault_balance, optimal_vault_balance, idle_cash, cash_efficiency_score, daily_transactions, lat/lng coordinates, manager_name, is_cpc (bool), feeding_branch_id
   - Branch types distributed: 35% Surplus, 25% Deficit, 20% Balanced, 15% Seasonal, 5% Hub/CPC
   - Generate 365 days of daily vault_position data per branch with realistic patterns (day-of-week, salary cycles on 1st/15th, Eid spikes, Ramadan patterns, crop season effects for Seasonal branches)
   - Generate 2,180 ATMs linked to branches with cassette_capacity, avg_daily_dispense, denomination_split, last_loaded, uptime_pct

9. Wire up main.py FastAPI app with CORS middleware allowing localhost:5173 (Vite dev server) and include all API routers.

10. Verify everything runs:
    - `conda activate coe && cd backend && python -m uvicorn app.main:app --reload --port 8000`
    - `cd frontend && npm run dev`
    - Both should start without errors
    - GET http://localhost:8000/health should return {"status": "ok"}
    - Frontend should load at http://localhost:5173

DO NOT build any use case logic yet. Just the skeleton, data models, synthetic data generator, and the working dev environment. I will provide each UC prompt separately.
```

---

# USE CASE 01: Branch Vault Cash Forecasting & Right-Sizing

## Claude Code Prompt — UC-01

```
Implement UC-01 (Branch Vault Cash Forecasting & Right-Sizing) in the cash-optimization-engine project. This is the flagship use case. Build both backend ML/optimization and a stunning frontend dashboard.

## CONTEXT
- Project is at ~/projects/cash-optimization-engine/
- Conda env: coe (Python 3.11, PyTorch, FastAPI, etc.)
- Frontend: Vite + React + Tailwind + Recharts + Zustand
- DB has 1,547 branches with 365 days of vault position history
- SBP Policy Rate: 11% | CRR: 6% weekly avg, 4% daily min

## BACKEND: services/uc01_vault_forecast.py

### 1. LSTM Cash Demand Forecasting Model

Build a PyTorch LSTM model that predicts next-7-day cash demand per branch:

```python
class BranchCashLSTM(nn.Module):
    """
    LSTM forecaster for branch-level daily cash demand.
    
    Features (per day):
    - day_of_week (one-hot 7)
    - day_of_month (1-31 normalized)
    - is_salary_day (1st, 15th of month)
    - is_friday (Islamic weekend effect)
    - is_eid_window (±7 days around Eid-ul-Fitr, Eid-ul-Adha)
    - is_ramadan (30-day window)
    - is_muharram (10 days)
    - crop_season_indicator (Rabi: Nov-Apr=1, Kharif: May-Oct=2, 0 otherwise — only for Seasonal branches)
    - month_sin, month_cos (cyclical encoding)
    - lagged_demand_1d, lagged_demand_7d, lagged_demand_30d
    - rolling_mean_7d, rolling_std_7d
    - deposit_withdrawal_ratio
    - branch_type_embedding (5 types)
    
    Architecture:
    - Input: 30-day lookback window
    - 2-layer LSTM, hidden_size=64
    - Dropout 0.2
    - Linear head → 7-day forecast
    - Output: mean + std (for uncertainty quantification)
    """
```

Training pipeline:
- Split: Train on first 300 days, validate on last 65 days
- Loss: Negative log-likelihood (Gaussian) to learn both mean and variance
- Optimizer: AdamW, lr=1e-3, weight_decay=1e-4
- Early stopping on validation loss, patience=10
- Save best model to models/uc01_lstm_best.pt
- Compute MAPE, MAE, RMSE on validation set
- Store forecast results in forecast table with confidence intervals (5th, 50th, 95th percentiles)

### 2. Stochastic Vault Optimization

```python
class VaultOptimizer:
    """
    Two-stage stochastic program for optimal vault opening balance.
    
    Stage 1 (here-and-now): Decide vault opening balance V₀
    Stage 2 (recourse): After observing actual demand D:
        - If D > V₀: Emergency CIT trip cost = PKR 45,000 (1.5x normal)
        - If D < V₀: Idle cash cost = (V₀ - D) × (policy_rate / 365)
    
    Objective: min E[idle_cost + emergency_cost]
    
    Subject to:
        - V₀ ≥ branch_minimum_cash (operational floor)
        - V₀ ≤ vault_capacity
        - denomination_mix constraints (min 10% in Rs.1000, min 5% in Rs.500)
        
    Solve using Sample Average Approximation (SAA):
        - Draw N=1000 scenarios from LSTM forecast distribution
        - Solve deterministic equivalent as LP using scipy.optimize or PuLP
    """
```

### 3. Cash Efficiency Scoring (Game Theory Mechanism)

```python
class CashEfficiencyEngine:
    """
    Implements the principal-agent mechanism design.
    
    Cash Efficiency Score (CES):
        CES = 1 - (avg_idle_cash / avg_vault_balance)
        
    Branch Manager Incentive Score:
        BMIS = w1 × CES + w2 × (1 - stockout_rate) + w3 × forecast_adherence
        where:
            w1 = 0.5 (efficiency weight)
            w2 = 0.3 (service quality weight — no stockouts)
            w3 = 0.2 (model trust weight — how close to recommended level)
    
    Nash Equilibrium Analysis:
        - Compute payoff matrix for branch manager strategies:
          {Hoard, Trust_Model, Aggressive_Minimize}
        - vs Treasury strategies:
          {Guarantee_Emergency_CIT, No_Guarantee, Penalty_Only}
        - Find Nash equilibrium (should be Trust_Model + Guarantee)
        
    Rank all branches by BMIS, identify top/bottom deciles.
    """
```

### 4. API Endpoints (api/forecasts.py + api/optimization.py)

```python
# GET /api/uc01/branches
# Returns all branches with current vault metrics, CES scores

# GET /api/uc01/branches/{branch_id}
# Returns detailed branch data + last 30 days vault history

# POST /api/uc01/forecast/{branch_id}
# Runs LSTM forecast for next 7 days, returns with confidence intervals

# POST /api/uc01/optimize/{branch_id}
# Runs stochastic optimizer, returns recommended vault level + savings

# GET /api/uc01/network-summary
# Aggregate: total idle cash, avg CES, total savings potential, top/bottom branches

# POST /api/uc01/game-theory/{branch_id}
# Returns Nash equilibrium analysis, BMIS score, payoff matrix

# POST /api/uc01/claude-analyze/{branch_id}
# Proxies to Claude API with branch data, returns AI optimization recommendations
# Use the Anthropic Python SDK
# Model: claude-sonnet-4-20250514
# Prompt should include all branch metrics, SBP constraints, and ask for:
#   risk_assessment, recommended_vault_level, daily_savings, annual_impact,
#   actions (3-5 specific), denomination_split, forecast_confidence,
#   game_theory_insight
```

### 5. Claude AI Integration (api/claude_ai.py)

```python
import anthropic

class ClaudeOptimizer:
    """
    Proxy to Claude API for AI-powered branch analysis.
    Uses structured prompting with branch data + SBP constraints.
    Returns parsed JSON with actionable recommendations.
    
    The prompt template should be comprehensive:
    - Full branch metrics (vault, deposits, withdrawals, CES, type)
    - SBP regulatory context (CRR, penalty structure, CDM mandate)
    - Historical patterns (last 30 days trend)
    - Ask for JSON response with specific fields
    - Include game theory framing (principal-agent)
    """
```

## FRONTEND: UC-01 Dashboard

### Design Language
- Bloomberg Terminal aesthetic: dark background (#0a0e17), monospace data, gold (#d4a853) accents
- Dense information layout — every pixel earns its place
- JetBrains Mono for data/numbers, DM Sans for labels
- Subtle animations: fade-in on data load, pulse on live indicators
- Color coding: green (optimal/good), gold (warnings/targets), red (idle/bad), cyan (AI/forecast)

### Page Structure (when user clicks UC-01 from catalogue)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← CATALOGUE  │ UC-01: Branch Vault Forecasting    [ACTIVE] 🟢  │
├─────────────────────────────────────────────────────────────────┤
│ Branches│ Total Idle │ Avg CES │ Savings │ Accuracy │ SBP Rate │
│  1,547  │ 98.5B PKR  │  57%    │ 10.8B   │  94.7%   │  11.0%   │
├────────┬────────────────────────────────────────────────────────┤
│BRANCHES│                                                        │
│ Filter │  ┌─ BRANCH HEADER ──────────────── Annual Savings ─┐  │
│[All   ]│  │ Saddar Main (KHI-001) Karachi    PKR 5.8M/yr    │  │
│[Surpl ]│  │ Vault: 120M cap │ 95M current │ 42M optimal     │  │
│[Defic ]│  └─────────────────────────────────────────────────┘  │
│[Bal   ]│                                                        │
│[Seas  ]│  ┌─ 7-DAY FORECAST ─────┐ ┌─ VAULT UTILIZATION ────┐  │
│        │  │ LSTM + Confidence Band│ │ Stacked Bar: All Brnch │  │
│ Branch │  │ Actual vs Forecast    │ │ Green=Productive       │  │
│ List   │  │ + Optimal Line        │ │ Red=Idle               │  │
│ with   │  └───────────────────────┘ └────────────────────────┘  │
│ CES    │                                                        │
│ scores │  ┌─ TYPE MIX ─┐ ┌─ CLAUDE AI OPTIMIZER ────────────┐  │
│ + idle │  │ Pie Chart  │ │ [VIEW PROMPT] [RUN OPTIMIZATION] │  │
│ bars   │  ├────────────┤ │                                   │  │
│        │  │ GAME THEORY│ │ Risk: HIGH  │ Optimal: 42M       │  │
│        │  │ Principal- │ │ Daily: PKR 16K │ Annual: 5.8M    │  │
│        │  │ Agent box  │ │ Actions: [1] [2] [3] [4]         │  │
│        │  │ Nash Eq.   │ │ Denomination: [chart]             │  │
│        │  │ CES formula│ │ Game Theory Insight: [text]       │  │
│        │  └────────────┘ └───────────────────────────────────┘  │
└────────┴────────────────────────────────────────────────────────┘
```

### Components to Build:

1. **BranchList.jsx** — Left sidebar with search, type filters, scrollable branch cards showing name, ID, city, CES bar, idle cash indicator. Selected branch highlighted with gold left border.

2. **BranchDetail.jsx** — Right panel header showing selected branch metrics (vault cap, current, optimal, idle, CES), annual savings calculation at 11%.

3. **ForecastChart.jsx** — Recharts ComposedChart with:
   - Area for 95% confidence band (light blue fill)
   - Line for actual demand (red, solid)
   - Line for LSTM forecast (gold, dashed)
   - Line for optimal vault level (green, thin)
   - Fetches from /api/uc01/forecast/{branch_id}

4. **VaultChart.jsx** — Recharts stacked BarChart showing productive vs idle cash for top 15 branches. Green stack = optimal, red stack = idle.

5. **ClaudePanel.jsx** — Interactive AI panel:
   - "VIEW PROMPT" toggle shows the raw prompt being sent
   - "RUN OPTIMIZATION" button calls /api/uc01/claude-analyze/{branch_id}
   - Response renders: risk badge, recommended level, savings, actions list, denomination split mini-bars, game theory insight in teal box
   - Loading spinner with "Running stochastic optimization model..." text

6. **GameTheoryCard.jsx** — Teal-bordered card explaining:
   - Principal-Agent framing
   - Nash Equilibrium outcome
   - CES mechanism formula
   - Payoff matrix visualization (small 3x3 grid)

7. **KPIStrip.jsx** — Horizontal metrics bar (reusable across all UCs)

### Zustand Store (stores/appStore.js):
```javascript
{
  currentUC: "catalog" | "uc01" | ... | "uc10",
  selectedBranch: null | BranchObject,
  branchFilter: "All" | "Cash-Surplus" | ...,
  forecastData: [],
  optimizationResult: null,
  claudeResponse: null,
  isLoading: false,
  branches: [],
  networkSummary: {},
  
  // Actions
  setCurrentUC, selectBranch, setFilter,
  fetchBranches, fetchForecast, runOptimization, runClaudeAnalysis
}
```

### API Integration (hooks/useAPI.js):
- axios instance with baseURL http://localhost:8000/api
- Error handling with toast-style error display
- Loading states managed via Zustand

## CRITICAL REQUIREMENTS:
1. Backend forecast endpoint must actually run the LSTM model (even on synthetic data) — not mock
2. The stochastic optimizer must solve a real LP — not fake numbers
3. Claude API call must use real Anthropic SDK with the API key from .env
4. All charts must be interactive (tooltips, click-to-select)
5. Branch selection in sidebar must update ALL panels on the right
6. The forecast chart confidence band must reflect actual model uncertainty
7. CES formula must be computed from real data, not hardcoded
8. Test with: cd backend && python -c "from app.services.uc01_vault_forecast import *; print('UC-01 OK')"
9. The UI must feel like a Bloomberg Terminal — dense, dark, data-rich, professional
10. Include error handling for when Claude API key is missing or API fails

Run backend and frontend. Verify full flow: select branch → see forecast → run optimizer → get Claude analysis.
```

---

# USE CASE 02: ATM Cash Replenishment Optimization

## Claude Code Prompt — UC-02

```
Implement UC-02 (ATM Cash Replenishment Optimization) in the cash-optimization-engine project. Build on the existing skeleton.

## CONTEXT
- Existing project at ~/projects/cash-optimization-engine/ with UC-01 complete
- 2,180 ATMs in the database linked to branches
- Each ATM has: atm_id, branch_id, location, cassette_capacity (PKR 3-8M), denomination_slots (4 cassettes), avg_daily_dispense, uptime_pct, last_loaded_date

## BACKEND: services/uc02_atm_optimizer.py

### 1. ATM Demand Forecasting (Per-ATM LSTM)

Adapt the UC-01 LSTM for ATM-level granularity:
- Shorter lookback (14 days) since ATM patterns are more volatile
- Additional features: hour_of_day_peak_distribution, nearby_event_flag, atm_type (lobby/offsite/mall), competitor_atm_proximity
- Output: hourly dispense forecast rolled up to daily + denomination breakdown
- Train a single model with ATM-type embeddings (not 2,180 separate models)

### 2. (s,S) Inventory Policy Optimizer

```python
class ATMInventoryOptimizer:
    """
    Computes optimal (s, S) policy per ATM per denomination.
    
    s = reorder point (trigger CIT when cassette drops to this level)
    S = order-up-to level (how much to load)
    
    Uses dynamic programming:
    - State: current cassette level by denomination
    - Decision: when to trigger CIT, how much per denomination
    - Cost model:
        - Holding cost: idle_cash × (policy_rate / 365) per day
        - Stockout cost: PKR 50,000 per event (customer loss + brand damage)
        - CIT trip cost: PKR 15,000 fixed + PKR 2/km variable
        - Partial stockout cost: PKR 10,000 (wrong denomination available)
    
    Solve via value iteration over 30-day horizon.
    """
```

### 3. Deep Q-Network (DQN) Agent

```python
class ATMReplenishmentDQN:
    """
    RL agent that learns ATM loading policy through simulation.
    
    State (per ATM):
        - cassette_levels: [slot1_pct, slot2_pct, slot3_pct, slot4_pct]
        - day_of_week, is_salary_period, is_eid_window
        - days_since_last_load
        - forecast_next_3_days: [d1, d2, d3]
        - atm_type_encoding
        
    Actions (discrete):
        - 0: Do nothing
        - 1: Light load (fill to 50%)
        - 2: Standard load (fill to 75%)
        - 3: Full load (fill to 100%)
        - 4: Denomination rebalance (swap cassette mix)
    
    Reward:
        R = -holding_cost - stockout_penalty - cit_cost + availability_bonus
        
    Architecture: 3-layer MLP (128, 64, 32) with experience replay buffer.
    Train for 10,000 episodes on simulated ATM environment.
    Compare DQN policy vs (s,S) baseline vs current bank practice.
    """
```

### 4. Game Theory: Bank vs CIT Provider (Stackelberg)

```python
class StackelbergCITGame:
    """
    Stackelberg game where Bank (leader) sets CIT schedule,
    CIT provider (follower) optimizes routes.
    
    Bank's strategy: number of CIT trips per week per region
    CIT's strategy: route optimization given bank's schedule
    
    Bank's payoff: -idle_cash_cost - cit_fee + availability_value
    CIT's payoff: cit_fee - route_cost - overtime_cost
    
    Contract designs to evaluate:
    1. Fixed fee per trip (current)
    2. Performance-based: fee tied to ATM uptime >99%
    3. Shared savings: 50/50 split of savings from fewer trips
    
    Solve via backward induction: CIT best-responds to each bank strategy,
    bank chooses strategy maximizing own payoff given CIT's best response.
    """
```

### 5. API Endpoints

```
GET  /api/uc02/atms                          — All ATMs with current metrics
GET  /api/uc02/atms/{atm_id}                 — ATM detail + cassette history
POST /api/uc02/forecast/{atm_id}             — LSTM forecast
POST /api/uc02/optimize/{atm_id}             — (s,S) policy recommendation
POST /api/uc02/dqn-recommend/{atm_id}        — DQN agent action
GET  /api/uc02/network-summary               — Fleet-wide metrics
POST /api/uc02/stackelberg-analysis           — CIT game analysis
POST /api/uc02/claude-analyze/{atm_id}       — Claude AI for ATM optimization
```

## FRONTEND: UC-02 Dashboard

Same layout pattern as UC-01 but adapted:

- Left sidebar: ATM list with search, filter by type (Lobby/Offsite/Mall), region, uptime status
- Each ATM card shows: cassette fill level (4 mini bars per denomination), days since last load, uptime %, dispense rate
- Right panel:
  - ATM header with cassette visualization (4 cylinders showing fill level per denomination)
  - Forecast chart: hourly dispense prediction with denomination breakdown
  - (s,S) Policy visualization: timeline showing optimal reorder points and load events
  - DQN vs Baseline comparison: bar chart showing cost comparison of three strategies
  - Stackelberg Game panel: contract comparison table, CIT cost breakdown
  - Claude AI panel adapted for ATM context

### Unique UI Element: ATM Cassette Visualizer
Build a visual component showing 4 cassette slots as vertical cylinders:
- Each colored by denomination (Rs.5000=gold, Rs.1000=blue, Rs.500=green, Rs.100=teal)
- Fill level animated from 0 to current
- Red zone at bottom (below reorder point s)
- Dashed line at order-up-to level S

Wire into the catalogue: UC-02 card should now be clickable with status "ACTIVE".
```

---

# USE CASE 03: Inter-Branch Cash Netting & Routing

## Claude Code Prompt — UC-03

```
Implement UC-03 (Inter-Branch Cash Netting & Routing) in cash-optimization-engine.

## BACKEND: services/uc03_netting.py

### 1. Network Flow Model

```python
class BranchCashNetwork:
    """
    Model the 1,547-branch network as directed graph G=(V,E).
    
    Nodes: branches (with supply/demand = excess/shortfall vs optimal vault)
    Edges: feasible CIT routes between branches in same city/region
    Edge cost: distance_km × PKR_per_km + time_hours × opportunity_cost_per_hour
    Edge capacity: CIT vehicle max (PKR 50M per trip)
    
    Problem: Minimum Cost Network Flow
    - Source nodes: surplus branches (supply > 0)
    - Sink nodes: deficit branches (demand > 0)
    - Transshipment: Hub/CPC branches
    
    Solve using:
    1. networkx min_cost_flow for exact solution
    2. Google OR-Tools for large-scale with side constraints
    
    Compare: direct netting flow vs all-through-central-vault flow
    Compute: trips saved, cash-in-transit time saved, cost saved
    """
```

### 2. VCG Auction Mechanism

```python
class CashAuction:
    """
    Vickrey-Clarke-Groves auction for internal cash market.
    
    Surplus branches submit asks: (quantity, min_price) 
        where price = opportunity cost of holding cash extra hours
    Deficit branches submit bids: (quantity, max_price)
        where price = emergency CIT cost they'd pay if not matched
    
    VCG mechanism:
    1. Find efficient allocation (max total surplus)
    2. Charge each participant their externality (not their bid)
    3. Proves: truthful bidding is dominant strategy
    
    Output: matching of surplus→deficit pairs with quantities, 
    internal transfer prices, CIT routes for matched pairs
    """
```

### 3. API Endpoints
```
GET  /api/uc03/network-flow          — Current network flow solution
POST /api/uc03/run-auction           — Execute VCG auction
GET  /api/uc03/savings-analysis      — Netting vs central vault comparison
POST /api/uc03/claude-analyze        — AI analysis of network efficiency
```

## FRONTEND
- Network graph visualization using d3-force layout showing branches as nodes colored by type, edges showing cash flows, thickness = flow amount
- Auction results table: matched pairs, quantities, internal prices
- Savings comparison: side-by-side bar chart (central vault routing vs direct netting)
- Heatmap: city-level surplus/deficit map

Wire UC-03 card in catalogue as clickable with status "ACTIVE".
```

---

# USE CASE 04: CRR Float Engineering

## Claude Code Prompt — UC-04

```
Implement UC-04 (CRR Float Engineering & Regulatory Arbitrage) in cash-optimization-engine.

## BACKEND: services/uc04_crr_float.py

### 1. CRR Band Optimizer

```python
class CRRFloatOptimizer:
    """
    7-day rolling dynamic program for CRR position management.
    
    SBP Rules:
    - Weekly avg CRR ≥ 6% on (demand liabilities + time liabilities < 1yr)
    - Daily minimum CRR ≥ 4%
    - Maintenance period: Friday to Thursday
    - CRR held at SBP earns 0% (non-interest-bearing)
    
    State: (day_in_week, cumulative_crr_deposit, deposit_base_forecast)
    Decision: CRR deposit amount for today (between 4% floor and chosen ceiling)
    
    Freed liquidity = (6% - actual_today%) × deposit_base
    Deployed at: overnight repo rate (policy_rate - 50bps = 10.5%)
    
    Objective: Maximize sum(freed_liquidity × overnight_rate) over 7 days
    Subject to: weekly_avg ≥ 6%, daily ≥ 4%, P(violation) < 0.001
    
    Solve via backward induction DP + Monte Carlo for deposit base uncertainty.
    
    Game theory layer: model as repeated game with SBP.
    Conservative strategy: never go below 4.5% daily (buffer).
    Aggressive strategy: hit 4.0% floor on low-demand days.
    Compute expected income for each strategy profile.
    """
```

### 2. API Endpoints
```
GET  /api/uc04/crr-position          — Current week CRR status
POST /api/uc04/optimize-week         — Run DP optimizer for current week
GET  /api/uc04/strategy-comparison   — Conservative vs Aggressive payoffs
POST /api/uc04/claude-analyze        — AI analysis with regulatory insight
```

## FRONTEND
- 7-day CRR timeline chart: daily CRR % with 4% floor (red dashed), 6% target (gold dashed), actual (blue solid), cumulative avg line
- Freed liquidity chart: daily bar showing PKR freed and repo income earned
- Strategy game tree visualization: decision tree with payoffs at each node
- Regulatory risk gauge: speedometer-style showing how close to SBP attention threshold

Wire UC-04 in catalogue.
```

---

# USE CASE 05: Nostro Balance Optimization

## Claude Code Prompt — UC-05

```
Implement UC-05 (Nostro Account Balance Optimization) in cash-optimization-engine.

## BACKEND: services/uc05_nostro.py

### 1. Multi-Currency MDP

```python
class NostroOptimizer:
    """
    Markov Decision Process for nostro account management.
    
    Accounts: 35 correspondent banks across USD, EUR, GBP, AED, SAR, CNY, JPY
    
    State per account: (balance, pending_obligations, fx_rate, days_to_next_settlement)
    Actions: hold, transfer_to_other_nostro, place_overnight_deposit, repatriate_to_pkr, pre_fund_obligation
    Transitions: stochastic LC arrivals, remittance flows, FX rate changes (GARCH model)
    Reward: interest_earned - transfer_cost - overdraft_penalty - relationship_damage
    
    FX Carry layer: compare USD earning (Fed Funds ~4.5%) vs PKR earning (10.5%)
    accounting for forward premium/discount.
    
    Nash Bargaining: model minimum balance negotiation with each correspondent.
    """
```

### 2. API + Frontend
- Dashboard showing all 35 nostro accounts on a world map
- Currency-grouped balance treemap
- Optimization recommendation per account
- FX carry analysis table: currency pair, interest differential, forward points, net carry

Wire UC-05 in catalogue.
```

---

# USE CASE 06: Vostro Liability Optimization

## Claude Code Prompt — UC-06

```
Implement UC-06 (Vostro Liability Optimization) in cash-optimization-engine.

## BACKEND: services/uc06_vostro.py

### 1. Liquidity-at-Risk (LaR) Framework

```python
class VostroLaREngine:
    """
    Model vostro balances as stochastic funding source.
    
    For each vostro account:
    - Compute historical outflow distribution (1-day, 7-day, 30-day)
    - LaR = 99th percentile of outflow distribution
    - Stable portion = total_balance - LaR (can be deployed in longer instruments)
    - Volatile portion = LaR buffer (stays in overnight instruments)
    
    Deployment strategy:
    - Stable portion → 3-6 month T-bills (yield: 11.5-12%)
    - Volatile portion → overnight repo (yield: 10.5%)
    - Incremental income = stable × (tbill_rate - overnight_rate)
    
    Cooperative game: reciprocal rate incentives with correspondent banks
    for maintaining stable vostro balances.
    """
```

### 2. API + Frontend
- Vostro account table with LaR indicators
- Stable vs volatile split visualization (stacked area over time)
- Deployment recommendation per account
- Cooperative game payoff matrix showing reciprocal relationship benefits

Wire UC-06 in catalogue.
```

---

# USE CASE 07: Denomination Mix Optimization

## Claude Code Prompt — UC-07

```
Implement UC-07 (Denomination Mix Optimization & SBP Penalty Avoidance) in cash-optimization-engine.

## BACKEND: services/uc07_denomination.py

### 1. NSGA-II Multi-Objective Optimizer

```python
class DenominationOptimizer:
    """
    Multi-objective optimization for denomination mix per branch type.
    
    Decision variables: % allocation to each denomination
    [Rs.5000, Rs.1000, Rs.500, Rs.100, Rs.50, Rs.20, Rs.10]
    
    Objectives (minimize all):
    1. Denomination mismatch cost: Σ|demand_pct_i - supply_pct_i| × cost_i
    2. SBP penalty risk score: f(unsorted_notes, vault_compliance, CCTV, insurance)
    3. Sorting/CPC throughput time: notes_per_minute efficiency
    
    Constraints:
    - Sum of allocations = 100%
    - Min 5% in any denomination that has >1% demand
    - ATM cassettes only accept Rs.5000, Rs.1000, Rs.500
    - Eid period: min 20% in Rs.50 and below (Eidi demand)
    
    Solve using NSGA-II (Non-dominated Sorting Genetic Algorithm II)
    from scipy or pymoo to generate Pareto frontier.
    
    Robust optimization layer: worst-case demand scenario for Eid/Ramadan.
    """
```

### 2. API + Frontend
- Pareto frontier scatter plot (clickable — select a solution)
- Denomination split as stacked horizontal bar per branch
- SBP penalty tracker: heatmap of branches by compliance score
- Seasonal demand overlay showing denomination demand shifts during Eid/Ramadan/crop

Wire UC-07 in catalogue.
```

---

# USE CASE 08: CIT Route Optimization

## Claude Code Prompt — UC-08

```
Implement UC-08 (CIT Route Optimization & Dynamic Scheduling) in cash-optimization-engine.

## BACKEND: services/uc08_cit_routing.py

### 1. VRPTW Solver

```python
class CITRouteOptimizer:
    """
    Vehicle Routing Problem with Time Windows for CIT fleet.
    
    Fleet: 150 armored vehicles across Pakistan
    - Karachi: 45 vehicles
    - Lahore: 35 vehicles
    - Islamabad/Rawalpindi: 20 vehicles
    - Others: distributed proportionally
    
    Each vehicle:
    - Capacity: PKR 100M max per trip
    - Operating hours: 8:00-18:00
    - Max stops per route: 12
    
    Each branch stop:
    - Time window: [earliest_acceptable, latest_acceptable]
    - Service time: 20 min (pickup) or 30 min (delivery + verification)
    - Demand: cash to pickup or deliver (from UC-01 optimizer output)
    
    Objective: Minimize total distance + total time + security risk score
    
    Security constraints:
    - Max PKR value in vehicle at any point < PKR 100M
    - Avoid high-risk areas between 12:00-14:00 and after 16:00
    - No vehicle waits stationary > 15 min (except at branch)
    
    Solve using Google OR-Tools CP-SAT or routing solver.
    Add dynamic re-routing: if branch triggers emergency request,
    use cheapest insertion heuristic on active routes.
    
    Shapley value cost allocation: fairly distribute total CIT cost
    across branches proportional to their marginal contribution.
    """
```

### 2. API + Frontend
- Route map visualization (using branch lat/lng on city map via SVG)
- Vehicle fleet dashboard: status, current route, next stops
- Before/after comparison: current schedule vs optimized
- Savings breakdown: trips saved, km saved, time saved, cost saved
- Dynamic re-routing simulator: click to trigger emergency on a branch

Wire UC-08 in catalogue.
```

---

# USE CASE 09: Digital Channel Incentivization

## Claude Code Prompt — UC-09

```
Implement UC-09 (Digital Channel Incentivization & Cash Demand Deflection) in cash-optimization-engine.

## BACKEND: services/uc09_digital_incentive.py

### 1. Multi-Armed Bandit Incentive Allocator

```python
class IncentiveOptimizer:
    """
    Thompson Sampling multi-armed bandit for incentive allocation.
    
    Customer segments (from profitability engine):
    - Retail Mass (60%): high cash usage, low digital literacy
    - Retail Affluent (15%): moderate cash, high digital potential
    - SME (15%): very high cash (supplier payments), needs education
    - Corporate (8%): low branch cash, already digital
    - Government (2%): salary disbursement, captive
    
    Arms (incentive types):
    1. Cashback on Raast transfers (0.5% up to PKR 500/mo)
    2. Fee waiver on digital bill payments
    3. Loyalty points for mobile banking transactions
    4. Tiered pricing: surcharge on cash transactions >PKR 50K
    5. Social proof nudge: "85% in your area use mobile banking"
    6. Digital-only product access (better savings rate)
    
    Reward signal: Δ(digital_txn_pct) for each customer post-treatment
    
    Budget constraint: total incentive spend ≤ PKR 500M/year
    Per-segment allocation optimized by Thompson Sampling.
    
    Subgame perfect equilibrium: incentive = customer switching cost.
    """
```

### 2. API + Frontend
- Segment dashboard: 5 customer segments with cash vs digital split
- A/B test simulator: select arms per segment, simulate outcomes
- Budget allocation Sankey diagram: budget → segments → channels
- ROI calculator: cost of incentives vs savings from cash reduction
- Nudge preview: mock mobile banking screens showing each nudge

Wire UC-09 in catalogue.
```

---

# USE CASE 10: Cash P&L Attribution

## Claude Code Prompt — UC-10

```
Implement UC-10 (Cash P&L Attribution & Branch Profitability) in cash-optimization-engine.

## BACKEND: services/uc10_pnl_attribution.py

### 1. Activity-Based Costing Engine

```python
class CashPnLEngine:
    """
    Full ABC model for cash operations cost attribution.
    
    Activities & Cost Drivers:
    1. Vault storage → cost per vault-hour per PKR M held
    2. Teller counting → cost per transaction
    3. CIT transport → cost per trip allocated to served branches
    4. ATM loading → cost per load event
    5. CPC sorting → cost per note sorted
    6. SBP deposit/withdrawal → cost per SBP interaction
    7. Denomination management → cost per denomination change
    8. Insurance → proportional to insured vault value
    9. Security personnel → allocated by branch risk grade
    10. Opportunity cost → policy_rate × idle_cash × time
    
    Attribution dimensions:
    - By branch (1,547 branches ranked by cash cost)
    - By customer segment (retail, corporate, SME, govt)
    - By product (current account, savings, fixed deposit, remittance)
    - By region (province, city, urban/rural)
    
    Transfer Pricing Engine:
    - Each branch charged internal "cost of cash" = policy_rate × avg_vault
    - Branches below avg CES pay premium
    - Branches above avg CES get credit
    - Creates internal market incentive for self-optimization
    
    Tournament mechanism: rank all branches by net cash cost,
    top decile gets recognition + bonus, bottom decile gets review.
    """
```

### 2. API + Frontend
- P&L waterfall chart: revenue from freed cash vs all cost categories
- Branch ranking table: sortable by total cash cost, CES, net contribution
- Treemap: cost breakdown by activity, colored by category
- Transfer pricing dashboard: what each branch is charged/credited
- Executive ALCO report view: summary for board presentation
- Time series: monthly cash P&L trend showing optimization impact

Wire UC-10 in catalogue. All 10 cards should now be clickable with "ACTIVE" status.

### FINAL: Update Catalogue
Ensure the main catalogue view shows all 10 use cases with:
- Correct status badges (all ACTIVE)
- Click navigation to each UC dashboard
- Summary KPIs updated from real computed data
- Total impact figure dynamically computed from all UC savings
```

---

# EXECUTION ORDER

| Step | What | Claude Code Prompt |
|------|------|--------------------|
| 0 | Environment + Skeleton | Phase 0 prompt above |
| 1 | UC-01: Branch Vault | UC-01 prompt above |
| 2 | UC-02: ATM Replenishment | UC-02 prompt above |
| 3 | UC-03: Inter-Branch Netting | UC-03 prompt above |
| 4 | UC-04: CRR Float | UC-04 prompt above |
| 5 | UC-05: Nostro | UC-05 prompt above |
| 6 | UC-06: Vostro | UC-06 prompt above |
| 7 | UC-07: Denomination | UC-07 prompt above |
| 8 | UC-08: CIT Routing | UC-08 prompt above |
| 9 | UC-09: Digital Incentives | UC-09 prompt above |
| 10 | UC-10: Cash P&L | UC-10 prompt above |

**Execute one at a time. Verify each UC works before moving to the next.**
**Each prompt is self-contained and assumes previous UCs are complete.**

---

*Prepared by Godaitec (godai.tech) | March 2026 | Confidential*
