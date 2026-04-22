# CASH OPTIMIZATION ENGINE — Claude Code Prompt Playbook

## Godaitec × UBL | 10 Use Cases | Complete Build Guide

**Machine:** ASUS Laptop, RTX 4080 (12GB VRAM), 32GB RAM
**Environment:** WSL2 Ubuntu, VSCode, Conda, Claude Code
**Stack:** Python (FastAPI + ML) + React (Vite + TailwindCSS + Recharts)

### DESIGN PHILOSOPHY: COMPUTATION-FIRST, AI-LIGHT

This application is **95% local computation, 5% optional AI commentary.**
All forecasting, optimization, game theory, and scoring runs locally using
PyTorch, scipy, OR-Tools, PuLP, and networkx on the RTX 4080.

The OpenAI GPT-4.1 integration is a **single optional "Ask AI" button** per use case
that sends a pre-computed summary to GPT for a plain-English executive brief.
The app works 100% without any API calls. AI is garnish, not the engine.

**AI Call Budget:** Max 1 API call per user action, only when user explicitly clicks "Ask AI".
No background AI calls. No streaming. No auto-analysis. User controls every API hit.

---

# PHASE 0: ENVIRONMENT SETUP

## Claude Code Prompt — Copy & Paste into Claude Code Terminal

```
Create a complete full-stack project called "cash-optimization-engine" (COE) in my WSL2 Ubuntu environment. This is a Bloomberg Terminal-style financial application for Pakistani bank branch cash optimization.

CRITICAL DESIGN RULE: This app is COMPUTATION-FIRST. All forecasting, optimization, scoring, and game theory runs LOCALLY using PyTorch, scipy, OR-Tools etc. There is ONE optional "Ask AI" button per use case that calls OpenAI GPT-4.1 for an executive summary. The entire app must work perfectly with ZERO API calls. The AI button is a bonus feature, not a dependency.

## ENVIRONMENT SETUP

1. Create conda environment:
   - Name: coe
   - Python 3.11
   - Install: fastapi uvicorn sqlalchemy alembic pandas numpy scipy scikit-learn pytorch torchvision statsmodels prophet plotly httpx pydantic python-dotenv websockets ortools pulp networkx pymoo
   - pip install openai

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
│   │   │   ├── ai_summary.py        # Single OpenAI proxy — shared by all UCs
│   │   │   └── dashboard.py
│   │   ├── services/                # Business logic (ALL LOCAL COMPUTATION)
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
│   │       ├── game_theory.py       # Game theory engines
│   │       └── ai_client.py         # OpenAI wrapper (thin, optional)
│   ├── alembic/
│   ├── alembic.ini
│   ├── seed_data.py                 # Populate DB with UBL data
│   └── requirements.txt
├── frontend/
│   ├── (Vite React project)
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
│       │   ├── AISummaryPanel.jsx   # Single reusable AI panel for all UCs
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
│   └── synthetic/
├── notebooks/
│   └── exploration.ipynb
├── .env
├── docker-compose.yml
├── Makefile
└── README.md
```

3. Frontend setup:
   - cd frontend && npm create vite@latest . -- --template react
   - npm install zustand recharts lucide-react axios tailwindcss @tailwindcss/vite
   - Configure tailwind with dark mode, Bloomberg-style palette

4. Database: SQLite for dev (cash_engine.db)

5. Create .env template:
```
OPENAI_API_KEY=sk-...
DATABASE_URL=sqlite:///./cash_engine.db
SBP_POLICY_RATE=0.11
CRR_WEEKLY_AVG=0.06
CRR_DAILY_MIN=0.04
UBL_TOTAL_BRANCHES=1547
UBL_TOTAL_ATMS=2180
UBL_DEPOSIT_BASE_TRILLIONS=2.54
```

6. Create backend/app/core/ai_client.py — THE ONLY AI FILE IN THE ENTIRE PROJECT:

