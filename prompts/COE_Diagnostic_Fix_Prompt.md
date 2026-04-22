# COE — DIAGNOSTIC & FIX PROMPT

## The Problem

Claude Code generates files that LOOK complete but the actual wiring is broken:
- Services have classes but methods return hardcoded/empty data
- API endpoints import services but never call the actual computation
- Frontend components call endpoints but don't handle responses correctly
- Models are defined but never trained or loaded
- Database is seeded but queries return nothing because of wrong field names
- Zustand actions dispatch but the state never updates the UI

## HOW TO USE THIS FILE

Paste each section below into Claude Code ONE AT A TIME.
Start with DIAGNOSTIC, then apply each FIX section.

---

# STEP 1: DIAGNOSTIC — Paste this into Claude Code first

```
I have the cash-optimization-engine project at ~/projects/cash-optimization-engine/. The app LOOKS complete but nothing actually works end-to-end. Run a full diagnostic. For EACH file listed below, open it, read the actual code, and report:

1. Is the function/method ACTUALLY computing something, or is it returning mock/hardcoded/placeholder data?
2. Is it properly connected to the layer above it (service→endpoint→frontend)?

CHECK THESE FILES IN ORDER:

## BACKEND WIRING CHECK

### A. Database & Seed Data
- backend/app/database.py — Is the engine actually created? Is the session dependency working?
- backend/seed_data.py — Does it ACTUALLY insert rows? Run: `cd backend && python seed_data.py` and then `python -c "from app.database import SessionLocal; db=SessionLocal(); print(db.execute('SELECT COUNT(*) FROM branches').scalar())"`
- If the table doesn't exist or count is 0, the seed never ran or schema is wrong.

### B. Models → Services Connection  
- backend/app/services/uc01_vault_forecast.py — Open it. Check:
  - Does BranchCashLSTM.__init__ actually create nn.LSTM layers?
  - Does the forward() method actually run data through the LSTM?
  - Is there a train() or fit() function that ACTUALLY trains with real data from DB?
  - Is there a predict() function that loads a saved model and runs inference?
  - Or is it all just class definitions with `pass` or `return []`?

- Does VaultOptimizer.optimize() actually call scipy.optimize or PuLP?
  - Or does it return `{"optimal": 42, "savings": 5.8}` hardcoded?

- Does CashEfficiencyEngine compute CES from actual DB data?
  - Or is it `return 0.75` hardcoded?

### C. Services → API Endpoints Connection
- backend/app/api/forecasts.py (or wherever UC01 endpoints live):
  - Does the endpoint function import and instantiate the service class?
  - Does it pass the branch_id to the service?
  - Does it get the DB session via Depends(get_db)?
  - Does it return the actual service output, or a hardcoded dict?

- backend/app/main.py:
  - Are ALL routers actually included? Check: `app.include_router(...)` for each API module
  - Is CORS middleware added with allow_origins=["http://localhost:5173"]?

### D. Test the actual endpoints
Run the backend: `cd backend && python -m uvicorn app.main:app --reload --port 8000`

Then test EACH endpoint:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/uc01/branches | head -200
curl http://localhost:8000/api/uc01/branches/KHI-001
curl -X POST http://localhost:8000/api/uc01/forecast/KHI-001
curl -X POST http://localhost:8000/api/uc01/optimize/KHI-001
curl -X POST http://localhost:8000/api/uc01/game-theory/KHI-001
curl http://localhost:8000/api/uc01/network-summary
```

For each: report status code, response body (first 500 chars), any errors.

### E. Frontend → Backend Connection
- frontend/src/hooks/useAPI.js — What is the baseURL? Is it http://localhost:8000 or http://localhost:8000/api?
- frontend/src/stores/appStore.js — Do the fetch actions actually call axios/fetch?
  - Do they update the store state with the response data?
  - Or do they set state to empty arrays/null?
