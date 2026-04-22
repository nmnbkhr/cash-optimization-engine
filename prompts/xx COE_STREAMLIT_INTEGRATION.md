# COE — STREAMLIT COMMAND CENTER INTEGRATION
# ══════════════════════════════════════════════════════════════
# Adds an interactive Streamlit demo layer ON TOP of the existing
# React app. Both can run simultaneously on different ports.
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
I have a complete Streamlit Command Center app at:
  ~/projects/cash-optimization-engine/streamlit/coe_command_center.py

It's a single-file interactive demo for banking executives.
Integrate it into the project WITHOUT disrupting the existing React frontend.

### Step 1: Place the file
mkdir -p ~/projects/cash-optimization-engine/streamlit
# I've already placed coe_command_center.py there

### Step 2: Install Streamlit in the conda env
conda activate coe
pip install streamlit plotly

### Step 3: Add Makefile targets
```makefile
# Streamlit Command Center (port 8501)
streamlit:
	cd streamlit && streamlit run coe_command_center.py --server.port 8501

# Run everything: React (5173) + FastAPI (8000) + Streamlit (8501)
dev-all:
	make backend &
	make frontend &
	make streamlit &
	wait
```

### Step 4: Make the Streamlit app read from the SAME database

Update coe_command_center.py line ~68 (load_or_generate_branches function)
to ALSO try reading directly from the SQLite database:

```python
# Add this as the FIRST candidate in load_or_generate_branches():
try:
    import sqlite3
    db_path = os.path.expanduser(
        "~/projects/cash-optimization-engine/backend/cash_engine.db"
    )
    if os.path.exists(db_path):
        con = sqlite3.connect(db_path)
        df = pd.read_sql("SELECT * FROM branches", con)
        con.close()
        if len(df) > 0:
            st.sidebar.success(f"Loaded {len(df)} branches from SQLite DB")
            return df
except Exception as e:
    pass  # Fall through to CSV loading
```

This means the Streamlit app sees the EXACT same data as the React app.
If you run `make migrate-demo`, both apps update together.

### Step 5: Verify
```bash
cd ~/projects/cash-optimization-engine

# Terminal 1: Backend API
make backend

# Terminal 2: React frontend  
make frontend

# Terminal 3: Streamlit Command Center
make streamlit

# Open browser:
# React app: http://localhost:5173  (existing technical UC dashboards)
# Streamlit: http://localhost:8501  (executive demo Command Center)
# Both read from the same database
```

### What's in the Streamlit app (already built — don't rebuild):

Tab 1: Executive Dashboard
  - 5 KPI cards with delta indicators (idle cash, KIBOR loss, CES, BSC avoided, CIT saved)
  - Before/After idle cash histogram (Plotly)
  - P&L impact waterfall chart (McKinsey-style)
  - Branch health bar chart by CES category

Tab 2: Netting Sandbox (THE DEMO)
  - AI-recommended transfer cards (from → to, amount, distance, savings)
  - "⚡ Execute Transfer" button per recommendation
  - On click: updates vault balances, recalculates CES, shows success toast
  - Live P&L delta: "₨50M idle cash reduced. ₨60,000 SBP fee avoided."
  - State persists across interactions (st.session_state)

Tab 3: Branch Map
  - Plotly scatter_mapbox on Pakistan dark map
  - Green dots = surplus, Red dots = deficit, Gray = normal
  - Size proportional to idle cash
  - Hover shows branch details

Tab 4: Action Log
  - Full audit trail of every executed transfer
  - Pre/post state for each action
  - Exportable JSON for compliance

Sidebar:
  - Live KIBOR/SBP rate display
  - Netting parameter sliders (radius, min transfer)
  - Reset button (undo all actions, restore baseline)

### How the state management works:

DemoStateManager holds two copies of the branch DataFrame:
  - baseline (frozen — the original from DB, never changes)
  - current (mutated by each "Execute" action)

Every action:
  1. Updates current vault balances
  2. Recalculates idle_cash and CES for affected branches
  3. Accumulates P&L deltas (BSC avoided, CIT saved, KIBOR gain)
  4. Logs the full pre/post state for audit
  5. All KPIs recompute from current vs baseline

The "Reset" button restores current = baseline.copy()

### The SpatialNettingEngine works:

1. Build KDTree from branch lat/lng coordinates
2. Classify: surplus (vault > 80% capacity) and deficit (< 35% capacity)
3. For each surplus branch: query deficit branches within 15km radius
4. Compute: transfer_amount = min(excess, shortfall)
5. Financial impact: BSC charge avoided + CIT trip saved + KIBOR gain
6. Sort by total saving descending → top 20 recommendations

All math is vectorized. KDTree gives O(log n) spatial queries vs O(n²) brute force.
```