```python
"""
Thin OpenAI wrapper. Used ONLY when user clicks "Ask AI" button.
The entire application works without this. This is optional garnish.
"""
import os
from openai import OpenAI

client = None

def get_client():
    global client
    if client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        client = OpenAI(api_key=api_key)
    return client

def ask_ai(system_prompt: str, user_content: str) -> dict:
    """
    Single function for ALL AI calls across ALL use cases.
    Returns {"summary": str, "available": bool}
    If no API key or API fails, returns graceful fallback.
    """
    c = get_client()
    if c is None:
        return {"summary": "AI summary unavailable — no OPENAI_API_KEY set. All optimization results above are computed locally.", "available": False}
    
    try:
        response = c.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            max_tokens=800,
            temperature=0.3
        )
        return {"summary": response.choices[0].message.content, "available": True}
    except Exception as e:
        return {"summary": f"AI unavailable: {str(e)}. All optimization results above are computed locally.", "available": False}
```

7. Create backend/app/api/ai_summary.py — SINGLE SHARED ENDPOINT:

```python
"""
One endpoint handles AI summaries for ALL use cases.
Called only when user explicitly clicks "Ask AI" button.
Receives pre-computed optimization results, sends compact summary to GPT.
"""

@router.post("/api/ai-summary")
async def get_ai_summary(request: AISummaryRequest):
    """
    request.use_case: str (uc01, uc02, ... uc10)
    request.context: dict (pre-computed results from local optimization)
    request.question: str (optional user question)
    
    Returns plain-English executive summary of the pre-computed results.
    NO computation happens in AI. AI only narrates what's already computed.
    """
```

8. Create Makefile with targets:
   - `make setup` — create conda env + install deps + init DB
   - `make seed` — generate synthetic UBL data (1547 branches, 2180 ATMs)
   - `make backend` — uvicorn backend
   - `make frontend` — vite dev server
   - `make dev` — run both concurrently
   - `make migrate` — alembic upgrade head

9. Create backend/app/core/constants.py with ALL SBP regulatory constants:
   - CRR rates (daily min 4%, weekly avg 6%)
   - Policy rate (11%)
   - CDM mandate (25% by CY2028)
   - Penalty structure (PKR 100K for unprocessed notes, etc.)
   - Denomination specs (Rs.5000, Rs.1000, Rs.500, Rs.100, Rs.50, Rs.20, Rs.10)
   - CIT cost per trip estimate (PKR 15,000)
   - Vault insurance rate (0.015% of vault value)

10. Create backend/app/services/data_generator.py:
   - Generate 1,547 synthetic UBL branches across Pakistan
   - Cities: Karachi (380), Lahore (280), Islamabad (120), Rawalpindi (90), Faisalabad (85), Multan (65), Peshawar (60), Hyderabad (55), Quetta (35), Sialkot (30), Gujranwala (28), Bahawalpur (25), Sukkur (22), Abbottabad (18), remaining across 50+ smaller cities
   - Each branch: branch_id, name, city, region, type (Cash-Surplus/Deficit/Balanced/Seasonal/Hub), vault_capacity, avg_daily_deposits, avg_daily_withdrawals, current_vault_balance, optimal_vault_balance, idle_cash, cash_efficiency_score, daily_transactions, lat/lng, manager_name, is_cpc, feeding_branch_id
   - Types: 35% Surplus, 25% Deficit, 20% Balanced, 15% Seasonal, 5% Hub/CPC
   - 365 days daily vault_position per branch with realistic patterns (day-of-week, salary 1st/15th, Eid, Ramadan, crop season)
   - 2,180 ATMs with cassette_capacity, avg_daily_dispense, denomination_split, last_loaded, uptime_pct

11. Wire up main.py with CORS for localhost:5173, include all routers.

12. Create frontend AISummaryPanel.jsx — ONE REUSABLE COMPONENT:
```jsx
/**
 * Shared "Ask AI" panel used across ALL use cases.
 * Props:
 *   useCase: string (uc01-uc10)
 *   computedResults: object (whatever the local optimizer produced)
 *   title: string
 * 
 * Shows a collapsed "Ask AI for Executive Summary" button.
 * Only calls API when user clicks. Shows "AI unavailable" gracefully if no key.
 * Displays AI response in a simple text box below the button.
 * This is NOT a core feature — it's a nice-to-have addon.
 */
```