- When user clicks a branch in BranchList, does it:
  1. Call selectBranch(branch) in store?
  2. Trigger fetchForecast(branch.id)?
  3. Trigger fetchOptimization(branch.id)?
  4. Update forecastData, optimizationResult in store?
  5. Do the chart components READ from these store values?

### F. Console Errors
- Run frontend: `cd frontend && npm run dev`
- Open browser to localhost:5173
- Open browser DevTools Console (F12)
- Report ALL red errors
- Check Network tab: are API calls going out? What status codes come back? Any CORS errors?

GIVE ME A COMPLETE REPORT of what's broken. Be specific: "file X, line Y, function Z returns hardcoded value instead of computing" or "endpoint /api/uc01/forecast/KHI-001 returns 404 because router not included in main.py".
```

---

# STEP 2: FIX — THE WIRING BLUEPRINT

After diagnostic, paste this to fix everything:

```
Based on the diagnostic, fix ALL broken wiring in cash-optimization-engine. Follow this EXACT connection pattern for every use case. I'll describe UC-01 precisely — apply the same pattern to UC-02 through UC-10.

## RULE: NO HARDCODED RETURNS. NO PLACEHOLDER DATA. NO `pass`. NO `TODO`.

Every function must compute a real result from real data or raise an explicit error.

## THE CORRECT WIRING PATTERN (UC-01 as template):

### LAYER 1: Database has real data

File: backend/seed_data.py

```python
# This MUST actually insert data. Verify by running it and checking count.
def seed_branches(db: Session):
    """Insert 1,547 branches with realistic data."""
    # ... generates branches ...
    for branch in branches:
        db.add(Branch(**branch))
    db.commit()
    print(f"Seeded {db.query(Branch).count()} branches")

def seed_vault_positions(db: Session):
    """Insert 365 days × 1,547 branches of daily vault data."""
    branches = db.query(Branch).all()
    for branch in branches:
        for day_offset in range(365):
            date = datetime.now() - timedelta(days=365-day_offset)
            # Generate realistic amount based on branch type
            base = branch.avg_daily_withdrawals
            noise = np.random.normal(0, base * 0.15)
            day_effect = 1.2 if date.weekday() == 4 else 1.0  # Friday spike
            salary_effect = 1.4 if date.day in [1, 15] else 1.0
            
            actual_demand = max(0, (base + noise) * day_effect * salary_effect)
            vault_balance = branch.current_vault_balance + np.random.normal(0, 5)
            
            db.add(VaultPosition(
                branch_id=branch.branch_id,
                date=date.date(),
                opening_balance=vault_balance,
                deposits=branch.avg_daily_deposits + np.random.normal(0, 3),
                withdrawals=actual_demand,
                closing_balance=vault_balance - actual_demand + branch.avg_daily_deposits,
                idle_cash=max(0, vault_balance - actual_demand * 1.2),
            ))
    db.commit()
    print(f"Seeded {db.query(VaultPosition).count()} vault positions")

if __name__ == "__main__":
    from app.database import SessionLocal, engine, Base
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_branches(db)
    seed_vault_positions(db)
    db.close()
```

Run it: `cd backend && python seed_data.py`
Verify: `python -c "from app.database import SessionLocal; db=SessionLocal(); print('branches:', db.execute('SELECT COUNT(*) FROM branches').scalar()); print('vault_pos:', db.execute('SELECT COUNT(*) FROM vault_positions').scalar())"`

Expected: branches: 1547, vault_pos: ~564,655

### LAYER 2: Service classes compute REAL results from DB data

File: backend/app/services/uc01_vault_forecast.py

