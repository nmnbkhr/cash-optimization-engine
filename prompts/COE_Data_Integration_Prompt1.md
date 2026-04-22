# COE — COMPLETE DATA CHAIN PROMPT
# This REPLACES the data/seed section in Phase 0
# Paste into Claude Code AFTER the project skeleton is created

```
I have the source data file and pre-generated synthetic datasets for the 
cash-optimization-engine project. Here's the complete data chain to set up.

## FILE PLACEMENT

Place files in the project as follows:

~/projects/cash-optimization-engine/
├── data/
│   ├── source/
│   │   └── demo.xlsx              ← ORIGINAL UBL GL data (DO NOT MODIFY)
│   ├── synthetic/
│   │   ├── branches.csv           ← 1,527 branches (generated from demo.xlsx)
│   │   ├── atms.csv               ← 2,180 ATMs
│   │   ├── vault_history.csv      ← 73,000 rows LSTM training data
│   │   ├── nostro_accounts.csv    ← 35 correspondent banks
│   │   ├── crr_positions.csv      ← 90 days CRR positions
│   │   └── ubl_actuals.json       ← Extracted GL totals for validation
│   └── generate_dataset.py        ← Script that reads demo.xlsx → produces CSVs

The files in data/synthetic/ already exist. I'm uploading them now.
The file data/source/demo.xlsx already exists. I'm uploading it now.

## WHAT demo.xlsx CONTAINS

Two sheets of REAL UBL internal GL-level MPR data (January 2016):
- "Balance Sheet-Off Bal": 1,265 rows × 20 columns — every GL code with amounts
- "Profit & Loss": 409 rows × 17 columns — monthly P&L by GL code
- All amounts are in PKR MILLIONS

Key actuals extracted from it (stored in ubl_actuals.json):
- Cash in Hand: 11,739 M → distributed to branch vaults (UC-01)
- Cash ATM: 1,393 M → distributed to 2,180 ATMs (UC-02)
- SBP Balance: 31,178 M → CRR modeling (UC-04)
- Nostro + Placements: 4,005 M → nostro accounts (UC-05)
- Total Deposits: 851,038 M → CRR base, branch allocation
- Monthly Interest Income: 7,015 M → branch P&L attribution (UC-10)
- Monthly OPEX: 2,096 M → cost allocation (UC-10)

## WHAT THE CSVs CONTAIN

All synthetic data is ANCHORED to demo.xlsx actuals — amounts sum back to real GL totals.

### branches.csv (1,527 rows)
branch_id, name, city, region, branch_type, is_urban, is_cpc,
vault_capacity, current_vault_balance, optimal_vault_balance, idle_cash,
cash_efficiency_score, daily_transactions, avg_daily_deposits, avg_daily_withdrawals,
total_deposits, deposits_current_account, deposits_savings, deposits_term,
monthly_interest_income, monthly_interest_expense, monthly_nim,
monthly_personnel_cost, monthly_premises_cost, monthly_direct_cost, monthly_other_cost,
annual_savings_potential, lat, lng

Verification: branches.total_deposits.sum() == 851,038 M (matches demo.xlsx exactly)
Verification: branches.idle_cash.sum() ≈ 7,535 M
Verification: atms.current_cash_m.sum() == 1,393 M (matches demo.xlsx ATM GLs exactly)

### vault_history.csv (73,000 rows — 200 branches × 365 days)
branch_id, date, day_of_week, day_of_month, opening_balance, deposits,
withdrawals, closing_balance, idle_cash, is_salary_day, is_friday,
eid_factor, ramadan_factor, crop_factor

This is the TRAINING DATA for UC-01 LSTM. Has real patterns built in.

### atms.csv (2,180 rows)
atm_id, branch_id, city, atm_type, cassette_capacity_m, denomination_slots,
denom_5000_pct, denom_1000_pct, denom_500_pct, denom_100_pct,
avg_daily_dispense_m, uptime_pct, days_since_last_load, lat, lng,
current_cash_m, optimal_cash_m, idle_cash_m

### nostro_accounts.csv (35 rows)
nostro_id, correspondent_bank, currency, country, balance_pkr_m,
minimum_required_m, idle_balance_m, pending_lc_obligations_m,
avg_monthly_flow_m, overnight_rate_pct, relationship_years

### crr_positions.csv (90 rows)
date, day_of_week, deposit_base_m, crr_deposit_m, crr_pct,
required_daily_min_m, required_weekly_avg_m, excess_over_min_m,
freed_liquidity_m, overnight_repo_rate, is_maintenance_start

## HOW TO WIRE INTO THE APP

### 1. Update seed_data.py — LOAD CSVs into SQLite, don't generate

```python
# backend/seed_data.py
"""
Loads pre-generated CSVs (from data/synthetic/) into the SQLite database.
These CSVs were generated from real UBL GL data (data/source/demo.xlsx).
DO NOT generate random data. The CSVs already contain properly anchored amounts.
"""
import pandas as pd
import os
from app.database import SessionLocal, engine, Base
from app.models.branch import Branch
from app.models.vault_position import VaultPosition
from app.models.atm import ATM
from app.models.nostro_account import NostroAccount
from app.models.crr_position import CRRPosition

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'synthetic')

