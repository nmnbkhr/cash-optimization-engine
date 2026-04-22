# Cash Optimization Engine (COE)

Enterprise treasury optimization platform for **United Bank Limited (UBL)**, Pakistan's second-largest bank. Implements 10 interconnected use cases combining ML, operations research, game theory, and mechanism design to optimize PKR 2.54 trillion in deposits across 1,547 branches and 2,180 ATMs.

## Quick Start
```bash
conda activate coe
cd ~/projects/cash-optimization-engine
./start.sh        # starts backend (:8000) + frontend (:5173)
./stop.sh         # kills both
```

## Stack

### Backend
- **Runtime:** Python 3.11, conda env `coe`
- **Framework:** FastAPI 0.109.2 + Uvicorn
- **ORM:** SQLAlchemy 2.0.27, Alembic migrations
- **Database:** SQLite (`backend/cash_engine.db`)
- **ML/AI:** PyTorch 2.11 (CUDA, RTX 4080), Prophet, Statsmodels
- **Optimization:** OR-Tools (VRPTW), PuLP (LP), Pymoo (NSGA-II), SciPy, NetworkX
- **Optional AI:** OpenAI GPT-4.1 (graceful degradation if no API key)

### Frontend
- **Framework:** React 19.2 + Vite 7.3
- **Styling:** TailwindCSS 4.2 (dark theme: `#0a0e17` bg, `#d4a853` gold accent)
- **State:** Zustand 5.0.11
- **Charts:** Recharts 3.8
- **HTTP:** Axios 1.13
- **Icons:** Lucide React

### Node.js
- Managed via **nvm**, requires Node 20+ (v22 LTS installed)

## Architecture

```
cash-optimization-engine/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, router includes
│   │   ├── config.py            # Settings (DB URL, SBP rates, CORS)
│   │   ├── database.py          # SQLAlchemy engine, session, Base
│   │   ├── api/                 # Route handlers (1 file per UC)
│   │   │   ├── branches.py      # /api/branches
│   │   │   ├── dashboard.py     # /api/dashboard
│   │   │   ├── ai_summary.py    # /api/ai-summary
│   │   │   ├── forecasts.py     # /api/forecasts (UC-01)
│   │   │   ├── optimization.py  # /api/optimization
│   │   │   ├── uc02.py – uc10.py
│   │   ├── services/            # Business logic (1 file per UC)
│   │   │   ├── uc01_vault_forecast.py   (1,039 lines)
│   │   │   ├── uc02_atm_optimizer.py    (1,675 lines)
│   │   │   ├── uc03_netting.py          (1,054 lines)
│   │   │   ├── uc04_crr_float.py        (664 lines)
│   │   │   ├── uc05_nostro.py           (557 lines)
│   │   │   ├── uc06_vostro.py           (576 lines)
│   │   │   ├── uc07_denomination.py     (535 lines)
│   │   │   ├── uc08_cit_routing.py      (573 lines)
│   │   │   ├── uc09_digital_incentive.py(529 lines)
│   │   │   ├── uc10_pnl_attribution.py  (536 lines)
│   │   │   └── data_generator.py
│   │   ├── models/              # SQLAlchemy ORM models
│   │   └── core/                # Constants, AI client, game theory
│   ├── alembic/                 # DB migrations
│   ├── seed_data.py             # Synthetic data generator
│   ├── migrate_demo_data.py     # Demo data loader
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root component
│   │   ├── Layout.jsx           # Sidebar + content area
│   │   ├── stores/appStore.js   # Zustand store (~150 state props)
│   │   ├── components/
│   │   │   ├── uc01/ – uc10/    # UC dashboard pages
│   │   │   ├── common/          # Metric, Badge, ProgressBar
│   │   │   ├── ExecutiveSummary.jsx
│   │   │   ├── Catalogue.jsx
│   │   │   ├── BranchList.jsx / BranchDetail.jsx
│   │   │   ├── AISummaryPanel.jsx
│   │   │   ├── GameTheoryCard.jsx
│   │   │   ├── ForecastChart.jsx
│   │   │   ├── CityHeatmap.jsx
│   │   │   ├── PnLWaterfall.jsx
│   │   │   └── BudgetSankey.jsx
│   │   └── utils/               # useAPI, formatPKR, theme
│   ├── package.json
│   └── vite.config.js
├── data/                        # initial/, source/, synthetic/
├── notebooks/                   # Jupyter notebooks
├── Makefile                     # setup, seed, backend, frontend, dev
├── start.sh                     # Start both services (kills stale first)
└── stop.sh                      # Stop all services
```