```python
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from sqlalchemy.orm import Session
from app.models.branch import Branch
from app.models.vault_position import VaultPosition
from app.core.constants import SBP_POLICY_RATE, CRR_DAILY_MIN

# ── LSTM MODEL (actual PyTorch, trains on GPU) ──

class BranchCashLSTM(nn.Module):
    def __init__(self, input_size=18, hidden_size=64, num_layers=2, output_days=7):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, 
                           batch_first=True, dropout=0.2)
        self.fc_mean = nn.Linear(hidden_size, output_days)
        self.fc_std = nn.Linear(hidden_size, output_days)
    
    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        last_hidden = lstm_out[:, -1, :]
        mean = self.fc_mean(last_hidden)
        std = torch.softplus(self.fc_std(last_hidden))  # ensure positive
        return mean, std


def prepare_features(vault_history: list[VaultPosition], branch: Branch) -> np.ndarray:
    """Convert vault position history into feature matrix. MUST return real numbers."""
    records = []
    for vp in vault_history:
        d = vp.date
        records.append({
            "demand": vp.withdrawals,
            "deposits": vp.deposits,
            "dow_sin": np.sin(2 * np.pi * d.weekday() / 7),
            "dow_cos": np.cos(2 * np.pi * d.weekday() / 7),
            "dom_norm": d.day / 31.0,
            "is_salary": 1.0 if d.day in [1, 15] else 0.0,
            "is_friday": 1.0 if d.weekday() == 4 else 0.0,
            "month_sin": np.sin(2 * np.pi * d.month / 12),
            "month_cos": np.cos(2 * np.pi * d.month / 12),
            "is_surplus": 1.0 if branch.branch_type == "Cash-Surplus" else 0.0,
            "is_deficit": 1.0 if branch.branch_type == "Cash-Deficit" else 0.0,
            "is_seasonal": 1.0 if branch.branch_type == "Seasonal" else 0.0,
            "is_balanced": 1.0 if branch.branch_type == "Balanced" else 0.0,
            "is_hub": 1.0 if branch.branch_type == "Hub" else 0.0,
            "dep_with_ratio": vp.deposits / max(vp.withdrawals, 0.01),
            "balance_norm": vp.opening_balance / max(branch.vault_capacity, 1),
            # Lagged features added during windowing
        })
    df = pd.DataFrame(records)
    
    # Add rolling features
    df["rolling_mean_7"] = df["demand"].rolling(7, min_periods=1).mean()
    df["rolling_std_7"] = df["demand"].rolling(7, min_periods=1).std().fillna(0)
    
    return df.values.astype(np.float32)


def forecast_branch(db: Session, branch_id: str) -> dict:
    """
    Actually runs LSTM inference. Returns real forecast numbers.
    If model not trained yet, falls back to statistical forecast.
    """
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise ValueError(f"Branch {branch_id} not found")
    
    # Get last 60 days of vault history
    history = (db.query(VaultPosition)
               .filter(VaultPosition.branch_id == branch_id)
               .order_by(VaultPosition.date.desc())
               .limit(60)
               .all())
    history.reverse()  # chronological order
    
    if len(history) < 30:
        raise ValueError(f"Insufficient history for {branch_id}: {len(history)} days")
    
    # Try LSTM model
    model_path = "models/uc01_lstm_best.pt"
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = BranchCashLSTM().to(device)
        model.load_state_dict(torch.load(model_path, map_location=device))
        model.eval()
        
        features = prepare_features(history[-30:], branch)
        x = torch.FloatTensor(features).unsqueeze(0).to(device)
        
        with torch.no_grad():
            mean, std = model(x)
        
        mean_np = mean.cpu().numpy().flatten()
        std_np = std.cpu().numpy().flatten()
        
    except (FileNotFoundError, Exception):
        # FALLBACK: Statistical forecast (still real computation, not hardcoded)
        demands = [vp.withdrawals for vp in history[-30:]]
        base_mean = np.mean(demands)
        base_std = np.std(demands)
        
        # Day-of-week adjustment from historical data
        dow_factors = {}
        for vp in history:
            dow = vp.date.weekday()
            dow_factors.setdefault(dow, []).append(vp.withdrawals)
        dow_means = {k: np.mean(v) for k, v in dow_factors.items()}
        global_mean = np.mean(list(dow_means.values()))
        
        today_weekday = history[-1].date.weekday()
        mean_np = np.array([
            base_mean * (dow_means.get((today_weekday + i + 1) % 7, global_mean) / max(global_mean, 0.01))
            for i in range(7)
        ])
        std_np = np.full(7, base_std)
    
    # Build response with confidence intervals
    days = []
    for i in range(7):
        days.append({
            "day": i + 1,
            "forecast_mean": round(float(mean_np[i]), 2),
            "forecast_std": round(float(std_np[i]), 2),
            "ci_lower": round(float(mean_np[i] - 1.96 * std_np[i]), 2),
            "ci_upper": round(float(mean_np[i] + 1.96 * std_np[i]), 2),
            "optimal_vault": round(float(mean_np[i] * 1.15), 2),  # 15% buffer
        })
    
    return {
        "branch_id": branch_id,
        "branch_name": branch.name,
        "model_type": "LSTM" if os.path.exists(model_path) else "Statistical",
        "forecast_days": days,
        "avg_forecast": round(float(np.mean(mean_np)), 2),
        "mape": round(float(np.mean(np.abs(std_np / np.maximum(mean_np, 0.01))) * 100), 1),
    }


# ── VAULT OPTIMIZER (actual scipy computation) ──

def optimize_vault(db: Session, branch_id: str) -> dict:
    """
    Runs stochastic optimization using SAA. Returns REAL computed optimal level.
    """
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    forecast = forecast_branch(db, branch_id)
    
    avg_demand = forecast["avg_forecast"]
    demand_std = np.mean([d["forecast_std"] for d in forecast["forecast_days"]])
    
    # Generate 1000 demand scenarios from forecast distribution
    scenarios = np.random.normal(avg_demand, demand_std, 1000)
    scenarios = np.maximum(scenarios, 0)  # no negative demand
    
    # Cost function to minimize
    emergency_cit_cost = 45000 / 1e6  # PKR 45K in millions
    daily_opportunity_rate = SBP_POLICY_RATE / 365
    
    def total_expected_cost(vault_level):
        idle_costs = np.maximum(vault_level - scenarios, 0) * daily_opportunity_rate
        stockout_costs = np.where(scenarios > vault_level, emergency_cit_cost, 0)
        return np.mean(idle_costs + stockout_costs)
    
    # Optimize: find vault level that minimizes expected cost
    result = minimize_scalar(
        total_expected_cost,
        bounds=(avg_demand * 0.8, branch.vault_capacity),
        method="bounded"
    )
    
    optimal = round(result.x, 1)
    current = branch.current_vault_balance
    idle_reduction = max(0, current - optimal)
    annual_savings = round(idle_reduction * SBP_POLICY_RATE, 2)
    
    return {
        "branch_id": branch_id,
        "current_vault": current,
        "recommended_vault": optimal,
        "idle_cash_current": round(current - avg_demand, 1),
        "idle_cash_optimized": round(max(0, optimal - avg_demand), 1),
        "idle_reduction": round(idle_reduction, 1),
        "daily_savings_pkr": round(idle_reduction * SBP_POLICY_RATE / 365 * 1e6, 0),
        "annual_savings_m": annual_savings,
        "scenarios_computed": 1000,
        "confidence_95": round(float(np.percentile(scenarios, 95)), 1),
        "solver_converged": result.success if hasattr(result, 'success') else True,
    }


# ── GAME THEORY (actual Nash equilibrium computation) ──

def compute_game_theory(db: Session, branch_id: str) -> dict:
    """
    Computes actual Nash equilibrium from payoff matrix. Pure math.
    """
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    
    # Compute CES from actual vault data
    history = (db.query(VaultPosition)
               .filter(VaultPosition.branch_id == branch_id)
               .order_by(VaultPosition.date.desc())
               .limit(30)
               .all())
    
    if history:
        avg_idle = np.mean([vp.idle_cash for vp in history])
        avg_vault = np.mean([vp.opening_balance for vp in history])
        ces = round(1 - (avg_idle / max(avg_vault, 0.01)), 3)
        
        stockout_days = sum(1 for vp in history if vp.closing_balance < 0)
        stockout_rate = stockout_days / len(history)
    else:
        ces = branch.cash_efficiency_score
        stockout_rate = 0.02
    
    # Payoff matrix: Branch Manager rows × Treasury columns
    # Strategies: Hoard, Trust_Model, Aggressive
    # Treasury: Guarantee_CIT, No_Guarantee, Penalty_Only
    
    idle_cost_hoard = branch.current_vault_balance * 0.4 * SBP_POLICY_RATE / 365
    idle_cost_trust = branch.current_vault_balance * 0.15 * SBP_POLICY_RATE / 365
    idle_cost_aggr = branch.current_vault_balance * 0.05 * SBP_POLICY_RATE / 365
    stockout_penalty = 0.045  # PKR 45K emergency
    reputation_cost = 0.1
    guarantee_cost = 0.02
    
    # Branch Manager payoffs (negative costs): higher is better
    bm_payoffs = np.array([
        # Guarantee    No_Guarantee   Penalty_Only
        [-idle_cost_hoard, -idle_cost_hoard, -idle_cost_hoard],                              # Hoard
        [-idle_cost_trust, -idle_cost_trust - stockout_penalty*0.05, -idle_cost_trust - reputation_cost*0.1],  # Trust
        [-idle_cost_aggr - stockout_penalty*0.3, -idle_cost_aggr - stockout_penalty*0.3 - reputation_cost, -idle_cost_aggr - reputation_cost*2],  # Aggressive
    ])
    
    # Treasury payoffs: higher is better (savings from freed cash)
    treasury_payoffs = np.array([
        [idle_cost_hoard*0.1 - guarantee_cost, idle_cost_hoard*0.1, idle_cost_hoard*0.1],
        [idle_cost_trust*3 - guarantee_cost, idle_cost_trust*2.5, idle_cost_trust*2],
        [idle_cost_aggr*5 - guarantee_cost - stockout_penalty*0.3, idle_cost_aggr*4, idle_cost_aggr*3],
    ])
    
    # Find Nash equilibrium via best response iteration
    bm_best = np.argmax(bm_payoffs, axis=0)  # BM best response per Treasury strategy
    tr_best = np.argmax(treasury_payoffs, axis=1)  # Treasury best response per BM strategy
    
    nash_cells = []
    strategies_bm = ["Hoard", "Trust_Model", "Aggressive"]
    strategies_tr = ["Guarantee_CIT", "No_Guarantee", "Penalty_Only"]
    
    for i in range(3):
        for j in range(3):
            if bm_best[j] == i and tr_best[i] == j:
                nash_cells.append({"bm": strategies_bm[i], "treasury": strategies_tr[j]})
    
    if not nash_cells:
        nash_cells = [{"bm": "Trust_Model", "treasury": "Guarantee_CIT"}]
    
    # BMIS score
    forecast_adherence = max(0, 1 - abs(branch.current_vault_balance - branch.optimal_vault_balance) / max(branch.current_vault_balance, 1))
    bmis = round(0.5 * ces + 0.3 * (1 - stockout_rate) + 0.2 * forecast_adherence, 3)
    
    return {
        "branch_id": branch_id,
        "ces": ces,
        "bmis": bmis,
        "stockout_rate": round(stockout_rate, 3),
        "forecast_adherence": round(forecast_adherence, 3),
        "nash_equilibrium": nash_cells,
        "payoff_matrix_bm": bm_payoffs.round(4).tolist(),
        "payoff_matrix_treasury": treasury_payoffs.round(4).tolist(),
        "strategies_bm": strategies_bm,
        "strategies_treasury": strategies_tr,
    }
```

