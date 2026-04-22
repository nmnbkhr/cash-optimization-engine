# Cash Optimization Engine (COE) — Complete Guide

> **United Bank Limited** | Enterprise Treasury Optimization Platform
> PKR 2.54 Trillion Deposits | 1,532 Branches | 2,180 ATMs | 10 Use Cases

---

## Table of Contents

- [Business Overview](#business-overview)
- [Platform Architecture](#platform-architecture)
- [Quick Start](#quick-start)
- [Business Views](#business-views)
- [Technical Use Cases (UC-01 to UC-10)](#technical-use-cases)
- [Data Model](#data-model)
- [SBP Data Integration](#sbp-data-integration)
- [API Reference](#api-reference)
- [Commands Reference](#commands-reference)

---

## Business Overview

### The Problem

Pakistani banks hold **billions in idle vault cash** that earns 0% while KIBOR stands at 11.64%. Every rupee sitting in a branch vault is a rupee NOT deployed in overnight repo, T-bills, or lending. Across UBL's 1,532 branches and 2,180 ATMs, this idle cash represents a massive opportunity cost.

### The Solution

COE transforms raw ML/optimization outputs into **prescriptive banking decisions**:

| Instead of... | COE says... |
|---------------|-------------|
| "Branch has PKR 154.8M in vault" | **"RELEASE PKR 84.9M to CIT. You're losing PKR 24,430/day at KIBOR 11.64%"** |
| "ATM has 3.5 days of cash" | **"SKIP next CIT. Target 2.2 days. Saving PKR 45K per trip"** |
| "CRR is 6% compliant" | **"DEPLOY PKR 50,843M in overnight repo. Expected income: PKR 14.63M today"** |
| "Nostro excess USD 180M" | **"SWEEP to PKR. Carry differential 6.14% justifies repatriation"** |

### Key Metrics (Live)

| Metric | Value | Source |
|--------|-------|--------|
| KIBOR 6M | **11.64%** | SBP EasyData (live) |
| SBP Policy Rate | **10.50%** | SBP EasyData (live) |
| USD/PKR | **279.67** | SBP EasyData (live) |
| Total Deposits | **851,038 PKR M** | demo.xlsx (real UBL GL) |
| Annual Savings Potential | **44.6 PKR B** | Computed across 10 UCs |
| Data Reconciliation | **ALL PASS** | Dirichlet-verified chain |

---

## Platform Architecture

```
                            +------------------+
                            |   SBP EasyData   |
                            |  (2,825 series)  |
                            +--------+---------+
                                     |
                                     v
+----------+    +------------------------------------------+
|          |    |            BACKEND (:8000)                |
|  demo    |    |                                          |
|  .xlsx   +--->+  FastAPI + SQLAlchemy + PyTorch          |
|  (UBL    |    |                                          |
|   GL)    |    |  +-- services/ -----------------------+  |
|          |    |  | business_output.py (Prescriptive)  |  |
+----------+    |  | reconciling_generator.py (FSDM)    |  |
                |  | uc01-uc10 (ML/OR/Game Theory)      |  |
                |  +------------------------------------+  |
                |                                          |
                |  +-- core/ ---------------------------+  |
                |  | sbp_data.py (Live KIBOR/FX/CPI)    |  |
                |  | ubl_branch_geo.py (96 real coords) |  |
                |  | constants.py (SBP regulatory)      |  |
                |  +------------------------------------+  |
                |                                          |
                |  +-- models/ -------------------------+  |
                |  | branches (1,532) + CDM tables      |  |
                |  | dim_market (30 days)                |  |
                |  | fact_gl_daily (45,960 rows)         |  |
                |  | fact_transactions (4.5M rows)       |  |
                |  +------------------------------------+  |
                +------------------------------------------+
                                     |
                                     v
                +------------------------------------------+
                |           FRONTEND (:5173)                |
                |                                          |
                |  React 19 + Vite 7 + TailwindCSS 4      |
                |  Zustand (state) + Recharts (charts)     |
                |  Axios (HTTP) + Lucide (icons)           |
                |                                          |
                |  +-- Business Views -+-- Technical --+   |
                |  | Consolidated Dash | UC-01 to UC-10|   |
                |  | Branch Plan       | Executive Sum |   |
                |  | Treasury Desk     | Catalogue     |   |
                |  | Regional View     | Branch Detail |   |
                |  +-------------------+---------------+   |
                +------------------------------------------+
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Python 3.11, conda `coe` | Backend environment |
| **API** | FastAPI 0.109 + Uvicorn | Async REST API with auto-docs |
| **ORM** | SQLAlchemy 2.0 + Alembic | Database models + migrations |
| **Database** | SQLite (dev), PostgreSQL (prod) | 14 tables, 4.6M+ rows |
| **ML/AI** | PyTorch 2.11 (CUDA RTX 4080) | LSTM forecasting, DQN agents |
| **Optimization** | OR-Tools, PuLP, Pymoo, SciPy | VRPTW, LP, NSGA-II, DP |
| **Frontend** | React 19 + Vite 7 + Tailwind 4 | SPA with dark Bloomberg theme |
| **State** | Zustand 5.0 | Lightweight global state |
| **Charts** | Recharts 3.8 | Line, bar, pie, waterfall |
| **Node.js** | v22 LTS via nvm | Frontend tooling |
| **Data** | SBP EasyData API (2,825 cached series) | Live KIBOR, FX, CPI |

---

## Quick Start

```bash
# Prerequisites: conda (miniforge3), nvm (Node 22)

# 1. Setup environment
make setup

# 2. Seed database with synthetic UBL data
make seed

# 3. Enrich branches with real coordinates + financial columns
make enrich-branches

# 4. Generate reconciled CDM tables (FSDM fact/dimension)
make seed-cdm

# 5. Start the app
./start.sh

# 6. Open browser
# Frontend: http://localhost:5173
# API Docs: http://localhost:8000/docs
# Health:   http://localhost:8000/health
```

### Stop & Restart

```bash
./stop.sh       # Kill both services, free ports
./start.sh      # Clean start (kills stale, starts fresh)
```

---

## Business Views

> **Navigation**: Sidebar > BUSINESS VIEWS section

### 1. Consolidated Dashboard

**Audience**: CFO, ALCO, Board

**What it shows**:
- 4 hero KPIs: Annual Value Realized, Total Idle Cash, Avg CES, CRR Compliance
- **TOP ACTIONS NOW** — 4 prioritized decisions for today
- Revenue breakdown (vault/ATM/CRR/nostro income)
- Cost breakdown (personnel/premises/CIT/other)
- Digital shift progress (65% cash / 35% digital)

**API**: `GET /api/business/consolidated`

---

### 2. Branch Manager Plan

**Audience**: Branch Manager, Operations Head

**What it shows**:
- Select any branch from dropdown
- **KEY DECISION**: "RELEASE PKR 84.9M" / "REQUEST PKR 54.0M" / "HOLD"
- Vault gauge: current vs optimal vs capacity with SBP minimum and insurance limits
- Cost of inaction: daily KIBOR loss, annual impact
- Denomination plan: Rs.5000/1000/500/100 mix by branch type
- Eid seasonal adjustment when applicable

**API**: `GET /api/business/vault-recommendation/{branch_id}`, `GET /api/business/denomination-plan/{branch_id}`

---

### 3. Treasury Desk

**Audience**: Treasury Manager, ALM Desk

**What it shows**:
- **CRR Section**: "DEPLOY PKR 50,843M in overnight KIBOR repo"
  - Maintenance week gauge (day 1-7, Friday to Thursday)
  - Hold at SBP vs free for deployment
  - Compliance status + breach probability
- **Nostro Section**: SWEEP/FUND/HOLD actions per correspondent bank
  - FX carry analysis (repatriate if carry > 2%)
  - Monthly income potential from sweeps
- **Value Realized**: Monthly P&L waterfall (revenue - costs)

**API**: `GET /api/business/crr-deployment`, `GET /api/business/nostro-vostro`, `GET /api/business/value-realized`

---

### 4. Regional View

**Audience**: Regional Head, Area Manager

**What it shows**:
- City selector (Karachi, Lahore, Islamabad, etc.)
- 4 KPIs: branches, avg CES, idle cash, netting matches
- **Netting**: Surplus-to-deficit branch matches within 15km
  - BSC charge avoided + CIT trip saved per match
- **ATM Fleet**: Urgent/scheduled/skip/optimal load orders
  - Days-of-Cash gauge vs 2.2 target
- **Branch Rankings**: CES leaderboard (worst first)

**API**: `GET /api/business/netting/{city}`, `GET /api/business/atm-load-orders?city={city}`

---

## Technical Use Cases

> **Navigation**: Sidebar > TECHNICAL section

| UC | Title | Algorithm | Annual Impact |
|----|-------|-----------|--------------|
| **UC-01** | Branch Vault Forecasting | LSTM + Stochastic LP (SAA) | **5.3B** (idle cash x KIBOR) |
| **UC-02** | ATM Replenishment | DQN + (s,S) Inventory Policy | **1.9B** (holding cost reduction) |
| **UC-03** | Inter-Branch Netting | Min-Cost Network Flow + VCG Auction | **11M** (logistics savings) |
| **UC-04** | CRR Float Engineering | DP Backward Induction + Monte Carlo | Compliance + repo income |
| **UC-05** | Nostro Optimization | Multi-Currency MDP + Nash Bargaining | **18.9B** (repatriation income) |
| **UC-06** | Vostro Optimization | Liquidity-at-Risk + Shapley Value | **204.8M** (deployment yield) |
| **UC-07** | Denomination Mix | NSGA-II Pareto Multi-Objective | **75.2M** (penalty reduction) |
| **UC-08** | CIT Route Optimization | VRPTW (OR-Tools) + Shapley Allocation | **8.7M** (route cost -38%) |
| **UC-09** | Digital Incentivization | Thompson Sampling Bandit + SPE | **12.9B** (digital migration) |
| **UC-10** | Cash P&L Attribution | ABC Costing + Transfer Pricing | **5.3B** (income + savings) |
| | | **TOTAL** | **44.6B PKR/year** |

---

## Data Model

### Operational Tables (Existing)

| Table | Rows | Purpose |
|-------|------|---------|
| `branches` | 1,532 | Network nodes with financials + real coordinates |
| `vault_positions` | ~559K | 365-day vault history per branch |
| `atms` | 2,180 | ATM devices with cassette data |
| `atm_cassettes` | 8,720 | Denomination slots per ATM |
| `crr_positions` | ~365 | Weekly CRR tracking |
| `nostro_accounts` | 35 | Correspondent bank balances (7 currencies) |
| `vostro_accounts` | 20 | Respondent bank balances |
| `denomination_inventory` | ~10,724 | Note stock per branch |
| `cit_trips` | 1,260 | Cash-in-Transit routes |
| `transactions` | ~1.5M | Cash flow records |

### FSDM / CDM Tables (New)

| Table | Rows | Purpose |
|-------|------|---------|
| `dim_market` | 30 | Daily market rates (KIBOR, FX, CPI, calendar flags) |
| `fact_gl_daily` | 45,960 | Daily GL per branch (cash flows, costs, income) |
| `fact_transactions` | 4,528,860 | Individual transactions (reconciled to GL) |

### Reconciliation Chain

```
demo.xlsx (Real UBL GL: Deposits 851,038M, Revenue 7,197.6M)
  |
  +-> branches: SUM(total_deposits) = 851,038M          [EXACT]
  |     |
  |     +-> fact_gl_daily: AVG(deposits) = branch.avg    [EXACT - Dirichlet]
  |           |
  |           +-> fact_transactions: SUM(cash_in) = GL   [EXACT - Dirichlet]
  |
  +-> Every level reconciles upward. Auditable. Bankable.
```

**Verification**: `GET /api/business/reconciliation` or `curl localhost:8000/api/business/reconciliation`

### Branch Financial Columns (from demo.xlsx)

| Column | Source | Allocation Method |
|--------|--------|-------------------|
| `total_deposits` | 851,038M bank-wide | Proportional to `avg_daily_deposits` |
| `deposits_current_account` | 55% of total_deposits | CASA ratio |
| `deposits_savings` | 25% of total_deposits | CASA ratio |
| `deposits_term` | 20% of total_deposits | Term deposit ratio |
| `monthly_interest_income` | 7,197.6M bank-wide | Proportional to deposits |
| `monthly_interest_expense` | 3,500.0M bank-wide | Proportional to deposits |
| `monthly_personnel_cost` | 903.5M bank-wide | Proportional to transactions |
| `monthly_premises_cost` | 328.1M bank-wide | Proportional to transactions |
| `monthly_direct_cost` | 70.5M bank-wide | Proportional to transactions |
| `monthly_other_cost` | 698.7M bank-wide | Proportional to transactions |

### Branch Coordinates

96 major branches mapped to **real UBL locations** (verified from UBL branch locator, Google Maps). Remaining branches placed at commercial landmarks in their city with 50-200m offset for realism.

---

## SBP Data Integration

### Data Flow

```
SBP EasyData API (easydata.sbp.org.pk)
  |
  +-> /mnt/e/psxdata/sbp_easydata/ (2,825 cached series)
  |     symlinked to data/sbp_cache/
  |
  +-> sbp_easydata.py (pakfindata scraper, adapted)
  |     reads cached CSVs — NO API calls on web requests
  |
  +-> sbp_data.py (thin wrapper)
  |     SBPDataService singleton with in-memory cache
  |     Falls back to constants.py if cache unavailable
  |
  +-> business_output.py
        self.kibor = sbp.get_overnight_kibor()  # 11.64%
        self.policy_rate = sbp.get_policy_rate_current()  # 10.50%
```

### Live Rates Available

| Rate | Series Key | Value | As Of |
|------|-----------|-------|-------|
| KIBOR 6M Offer | `TS_GP_BAM_SIRKIBOR_D.KIBOR0030` | 11.64% | 2026-04-03 |
| SBP Policy Rate | `TS_GP_IR_SIRPR_AH.SBPOL0030` | 10.50% | 2025-12-16 |
| USD/PKR | `TS_GP_ES_FADERPKR_M.XRDAVG0220` | 279.67 | 2026-02-27 |
| EUR/PKR | `TS_GP_ES_FADERPKR_M.XRDAVG0230` | 330.11 | 2026-02-27 |
| GBP/PKR | `TS_GP_ES_FADERPKR_M.XRDAVG0210` | 377.25 | 2026-02-27 |
| WALR | `TS_GP_BAM_SIRWALDR_M.WALD0010` | 11.69% | Latest |
| CPI YoY | `TS_GP_PT_CPI_M.P00011516` | 7.3% | Latest |
| KIBOR 1W | `TS_GP_BAM_SIRKIBOR_D.1KIBOR1W` | 10.91% | 2026-04-03 |
| KIBOR 12M | `TS_GP_BAM_SIRKIBOR_D.7KIBOR12M` | 12.01% | 2026-04-03 |

### Refresh Commands

```bash
make sbp-update    # Incremental fetch (new data since last download)
make sbp-fetch     # Full priority fetch (~30 min, rate-limited)
make sbp-status    # Show what's cached and how fresh
make sbp-sync-db   # Sync CSVs into SQLite tables
```

---

## API Reference

### Business Output Layer (Prescriptive)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/business/consolidated` | GET | CFO dashboard — all UCs aggregated |
| `/api/business/vault-recommendation/{id}` | GET | Branch vault action (RELEASE/REQUEST/HOLD) |
| `/api/business/atm-load-orders` | GET | ATM fleet orders (?city= or ?branch_id=) |
| `/api/business/netting/{city}` | GET | Inter-branch netting opportunities |
| `/api/business/netting` | GET | Network-wide netting |
| `/api/business/crr-deployment` | GET | CRR daily recommendation |
| `/api/business/nostro-vostro` | GET | Nostro SWEEP/FUND + Vostro deployment |
| `/api/business/denomination-plan/{id}` | GET | Note mix plan for branch |
| `/api/business/cit-routes/{city}` | GET | CIT route sheet with security |
| `/api/business/digital-shift` | GET | Digital migration analysis |
| `/api/business/value-realized` | GET | P&L attribution (bottom line) |
| `/api/business/rates` | GET | Live SBP rates (KIBOR, FX, CPI) |
| `/api/business/reconciliation` | GET | Data integrity verification |

### Dashboard & Branches

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/summary` | GET | High-level KPIs |
| `/api/dashboard/executive-summary` | GET | All 10 UC savings aggregated |
| `/api/branches` | GET | List branches (?branch_type=, ?city=) |
| `/api/branches/{id}` | GET | Branch detail + 30-day vault history |
| `/api/ai-summary` | POST | OpenAI narrative (optional) |
| `/health` | GET | Health check |

### UC-Specific (10 use cases)

Each UC has 3-6 endpoints under `/api/uc01/` through `/api/uc10/`. See CLAUDE.md for full listing.

---

## Commands Reference

### Application

| Command | What |
|---------|------|
| `./start.sh` | Kill stale + start backend (:8000) + frontend (:5173) |
| `./stop.sh` | Kill all COE processes |
| `make dev` | Alternative: start both via Makefile |
| `make backend` | Backend only |
| `make frontend` | Frontend only |

### Database

| Command | What |
|---------|------|
| `make setup` | Create conda env + install deps + init DB |
| `make seed` | Populate with synthetic UBL data |
| `make enrich-branches` | Add financial cols + real coordinates |
| `make seed-cdm` | Generate reconciled FSDM tables |
| `make clean` | Delete DB and model files |

### SBP Data

| Command | What |
|---------|------|
| `make sbp-fetch` | Download priority SBP datasets (~30 min) |
| `make sbp-update` | Incremental update (new data only) |
| `make sbp-status` | Show cache coverage |
| `make sbp-sync-db` | Sync CSVs into SQLite |

### Verification

```bash
# Check everything is working
curl localhost:8000/health
curl localhost:8000/api/business/rates
curl localhost:8000/api/business/reconciliation
curl localhost:8000/api/business/consolidated
curl localhost:8000/api/business/vault-recommendation/KAR-001
```

---

## Environment

| Component | Version | Notes |
|-----------|---------|-------|
| OS | Ubuntu 24.04 (native) | Migrated from WSL2 on 2026-04-04 |
| Python | 3.11.15 (conda `coe`) | miniforge3 |
| Node.js | 22.22.2 (nvm) | Required for Vite 7 |
| PyTorch | 2.11.0+cu130 | CUDA on RTX 4080 |
| GPU | NVIDIA RTX 4080 | Auto-detected, falls back to CPU |
| Database | SQLite (dev) | 14 tables, ~4.6M rows total |

---

## Data Sources

| Source | What | Location |
|--------|------|----------|
| `demo.xlsx` | Real UBL General Ledger (Jan 2016) | `data/source/demo.xlsx` |
| `Branch Master Data from SYMBOLS.xlsx` | 1,585 real UBL branches from T24 | Project root |
| SBP EasyData | 2,825 macro/financial series | `data/sbp_cache/` (symlink to `/mnt/e/psxdata/sbp_easydata`) |
| Synthetic Generator | Reconciled FSDM data | Generated via `make seed-cdm` |

---

> Built with FastAPI + React + PyTorch | Godaitec x UBL