def seed_all():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # ── Branches ──
        if db.query(Branch).count() == 0:
            df = pd.read_csv(os.path.join(DATA_DIR, 'branches.csv'))
            for _, row in df.iterrows():
                db.add(Branch(**row.to_dict()))
            db.commit()
            print(f"Seeded {db.query(Branch).count()} branches")
            print(f"  Total deposits: {df['total_deposits'].sum():,.0f} M")
            print(f"  Total idle cash: {df['idle_cash'].sum():,.0f} M")
        else:
            print(f"Branches already seeded: {db.query(Branch).count()}")
        
        # ── Vault History ──
        if db.query(VaultPosition).count() == 0:
            df = pd.read_csv(os.path.join(DATA_DIR, 'vault_history.csv'))
            for chunk_start in range(0, len(df), 1000):
                chunk = df.iloc[chunk_start:chunk_start+1000]
                db.bulk_insert_mappings(VaultPosition, chunk.to_dict('records'))
                db.commit()
            print(f"Seeded {db.query(VaultPosition).count()} vault positions")
        else:
            print(f"Vault positions already seeded: {db.query(VaultPosition).count()}")
        
        # ── ATMs ──
        if db.query(ATM).count() == 0:
            df = pd.read_csv(os.path.join(DATA_DIR, 'atms.csv'))
            for _, row in df.iterrows():
                db.add(ATM(**row.to_dict()))
            db.commit()
            print(f"Seeded {db.query(ATM).count()} ATMs")
            print(f"  Total ATM cash: {df['current_cash_m'].sum():,.1f} M")
        else:
            print(f"ATMs already seeded: {db.query(ATM).count()}")
        
        # ── Nostro ──
        if db.query(NostroAccount).count() == 0:
            df = pd.read_csv(os.path.join(DATA_DIR, 'nostro_accounts.csv'))
            for _, row in df.iterrows():
                db.add(NostroAccount(**row.to_dict()))
            db.commit()
            print(f"Seeded {db.query(NostroAccount).count()} nostro accounts")
        else:
            print(f"Nostro already seeded: {db.query(NostroAccount).count()}")
        
        # ── CRR ──
        if db.query(CRRPosition).count() == 0:
            df = pd.read_csv(os.path.join(DATA_DIR, 'crr_positions.csv'))
            for _, row in df.iterrows():
                db.add(CRRPosition(**row.to_dict()))
            db.commit()
            print(f"Seeded {db.query(CRRPosition).count()} CRR positions")
        else:
            print(f"CRR already seeded: {db.query(CRRPosition).count()}")
    
    finally:
        db.close()

if __name__ == '__main__':
    seed_all()