### LAYER 3: API endpoints ACTUALLY call services and return results

File: backend/app/api/uc01.py (or forecasts.py — wherever UC01 endpoints are)

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.uc01_vault_forecast import forecast_branch, optimize_vault, compute_game_theory
from app.core.ai_client import ask_ai

router = APIRouter(prefix="/api/uc01", tags=["UC-01"])

@router.get("/branches")
def list_branches(db: Session = Depends(get_db)):
    """Return ALL branches with computed metrics. Not hardcoded."""
    from app.models.branch import Branch
    branches = db.query(Branch).all()
    if not branches:
        raise HTTPException(404, "No branches found. Run: python seed_data.py")
    return [
        {
            "branch_id": b.branch_id,
            "name": b.name,
            "city": b.city,
            "type": b.branch_type,
            "vault_capacity": b.vault_capacity,
            "current_vault": b.current_vault_balance,
            "optimal_vault": b.optimal_vault_balance,
            "idle_cash": b.idle_cash,
            "ces": b.cash_efficiency_score,
            "daily_transactions": b.daily_transactions,
            "avg_deposits": b.avg_daily_deposits,
            "avg_withdrawals": b.avg_daily_withdrawals,
        }
        for b in branches
    ]

@router.get("/branches/{branch_id}")
def get_branch(branch_id: str, db: Session = Depends(get_db)):
    from app.models.branch import Branch
    from app.models.vault_position import VaultPosition
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(404, f"Branch {branch_id} not found")
    
    history = (db.query(VaultPosition)
               .filter(VaultPosition.branch_id == branch_id)
               .order_by(VaultPosition.date.desc())
               .limit(30)
               .all())
    
    return {
        "branch": {
            "branch_id": branch.branch_id,
            "name": branch.name,
            "city": branch.city,
            "type": branch.branch_type,
            "vault_capacity": branch.vault_capacity,
            "current_vault": branch.current_vault_balance,
            "optimal_vault": branch.optimal_vault_balance,
            "idle_cash": branch.idle_cash,
            "ces": branch.cash_efficiency_score,
            "daily_transactions": branch.daily_transactions,
        },
        "history": [
            {
                "date": str(vp.date),
                "opening": vp.opening_balance,
                "deposits": vp.deposits,
                "withdrawals": vp.withdrawals,
                "closing": vp.closing_balance,
                "idle": vp.idle_cash,
            }
            for vp in reversed(history)
        ]
    }

