"""
Reads new demo CSVs from data/synthetic/, transforms column names/types
to match existing DB schema, backs up current data, then reseeds.
Existing UC service/API/frontend code remains unchanged.

Usage:
    python migrate_demo_data.py              # Migrate to UBL demo data
    python migrate_demo_data.py --restore    # Restore initial synthetic data
    python migrate_demo_data.py --dry-run    # Show mapping only, no changes
"""
import sys
import os
import shutil
import datetime
import random
import json

sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
import numpy as np
from sqlalchemy import text, inspect

from app.database import SessionLocal, engine, Base
# Import all models so Base.metadata knows about all tables
import app.models  # noqa: F401


PROJECT_ROOT = os.path.join(os.path.dirname(__file__), '..')
DEMO_DIR = os.path.join(PROJECT_ROOT, 'data', 'synthetic')
BACKUP_DIR = os.path.join(PROJECT_ROOT, 'data', 'initial')
DB_PATH = os.path.join(os.path.dirname(__file__), 'cash_engine.db')


# ═══════════════════════════════════════════════════════════════════
# STEP 1: Load and transform new CSVs to match existing DB schema
# ═══════════════════════════════════════════════════════════════════

def load_and_transform():
    """Load new CSVs and transform columns to match existing DB schema."""

    print("=" * 60)
    print("COLUMN MAPPING (New CSV → Existing DB)")
    print("=" * 60)

    # ── BRANCHES ──
    print("\n── BRANCHES ──")
    branches = pd.read_csv(os.path.join(DEMO_DIR, 'branches.csv'))

    # Rename columns
    branches = branches.rename(columns={
        'lat': 'latitude',
        'lng': 'longitude',
    })

    # Generate missing columns
    fake_names = [
        "Ahmed Khan", "Sara Ali", "Usman Malik", "Fatima Hussain", "Hassan Raza",
        "Ayesha Siddiqui", "Bilal Ahmad", "Nadia Shah", "Imran Qureshi", "Zainab Farooq",
        "Tariq Mehmood", "Sana Iqbal", "Waqas Javed", "Hina Butt", "Faisal Akhtar",
        "Rabia Nawaz", "Kamran Yousuf", "Amina Riaz", "Shahid Bashir", "Mariam Aslam",
    ]
    branches['manager_name'] = [random.choice(fake_names) for _ in range(len(branches))]
    branches['feeding_branch_id'] = None
    branches['created_at'] = datetime.datetime.utcnow().isoformat()

    # Map branch_type values to enum NAMES (SQLAlchemy stores enum names, not values)
    branch_type_to_enum_name = {
        'Cash-Surplus': 'CASH_SURPLUS',
        'Cash-Deficit': 'DEFICIT',
        'Deficit': 'DEFICIT',
        'Balanced': 'BALANCED',
        'Seasonal': 'SEASONAL',
        'Hub': 'HUB',
    }
    branches['branch_type'] = branches['branch_type'].map(branch_type_to_enum_name).fillna('BALANCED')

    valid_names = {"CASH_SURPLUS", "DEFICIT", "BALANCED", "SEASONAL", "HUB"}
    actual_types = set(branches['branch_type'].unique())
    print(f"  branch_type values (enum names): {actual_types}")
    if not actual_types.issubset(valid_names):
        bad = actual_types - valid_names
        print(f"  WARNING: Invalid values: {bad} → mapping to 'BALANCED'")
        branches.loc[~branches['branch_type'].isin(valid_names), 'branch_type'] = 'BALANCED'

    # Keep only columns that match the DB schema
    branch_db_cols = [
        'branch_id', 'name', 'city', 'region', 'branch_type', 'vault_capacity',
        'avg_daily_deposits', 'avg_daily_withdrawals', 'current_vault_balance',
        'optimal_vault_balance', 'idle_cash', 'cash_efficiency_score',
        'daily_transactions', 'latitude', 'longitude', 'manager_name',
        'is_cpc', 'feeding_branch_id', 'created_at'
    ]
    extra_branch_cols = [c for c in branches.columns if c not in branch_db_cols and c != 'id']
    print(f"  Renamed: lat→latitude, lng→longitude")
    print(f"  Generated: manager_name, feeding_branch_id, created_at")
    print(f"  Extra cols (dropped): {extra_branch_cols}")

    # Save extra columns for potential use by services
    branches_extra = branches[['branch_id'] + [c for c in extra_branch_cols if c in branches.columns]].copy()
    branches = branches[[c for c in branch_db_cols if c in branches.columns]]

    print(f"  Final columns: {list(branches.columns)}")
    print(f"  Rows: {len(branches)}")

    # ── ATMs ──
    print("\n── ATMs ──")
    atms = pd.read_csv(os.path.join(DEMO_DIR, 'atms.csv'))

    atms = atms.rename(columns={
        'atm_type': 'location_type',
        'lat': 'latitude',
        'lng': 'longitude',
        'cassette_capacity_m': 'total_capacity',
        'avg_daily_dispense_m': 'avg_daily_dispense',
    })

    # Compute last_loaded from days_since_last_load
    if 'days_since_last_load' in atms.columns:
        today = datetime.date.today()
        atms['last_loaded'] = atms['days_since_last_load'].apply(
            lambda d: (today - datetime.timedelta(days=int(d))).isoformat() if pd.notna(d) else None
        )
    else:
        atms['last_loaded'] = None

    atms['status'] = 'active'
    atms['created_at'] = datetime.datetime.utcnow().isoformat()

    atm_db_cols = [
        'atm_id', 'branch_id', 'location_type', 'city', 'latitude', 'longitude',
        'total_capacity', 'avg_daily_dispense', 'last_loaded', 'uptime_pct',
        'status', 'created_at'
    ]
    extra_atm_cols = [c for c in atms.columns if c not in atm_db_cols and c != 'id']
    print(f"  Renamed: atm_type→location_type, lat→latitude, lng→longitude")
    print(f"  Renamed: cassette_capacity_m→total_capacity, avg_daily_dispense_m→avg_daily_dispense")
    print(f"  Computed: last_loaded (from days_since_last_load)")
    print(f"  Generated: status='active', created_at")
    print(f"  Extra cols (dropped): {extra_atm_cols}")

    # Save ATM extra data for cassette generation
    atms_extra = atms[['atm_id'] + [c for c in ['denomination_slots', 'denom_5000_pct',
                        'denom_1000_pct', 'denom_500_pct', 'denom_100_pct',
                        'current_cash_m', 'optimal_cash_m', 'idle_cash_m'] if c in atms.columns]].copy()
    atms = atms[[c for c in atm_db_cols if c in atms.columns]]

    print(f"  Final columns: {list(atms.columns)}")
    print(f"  Rows: {len(atms)}")

    # ── VAULT POSITIONS ──
    print("\n── VAULT POSITIONS ──")
    vault = pd.read_csv(os.path.join(DEMO_DIR, 'vault_history.csv'))

    # Compute missing columns
    vault['net_flow'] = vault['deposits'] - vault['withdrawals']
    vault['vault_utilization'] = np.where(
        vault['closing_balance'] > 0,
        (vault['closing_balance'] / vault['closing_balance'].quantile(0.95)).clip(0, 1),
        0
    )
    vault['created_at'] = datetime.datetime.utcnow().isoformat()

    vault_db_cols = [
        'branch_id', 'date', 'opening_balance', 'closing_balance',
        'deposits', 'withdrawals', 'net_flow', 'vault_utilization', 'created_at'
    ]
    extra_vault_cols = [c for c in vault.columns if c not in vault_db_cols and c != 'id']
    print(f"  Computed: net_flow (deposits - withdrawals)")
    print(f"  Computed: vault_utilization (closing_balance / p95)")
    print(f"  Extra cols (dropped): {extra_vault_cols}")
    vault = vault[[c for c in vault_db_cols if c in vault.columns]]

    print(f"  Final columns: {list(vault.columns)}")
    print(f"  Rows: {len(vault)}")

    # ── NOSTRO ACCOUNTS ──
    print("\n── NOSTRO ACCOUNTS ──")
    nostro = pd.read_csv(os.path.join(DEMO_DIR, 'nostro_accounts.csv'))

    nostro = nostro.rename(columns={
        'correspondent_bank': 'bank_name',
        'balance_pkr_m': 'balance',
        'minimum_required_m': 'required_minimum',
        'idle_balance_m': 'excess_balance',
        'overnight_rate_pct': 'overnight_rate',
    })

    # Generate account numbers from nostro_id
    if 'nostro_id' in nostro.columns:
        nostro['account_number'] = nostro['nostro_id']
    else:
        nostro['account_number'] = [f"NOSTRO-{i:03d}" for i in range(len(nostro))]

    nostro['last_updated'] = datetime.datetime.utcnow().isoformat()
    nostro['created_at'] = datetime.datetime.utcnow().isoformat()

    nostro_db_cols = [
        'bank_name', 'currency', 'country', 'balance', 'required_minimum',
        'excess_balance', 'overnight_rate', 'last_updated', 'account_number', 'created_at'
    ]
    extra_nostro_cols = [c for c in nostro.columns if c not in nostro_db_cols and c != 'id']
    print(f"  Renamed: correspondent_bank→bank_name, balance_pkr_m→balance")
    print(f"  Renamed: minimum_required_m→required_minimum, idle_balance_m→excess_balance")
    print(f"  Renamed: overnight_rate_pct→overnight_rate")
    print(f"  Generated: account_number (from nostro_id), last_updated, created_at")
    print(f"  Extra cols (dropped): {extra_nostro_cols}")
    nostro = nostro[[c for c in nostro_db_cols if c in nostro.columns]]

    print(f"  Final columns: {list(nostro.columns)}")
    print(f"  Rows: {len(nostro)}")

    # ── CRR POSITIONS ──
    print("\n── CRR POSITIONS ──")
    crr = pd.read_csv(os.path.join(DEMO_DIR, 'crr_positions.csv'))

    crr = crr.rename(columns={
        'deposit_base_m': 'deposit_base',
        'required_daily_min_m': 'required_crr',
        'crr_deposit_m': 'actual_crr',
        'crr_pct': 'crr_ratio',
        'excess_over_min_m': 'excess_crr',
        'freed_liquidity_m': 'freed_liquidity',
    })

    # Compute missing columns
    crr['overnight_deployment'] = crr['freed_liquidity'] * crr.get('overnight_repo_rate', 0.17)
    if 'overnight_repo_rate' in crr.columns:
        crr['overnight_deployment'] = crr['freed_liquidity'] * crr['overnight_repo_rate']
    crr['income_earned'] = crr['overnight_deployment'] / 365  # daily income approx

    # Compute week_number from date
    crr['date'] = pd.to_datetime(crr['date'])
    crr['week_number'] = crr['date'].dt.isocalendar().week.astype(int)

    # is_compliant: actual_crr >= required_crr
    crr['is_compliant'] = (crr['actual_crr'] >= crr['required_crr']).astype(int)
    crr['created_at'] = datetime.datetime.utcnow().isoformat()

    crr_db_cols = [
        'date', 'deposit_base', 'required_crr', 'actual_crr', 'crr_ratio',
        'excess_crr', 'freed_liquidity', 'overnight_deployment', 'income_earned',
        'week_number', 'is_compliant', 'created_at'
    ]
    extra_crr_cols = [c for c in crr.columns if c not in crr_db_cols and c != 'id']
    print(f"  Renamed: deposit_base_m→deposit_base, required_daily_min_m→required_crr")
    print(f"  Renamed: crr_deposit_m→actual_crr, crr_pct→crr_ratio")
    print(f"  Renamed: excess_over_min_m→excess_crr, freed_liquidity_m→freed_liquidity")
    print(f"  Computed: overnight_deployment, income_earned, week_number, is_compliant")
    print(f"  Extra cols (dropped): {extra_crr_cols}")
    crr = crr[[c for c in crr_db_cols if c in crr.columns]]

    print(f"  Final columns: {list(crr.columns)}")
    print(f"  Rows: {len(crr)}")

    return branches, atms, vault, nostro, crr, atms_extra