```

### 2. Update SQLAlchemy models to MATCH CSV columns exactly

The model fields MUST match the CSV column names. Here are the exact mappings:

```python
# backend/app/models/branch.py
class Branch(Base):
    __tablename__ = 'branches'
    
    branch_id = Column(String, primary_key=True)          # "KHI-0001"
    name = Column(String, nullable=False)                   # "Saddar"
    city = Column(String, nullable=False)                   # "Karachi"
    region = Column(String)                                 # "Sindh"
    branch_type = Column(String)                            # "Cash-Surplus"
    is_urban = Column(Boolean)
    is_cpc = Column(Boolean)
    vault_capacity = Column(Float)                          # PKR M
    current_vault_balance = Column(Float)                   # PKR M
    optimal_vault_balance = Column(Float)                   # PKR M
    idle_cash = Column(Float)                               # PKR M
    cash_efficiency_score = Column(Float)                   # 0.0 - 1.0
    daily_transactions = Column(Integer)
    avg_daily_deposits = Column(Float)                      # PKR M
    avg_daily_withdrawals = Column(Float)                   # PKR M
    total_deposits = Column(Float)                          # PKR M
    deposits_current_account = Column(Float)                # PKR M
    deposits_savings = Column(Float)                        # PKR M
    deposits_term = Column(Float)                           # PKR M
    monthly_interest_income = Column(Float)                 # PKR M
    monthly_interest_expense = Column(Float)                # PKR M
    monthly_nim = Column(Float)                             # PKR M
    monthly_personnel_cost = Column(Float)                  # PKR M
    monthly_premises_cost = Column(Float)                   # PKR M
    monthly_direct_cost = Column(Float)                     # PKR M
    monthly_other_cost = Column(Float)                      # PKR M
    annual_savings_potential = Column(Float)                 # PKR M
    lat = Column(Float)
    lng = Column(Float)


# backend/app/models/vault_position.py
class VaultPosition(Base):
    __tablename__ = 'vault_positions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(String, ForeignKey('branches.branch_id'))
    date = Column(String)                                    # "2024-05-15"
    day_of_week = Column(Integer)                            # 0=Mon, 6=Sun
    day_of_month = Column(Integer)
    opening_balance = Column(Float)                          # PKR M
    deposits = Column(Float)                                 # PKR M
    withdrawals = Column(Float)                              # PKR M
    closing_balance = Column(Float)                          # PKR M
    idle_cash = Column(Float)                                # PKR M
    is_salary_day = Column(Integer)                          # 0 or 1
    is_friday = Column(Integer)                              # 0 or 1
    eid_factor = Column(Float)                               # 1.0 = normal
    ramadan_factor = Column(Float)
    crop_factor = Column(Float)


# backend/app/models/atm.py
class ATM(Base):
    __tablename__ = 'atms'
    
    atm_id = Column(String, primary_key=True)
    branch_id = Column(String, ForeignKey('branches.branch_id'))
    city = Column(String)
    atm_type = Column(String)                                # Lobby/Offsite/Mall/Kiosk
    cassette_capacity_m = Column(Float)                      # PKR M
    denomination_slots = Column(Integer)
    denom_5000_pct = Column(Float)
    denom_1000_pct = Column(Float)
    denom_500_pct = Column(Float)
    denom_100_pct = Column(Float)
    avg_daily_dispense_m = Column(Float)                     # PKR M
    uptime_pct = Column(Float)
    days_since_last_load = Column(Integer)
    lat = Column(Float)
    lng = Column(Float)
    current_cash_m = Column(Float)                           # PKR M
    optimal_cash_m = Column(Float)                           # PKR M
    idle_cash_m = Column(Float)                              # PKR M


# backend/app/models/nostro_account.py
class NostroAccount(Base):
    __tablename__ = 'nostro_accounts'
    
    nostro_id = Column(String, primary_key=True)
    correspondent_bank = Column(String)
    currency = Column(String)
    country = Column(String)
    balance_pkr_m = Column(Float)                            # PKR M
    minimum_required_m = Column(Float)
    idle_balance_m = Column(Float)
    pending_lc_obligations_m = Column(Float)
    avg_monthly_flow_m = Column(Float)
    overnight_rate_pct = Column(Float)
    relationship_years = Column(Integer)


# backend/app/models/crr_position.py
class CRRPosition(Base):
    __tablename__ = 'crr_positions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String)
    day_of_week = Column(Integer)
    deposit_base_m = Column(Float)                           # PKR M
    crr_deposit_m = Column(Float)
    crr_pct = Column(Float)
    required_daily_min_m = Column(Float)
    required_weekly_avg_m = Column(Float)
    excess_over_min_m = Column(Float)
    freed_liquidity_m = Column(Float)
    overnight_repo_rate = Column(Float)
    is_maintenance_start = Column(Boolean)