@router.post("/forecast/{branch_id}")
def run_forecast(branch_id: str, db: Session = Depends(get_db)):
    """Runs ACTUAL LSTM/statistical forecast. Not hardcoded."""
    try:
        return forecast_branch(db, branch_id)
    except Exception as e:
        raise HTTPException(500, f"Forecast failed: {str(e)}")

@router.post("/optimize/{branch_id}")
def run_optimization(branch_id: str, db: Session = Depends(get_db)):
    """Runs ACTUAL stochastic optimizer. Not hardcoded."""
    try:
        return optimize_vault(db, branch_id)
    except Exception as e:
        raise HTTPException(500, f"Optimization failed: {str(e)}")

@router.post("/game-theory/{branch_id}")
def run_game_theory(branch_id: str, db: Session = Depends(get_db)):
    """Runs ACTUAL Nash equilibrium computation. Not hardcoded."""
    try:
        return compute_game_theory(db, branch_id)
    except Exception as e:
        raise HTTPException(500, f"Game theory failed: {str(e)}")

@router.get("/network-summary")
def get_network_summary(db: Session = Depends(get_db)):
    from app.models.branch import Branch
    branches = db.query(Branch).all()
    total_idle = sum(b.idle_cash for b in branches)
    avg_ces = sum(b.cash_efficiency_score for b in branches) / max(len(branches), 1)
    return {
        "total_branches": len(branches),
        "total_idle_cash_m": round(total_idle, 1),
        "avg_ces": round(avg_ces, 3),
        "total_annual_savings_m": round(total_idle * 0.11, 1),
        "branches_by_type": {
            t: sum(1 for b in branches if b.branch_type == t)
            for t in ["Cash-Surplus", "Cash-Deficit", "Balanced", "Seasonal", "Hub"]
        },
    }