## Database Schema

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `branches` | 1,547 network nodes | branch_id, city, region, branch_type, vault_capacity, current/optimal_balance, idle_cash, cash_efficiency_score |
| `vault_positions` | 365 days/branch time-series | branch_id, date, opening/closing_balance, deposits, withdrawals, vault_utilization |
| `atms` | 2,180 ATM devices | atm_id, branch_id, location_type (lobby/offsite/mall), total_capacity, avg_daily_dispense |
| `atm_cassettes` | Denomination slots per ATM | atm_id, denomination (5K/1K/500/100/50/20/10), capacity, current_level, reorder_point |
| `forecasts` | ML predictions | entity_type (branch/atm), entity_id, forecast_date, target_date, predicted_value, confidence_bounds, MAPE |
| `crr_positions` | Weekly CRR tracking | date, deposit_base, actual_crr, freed_liquidity, income_earned, is_compliant |
| `nostro_accounts` | 35 correspondent banks | bank_name, currency (7 types), balance, required_minimum, excess_balance, overnight_rate |
| `vostro_accounts` | 20 respondent banks | bank_name, currency, balance, average_balance_30d, volatility, stable_portion, deployable_amount |
| `denomination_inventory` | Note stock per branch | branch_id, denomination, quantity, value, is_fit, is_soiled |
| `cit_trips` | Cash-in-Transit routes | trip_id, vehicle_id, route (JSON), distance, cost, num_stops, status |
| `transactions` | Cash flows | branch_id, date, type (deposit/withdrawal) |

## 10 Use Cases

### UC-01: Branch Vault Cash Forecasting
- **Problem:** Vault overstocking (idle cash)
- **Algorithm:** LSTM + 2-stage stochastic LP (SAA) + game theory scoring
- **Routes:** `POST /api/uc01/forecast`, `POST /api/uc01/optimize`, `GET /api/uc01/network-summary`
- **Impact:** PKR 10.8B savings @ 10.5% KIBOR

### UC-02: ATM Cash Replenishment Optimization
- **Problem:** ATM stockouts & replenishment costs
- **Algorithm:** LSTM forecast + (s,S) inventory policy via DP + DQN agent + Stackelberg CIT game
- **Routes:** `GET /api/uc02/atms`, `POST /api/uc02/forecast/{id}`, `POST /api/uc02/optimize/{id}`, `POST /api/uc02/dqn-recommend/{id}`, `POST /api/uc02/stackelberg-analysis`
- **Impact:** PKR 3.2B savings, 99.1% uptime

### UC-03: Inter-Branch Cash Netting & Routing
- **Problem:** Cash fragmentation across branch network
- **Algorithm:** Min-cost network flow + VCG truthful auction
- **Routes:** `GET /api/uc03/network-summary`, `POST /api/uc03/solve-netting`, `POST /api/uc03/run-auction`, `GET /api/uc03/city-heatmap`
- **Impact:** PKR 2.1B logistics savings

### UC-04: CRR Float Engineering
- **Problem:** CRR regulatory dead capital
- **Algorithm:** 7-day rolling DP (backward induction) + Monte Carlo + Nash equilibrium with SBP
- **Routes:** `GET /api/uc04/summary`, `GET /api/uc04/weekly-timeline`, `POST /api/uc04/optimize`, `POST /api/uc04/strategy-game`
- **Constraints:** SBP 6% weekly avg, 4% daily min
- **Impact:** 10.5% yield on freed liquidity

### UC-05: Nostro Balance Optimization
- **Problem:** Excess foreign correspondent balances
- **Algorithm:** Multi-currency MDP (7×3×3 state space) + Nash bargaining + FX carry analysis
- **Routes:** `GET /api/uc05/summary`, `GET /api/uc05/portfolio`, `POST /api/uc05/optimize`, `POST /api/uc05/nash-bargaining`, `POST /api/uc05/fx-carry`
- **Impact:** USD 180M+ repatriation opportunity

### UC-06: Vostro Liability Optimization
- **Problem:** Respondent liability risk
- **Algorithm:** Liquidity-at-Risk (99th percentile) + Shapley value + yield deployment
- **Routes:** `GET /api/uc06/summary`, `GET /api/uc06/portfolio`, `POST /api/uc06/compute-lar`, `POST /api/uc06/optimize-deployment`, `POST /api/uc06/cooperative-game`
- **Impact:** 9.2% yield on stable portions