# ═══════════════════════════════════════════════════════════════════
# STEP 2: Generate dependent tables (not in new CSVs)
# ═══════════════════════════════════════════════════════════════════

def generate_atm_cassettes(atm_id_map, atms_extra):
    """Generate ATM cassettes from ATM denomination data."""
    print("\n── Generating ATM Cassettes ──")
    rows = []
    denoms = [5000, 1000, 500, 100]
    denom_pct_cols = {
        5000: 'denom_5000_pct',
        1000: 'denom_1000_pct',
        500: 'denom_500_pct',
        100: 'denom_100_pct',
    }

    for _, atm_row in atms_extra.iterrows():
        atm_str_id = atm_row['atm_id']
        if atm_str_id not in atm_id_map:
            continue
        db_atm_id = atm_id_map[atm_str_id]
        total_cash = atm_row.get('current_cash_m', 5.0)

        for denom in denoms:
            pct_col = denom_pct_cols.get(denom)
            pct = atm_row.get(pct_col, 0.25) if pct_col and pct_col in atm_row.index else 0.25
            if pd.isna(pct):
                pct = 0.25
            value = total_cash * pct
            capacity = value * 1.5
            rows.append({
                'atm_id': db_atm_id,
                'denomination': denom,
                'capacity': round(capacity, 2),
                'current_level': round(value, 2),
                'reorder_point': round(capacity * 0.2, 2),
                'order_up_to': round(capacity * 0.8, 2),
            })

    df = pd.DataFrame(rows)
    print(f"  Generated {len(df)} cassette records for {len(atm_id_map)} ATMs")
    return df


