# COE — ACTIVATE FORECASTING (Wire ML Models Into The App)
# ══════════════════════════════════════════════════════════════
# The ML models EXIST but are dead code:
#   - ensemble_forecast.py → built, never called from UI
#   - uc01_vault_forecast.py → LSTM exists, never trained from app
#   - forecasts table → 0 rows (never populated)
#   - /api/business/ensemble/* → endpoints exist, no UI page
#
# This prompt ACTIVATES forecasting end-to-end:
#   1. Train models from the app (button click or daily cron)
#   2. Store predictions in forecasts table
#   3. Show forecasts in a new UI page
#   4. Connect forecasts to Branch Plan recommendations
#   5. Daily runner trains + predicts automatically
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
The forecasting infrastructure exists but is dead code. The forecasts 
table has 0 rows. The ensemble endpoints exist but no UI page calls them.
LSTM is defined but never trained from the app. Fix this.

Exact stack (already installed — add NOTHING):
  Backend: FastAPI, SQLAlchemy, SQLite, pandas, numpy, XGBoost 3.2, MAPIE 1.3, PyTorch 2.11
  Frontend: React 19.2, Vite 7.3, TailwindCSS 4.2, Zustand 5.0, Recharts 3.8, Axios, Lucide React

## WHAT NEEDS TO HAPPEN

### Problem: The forecast pipeline is disconnected

Right now:
  fact_gl_daily (45,960 rows of daily vault data) → sits in DB, unused by ML
  vault_positions (559,180 rows of vault history) → sits in DB, unused by ML
  ensemble_forecast.py → has train() and predict() methods but nothing calls them
  uc01_vault_forecast.py → has LSTM class but never trains on real data
  forecasts table → 0 rows

What should happen:
  fact_gl_daily + vault_positions → features extracted → model trained
  model → predictions for next 7 days per branch → stored in forecasts table
  forecasts table → read by Branch Plan page → "Expected deposits tomorrow: ₨68.5M"
  forecasts table → read by Command Center → informs netting opportunities
  daily_runner.py → retrains + predicts every morning at 6 AM

### STEP 1: Wire the training pipeline

Update ensemble_forecast.py (or the existing training endpoint) to actually:

1. Read from fact_gl_daily table (45,960 rows = 1,532 branches × 30 days)
2. Extract features per branch-day:
   - day_of_week (0-6)
   - day_of_month (1-31)
   - is_friday (bool)
   - is_salary_day (1st or 15th)
   - rolling_7d_mean_deposits
   - rolling_7d_std_deposits
   - rolling_7d_mean_withdrawals
   - lag_1_deposits (yesterday)
   - lag_7_deposits (same day last week)
   - branch_type_encoded (ordinal)
   - city_encoded (ordinal)
   - total_deposits (branch size — larger branches have larger swings)
3. Target: total_deposit_flow_m (next day deposits)
   Also train separate model for: total_withdrawal_flow_m
4. Train XGBoost with MAPIE ConformalizedQuantileRegression:
   - This gives prediction intervals with guaranteed coverage
   - Upper/lower bounds = "we are 95% confident deposits will be between X and Y"
5. Store trained model in memory (pickle to data/models/ for persistence)
6. Return training metrics: MAPE, coverage, n_samples

The endpoint POST /api/business/ensemble/train should:
```python
@router.post("/ensemble/train")
def train_ensemble(db: Session = Depends(get_db)):
    """
    Train XGBoost + Conformal on fact_gl_daily data.
    Takes ~10-30 seconds for 45K rows. Not instant — show loading in UI.
    """
    from app.services.ensemble_forecast import EnsembleForecastService
    service = EnsembleForecastService(db)
    result = service.train()
    # result = {
    #   "status": "trained",
    #   "samples": 45960,
    #   "features": 12,
    #   "mape_deposits": 8.2,    # Mean Absolute Percentage Error
    #   "mape_withdrawals": 9.1,
    #   "coverage_95": 96.3,     # % of actuals within 95% conformal band
    #   "model_size_kb": 340,
    #   "trained_at": "2026-04-06T14:30:00",
    # }
    return result
```

### STEP 2: Wire the prediction pipeline

The endpoint GET /api/business/ensemble/predict/{branch_id} should:

1. Load trained model from memory (or pickle)
2. For the given branch, generate features for next 7 days
3. Predict deposits + withdrawals + conformal intervals
4. Compute recommended vault level:
   recommended_vault = predicted_withdrawals_upper_95 × 1.1
   (keep 10% buffer above 95th percentile of predicted demand)
5. Store predictions in forecasts table
6. Return structured forecast

```python
@router.get("/ensemble/predict/{branch_id}")
def predict_branch(branch_id: str, db: Session = Depends(get_db)):
    """
    7-day forecast for one branch with conformal prediction intervals.
    """
    # Returns:
    # {
    #   "branch_id": "KHI-0001",
    #   "branch_name": "Saddar Main",
    #   "model": "XGBoost + Conformal (MAPIE)",
    #   "trained_at": "2026-04-06T14:30:00",
    #   "forecasts": [
    #     {
    #       "date": "2026-04-07",
    #       "day_name": "Monday",
    #       "predicted_deposits": 68.5,
    #       "deposits_lower_95": 52.1,
    #       "deposits_upper_95": 84.9,
    #       "predicted_withdrawals": 31.2,
    #       "withdrawals_lower_95": 22.8,
    #       "withdrawals_upper_95": 39.6,
    #       "predicted_net": 37.3,
    #       "recommended_vault": 43.6,
    #       "is_salary_day": false,
    #       "is_friday": false,
    #     },
    #     ... (7 days)
    #   ],
    #   "current_vault": 95.0,
    #   "optimal_vault": 42.0,
    #   "action": "RELEASE",
    #   "action_amount": 53.0,
    #   "accuracy": {
    #     "mape": 8.2,
    #     "coverage_95": 96.3,
    #   }
    # }
```

### STEP 3: Store predictions in forecasts table

The forecasts table already exists but has 0 rows.
Define the model if not already:

```python
class Forecast(Base):
    __tablename__ = 'forecasts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(String, index=True)
    forecast_date = Column(String)          # date being predicted
    created_at = Column(String)             # when prediction was made
    model_type = Column(String)             # "xgboost_conformal"
    predicted_deposits = Column(Float)
    deposits_lower_95 = Column(Float)
    deposits_upper_95 = Column(Float)
    predicted_withdrawals = Column(Float)
    withdrawals_lower_95 = Column(Float)
    withdrawals_upper_95 = Column(Float)
    recommended_vault = Column(Float)
    actual_deposits = Column(Float, nullable=True)   # filled in next day
    actual_withdrawals = Column(Float, nullable=True)
```

After predicting, INSERT rows. Next day, UPDATE with actuals for accuracy tracking.

### STEP 4: Batch predict — all branches at once

Add endpoint for daily batch prediction:

```python
@router.post("/ensemble/predict-all")
def predict_all_branches(db: Session = Depends(get_db)):
    """
    Run 7-day forecast for ALL 1,532 branches.
    Takes ~1-2 minutes. Store all in forecasts table.
    Used by daily_runner.py at 6 AM.
    """
    # Clears old predictions, generates new ones
    # Returns summary: { "branches_predicted": 1532, "rows_inserted": 10724 }
```

### STEP 5: Connect to Branch Plan page

Update BranchPlanView.jsx to fetch and display the forecast:

When a branch is selected:
1. Call GET /api/business/ensemble/predict/{branch_id}
2. If model not trained, show: "Model not trained yet. [Train Now] button"
3. If trained, show 7-day forecast chart:

```
Branch Vault Forecast — Saddar Main (KHI-0001)
Model: XGBoost + Conformal | MAPE: 8.2% | Coverage: 96.3%

         Mon    Tue    Wed    Thu    Fri    Sat    Sun
Deposits  68.5   72.1   65.8   70.3   88.2   45.6   32.1
         ┌────  ┌────  ┌────  ┌────  ┌────  ┌────  ┌────
         │ ▓▓▓  │ ▓▓▓  │ ▓▓▓  │ ▓▓▓  │▓▓▓▓  │ ▓▓   │ ▓
95% band │52-85 │55-89 │50-82 │54-87 │67-109 │35-56 │24-40
         └────  └────  └────  └────  └────  └────  └────
Withdraw  31.2   33.5   29.7   32.1   42.8   18.9   12.4

Recommended vault: ₨43.6 M
Current vault: ₨95.0 M
Action: RELEASE ₨51.4 M (vault > recommended + buffer)
```