13. Verify:
    - `conda activate coe && cd backend && python -m uvicorn app.main:app --reload --port 8000`
    - `cd frontend && npm run dev`
    - GET http://localhost:8000/health → {"status": "ok"}
    - GET http://localhost:8000/api/ai-summary/status → {"available": true/false} based on env key
    - Frontend loads at http://localhost:5173

DO NOT build any use case logic yet. Just skeleton, models, data generator, AI wrapper, and working dev env.
```

---

# USE CASE 01: Branch Vault Cash Forecasting & Right-Sizing

## Claude Code Prompt — UC-01

```
Implement UC-01 (Branch Vault Cash Forecasting & Right-Sizing) in the cash-optimization-engine project. This is the flagship use case. ALL computation runs locally. AI is optional.

## CONTEXT
- Project at ~/projects/cash-optimization-engine/
- Conda env: coe (Python 3.11, PyTorch, FastAPI, etc.)
- Frontend: Vite + React + Tailwind + Recharts + Zustand
- DB has 1,547 branches with 365 days of vault position history
- SBP Policy Rate: 11% | CRR: 6% weekly avg, 4% daily min
- OpenAI GPT-4.1 is available via core/ai_client.py but ONLY used when user clicks "Ask AI"

## BACKEND: services/uc01_vault_forecast.py

### 1. LSTM Cash Demand Forecasting Model (LOCAL — runs on RTX 4080)

Build a PyTorch LSTM that predicts next-7-day cash demand per branch:

```python
class BranchCashLSTM(nn.Module):
    """
    LSTM forecaster for branch-level daily cash demand.
    Runs ENTIRELY on local GPU. No API calls.
    
    Features (per day):
    - day_of_week (one-hot 7)
    - day_of_month (1-31 normalized)
    - is_salary_day (1st, 15th of month)
    - is_friday (Islamic weekend effect)
    - is_eid_window (±7 days around Eid-ul-Fitr, Eid-ul-Adha)
    - is_ramadan (30-day window)
    - is_muharram (10 days)
    - crop_season_indicator (Rabi: Nov-Apr, Kharif: May-Oct — Seasonal branches only)
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
    - Output: mean + std (uncertainty quantification)
    - Device: cuda if available, else cpu
    """
```

Training pipeline:
- Split: 300 days train, 65 days validation
- Loss: Negative log-likelihood (Gaussian) for mean + variance
- Optimizer: AdamW, lr=1e-3, weight_decay=1e-4
- Early stopping patience=10
- Save best model to models/uc01_lstm_best.pt
- Metrics: MAPE, MAE, RMSE on validation
- Store forecasts with confidence intervals (5th, 50th, 95th percentiles)

### 2. Stochastic Vault Optimization (LOCAL — scipy/PuLP)

```python
class VaultOptimizer:
    """
    Two-stage stochastic program. Runs locally. No API.
    
    Stage 1 (here-and-now): Decide vault opening balance V₀
    Stage 2 (recourse): After observing actual demand D:
        - If D > V₀: Emergency CIT cost = PKR 45,000
        - If D < V₀: Idle cost = (V₀ - D) × (policy_rate / 365)
    
    Objective: min E[idle_cost + emergency_cost]
    Constraints: branch_minimum ≤ V₀ ≤ vault_capacity
    
    Solve via Sample Average Approximation (SAA):
    - Draw N=1000 scenarios from LSTM forecast distribution
    - Solve deterministic LP using scipy.optimize.linprog or PuLP
    - Returns: optimal_vault_level, expected_savings, confidence_interval
    """
```

### 3. Cash Efficiency Scoring Engine (LOCAL — pure Python math)

```python
class CashEfficiencyEngine:
    """
    Game theory mechanism design. All computed locally.
    
    Cash Efficiency Score (CES):
        CES = 1 - (avg_idle_cash / avg_vault_balance)
        
    Branch Manager Incentive Score (BMIS):
        BMIS = 0.5 × CES + 0.3 × (1 - stockout_rate) + 0.2 × forecast_adherence
    
    Nash Equilibrium Analysis:
        Payoff matrix for strategies:
        Branch Manager: {Hoard, Trust_Model, Aggressive_Minimize}
        Treasury: {Guarantee_Emergency_CIT, No_Guarantee, Penalty_Only}
        
        Compute using iterated elimination of dominated strategies.
        Nash eq should be (Trust_Model, Guarantee_Emergency_CIT).
    
    Branch ranking by BMIS — identify top/bottom deciles.
    ALL pure computation. No AI.
    """
```

