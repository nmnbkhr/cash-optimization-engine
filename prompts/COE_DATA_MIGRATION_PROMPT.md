# COE — DATA MIGRATION PROMPT
# ══════════════════════════════════════════════════════════════
# SITUATION: All 10 use cases are BUILT and TESTED with initial 
# synthetic data. Now swap that data with demo.xlsx-anchored data 
# (real UBL GL amounts) WITHOUT breaking any existing UC code.
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
IMPORTANT CONTEXT: All 10 use cases (UC-01 through UC-10) are already built and working 
with the current synthetic data. I do NOT want to rebuild any use case. I want to REPLACE 
the data underneath with new CSV files that are anchored to real UBL GL amounts.

The new data files are in data/demo/ (or data/synthetic/ — check both). They are:
- branches.csv (1,527 rows)
- atms.csv (2,180 rows)
- vault_history.csv (73,000 rows)
- nostro_accounts.csv (35 rows)
- crr_positions.csv (90 rows)
- ubl_actuals.json

These were generated from real UBL balance sheet and P&L data (demo.xlsx).
All amounts are in PKR MILLIONS.

## YOUR TASK: Migrate data without breaking existing UC code

### Step 1: Audit the current state

Run this to understand what exists now:

```bash
# What tables exist in the current DB?
cd ~/projects/cash-optimization-engine/backend
python3 -c "
from app.database import engine
from sqlalchemy import inspect
insp = inspect(engine)
for table in insp.get_table_names():
    cols = [c['name'] for c in insp.get_columns(table)]
    count_query = f'SELECT COUNT(*) FROM {table}'
    from app.database import SessionLocal
    db = SessionLocal()
    count = db.execute(count_query).scalar()
    print(f'{table} ({count} rows): {cols}')
    db.close()
"
```

```bash
# What columns do the NEW CSVs have?
cd ~/projects/cash-optimization-engine
python3 -c "
import pandas as pd, os
demo_dir = 'data/demo' if os.path.exists('data/demo') else 'data/synthetic'
print(f'Reading from: {demo_dir}')
for f in ['branches.csv','atms.csv','vault_history.csv','nostro_accounts.csv','crr_positions.csv']:
    path = os.path.join(demo_dir, f)
    if os.path.exists(path):
        df = pd.read_csv(path, nrows=2)
        print(f'{f} ({len(pd.read_csv(path))} rows): {list(df.columns)}')
    else:
        print(f'{f}: NOT FOUND')
"
```

### Step 2: Create column mapping

Compare the EXISTING DB columns with the NEW CSV columns.
For each table, create a mapping:

```
EXISTING DB column name  →  NEW CSV column name  →  Action needed
```

Actions:
- EXACT MATCH: no change needed
- RENAME: CSV column name is different → either rename in CSV or update model
- MISSING IN CSV: existing code uses a column that's not in new CSV → compute it or set default
- NEW IN CSV: CSV has columns the DB doesn't → add to model or ignore