### UC-07: Denomination Mix Optimization
- **Problem:** SBP denomination penalties
- **Algorithm:** NSGA-II Pareto multi-objective (7 denominations) + Eid/Ramadan scenarios
- **Routes:** `GET /api/uc07/summary`, `GET /api/uc07/penalty-heatmap`, `POST /api/uc07/optimize`
- **Impact:** 85% penalty reduction

### UC-08: CIT Route Optimization
- **Problem:** CIT fleet inefficiency (150 vehicles)
- **Algorithm:** VRPTW via OR-Tools + Shapley cost allocation + emergency rerouting
- **Routes:** `GET /api/uc08/summary`, `GET /api/uc08/fleet-dashboard`, `POST /api/uc08/optimize`, `POST /api/uc08/emergency-reroute`
- **Impact:** 38% route cost reduction

### UC-09: Digital Channel Incentivization
- **Problem:** High cash handling costs vs SBP CDM mandate
- **Algorithm:** Thompson sampling (multi-armed bandit, 5 segments) + subgame perfect equilibrium + ROI/A-B sim
- **Routes:** `GET /api/uc09/summary`, `GET /api/uc09/segment-dashboard`, `POST /api/uc09/optimize`, `POST /api/uc09/roi`, `POST /api/uc09/ab-test`
- **Impact:** PKR 500M budget, +18% digital conversion

### UC-10: Cash P&L Attribution
- **Problem:** Opaque cash cost allocation
- **Algorithm:** ABC costing (10 cost pools) + transfer pricing + tournament ranking
- **Routes:** `GET /api/uc10/summary`, `GET /api/uc10/waterfall`, `GET /api/uc10/branch-ranking`, `POST /api/uc10/transfer-pricing`, `GET /api/uc10/alco-report`
- **Impact:** Branch efficiency leaderboard, ALCO insights

## Supporting API Routes

- `GET /api/branches` — List branches (filter: branch_type, city)
- `GET /api/branches/{id}` — Detail with 30-day vault history
- `GET /api/dashboard/summary` — High-level KPIs
- `GET /api/dashboard/executive-summary` — All 10 UC savings aggregated
- `POST /api/ai-summary` — OpenAI narrative (optional, accepts `{use_case, context, question}`)
- `GET /api/ai-summary/status` — Check if API key configured

## Frontend Navigation

No React Router. SPA navigation via Zustand `currentUC` state:
- `'executive'` → ExecutiveSummary (landing page)
- `'catalog'` → Catalogue (browse all 10 UCs)
- `'uc01'`–`'uc10'` → UC-specific dashboard
- Branch explorer accessible from sidebar

## Configuration

### Environment Variables (`.env` at project root)
```
DATABASE_URL=sqlite:///./cash_engine.db
OPENAI_API_KEY=           # optional, for "Ask AI" feature
SBP_POLICY_RATE=0.11
CRR_WEEKLY_AVG=0.06
CRR_DAILY_MIN=0.04
UBL_TOTAL_BRANCHES=1547
UBL_TOTAL_ATMS=2180
UBL_DEPOSIT_BASE_TRILLIONS=2.54
```

### CORS
Backend allows: `http://localhost:5173`, `http://127.0.0.1:5173`

### Constants (`backend/app/core/constants.py`)
- SBP policy rates, CRR bands, penalty structures
- ATM parameters, CIT costs per km
- 7 denominations (Rs.5000 down to Rs.10)
- Branch types, city distribution weights
- Islamic calendar dates (Eid, Ramadan 2024–2027)

## Commands
```bash
make setup          # Create conda env + install deps + init DB
make seed           # Populate database with synthetic UBL data
make dev            # Start backend + frontend (or use ./start.sh)
make backend        # Backend only
make frontend       # Frontend only
make migrate        # Run alembic migrations
make migrate-demo   # Load demo data
make clean          # Delete DB and model files
./start.sh          # Kill stale processes, start both services
./stop.sh           # Kill all COE processes on ports 8000/5173
```