def generate_cit_trips(branch_ids, num_trips=1260):
    """Generate CIT trip data."""
    print("\n── Generating CIT Trips ──")
    rows = []
    vehicles = [f"CIT-{i:03d}" for i in range(1, 51)]
    base_date = datetime.date(2024, 1, 1)

    for i in range(num_trips):
        trip_date = base_date + datetime.timedelta(days=i % 365)
        num_stops = random.randint(3, 8)
        route_branches = random.sample(branch_ids, min(num_stops, len(branch_ids)))
        rows.append({
            'trip_id': f"TRIP-{i+1:05d}",
            'date': trip_date.isoformat(),
            'vehicle_id': random.choice(vehicles),
            'route': json.dumps(route_branches),
            'total_distance_km': round(random.uniform(20, 200), 1),
            'total_value_carried': round(random.uniform(10, 500), 1),
            'cost': round(random.uniform(5, 50), 1),
            'duration_hours': round(random.uniform(2, 8), 1),
            'num_stops': num_stops,
            'status': random.choice(['planned', 'completed', 'completed', 'completed']),
            'created_at': datetime.datetime.utcnow().isoformat(),
        })

    df = pd.DataFrame(rows)
    print(f"  Generated {len(df)} CIT trips")
    return df


def generate_denomination_inventory(branch_id_map):
    """Generate denomination inventory for branches."""
    print("\n── Generating Denomination Inventory ──")
    rows = []
    denoms = [5000, 1000, 500, 100, 50, 20, 10]
    dates = pd.date_range('2024-06-01', periods=2, freq='D')

    # Sample ~1500 branches, 7 denoms, 2 dates ≈ 21,000 rows
    for branch_str_id, db_id in branch_id_map.items():
        for date in dates:
            for denom in denoms:
                qty = random.randint(100, 10000)
                rows.append({
                    'branch_id': db_id,
                    'date': date.date().isoformat(),
                    'denomination': denom,
                    'quantity': qty,
                    'value': round(qty * denom / 1e6, 2),  # in millions
                    'is_fit': random.random() > 0.15,
                    'is_soiled': random.random() < 0.15,
                    'created_at': datetime.datetime.utcnow().isoformat(),
                })

    df = pd.DataFrame(rows)
    print(f"  Generated {len(df)} denomination inventory records")
    return df