### 4. API Endpoints

```python
# ALL these endpoints run LOCAL computation only:

# GET /api/uc01/branches
# Returns all branches with vault metrics, CES scores — from DB

# GET /api/uc01/branches/{branch_id}
# Detailed branch + last 30 days vault history — from DB

# POST /api/uc01/forecast/{branch_id}
# Runs LSTM model on GPU → returns 7-day forecast with CI — LOCAL

# POST /api/uc01/optimize/{branch_id}
# Runs stochastic optimizer → returns recommended vault level — LOCAL

# GET /api/uc01/network-summary
# Aggregate totals computed from DB — LOCAL

# POST /api/uc01/game-theory/{branch_id}
# Nash equilibrium + BMIS + payoff matrix — LOCAL

# POST /api/uc01/ai-brief/{branch_id}   ← THE ONLY AI ENDPOINT
# This is the ONLY endpoint that touches OpenAI.
# It gathers ALL pre-computed results (forecast, optimization, CES, game theory)
# packages them into a compact summary, and sends to GPT-4.1 with this prompt:
#
# System: "You are a senior bank treasury analyst. Given pre-computed optimization 
# results for a Pakistani bank branch, write a 4-5 sentence executive brief. 
# Include: risk assessment, key action, expected savings. Be specific with numbers.
# Do NOT recompute anything — just narrate the provided results clearly."
#
# User: "{branch_name} ({branch_id}), {city}, Type: {type}
# LSTM Forecast: {next_7_day_avg}M/day (MAPE: {mape}%)
# Optimizer: Current vault {current}M → Recommended {optimal}M
# Idle cash: {idle}M → Annual savings: {savings}M at 11%
# CES: {ces}% | BMIS: {bmis} | Nash: {equilibrium}
# SBP compliance: {status}"
#
# Returns the AI text. Called ONLY when user clicks "Ask AI" in frontend.
```

## FRONTEND: UC-01 Dashboard