## Rules
- **Additive-only**: Never modify existing service files from prior phases. Create new files or extend.
- **No auth currently**: All endpoints publicly accessible (add auth for production)
- **SQLite for dev**: Upgrade to PostgreSQL for production (>100 concurrent users)
- **GPU optional**: PyTorch auto-detects CUDA, falls back to CPU
- **OpenAI optional**: AI summaries degrade gracefully without API key
- **UTC internally**: Convert to PKT (`Asia/Karachi`) in frontend only
- **Dark theme**: All new UI must use `#0a0e17` background, `#d4a853` gold accent
- **Islamic calendar**: Eid/Ramadan dates hard-coded through 2027, needs maintenance after

## UC Pages Wiring (Critical — Read Before Modifying)

The 10 UC technical dashboards (UC-01 to UC-10) are **original code from a prior build phase**. They connect to the backend through a specific chain:

```
UC Dashboard (uc01/UC01Dashboard.jsx)
  → hooks/useAPI.js (API call functions: fetchUC01NetworkSummary, etc.)
  → stores/appStore.js (state: uc01NetworkSummary, isForecasting, etc.)
  → /api/uc01/* endpoints (FastAPI routes)
  → services/uc01_vault_forecast.py (business logic)
```

### Key Files (Do NOT modify without understanding full chain):
- `frontend/src/hooks/useAPI.js` — all API functions for all 10 UCs + dashboard
- `frontend/src/stores/appStore.js` — ~150 state props + setters for all UCs
- `frontend/src/components/uc01-uc10/` — 50 JSX files across 10 UC folders
- `backend/app/services/uc01-uc10` — 10 service files, ~8,000 lines total
- `backend/app/api/uc01-uc10` — 10 API route files, 67 endpoints

### Additive-Only Separation:
- **Business pages** (`business/`) → `/api/business/*` endpoints → `business_output.py`
- **Command Center** → `/api/command-center/*` → `netting_state.py`
- **Forecast Dashboard** → `/api/business/ensemble/*` → `ensemble_forecast.py`
- **UC pages** → `/api/uc01-uc10/*` → `uc01-uc10` services (UNTOUCHED)

The two layers (business + technical) coexist independently. If wiring UC pages to new data (CDM, forecasts, business output), create NEW components/hooks rather than modifying existing ones.

## Origin
Originally built in WSL2, migrated to native Ubuntu 24.04 (2026-04-04). Zone.Identifier files from Windows may still exist in root — safe to delete.

---

## Prescriptive Business Output Layer

### Overview
Beyond the 10 UC technical dashboards, COE has a **Prescriptive Business Output Layer** — the decision-making heart of the app. This layer transforms raw ML/optimization outputs into bankable actions with expert banking logic.

Built from the perspective of a **Senior Quantitative Finance Expert / Head of Treasury Operations** for a Tier-1 Pakistani commercial bank managing ~851 Billion PKR in deposits.

### Regulatory Context (Pakistan-Specific)
- **KIBOR** (Karachi Interbank Offered Rate) is the benchmark, NOT generic "policy rate"
- KIBOR overnight: ~10.50%, SBP policy rate: 10.50%
- **CRR**: 5% weekly average on demand + time liabilities < 1yr (NON-REMUNERATIVE — earns 0% at SBP)
- **SLR**: 19% minimum (T-bills + PIBs + approved securities)
- **SBP-BSC**: 0.12% service charge on currency chest operations
- **CDM mandate**: 25% of branches by CY2028
- **Penalty**: PKR 100K for unprocessed notes to public
- **CRR maintenance period**: Friday (day 1) to Thursday (day 7)
- Cash sorting mandatory via CPCs per Currency Management Strategy 2015

### Business Output Service (`backend/app/services/business_output.py`)

Core class: `CashOptimizationEngine(db: Session)` — each method returns an **ACTION**, not a report.