def generate_vostro_accounts():
    """Generate vostro account data."""
    print("\n── Generating Vostro Accounts ──")
    banks = [
        ("Standard Chartered", "USD", "UK"), ("HSBC", "GBP", "UK"),
        ("Citibank", "USD", "USA"), ("Deutsche Bank", "EUR", "Germany"),
        ("Bank of China", "CNY", "China"), ("Mashreq Bank", "AED", "UAE"),
        ("National Bank of Oman", "OMR", "Oman"), ("Bank Alfalah", "PKR", "Pakistan"),
        ("Habib Bank AG Zurich", "CHF", "Switzerland"), ("Faysal Bank", "PKR", "Pakistan"),
        ("MCB Bank", "PKR", "Pakistan"), ("Allied Bank", "PKR", "Pakistan"),
        ("Askari Bank", "PKR", "Pakistan"), ("Bank of Punjab", "PKR", "Pakistan"),
        ("Meezan Bank", "PKR", "Pakistan"), ("JS Bank", "PKR", "Pakistan"),
        ("Soneri Bank", "PKR", "Pakistan"), ("Summit Bank", "PKR", "Pakistan"),
        ("Silk Bank", "PKR", "Pakistan"), ("Bank Al Habib", "PKR", "Pakistan"),
    ]

    rows = []
    for bank_name, currency, country in banks:
        balance = round(random.uniform(50, 2000), 1)
        avg_bal = round(balance * random.uniform(0.8, 1.2), 1)
        vol = round(random.uniform(0.05, 0.3), 3)
        stable = round(balance * (1 - vol), 1)
        deploy = round(stable * random.uniform(0.3, 0.7), 1)
        rows.append({
            'bank_name': bank_name,
            'currency': currency,
            'country': country,
            'balance': balance,
            'average_balance_30d': avg_bal,
            'volatility': vol,
            'stable_portion': stable,
            'deployable_amount': deploy,
            'current_deployment': random.choice(['T-Bills', 'Repo', 'None', 'Money Market']),
            'yield_rate': round(random.uniform(0.10, 0.22), 4),
            'last_updated': datetime.datetime.utcnow().isoformat(),
            'created_at': datetime.datetime.utcnow().isoformat(),
        })

    df = pd.DataFrame(rows)
    print(f"  Generated {len(df)} vostro accounts")
    return df