### Design: Bloomberg Terminal aesthetic
- Dark bg (#0a0e17), JetBrains Mono for data, DM Sans for labels
- Gold (#d4a853) accents, dense layout, every pixel earns its place

### Layout

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
│        │  │ LSTM local model      │ │ Stacked Bar: Branches  │  │
│ Branch │  │ Actual vs Forecast    │ │ Green=Productive       │  │
│ List   │  │ + Confidence Band     │ │ Red=Idle               │  │
│ with   │  │ + Optimal Line        │ │ (no AI — pure data)    │  │
│ CES    │  └───────────────────────┘ └────────────────────────┘  │
│ bars   │                                                        │
│        │  ┌─ GAME THEORY ────────┐ ┌─ OPTIMIZER OUTPUT ──────┐  │
│        │  │ Payoff Matrix (3x3)  │ │ Recommended: 42M        │  │
│        │  │ Nash Equilibrium     │ │ Savings: PKR 5.8M/yr    │  │
│        │  │ CES: 75% BMIS: 0.82 │ │ Confidence: 95%         │  │
│        │  │ (all local compute)  │ │ Denomination split bars  │  │
│        │  └──────────────────────┘ │ Stochastic distribution  │  │
│        │                           │                          │  │
│        │  ┌─ ASK AI (optional) ──┐ │ [RUN OPTIMIZER] button  │  │
│        │  │ [💡 Ask AI for Brief]│ │ (runs local scipy/PuLP) │  │
│        │  │ Collapsed by default │ └──────────────────────────┘  │
│        │  │ Shows GPT text only  │                               │
│        │  │ when clicked         │                               │
│        │  └──────────────────────┘                               │
└────────┴─────────────────────────────────────────────────────────┘
```

### Components:

1. **BranchList.jsx** — Left sidebar: search, type filters, branch cards with CES bar and idle indicator. Gold left border on selected.

2. **BranchDetail.jsx** — Header: vault cap, current, optimal, idle, CES, annual savings at 11%. All from DB/computed locally.

3. **ForecastChart.jsx** — Recharts ComposedChart:
   - Area: 95% confidence band
   - Line: actual (red), LSTM forecast (gold dashed), optimal vault (green)
   - Data from /api/uc01/forecast/{branch_id} — LOCAL LSTM on GPU

4. **VaultChart.jsx** — Stacked BarChart: productive (green) vs idle (red) for top 15 branches. Pure DB data.

5. **OptimizerPanel.jsx** — Shows stochastic optimizer output:
   - "RUN OPTIMIZER" button → calls local scipy endpoint
   - Displays: recommended vault, savings, confidence interval
   - Scenario distribution histogram (1000 SAA scenarios)
   - Denomination split as horizontal stacked bars
   - All LOCAL computation. No AI.

6. **GameTheoryCard.jsx** — Teal-bordered card:
   - 3×3 payoff matrix visualization
   - Nash equilibrium highlighted
   - CES and BMIS scores
   - Principal-agent explanation text
   - ALL hardcoded logic + computed from DB. No AI.

7. **AISummaryPanel.jsx** — SHARED COMPONENT (used across all UCs):
   - Collapsed by default, showing only: "💡 Ask AI for Executive Brief"
   - On click: calls /api/uc01/ai-brief/{branch_id}
   - Shows loading spinner: "Generating brief..."
   - Displays 4-5 sentence plain text summary from GPT-4.1
   - If no API key: shows "AI unavailable — all results above are locally computed"
   - Gray border, understated design — clearly secondary to the main computational panels
   - THIS IS THE ONLY COMPONENT THAT TOUCHES OPENAI

8. **KPIStrip.jsx** — Horizontal metrics bar (reusable, data from DB)

### Zustand Store:
```javascript
{
  currentUC: "catalog" | "uc01" | ... | "uc10",
  selectedBranch: null | BranchObject,
  branchFilter: "All",
  forecastData: [],          // from LOCAL LSTM
  optimizationResult: null,  // from LOCAL scipy
  gameTheoryResult: null,    // from LOCAL computation
  aiBrief: null,             // from OpenAI — only if user clicks
  isOptimizing: false,       // local compute loading
  isAILoading: false,        // AI call loading (separate flag)
  branches: [],
  networkSummary: {},
}
```

### CRITICAL REQUIREMENTS:
1. LSTM forecast runs on RTX 4080 via PyTorch CUDA — NOT an API call
2. Stochastic optimizer uses real scipy LP — NOT an API call
3. Game theory payoff matrix is pure Python — NOT an API call
4. CES/BMIS scores computed from DB — NOT an API call
5. ALL charts render from locally-computed data — no AI dependency
6. The "Ask AI" button is OPTIONAL, COLLAPSED, and visually secondary
7. If OPENAI_API_KEY is missing, the app works identically minus the brief
8. The AI brief receives ONLY pre-computed numbers — it does NO computation
9. AI call uses gpt-4.1 model with max_tokens=800, temperature=0.3
10. Total AI calls per branch analysis: ZERO (default) or ONE (if user clicks)
```

---

# USE CASE 02: ATM Cash Replenishment Optimization

## Claude Code Prompt — UC-02

```
Implement UC-02 (ATM Cash Replenishment Optimization) in cash-optimization-engine. ALL computation local. One optional AI brief button.

## CONTEXT
- Project at ~/projects/cash-optimization-engine/ with UC-01 complete
- 2,180 ATMs in DB linked to branches
- RTX 4080 available for model training

## BACKEND: services/uc02_atm_optimizer.py (ALL LOCAL)

### 1. ATM Demand Forecasting (LOCAL PyTorch on GPU)

Adapt UC-01 LSTM for ATM-level:
- 14-day lookback (shorter, ATMs more volatile)
- Additional features: atm_type (lobby/offsite/mall), day_of_week, salary_period, eid_window
- Single model with ATM-type embeddings (not 2,180 separate models)
- Output: daily dispense forecast + denomination breakdown
- Train on GPU, save to models/uc02_atm_lstm_best.pt

### 2. (s,S) Inventory Policy Optimizer (LOCAL scipy)

```python
class ATMInventoryOptimizer:
    """
    Computes optimal (s, S) policy per ATM per denomination.
    Uses dynamic programming / value iteration. ALL LOCAL.
    
    s = reorder point, S = order-up-to level
    
    Cost model:
    - Holding: idle_cash × (0.11 / 365)
    - Stockout: PKR 50,000/event
    - CIT trip: PKR 15,000 + PKR 2/km
    - Partial stockout (wrong denom): PKR 10,000
    
    Solve via value iteration over 30-day horizon using numpy.
    """
```

### 3. DQN Agent (LOCAL PyTorch on GPU)

```python
class ATMReplenishmentDQN:
    """
    RL agent trained on simulated ATM environment. Runs on RTX 4080.
    
    State: [cassette_levels(4), day_of_week, salary_flag, eid_flag, 
            days_since_load, forecast_3d(3), atm_type(3)]
    Actions: {nothing, light_50pct, standard_75pct, full_100pct, rebalance}
    Reward: -holding_cost - stockout_penalty - cit_cost + availability_bonus
    
    Architecture: MLP (128, 64, 32) with experience replay.
    Train 10,000 episodes locally.
    Compare: DQN vs (s,S) vs current practice.
    """
```

### 4. Stackelberg CIT Game (LOCAL — pure Python game theory)

```python
class StackelbergCITGame:
    """
    Bank (leader) sets schedule, CIT (follower) optimizes routes.
    Solved by backward induction. Pure math, no API.
    
    Compare contracts: fixed-fee, performance-based, shared-savings.
    """
```

### 5. API Endpoints (ALL LOCAL except one)
```
GET  /api/uc02/atms                      — DB query
GET  /api/uc02/atms/{atm_id}             — DB query
POST /api/uc02/forecast/{atm_id}         — LOCAL LSTM on GPU
POST /api/uc02/optimize/{atm_id}         — LOCAL (s,S) value iteration
POST /api/uc02/dqn-recommend/{atm_id}    — LOCAL DQN inference on GPU
GET  /api/uc02/network-summary           — DB aggregation
POST /api/uc02/stackelberg-analysis      — LOCAL game theory
POST /api/uc02/ai-brief/{atm_id}        — ONLY AI CALL: GPT-4.1 brief of pre-computed results
```

## FRONTEND
Same layout as UC-01 adapted for ATMs:
- Left: ATM list with cassette fill bars, uptime, dispense rate
- Right panels ALL from local computation:
  - ATM Cassette Visualizer: 4 vertical cylinders (Rs.5000=gold, Rs.1000=blue, Rs.500=green, Rs.100=teal) with fill levels, red zone below s, dashed line at S
  - Forecast chart from local LSTM
  - DQN vs (s,S) vs Baseline cost comparison bar chart
  - Stackelberg game contract comparison table
  - "Ask AI" panel — same shared AISummaryPanel, collapsed by default

Wire UC-02 card in catalogue as clickable.
```

---

# USE CASE 03: Inter-Branch Cash Netting & Routing

## Claude Code Prompt — UC-03

```
Implement UC-03 (Inter-Branch Cash Netting) in cash-optimization-engine. ALL LOCAL computation.

## BACKEND: services/uc03_netting.py (ALL LOCAL)

### 1. Network Flow (LOCAL — networkx + OR-Tools)

```python
class BranchCashNetwork:
    """
    Min-cost network flow on 1,547-branch graph.
    Uses networkx.min_cost_flow() or OR-Tools for scale.
    
    Source: surplus branches, Sink: deficit branches
    Edge cost: distance × PKR/km + time × opportunity_cost/hr
    Edge capacity: PKR 50M per CIT trip
    
    Compares: direct netting vs all-through-central-vault.
    ALL LOCAL. No API.
    """
```

### 2. VCG Auction (LOCAL — pure Python mechanism design)

```python
class CashAuction:
    """
    Vickrey-Clarke-Groves auction for internal cash market.
    Pure math. No API. Truthful mechanism — dominant strategy.
    """
```

### 3. Endpoints: ALL local + one ai-brief
### 4. Frontend: Network graph (d3-force), auction table, savings comparison, city heatmap

Wire UC-03 in catalogue.
```

---

# USE CASE 04: CRR Float Engineering

## Claude Code Prompt — UC-04

```
Implement UC-04 (CRR Float Engineering) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc04_crr_float.py (ALL LOCAL)

### 1. CRR Band Optimizer (LOCAL — dynamic programming with numpy)

```python
class CRRFloatOptimizer:
    """
    7-day rolling DP: Friday-to-Thursday.
    State: (day, cumulative_crr, deposit_base_forecast)
    Decision: CRR deposit today (4% floor to chosen ceiling)
    Freed liquidity deployed at overnight repo 10.5%
    
    DP solved via backward induction + Monte Carlo for uncertainty.
    ALL LOCAL. No API.
    """
```

### 2. Repeated Game with SBP (LOCAL — payoff computation)

Compare Conservative (never below 4.5%) vs Aggressive (hit 4.0% floor).

### 3. Endpoints: ALL local + one ai-brief
### 4. Frontend: 7-day CRR timeline, freed liquidity bars, strategy game tree, risk gauge

Wire UC-04 in catalogue.
```

---

# USE CASE 05: Nostro Balance Optimization

## Claude Code Prompt — UC-05

```
Implement UC-05 (Nostro Optimization) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc05_nostro.py (ALL LOCAL)

### 1. Multi-Currency MDP (LOCAL — value iteration with numpy)

```python
class NostroOptimizer:
    """
    35 correspondent banks, 7 currencies.
    State: (balance, pending_obligations, fx_rate, days_to_settlement)
    Actions: hold, transfer, overnight_deposit, repatriate, pre_fund
    FX modeled via GARCH (local statsmodels).
    Solved via value iteration. ALL LOCAL.
    """
```

### 2. Nash Bargaining for minimum balances (LOCAL — closed-form)
### 3. Endpoints: ALL local + one ai-brief
### 4. Frontend: World map, currency treemap, FX carry table

Wire UC-05 in catalogue.
```

---

# USE CASE 06: Vostro Liability Optimization

## Claude Code Prompt — UC-06

```
Implement UC-06 (Vostro Optimization) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc06_vostro.py (ALL LOCAL)

### 1. Liquidity-at-Risk (LOCAL — numpy percentile computation)

```python
class VostroLaREngine:
    """
    LaR = 99th percentile of outflow distribution (1d, 7d, 30d).
    Stable portion → T-bills. Volatile → overnight.
    ALL pure statistics. No API.
    """
```

### 2. Cooperative game (LOCAL)
### 3. Endpoints: ALL local + one ai-brief
### 4. Frontend: LaR indicators, stable/volatile split, deployment recommendations

Wire UC-06 in catalogue.
```

---

# USE CASE 07: Denomination Mix Optimization

## Claude Code Prompt — UC-07

```
Implement UC-07 (Denomination Optimization) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc07_denomination.py (ALL LOCAL)

### 1. NSGA-II Multi-Objective (LOCAL — pymoo library)

```python
class DenominationOptimizer:
    """
    3 objectives: mismatch cost, SBP penalty risk, sorting time.
    Decision: % allocation across 7 denominations.
    Pareto frontier via pymoo NSGA-II. ALL LOCAL on CPU.
    
    Robust layer: worst-case Eid/Ramadan demand scenario.
    """
```

### 2. Endpoints: ALL local + one ai-brief
### 3. Frontend: Pareto scatter, denomination stacked bars, penalty heatmap, seasonal overlay

Wire UC-07 in catalogue.
```

---

# USE CASE 08: CIT Route Optimization

## Claude Code Prompt — UC-08

```
Implement UC-08 (CIT Routing) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc08_cit_routing.py (ALL LOCAL)

### 1. VRPTW Solver (LOCAL — Google OR-Tools)

```python
class CITRouteOptimizer:
    """
    150 vehicles, 1,547 branches, time windows.
    Capacity: PKR 100M max, 12 stops max.
    Security constraints: value limits, risk zones, wait limits.
    
    Solved using OR-Tools routing solver. ALL LOCAL.
    Dynamic re-routing via cheapest insertion heuristic.
    Shapley value cost allocation across branches.
    """
```

### 2. Endpoints: ALL local + one ai-brief
### 3. Frontend: Route map (SVG), fleet dashboard, before/after comparison, emergency simulator

Wire UC-08 in catalogue.
```

---

# USE CASE 09: Digital Channel Incentivization

## Claude Code Prompt — UC-09

```
Implement UC-09 (Digital Incentivization) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc09_digital_incentive.py (ALL LOCAL)

### 1. Thompson Sampling Bandit (LOCAL — numpy Beta distributions)

```python
class IncentiveOptimizer:
    """
    5 customer segments × 6 incentive arms.
    Thompson Sampling with Beta priors. ALL LOCAL numpy.
    
    Budget constraint: PKR 500M/year total.
    Reward: change in digital transaction percentage.
    Subgame perfect equilibrium: incentive = switching cost.
    """
```

### 2. Endpoints: ALL local + one ai-brief
### 3. Frontend: Segment dashboard, A/B simulator, budget Sankey, ROI calculator

Wire UC-09 in catalogue.
```

---

# USE CASE 10: Cash P&L Attribution

## Claude Code Prompt — UC-10

```
Implement UC-10 (Cash P&L Attribution) in cash-optimization-engine. ALL LOCAL.

## BACKEND: services/uc10_pnl_attribution.py (ALL LOCAL)

### 1. ABC Costing Engine (LOCAL — pandas computation)

```python
class CashPnLEngine:
    """
    10 activity cost pools, 4 attribution dimensions.
    Transfer pricing: branches charged policy_rate × avg_vault.
    Tournament ranking by net cash cost.
    ALL pandas/numpy computation. No API.
    """
```

### 2. Endpoints: ALL local + one ai-brief
### 3. Frontend: P&L waterfall, branch ranking, cost treemap, transfer pricing dash, ALCO report

Wire UC-10 in catalogue. All 10 cards now clickable and ACTIVE.

### FINAL: Update Catalogue
- All 10 UCs with ACTIVE badges
- Dynamic KPIs from real computed data
- Total impact aggregated across all UCs
- Single consistent "Ask AI" experience across all
```

---

# EXECUTION ORDER

| Step | What | AI Calls | Local Compute |
|------|------|----------|---------------|
| 0 | Environment + Skeleton | 0 | Setup only |
| 1 | UC-01: Branch Vault | 1 optional | LSTM (GPU) + Stochastic LP + Game Theory |
| 2 | UC-02: ATM Replenishment | 1 optional | LSTM (GPU) + DQN (GPU) + (s,S) DP + Stackelberg |
| 3 | UC-03: Inter-Branch Netting | 1 optional | Network Flow (OR-Tools) + VCG Auction |
| 4 | UC-04: CRR Float | 1 optional | Dynamic Programming + Monte Carlo |
| 5 | UC-05: Nostro | 1 optional | MDP Value Iteration + GARCH + Nash Bargaining |
| 6 | UC-06: Vostro | 1 optional | Liquidity-at-Risk Statistics |
| 7 | UC-07: Denomination | 1 optional | NSGA-II Pareto (pymoo) |
| 8 | UC-08: CIT Routing | 1 optional | VRPTW (OR-Tools) + Shapley Value |
| 9 | UC-09: Digital Incentives | 1 optional | Thompson Sampling Bandit |
| 10 | UC-10: Cash P&L | 1 optional | ABC Costing (pandas) |

**Total AI calls for full app usage: 0 (default) to 10 (if user clicks "Ask AI" on every single UC)**
**Total local compute: LSTM training, DQN training, LP solving, DP, NSGA-II, VRPTW, network flow, VCG, statistics**
**AI is garnish. Math is the engine.**

Execute one step at a time. Verify each works before proceeding.

---

*Prepared by Godaitec (godai.tech) | March 2026 | Confidential*