| Method | UC | What It Decides |
|--------|-----|-----------------|
| `vault_recommendation(branch_id)` | UC-01 | RELEASE / REQUEST / HOLD with exact PKR amount. Bounded by insurance limit (85% vault capacity) and SBP minimum. Calculates daily KIBOR loss on idle cash. |
| `atm_load_orders(branch_id, city)` | UC-02 | URGENT_LOAD / SCHEDULE_LOAD / SKIP_NEXT_CIT / OPTIMAL. Uses Days-of-Cash (DoC) metric, target 2.2 days. Denomination mix by ATM type. |
| `netting_opportunities(city)` | UC-03 | Surplus→Deficit branch matches within 15km. Calculates BSC charge avoided + CIT trip saved per match. Min PKR 3M transfer threshold. |
| `crr_deployment()` | UC-04 | Daily hold vs deploy recommendation. Tracks maintenance week position (day X/7). Frees excess for overnight KIBOR repo. Includes intraday buffer (0.15% of deposit base). |
| `nostro_vostro_actions()` | UC-05/06 | SWEEP / FUND / HOLD per nostro account. Sweep destination based on FX carry (repatriate to PKR if carry > 2%, else O/N deposit). |
| `denomination_plan(branch_id)` | UC-07 | Mix by branch type (Cash-Surplus: high Rs.1000/500; Cash-Deficit: high Rs.5000; Seasonal: Rs.1000 dominant). Eid adjustment (+15% small notes). |
| `cit_route_sheet(city)` | UC-08 | Vehicle routes with security constraints. Max PKR 100M per vehicle (insurance). Enhanced security in Karachi/Peshawar/Quetta. Daylight-only (08:00-16:00). |
| `digital_shift_report()` | UC-09 | Cash-heavy branch identification. Cost comparison: PKR 95/cash txn vs PKR 8/digital txn. ROI on migration campaigns. |
| `value_realized_report()` | UC-10 | Bottom line: (Idle Cash Freed x KIBOR) - Cash Ops Cost. Revenue from vault/ATM/CRR/nostro freeing. Cost allocation via ABC. |
| `consolidated_dashboard()` | All | CFO/ALCO home page. Bank snapshot + top 4 actions today + compliance status. |

### Business API Routes (`backend/app/api/business.py`)

```
GET /api/business/vault-recommendation/{branch_id}
GET /api/business/atm-load-orders?branch_id=&city=
GET /api/business/netting/{city}
GET /api/business/crr-deployment
GET /api/business/nostro-vostro
GET /api/business/denomination-plan/{branch_id}
GET /api/business/cit-routes/{city}
GET /api/business/digital-shift
GET /api/business/value-realized
GET /api/business/consolidated
```

### Key Constants Used
| Constant | Value | Usage |
|----------|-------|-------|
| KIBOR overnight | 10.50% | Opportunity cost benchmark |
| SBP CRR rate | 5% | Weekly average requirement |
| SBP-BSC service charge | 0.12% | Currency chest operations |
| Emergency CIT cost | PKR 45K | 3x normal trip cost |
| Normal CIT cost | PKR 15K | Scheduled trip |
| Vault insurance rate | 0.015%/day | Of insured value |
| CIT trip threshold | PKR 5M | Min amount to dispatch CIT |
| Max vehicle value | PKR 100M | Insurance constraint |
| Cash txn cost | PKR 95 | Per transaction |
| Digital txn cost | PKR 8 | Per transaction |
| Target DoC (ATM) | 2.2 days | Industry best practice |

### Frontend Business Pages (Role-Based Views)

| Route | Audience | Content |
|-------|----------|---------|
| `/` | All | Consolidated Dashboard — 4 big numbers + top actions |
| `/branch-plan` | Branch Manager | Select branch → daily vault/denomination/CIT plan |
| `/regional` | Regional Head | City heatmap + branch rankings |
| `/treasury` | Treasury Desk | CRR gauge + nostro map + deployment recs |
| `/executive` | CFO/ALCO | P&L waterfall + value realized |
| `/catalogue` | Technical | Existing UC dashboards (drill-down) |

### Design Rules for Business Pages
- KEY DECISION in huge text (e.g., "KEEP PKR 42M" or "DEPLOY PKR 13B")
- PKR amounts formatted: "PKR 42.0 M" or "PKR 851 B"
- Every panel answers "WHAT SHOULD I DO?" not "what happened?"
- KIBOR referenced as benchmark everywhere
- SBP regulations cited specifically
- Green/Gold/Red status coding, trend arrows ↑↓
- Print-friendly for branch plan page
- "Technical Details →" link to corresponding UC dashboard

### Verification
```bash
curl -s localhost:8000/api/business/consolidated | python -m json.tool
curl -s localhost:8000/api/business/vault-recommendation/KHI-0001 | python -m json.tool
curl -s localhost:8000/api/business/crr-deployment | python -m json.tool
curl -s localhost:8000/api/business/value-realized | python -m json.tool
curl -s localhost:8000/api/business/netting/Karachi | python -m json.tool
curl -s localhost:8000/api/business/atm-load-orders?city=Karachi | python -m json.tool
```