# ═══════════════════════════════════════════════════════════════════
# STEP 3: Migrate — backup, drop, reseed
# ═══════════════════════════════════════════════════════════════════

def migrate(branches, atms, vault, nostro, crr, atms_extra):
    """Backup current DB, then seed with new demo data."""

    # ═══ BACKUP (already done separately, but double-check) ═══
    if not os.path.exists(os.path.join(BACKUP_DIR, 'cash_engine_initial.db')):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR, 'cash_engine_initial.db'))
            print(f"Backed up DB → {BACKUP_DIR}/cash_engine_initial.db")

    # ═══ DROP & RECREATE ALL TABLES ═══
    print("\n" + "=" * 60)
    print("SEEDING DATABASE WITH DEMO DATA")
    print("=" * 60)

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Dropped and recreated all tables.")

    # ═══ SEED BRANCHES (first — others have FKs to branches.id) ═══
    branches.to_sql('branches', engine, if_exists='append', index=False)
    print(f"\nSeeded {len(branches)} branches")

    # Build branch_id (string) → id (integer) mapping
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, branch_id FROM branches"))
        branch_id_map = {row[1]: row[0] for row in result}
    print(f"  Branch ID mapping built: {len(branch_id_map)} entries")

    # ═══ SEED ATMs (replace string branch_id with integer FK) ═══
    atms['branch_id'] = atms['branch_id'].map(branch_id_map)
    unmapped_atms = atms['branch_id'].isna().sum()
    if unmapped_atms > 0:
        print(f"  WARNING: {unmapped_atms} ATMs have unmapped branch_ids — dropping them")
        atms = atms.dropna(subset=['branch_id'])
    atms['branch_id'] = atms['branch_id'].astype(int)
    atms.to_sql('atms', engine, if_exists='append', index=False)
    print(f"Seeded {len(atms)} ATMs")

    # Build atm_id (string) → id (integer) mapping
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, atm_id FROM atms"))
        atm_id_map = {row[1]: row[0] for row in result}

    # ═══ SEED VAULT POSITIONS (replace string branch_id with integer FK) ═══
    vault['branch_id'] = vault['branch_id'].map(branch_id_map)
    unmapped_vault = vault['branch_id'].isna().sum()
    if unmapped_vault > 0:
        print(f"  WARNING: {unmapped_vault} vault rows have unmapped branch_ids — dropping them")
        vault = vault.dropna(subset=['branch_id'])
    vault['branch_id'] = vault['branch_id'].astype(int)
    vault.to_sql('vault_positions', engine, if_exists='append', index=False, chunksize=5000)
    print(f"Seeded {len(vault)} vault positions")

    # ═══ SEED NOSTRO ═══
    nostro.to_sql('nostro_accounts', engine, if_exists='append', index=False)
    print(f"Seeded {len(nostro)} nostro accounts")

    # ═══ SEED CRR ═══
    crr.to_sql('crr_positions', engine, if_exists='append', index=False)
    print(f"Seeded {len(crr)} CRR positions")

    # ═══ SEED DEPENDENT TABLES ═══
    cassettes = generate_atm_cassettes(atm_id_map, atms_extra)
    cassettes.to_sql('atm_cassettes', engine, if_exists='append', index=False, chunksize=5000)
    print(f"Seeded {len(cassettes)} ATM cassettes")

    cit_trips = generate_cit_trips(list(branch_id_map.keys()))
    cit_trips.to_sql('cit_trips', engine, if_exists='append', index=False, chunksize=5000)
    print(f"Seeded {len(cit_trips)} CIT trips")

    denom_inv = generate_denomination_inventory(branch_id_map)
    denom_inv.to_sql('denomination_inventory', engine, if_exists='append', index=False, chunksize=5000)
    print(f"Seeded {len(denom_inv)} denomination inventory records")

    vostro = generate_vostro_accounts()
    vostro.to_sql('vostro_accounts', engine, if_exists='append', index=False)
    print(f"Seeded {len(vostro)} vostro accounts")

    # ═══ VERIFY ═══
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    with engine.connect() as conn:
        insp = inspect(engine)
        for table in insp.get_table_names():
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(f"  {table}: {count:,} rows")

        total_dep = conn.execute(text("SELECT SUM(avg_daily_deposits) FROM branches")).scalar()
        total_idle = conn.execute(text("SELECT SUM(idle_cash) FROM branches")).scalar()
        avg_ces = conn.execute(text("SELECT AVG(cash_efficiency_score) FROM branches")).scalar()

        print(f"\n  Total avg_daily_deposits: {total_dep:,.0f} M")
        print(f"  Total idle cash:          {total_idle:,.0f} M")
        print(f"  Avg CES:                  {avg_ces:.1%}")

    print("\nMigration complete! All 10 UCs should work with new UBL-anchored data.")
    print(f"To restore: python migrate_demo_data.py --restore")