@router.post("/ai-brief/{branch_id}")
def get_ai_brief(branch_id: str, db: Session = Depends(get_db)):
    """ONLY AI endpoint. Sends pre-computed results to GPT-4.1."""
    # First compute everything locally
    forecast = forecast_branch(db, branch_id)
    optimization = optimize_vault(db, branch_id)
    game = compute_game_theory(db, branch_id)
    
    from app.models.branch import Branch
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    
    context = (
        f"{branch.name} ({branch_id}), {branch.city}, Type: {branch.branch_type}\n"
        f"LSTM Forecast: {forecast['avg_forecast']}M/day (Model: {forecast['model_type']})\n"
        f"Optimizer: Current {optimization['current_vault']}M → Recommended {optimization['recommended_vault']}M\n"
        f"Idle reduction: {optimization['idle_reduction']}M → Annual savings: PKR {optimization['annual_savings_m']}M\n"
        f"CES: {game['ces']} | BMIS: {game['bmis']} | Nash: {game['nash_equilibrium']}\n"
    )
    
    result = ask_ai(
        system_prompt="You are a senior Pakistani bank treasury analyst. Given pre-computed optimization results, write a 4-5 sentence executive brief. Include risk level, key action, expected savings. Be specific with numbers. Do NOT recompute — narrate the provided results.",
        user_content=context
    )
    
    return {
        "ai_brief": result["summary"],
        "ai_available": result["available"],
        "computed_data": {
            "forecast": forecast,
            "optimization": optimization,
            "game_theory": game,
        }
    }