CRITICAL RULE: Do NOT change any service/*.py, api/*.py, or frontend component code.
Only change: models, seed_data.py, and if necessary add a thin adapter layer.

### Step 3: Adapt the NEW CSVs to fit EXISTING models (preferred approach)

The safest migration is to transform the new CSVs to match the existing column names.
This way ZERO service/API/frontend code changes are needed.

Create a file: backend/migrate_demo_data.py

```python
"""
Reads new demo CSVs, transforms column names/types to match existing DB schema,
drops and reseeds the database. Existing UC code unchanged.
"""
import pandas as pd
import os
from app.database import SessionLocal, engine, Base

DEMO_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'demo')
# or 'data/synthetic' — use whichever exists

def load_and_transform():
    db = SessionLocal()
    
    # ── Read new CSVs ──
    branches_new = pd.read_csv(os.path.join(DEMO_DIR, 'branches.csv'))
    atms_new = pd.read_csv(os.path.join(DEMO_DIR, 'atms.csv'))
    vault_new = pd.read_csv(os.path.join(DEMO_DIR, 'vault_history.csv'))
    nostro_new = pd.read_csv(os.path.join(DEMO_DIR, 'nostro_accounts.csv'))
    crr_new = pd.read_csv(os.path.join(DEMO_DIR, 'crr_positions.csv'))
    
    # ── Get existing DB column names ──
    from sqlalchemy import inspect
    insp = inspect(engine)
    existing_tables = {}
    for table in insp.get_table_names():
        existing_tables[table] = [c['name'] for c in insp.get_columns(table)]
    
    print("EXISTING DB SCHEMA:")
    for t, cols in existing_tables.items():
        print(f"  {t}: {cols}")
    
    print("\nNEW CSV COLUMNS:")
    print(f"  branches: {list(branches_new.columns)}")
    print(f"  atms: {list(atms_new.columns)}")
    print(f"  vault_history: {list(vault_new.columns)}")
    print(f"  nostro: {list(nostro_new.columns)}")
    print(f"  crr: {list(crr_new.columns)}")
    
    # ── MAPPING LOGIC ──
    # For each table, rename new CSV columns to match existing DB columns.
    # If existing DB has columns not in new CSV, compute them.
    # If new CSV has extra columns existing DB doesn't have, drop them.
    
    # YOU (Claude Code) must now:
    # 1. Compare the two sets of column names for each table
    # 2. Rename the new CSV columns to match the existing DB
    # 3. Add any missing columns with sensible defaults
    # 4. Drop any extra columns that existing DB doesn't have
    # 5. Make sure types match (bool columns are 0/1 not True/False, etc.)
    
    # Example:
    # If existing DB has 'branch_type' but new CSV has 'type' → rename
    # If existing DB has 'manager_name' but new CSV doesn't → add with fake names
    # If new CSV has 'monthly_nim' but DB doesn't → drop it OR add column to model
    
    # IMPORTANT: Print the exact mapping you're applying so I can verify
    
    return branches_new, atms_new, vault_new, nostro_new, crr_new
```

### Step 4: PRESERVE old data, then seed new data

CRITICAL: Keep the initial synthetic data as a backup so you can switch back anytime.

```python
import shutil

def migrate(branches, atms, vault, nostro, crr):
    DB_PATH = 'cash_engine.db'  # adjust to actual path
    BACKUP_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'initial')
    
    # ═══ STEP A: Backup current DB file ═══
    if os.path.exists(DB_PATH):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_path = os.path.join(BACKUP_DIR, 'cash_engine_initial.db')
        shutil.copy2(DB_PATH, backup_path)
        print(f"✓ Backed up current DB to: {backup_path}")
    
    # ═══ STEP B: Export current data to CSVs as permanent backup ═══
    os.makedirs(BACKUP_DIR, exist_ok=True)
    from app.database import SessionLocal
    db = SessionLocal()
    
    from sqlalchemy import inspect
    insp = inspect(engine)
    for table in insp.get_table_names():
        try:
            df = pd.read_sql_table(table, engine)
            csv_path = os.path.join(BACKUP_DIR, f'{table}.csv')
            df.to_csv(csv_path, index=False)
            print(f"✓ Exported {table} ({len(df)} rows) → {csv_path}")
        except Exception as e:
            print(f"✗ Could not export {table}: {e}")
    db.close()
    
    print(f"\n✓ Initial data preserved in: {BACKUP_DIR}/")
    print(f"  To restore: python migrate_demo_data.py --restore")
    
    # ═══ STEP C: Drop and reseed with new demo data ═══
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    branches.to_sql('branches', engine, if_exists='append', index=False)
    print(f"\nSeeded {len(branches)} branches (demo)")
    
    atms.to_sql('atms', engine, if_exists='append', index=False)
    print(f"Seeded {len(atms)} ATMs (demo)")
    
    vault.to_sql('vault_positions', engine, if_exists='append', index=False, chunksize=5000)
    print(f"Seeded {len(vault)} vault positions (demo)")
    
    nostro.to_sql('nostro_accounts', engine, if_exists='append', index=False)
    print(f"Seeded {len(nostro)} nostro accounts (demo)")
    
    crr.to_sql('crr_positions', engine, if_exists='append', index=False)
    print(f"Seeded {len(crr)} CRR positions (demo)")
    
    # ═══ STEP D: Verify ═══
    db = SessionLocal()
    print("\n=== VERIFICATION (demo data) ===")
    print(f"Branches: {db.execute('SELECT COUNT(*) FROM branches').scalar()}")
    print(f"ATMs: {db.execute('SELECT COUNT(*) FROM atms').scalar()}")
    print(f"Vault positions: {db.execute('SELECT COUNT(*) FROM vault_positions').scalar()}")
    print(f"Nostro: {db.execute('SELECT COUNT(*) FROM nostro_accounts').scalar()}")
    print(f"CRR: {db.execute('SELECT COUNT(*) FROM crr_positions').scalar()}")
    
    total_dep = db.execute('SELECT SUM(total_deposits) FROM branches').scalar()
    total_idle = db.execute('SELECT SUM(idle_cash) FROM branches').scalar()
    total_atm = db.execute('SELECT SUM(current_cash_m) FROM atms').scalar()
    print(f"\nTotal deposits: {total_dep:,.0f} M (should be ~851,038)")
    print(f"Total idle cash: {total_idle:,.0f} M (should be ~7,535)")
    print(f"Total ATM cash: {total_atm:,.1f} M (should be ~1,393)")
    db.close()


def restore_initial():
    """Switch back to the initial synthetic data."""
    BACKUP_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'initial')
    
    # Option A: Restore the DB file directly
    backup_db = os.path.join(BACKUP_DIR, 'cash_engine_initial.db')
    DB_PATH = 'cash_engine.db'
    if os.path.exists(backup_db):
        shutil.copy2(backup_db, DB_PATH)
        print(f"✓ Restored initial DB from: {backup_db}")
        return
    
    # Option B: Reseed from backed-up CSVs
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    for csv_file in os.listdir(BACKUP_DIR):
        if csv_file.endswith('.csv'):
            table_name = csv_file.replace('.csv', '')
            df = pd.read_csv(os.path.join(BACKUP_DIR, csv_file))
            df.to_sql(table_name, engine, if_exists='append', index=False, chunksize=5000)
            print(f"✓ Restored {table_name}: {len(df)} rows")
    
    print("\n✓ Switched back to initial synthetic data")


if __name__ == '__main__':
    import sys
    if '--restore' in sys.argv:
        restore_initial()
    else:
        branches, atms, vault, nostro, crr = load_and_transform()
        migrate(branches, atms, vault, nostro, crr)
```

### What this gives you: TWO datasets, switchable

```
data/
├── initial/                    ← Auto-saved from your CURRENT working DB
│   ├── cash_engine_initial.db  ← Full DB backup (instant restore)
│   ├── branches.csv            ← Exported current branches
│   ├── atms.csv                ← Exported current ATMs
│   ├── vault_positions.csv     ← Exported current vault history
│   ├── nostro_accounts.csv     ← Exported current nostros
│   └── crr_positions.csv       ← Exported current CRR
│
├── demo/                       ← New UBL-anchored data (from demo.xlsx)
│   ├── branches.csv            ← 1,527 branches, deposits=851,038M
│   ├── atms.csv                ← 2,180 ATMs, cash=1,393M
│   ├── vault_history.csv
│   ├── nostro_accounts.csv
│   ├── crr_positions.csv
│   └── ubl_actuals.json
│
├── source/
│   └── demo.xlsx               ← Original UBL GL data
└── generate_dataset.py

SWITCH BETWEEN DATASETS:
  python backend/migrate_demo_data.py              → Use UBL demo data
  python backend/migrate_demo_data.py --restore    → Back to initial data
```

### Also add Makefile targets

```makefile
migrate-demo:
	cd backend && python migrate_demo_data.py

restore-initial:
	cd backend && python migrate_demo_data.py --restore
```

### Step 5: Handle column mismatches

There WILL be mismatches. Here's how to handle each case:

**Case A: Existing code uses a column that's in the new CSV with a DIFFERENT NAME**
→ Rename the CSV column to match. Example:
```python
branches_new = branches_new.rename(columns={'branch_type': 'type'})  # if DB has 'type'
```

**Case B: Existing code uses a column that DOESN'T EXIST in new CSV**
→ Compute it or add a default. Example:
```python
if 'manager_name' not in branches_new.columns:
    import faker
    f = faker.Faker()
    branches_new['manager_name'] = [f.name() for _ in range(len(branches_new))]
```

**Case C: New CSV has a column that the EXISTING DB DOESN'T have**
→ Two options:
  Option 1 (safe): Drop the column before inserting
  Option 2 (better): Add the column to the SQLAlchemy model so the UC can use it later
  
If adding columns to models, you need to also:
- Delete the old DB file: rm backend/cash_engine.db  
- Re-create: python -c "from app.database import engine, Base; Base.metadata.create_all(engine)"

**Case D: The new CSV has different branch_ids than the old data**
→ This is fine. The IDs are just identifiers. All the relationships are by branch_id 
  foreign keys. As long as vault_history.branch_id references branches.branch_id, it works.
  The new CSVs already have consistent IDs (KHI-0001, LHE-0001, etc.)

**Case E: Amount ranges are different**
→ This might affect hardcoded thresholds in frontend (e.g., chart Y-axis max).
  After migration, check if charts look reasonable. If Y-axis is wrong, it's because
  the frontend has hardcoded scale values — make them dynamic based on data.

### Step 6: Run the migration

```bash
cd ~/projects/cash-optimization-engine/backend
python migrate_demo_data.py
```

### Step 7: Test EVERY use case still works

```bash
# Start the app
make dev

# Quick API test for each UC
for uc in uc01 uc02 uc03 uc04 uc05 uc06 uc07 uc08 uc09 uc10; do
    echo "Testing $uc..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" localhost:8000/api/$uc/*)
    echo "  → HTTP $STATUS"
done

# Then open browser: localhost:5173
# Click through each UC card
# Verify charts show data (not empty, not error)
```

If any UC breaks after migration, the issue is ALWAYS one of:
1. Column name mismatch → fix in migrate_demo_data.py rename step
2. Data type mismatch (string vs int) → fix with .astype() before insert
3. Null values where NOT NULL expected → fix with .fillna()
4. Branch IDs don't match between tables → check foreign keys

### Step 8: Verify the data is real UBL-anchored (not random)

```bash
cd backend && python3 -c "
from app.database import SessionLocal
db = SessionLocal()

total_dep = db.execute('SELECT SUM(total_deposits) FROM branches').scalar()
total_idle = db.execute('SELECT SUM(idle_cash) FROM branches').scalar()
total_atm = db.execute('SELECT SUM(current_cash_m) FROM atms').scalar()
avg_ces = db.execute('SELECT AVG(cash_efficiency_score) FROM branches').scalar()

print('=== POST-MIGRATION VERIFICATION ===')
print(f'Total deposits:  {total_dep:>12,.0f} M  (actual UBL: 851,038 M)')
print(f'Total idle cash: {total_idle:>12,.0f} M  (expected: ~7,535 M)')
print(f'Total ATM cash:  {total_atm:>12,.1f} M  (actual UBL: 1,393 M)')
print(f'Avg CES:         {avg_ces:>12.1%}       (expected: ~58.5%)')

match = abs(total_dep - 851038) < 100 and abs(total_atm - 1393) < 10
print(f'\nAnchored to real UBL data: {\"YES ✓\" if match else \"NO ✗ — check migration\"} ')
"
```

### DONE

After migration:
- All 10 UCs work exactly as before
- But now the data shows REAL UBL amounts (PKR Millions, anchored to demo.xlsx)
- Total deposits = 851,038 M (not random)
- ATM cash = 1,393 M (from actual GL codes)
- Branch distribution matches real UBL city presence
- P&L lines match actual UBL monthly figures

The service logic, API endpoints, frontend components — NONE of these change.
Only the DATA underneath changed from random → real UBL-anchored.
```