# ═══════════════════════════════════════════════════════════════════
# RESTORE: Switch back to initial data
# ═══════════════════════════════════════════════════════════════════

def restore_initial():
    """Restore initial synthetic data from backup."""
    backup_db = os.path.join(BACKUP_DIR, 'cash_engine_initial.db')

    if os.path.exists(backup_db):
        shutil.copy2(backup_db, DB_PATH)
        print(f"Restored initial DB from: {backup_db}")
        print("Restart the backend to pick up the restored data.")
        return

    # Fallback: reseed from CSV backups
    print("No DB backup found. Reseeding from CSV backups...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    for csv_file in sorted(os.listdir(BACKUP_DIR)):
        if csv_file.endswith('.csv'):
            table_name = csv_file.replace('.csv', '')
            df = pd.read_csv(os.path.join(BACKUP_DIR, csv_file))
            df.to_sql(table_name, engine, if_exists='append', index=False, chunksize=5000)
            print(f"  Restored {table_name}: {len(df):,} rows")

    print("\nRestored to initial synthetic data.")


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    if '--restore' in sys.argv:
        restore_initial()
    elif '--dry-run' in sys.argv:
        load_and_transform()
        print("\n[DRY RUN] No database changes made.")
    else:
        branches, atms, vault, nostro, crr, atms_extra = load_and_transform()
        migrate(branches, atms, vault, nostro, crr, atms_extra)