```

### 3. The generate_dataset.py script — READS demo.xlsx

This script already exists at data/generate_dataset.py. It does:
  demo.xlsx (source/demo.xlsx) → reads real GL amounts → distributes to branches/ATMs → writes CSVs

If you ever need to regenerate the synthetic data from the source:
```bash
cd ~/projects/cash-optimization-engine
python data/generate_dataset.py
```

But normally you don't need to — the CSVs are already generated and ready.

### 4. Update Makefile

```makefile
seed:
	cd backend && python seed_data.py

reseed:
	cd backend && rm -f cash_engine.db && python seed_data.py

regenerate:
	python data/generate_dataset.py
	cd backend && rm -f cash_engine.db && python seed_data.py
```

### 5. Add validation endpoint

```python
# backend/app/api/dashboard.py

@router.get("/api/validation")
def validate_data(db: Session = Depends(get_db)):
    """
    Cross-checks DB totals against real UBL GL actuals.
    Returns discrepancies if any.
    """
    import json, os
    actuals_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'synthetic', 'ubl_actuals.json')
    with open(actuals_path) as f:
        actuals = json.load(f)
    
    branches = db.query(Branch).all()
    atms = db.query(ATM).all()
    
    return {
        "status": "ok",
        "all_amounts_in": "PKR Millions",
        "checks": {
            "branches_count": {"actual": 1527, "db": len(branches)},
            "atms_count": {"actual": 2180, "db": len(atms)},
            "total_deposits": {
                "actual_gl": round(actuals['deposits_total'], 0),
                "db": round(sum(b.total_deposits for b in branches), 0),
                "match": abs(sum(b.total_deposits for b in branches) - actuals['deposits_total']) < 1
            },
            "total_atm_cash": {
                "actual_gl": round(actuals['cash_atm_total'], 1),
                "db": round(sum(a.current_cash_m for a in atms), 1),
                "match": abs(sum(a.current_cash_m for a in atms) - actuals['cash_atm_total']) < 1
            },
            "total_idle_cash_branches": round(sum(b.idle_cash for b in branches), 1),
            "total_idle_cash_atms": round(sum(a.idle_cash_m for a in atms), 1),
            "annual_savings_at_11pct": round(sum(b.annual_savings_potential for b in branches), 1),
        },
        "source": "data/source/demo.xlsx (UBL GL Data, Jan 2016)"
    }
```

### 6. Verify the chain works

After setup, run:
```bash
cd ~/projects/cash-optimization-engine

# Seed DB from existing CSVs
make seed

# Start backend
make backend

# Test validation
curl -s localhost:8000/api/validation | python -m json.tool

# Expected output:
# {
#   "status": "ok",
#   "all_amounts_in": "PKR Millions",
#   "checks": {
#     "branches_count": {"actual": 1527, "db": 1527},
#     "atms_count": {"actual": 2180, "db": 2180},
#     "total_deposits": {"actual_gl": 851038, "db": 851038, "match": true},
#     "total_atm_cash": {"actual_gl": 1393.2, "db": 1393.2, "match": true},
#     ...
#   }
# }
```

### COMPLETE DATA CHAIN SUMMARY

```
data/source/demo.xlsx          ← Real UBL GL data (the original, never modified)
        │
        ▼
data/generate_dataset.py       ← Reads demo.xlsx, extracts actuals, distributes to branches
        │
        ▼
data/synthetic/                ← CSVs anchored to real amounts
  ├── branches.csv (1,527)          deposits sum = 851,038 M ✓
  ├── atms.csv (2,180)              ATM cash sum = 1,393 M ✓
  ├── vault_history.csv (73,000)    LSTM training data
  ├── nostro_accounts.csv (35)      nostro sum = 4,005 M ✓
  ├── crr_positions.csv (90)        CRR on 851B deposit base
  └── ubl_actuals.json              extracted GL totals for validation
        │
        ▼
backend/seed_data.py           ← Loads CSVs into SQLite (NOT generates)
        │
        ▼
cash_engine.db                 ← SQLite database (tables match CSV columns exactly)
        │
        ▼
FastAPI endpoints              ← Query DB, run optimization, return JSON
        │
        ▼
React frontend                 ← Displays data, charts, AI panel

Everything traces back to demo.xlsx. If you update demo.xlsx, run:
  python data/generate_dataset.py && make reseed
```

DO NOT create any random data generators. DO NOT hardcode amounts. 
All data flows from demo.xlsx → CSVs → DB → API → UI.
The CSVs already exist and are ready to seed.
```