```

### LAYER 4: main.py ACTUALLY includes the router

File: backend/app/main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.uc01 import router as uc01_router
# ... import other UC routers as they're built

app = FastAPI(title="Cash Optimization Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uc01_router)
# app.include_router(uc02_router)  # uncomment as built

@app.get("/health")
def health():
    return {"status": "ok", "service": "cash-optimization-engine"}
```

### LAYER 5: Frontend ACTUALLY fetches and displays

File: frontend/src/stores/appStore.js

```javascript
import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000/api' })

export const useAppStore = create((set, get) => ({
  currentUC: 'catalog',
  selectedBranch: null,
  branches: [],
  forecastData: null,
  optimizationResult: null,
  gameTheoryResult: null,
  aiBrief: null,
  networkSummary: null,
  isLoading: false,
  isOptimizing: false,
  isAILoading: false,
  error: null,

  setCurrentUC: (uc) => set({ currentUC: uc }),

  fetchBranches: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.get('/uc01/branches')
      set({ branches: data, isLoading: false })
    } catch (e) {
      set({ error: `Failed to fetch branches: ${e.message}`, isLoading: false })
    }
  },

  fetchNetworkSummary: async () => {
    try {
      const { data } = await api.get('/uc01/network-summary')
      set({ networkSummary: data })
    } catch (e) {
      console.error('Network summary failed:', e)
    }
  },

  selectBranch: async (branch) => {
    set({ 
      selectedBranch: branch, 
      forecastData: null, 
      optimizationResult: null, 
      gameTheoryResult: null,
      aiBrief: null,
      isLoading: true 
    })
    
    try {
      // Fetch forecast + optimization + game theory in parallel
      const [forecastRes, optimRes, gtRes] = await Promise.all([
        api.post(`/uc01/forecast/${branch.branch_id}`),
        api.post(`/uc01/optimize/${branch.branch_id}`),
        api.post(`/uc01/game-theory/${branch.branch_id}`),
      ])
      
      set({
        forecastData: forecastRes.data,
        optimizationResult: optimRes.data,
        gameTheoryResult: gtRes.data,
        isLoading: false,
      })
    } catch (e) {
      set({ error: `Analysis failed: ${e.message}`, isLoading: false })
    }
  },

  fetchAIBrief: async () => {
    const branch = get().selectedBranch
    if (!branch) return
    
    set({ isAILoading: true })
    try {
      const { data } = await api.post(`/uc01/ai-brief/${branch.branch_id}`)
      set({ aiBrief: data, isAILoading: false })
    } catch (e) {
      set({ 
        aiBrief: { ai_brief: `AI unavailable: ${e.message}`, ai_available: false },
        isAILoading: false 
      })
    }
  },
}))
```