Use Recharts AreaChart with:
- Solid line: predicted values
- Shaded area: 95% conformal band (upper to lower)
- Dashed line: recommended vault level
- Red dots: actual values (when available, for past days)

### STEP 6: Build Forecast Dashboard page (page #31)

New file: src/pages/ForecastDashboard.jsx
Route: /forecasts
Nav: Add under Business Views section, icon: TrendingUp from Lucide

This page shows:

Section A: Model Status Bar
```
[Model Status: ✅ Trained 2h ago | MAPE: 8.2% | Coverage: 96.3%]  [🔄 Retrain Model]
```

The "Retrain Model" button:
- Calls POST /api/business/ensemble/train
- Shows loading spinner (takes 10-30 seconds)
- On success: toast "Model trained on 45,960 samples. MAPE: 8.2%"
- On error: toast with error message

Section B: Branch Forecast Viewer
- Branch dropdown (same as Branch Plan page)
- On select: fetches 7-day forecast
- Shows forecast chart (Recharts AreaChart):
  - X axis: 7 days
  - Primary area (shaded emerald): deposits with 95% conformal band
  - Secondary area (shaded amber): withdrawals with 95% band
  - Dashed line: recommended vault level
  - Current vault shown as horizontal reference line

Section C: Forecast Accuracy (if actuals available)
- Table: date, predicted, actual, error, within_95%_band
- Summary: "Last 7 days: 6/7 within conformal band (85.7%)"

Section D: Bank-Wide Forecast Summary
- Total predicted deposits tomorrow: ₨ X M (bank-wide)
- Total predicted withdrawals: ₨ Y M
- Branches needing attention: N (where predicted > vault capacity)
- Net system cash flow: ₨ Z M

### STEP 7: Update daily_runner.py

The existing daily_runner.py has stubs. Wire it to actually run forecasting:

```python
class DailyRunner:
    def run_morning_cycle(self):
        # Phase 1: Refresh SBP data (already implemented)
        self.refresh_sbp_data()
        
        # Phase 2: Train ensemble model (NEW)
        self.train_forecast_model()
        
        # Phase 3: Predict all branches (NEW)
        self.predict_all_branches()
        
        # Phase 4: Generate vault recommendations using forecasts (NEW)
        self.generate_vault_plans()
        
        # Phase 5: Check exceptions (already implemented)
        self.check_exceptions()
    
    def train_forecast_model(self):
        """Train XGBoost + Conformal on latest data."""
        from app.services.ensemble_forecast import EnsembleForecastService
        db = SessionLocal()
        service = EnsembleForecastService(db)
        result = service.train()
        logger.info(f"  Model trained: MAPE={result['mape_deposits']:.1f}%, "
                   f"coverage={result['coverage_95']:.1f}%")
        db.close()
    
    def predict_all_branches(self):
        """Generate 7-day forecast for all 1,532 branches."""
        from app.services.ensemble_forecast import EnsembleForecastService
        db = SessionLocal()
        service = EnsembleForecastService(db)
        result = service.predict_all(db)
        logger.info(f"  Predictions: {result['branches_predicted']} branches, "
                   f"{result['rows_inserted']} forecast rows")
        db.close()
    
    def generate_vault_plans(self):
        """Use forecasts to compute today's vault recommendation per branch."""
        # Read forecasts for today from forecasts table
        # For each branch: recommended_vault from forecast
        # Compare to current_vault in branches table
        # Generate RELEASE/REQUEST/HOLD action
        # Store in daily_results table
        pass
```

### STEP 8: Connect forecasts to existing Branch Plan page

In BranchPlanView.jsx, after the existing vault recommendation section, add:

```jsx
{/* ML Forecast Section */}
<div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mt-4">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
      7-Day Vault Forecast
    </h3>
    <span className="text-[9px] font-mono text-gray-500">
      XGBoost + Conformal | MAPE: {forecast?.accuracy?.mape}%
    </span>
  </div>
  
  {/* Recharts AreaChart showing 7-day forecast with conformal bands */}
  <ResponsiveContainer width="100%" height={200}>
    <AreaChart data={forecast?.forecasts}>
      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
      <XAxis dataKey="day_name" tick={{ fontSize: 9, fill: '#64748b' }} />
      <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
      <Tooltip content={<ChartTooltip />} />
      
      {/* 95% conformal band for deposits */}
      <Area type="monotone" dataKey="deposits_upper_95" 
            stroke="none" fill="#10b981" fillOpacity={0.1} />
      <Area type="monotone" dataKey="deposits_lower_95"
            stroke="none" fill="#0a0e17" fillOpacity={1} />
      
      {/* Predicted deposits line */}
      <Line type="monotone" dataKey="predicted_deposits" 
            stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
      
      {/* Recommended vault reference line */}
      <ReferenceLine y={forecast?.recommended_vault} 
                     stroke="#d4a853" strokeDasharray="5 5" 
                     label={{ value: 'Recommended', fill: '#d4a853', fontSize: 9 }} />
    </AreaChart>
  </ResponsiveContainer>
  
  {/* Action bar */}
  <div className="mt-3 flex items-center justify-between">
    <div className="text-[10px] font-mono text-gray-500">
      Tomorrow: Deposits ₨{forecast?.forecasts?.[0]?.predicted_deposits}M 
      (95% band: ₨{forecast?.forecasts?.[0]?.deposits_lower_95}-{forecast?.forecasts?.[0]?.deposits_upper_95}M)
    </div>
    <div className="text-[10px] font-mono text-amber-400">
      Recommended vault: ₨{forecast?.recommended_vault}M
    </div>
  </div>
</div>
```

### STEP 9: Add Zustand store for forecasts

```javascript
// src/stores/forecastStore.js
import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000/api/business' })

export const useForecastStore = create((set, get) => ({
  modelStatus: null,    // { trained_at, mape, coverage }
  forecast: null,       // 7-day forecast for selected branch
  bankSummary: null,    // bank-wide forecast summary
  training: false,
  predicting: false,

  trainModel: async () => {
    set({ training: true })
    try {
      const { data } = await api.post('/ensemble/train')
      set({ modelStatus: data, training: false })
      return data
    } catch (e) {
      set({ training: false })
      throw e
    }
  },

  fetchForecast: async (branchId) => {
    set({ predicting: true })
    try {
      const { data } = await api.get(`/ensemble/predict/${branchId}`)
      set({ forecast: data, predicting: false })
    } catch (e) {
      set({ predicting: false })
    }
  },

  compareForecast: async (branchId) => {
    const { data } = await api.get(`/ensemble/compare/${branchId}`)
    return data  // { lstm_mape, ensemble_mape, improvement_pct }
  },
}))
```

### VERIFY

```bash
# 1. Train the model
curl -s -X POST localhost:8000/api/business/ensemble/train | python -m json.tool
# Expected: { "status": "trained", "mape_deposits": ~8, "coverage_95": ~95 }

# 2. Predict for a branch
curl -s localhost:8000/api/business/ensemble/predict/KHI-0001 | python -m json.tool
# Expected: 7-day forecast with conformal intervals

# 3. Check forecasts table
cd backend && python -c "
from app.database import SessionLocal
db = SessionLocal()
count = db.execute('SELECT COUNT(*) FROM forecasts').scalar()
print(f'Forecasts table: {count} rows')
"
# Expected: > 0 rows (was 0 before)

# 4. Open browser:
#    /forecasts → Forecast Dashboard (model status + branch viewer)
#    /branch-plan → select branch → scroll down to see 7-day forecast chart

# 5. Run daily cycle
make daily-run
# Expected: trains model + predicts all 1,532 branches + stores forecasts
```

### SUMMARY: What this fixes

BEFORE:
  fact_gl_daily (45,960 rows) → unused
  ensemble_forecast.py → dead code
  forecasts table → 0 rows
  Branch Plan → shows static vault recommendation (no ML)
  daily_runner → doesn't train anything

AFTER:
  fact_gl_daily → features → XGBoost + Conformal → trained model
  model → 7-day predictions per branch → forecasts table (10,724 rows)
  Branch Plan → shows 7-day chart with 95% conformal bands
  Forecast Dashboard → train button, accuracy metrics, branch viewer
  daily_runner → trains at 6AM, predicts all branches, stores results
  Vault recommendation → USES forecast upper bound (not just static average)

The ML goes from dead code to the DRIVER of vault recommendations.
```