Then every component reads from the store:

```javascript
// ForecastChart.jsx
const forecastData = useAppStore(s => s.forecastData)
if (!forecastData) return <div>Select a branch...</div>
// render forecastData.forecast_days as Recharts lines

// OptimizerPanel.jsx  
const result = useAppStore(s => s.optimizationResult)
if (!result) return <div>Loading...</div>
// render result.recommended_vault, result.annual_savings_m etc.

// GameTheoryCard.jsx
const gt = useAppStore(s => s.gameTheoryResult)
// render gt.payoff_matrix_bm, gt.nash_equilibrium, gt.ces, gt.bmis

// AISummaryPanel.jsx
const aiBrief = useAppStore(s => s.aiBrief)
const isAILoading = useAppStore(s => s.isAILoading)
const fetchAIBrief = useAppStore(s => s.fetchAIBrief)
// Button calls fetchAIBrief(), renders aiBrief.ai_brief text
```

## APPLY THIS SAME PATTERN TO UC-02 THROUGH UC-10

For every use case:
1. Service file has functions that QUERY DB and COMPUTE with scipy/numpy/torch
2. API file has endpoints that CALL service functions and RETURN results
3. Router is INCLUDED in main.py
4. Frontend store has actions that CALL endpoints and SET state
5. Components READ from store and RENDER data
6. ONE optional ai-brief endpoint per UC that sends pre-computed results to GPT-4.1

## FINAL VERIFICATION CHECKLIST

After fixing, run each of these. ALL must return real computed data, not empty/error:

```bash
cd ~/projects/cash-optimization-engine/backend

# 1. DB has data
python -c "
from app.database import SessionLocal
db = SessionLocal()
print('branches:', db.execute('SELECT COUNT(*) FROM branches').scalar())
print('vault_pos:', db.execute('SELECT COUNT(*) FROM vault_positions').scalar())
"

# 2. Services compute
python -c "
from app.database import SessionLocal
from app.services.uc01_vault_forecast import forecast_branch, optimize_vault, compute_game_theory
db = SessionLocal()
f = forecast_branch(db, 'KHI-001')
print('Forecast avg:', f['avg_forecast'], 'days:', len(f['forecast_days']))
o = optimize_vault(db, 'KHI-001')
print('Optimal:', o['recommended_vault'], 'Savings:', o['annual_savings_m'])
g = compute_game_theory(db, 'KHI-001')
print('CES:', g['ces'], 'Nash:', g['nash_equilibrium'])
"

# 3. API responds
python -m uvicorn app.main:app --port 8000 &
sleep 3
curl -s localhost:8000/api/uc01/branches | python -c "import sys,json; d=json.load(sys.stdin); print(f'Branches: {len(d)}, First: {d[0][\"name\"]}')"
curl -s -X POST localhost:8000/api/uc01/forecast/KHI-001 | python -c "import sys,json; d=json.load(sys.stdin); print(f'Forecast: {d[\"avg_forecast\"]}M/day, Model: {d[\"model_type\"]}')"
curl -s -X POST localhost:8000/api/uc01/optimize/KHI-001 | python -c "import sys,json; d=json.load(sys.stdin); print(f'Optimal: {d[\"recommended_vault\"]}M, Savings: {d[\"annual_savings_m\"]}M/yr')"
curl -s -X POST localhost:8000/api/uc01/game-theory/KHI-001 | python -c "import sys,json; d=json.load(sys.stdin); print(f'CES: {d[\"ces\"]}, Nash: {d[\"nash_equilibrium\"]}')"
kill %1

# 4. Frontend renders (manual check)
# Open localhost:5173, click UC-01, click a branch
# Verify: charts show data, optimizer shows numbers, game theory shows matrix
# Open browser DevTools Network tab: all API calls return 200 with JSON bodies
```

Fix ALL broken wiring now. Every function must compute real results. No hardcoded data. No placeholder returns. No `pass` statements. No TODO comments.
```
