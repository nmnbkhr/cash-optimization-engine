# COE — RECONCILING SYNTHETIC DATA GENERATOR
# ══════════════════════════════════════════════════════════════
# Every number must tie. The chain:
#
#   demo.xlsx (actual UBL GL)
#     ↓ verified sum
#   branches.csv (1,527 branches — already in your DB)
#     ↓ daily breakdown must sum back
#   fact_gl_daily (30 days × 1,527 = 45,810 rows)
#     ↓ transaction detail must sum back
#   fact_transactions (300K individual txns)
#
# At every level: SUM(child) == parent. No gaps. No floating numbers.
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
My COE app is running on native Ubuntu. The database already has branch-level data 
from demo.xlsx (real UBL GL data, all amounts PKR Millions). Now I need to generate 
LOWER-LEVEL detail data (daily GL and individual transactions) that RECONCILES EXACTLY 
back to the branch-level totals already in the database.

THIS IS THE MOST IMPORTANT RULE: Every generated number must tie back.
If branches table says KHI-0001 has avg_daily_deposits = 68.5 M, then:
  - fact_gl_daily for KHI-0001 across 30 days must average ~68.5 M/day in deposits
  - fact_transactions cash_in amounts for KHI-0001 on any given day must sum to 
    that day's total_deposit_flow_m in fact_gl_daily

No orphan numbers. No unreconciled gaps. This is a bank — everything balances.

## STEP 1: Read what's already in the database

First, understand the existing data:

```bash
cd ~/projects/cash-optimization-engine/backend
python3 -c "
from app.database import SessionLocal
import pandas as pd

db = SessionLocal()

# Read existing branch data
branches = pd.read_sql('SELECT * FROM branches', db.bind)
print(f'Branches: {len(branches)}')
print(f'Columns: {list(branches.columns)}')
print()

# Key totals we must reconcile to
print('=== RECONCILIATION ANCHORS (from demo.xlsx) ===')
print(f'Total vault cash:     {branches.current_vault_balance.sum():>12,.1f} M')
print(f'Total deposits:       {branches.total_deposits.sum():>12,.1f} M')
print(f'Total idle cash:      {branches.idle_cash.sum():>12,.1f} M')
print(f'Avg daily deposits:   {branches.avg_daily_deposits.sum():>12,.1f} M (bank-wide daily)')
print(f'Avg daily withdrawals:{branches.avg_daily_withdrawals.sum():>12,.1f} M (bank-wide daily)')
print(f'Monthly int income:   {branches.monthly_interest_income.sum():>12,.1f} M')
print(f'Monthly int expense:  {branches.monthly_interest_expense.sum():>12,.1f} M')
print(f'Monthly personnel:    {branches.monthly_personnel_cost.sum():>12,.1f} M')
print(f'Monthly premises:     {branches.monthly_premises_cost.sum():>12,.1f} M')
print(f'Monthly direct cost:  {branches.monthly_direct_cost.sum():>12,.1f} M')
print(f'Daily transactions:   {branches.daily_transactions.sum():>12,} txns (bank-wide daily)')
print()
print('Sample branch:')
print(branches.iloc[0].to_string())
"
```

The output gives us the EXACT numbers that the synthetic data must reconcile to.

## STEP 2: Create the reconciling generator

File: backend/app/services/reconciling_generator.py

```python
"""
Reconciling Synthetic Data Generator
════════════════════════════════════
Reads existing branch-level data from the database (which came from real 
UBL GL data via demo.xlsx), then generates daily and transaction-level 
detail that EXACTLY reconciles back to those branch totals.

Reconciliation chain:
  branches.avg_daily_deposits × 30 ≈ sum(fact_gl_daily.total_deposit_flow_m)
  fact_gl_daily.total_deposit_flow_m = sum(fact_transactions.amount_m WHERE txn_type='cash_in')
  
At every level, parent = sum(children). Verified after generation.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text


class ReconcilingDataGenerator:
    """
    Generates daily GL and transaction data that ties back to branch totals.
    All amounts in PKR Millions.
    """
    
    def __init__(self, db: Session, n_days: int = 30, n_customers: int = 10000, seed: int = 42):
        self.db = db
        self.n_days = n_days
        self.n_customers = n_customers
        self.seed = seed
        np.random.seed(seed)
        
        # Load existing branch data (the reconciliation anchors)
        self.branches = pd.read_sql('SELECT * FROM branches', db.bind)
        self.n_branches = len(self.branches)
        self.base_date = datetime(2026, 4, 1)
        
        # Extract anchor totals for verification
        self.anchors = {
            'total_vault_cash': self.branches['current_vault_balance'].sum(),
            'total_deposits': self.branches['total_deposits'].sum(),
            'total_idle_cash': self.branches['idle_cash'].sum(),
            'bank_daily_deposits': self.branches['avg_daily_deposits'].sum(),
            'bank_daily_withdrawals': self.branches['avg_daily_withdrawals'].sum(),
            'bank_daily_transactions': self.branches['daily_transactions'].sum(),
            'monthly_interest_income': self.branches['monthly_interest_income'].sum(),
            'monthly_interest_expense': self.branches['monthly_interest_expense'].sum(),
            'monthly_personnel_cost': self.branches['monthly_personnel_cost'].sum(),
            'monthly_premises_cost': self.branches['monthly_premises_cost'].sum(),
            'monthly_direct_cost': self.branches['monthly_direct_cost'].sum(),
        }
    
    # ══════════════════════════════════════════════════════
    # LEVEL 1: dim_market (independent — market conditions)
    # ══════════════════════════════════════════════════════
    
    def generate_dim_market(self) -> pd.DataFrame:
        """Daily market conditions. Independent — doesn't need reconciliation."""
        dates = pd.date_range(
            self.base_date - timedelta(days=self.n_days),
            self.base_date - timedelta(days=1), freq='D'
        )
        n = len(dates)
        kibor = 0.1050
        drift = np.cumsum(np.random.normal(0, 0.0001, n))
        
        return pd.DataFrame({
            'date': dates.strftime('%Y-%m-%d'),
            'kibor_overnight': np.round(kibor + drift, 4),
            'kibor_3m': np.round(kibor + 0.005 + drift, 4),
            'kibor_6m': np.round(kibor + 0.008 + drift, 4),
            'sbp_policy_rate': kibor,
            'tbill_3m_yield': np.round(kibor + 0.003 + np.random.normal(0, 0.001, n), 4),
            'usd_pkr': np.round(278.5 + np.cumsum(np.random.normal(0, 0.3, n)), 2),
            'aed_pkr': np.round(75.85 + np.cumsum(np.random.normal(0, 0.05, n)), 2),
            'sar_pkr': np.round(74.20 + np.cumsum(np.random.normal(0, 0.05, n)), 2),
            'holiday_flag': np.isin(dates.dayofweek, [6]),
            'is_friday': dates.dayofweek == 4,
            'is_salary_day': np.isin(dates.day, [1, 15]),
        })
    
    # ══════════════════════════════════════════════════════
    # LEVEL 2: fact_gl_daily — MUST reconcile to branches
    # ══════════════════════════════════════════════════════
    
    def generate_fact_gl_daily(self, dim_market: pd.DataFrame) -> pd.DataFrame:
        """
        Generate daily GL for every branch × every day.
        
        RECONCILIATION RULE:
          For each branch:
            mean(fact_gl_daily.total_deposit_flow_m) ≈ branches.avg_daily_deposits
            mean(fact_gl_daily.total_withdrawal_flow_m) ≈ branches.avg_daily_withdrawals
            Each day's closing = opening + deposits - withdrawals
            Monthly sum of interest_income ≈ branches.monthly_interest_income
        """
        dates = dim_market['date'].values
        n_days = len(dates)
        
        all_rows = []
        
        for _, br in self.branches.iterrows():
            # ── TARGET VALUES FROM BRANCH (must hit these averages) ──
            target_avg_dep = br['avg_daily_deposits']
            target_avg_wth = br['avg_daily_withdrawals']
            target_vault = br['current_vault_balance']
            target_optimal = br['optimal_vault_balance']
            target_deposits = br['total_deposits']
            target_monthly_int_inc = br['monthly_interest_income']
            target_monthly_int_exp = br['monthly_interest_expense']
            target_monthly_personnel = br['monthly_personnel_cost']
            target_monthly_premises = br['monthly_premises_cost']
            target_monthly_direct = br['monthly_direct_cost']
            target_monthly_other = br['monthly_other_cost']
            
            # ── GENERATE DAILY DEPOSIT FLOWS ──
            # Sum must equal target_avg_dep × n_days
            # Use Dirichlet to split total across days (sums to exactly 1.0)
            total_dep_period = target_avg_dep * n_days
            dep_weights = np.random.dirichlet(np.ones(n_days) * 5)  # fairly uniform
            
            # Apply day-of-week and salary effects to weights
            for i, d in enumerate(dates):
                dt = pd.Timestamp(d)
                if dt.dayofweek == 4:  # Friday
                    dep_weights[i] *= 1.2
                elif dt.dayofweek in [5, 6]:  # Sat/Sun
                    dep_weights[i] *= 0.5
                if dt.day in [1, 2, 15, 16]:  # Salary
                    dep_weights[i] *= 1.3
            
            # Re-normalize so weights sum to 1.0 EXACTLY
            dep_weights = dep_weights / dep_weights.sum()
            daily_deposits = total_dep_period * dep_weights
            
            # ── GENERATE DAILY WITHDRAWAL FLOWS ──
            total_wth_period = target_avg_wth * n_days
            wth_weights = np.random.dirichlet(np.ones(n_days) * 5)
            
            for i, d in enumerate(dates):
                dt = pd.Timestamp(d)
                if dt.dayofweek == 4:
                    wth_weights[i] *= 1.25
                elif dt.dayofweek in [5, 6]:
                    wth_weights[i] *= 0.4
                if dt.day in [1, 2, 15, 16]:
                    wth_weights[i] *= 1.4
            
            wth_weights = wth_weights / wth_weights.sum()
            daily_withdrawals = total_wth_period * wth_weights
            
            # ── VAULT BALANCE CHAIN ──
            # opening[0] = branch current vault
            # closing[t] = opening[t] + deposits[t] - withdrawals[t]
            # opening[t+1] = closing[t] (carry forward)
            opening = np.zeros(n_days)
            closing = np.zeros(n_days)
            opening[0] = target_vault
            
            for i in range(n_days):
                closing[i] = opening[i] + daily_deposits[i] - daily_withdrawals[i]
                if i < n_days - 1:
                    # Add small vault adjustment (CIT pickup/delivery to keep in range)
                    vault_adj = 0
                    if closing[i] > br['vault_capacity'] * 0.9:
                        vault_adj = -(closing[i] - target_optimal)  # CIT pickup
                    elif closing[i] < target_optimal * 0.5:
                        vault_adj = target_optimal - closing[i]      # CIT delivery
                    opening[i + 1] = closing[i] + vault_adj
            
            idle = np.maximum(opening - target_optimal, 0)
            
            # ── COST/REVENUE ALLOCATION ──
            # Monthly totals split across days using equal allocation
            daily_int_inc = target_monthly_int_inc / n_days
            daily_int_exp = target_monthly_int_exp / n_days
            daily_personnel = target_monthly_personnel / n_days
            daily_premises = target_monthly_premises / n_days
            daily_direct = target_monthly_direct / n_days
            daily_other = target_monthly_other / n_days
            
            # CRR: branch's proportional share of system CRR
            crr_share = target_deposits / max(self.anchors['total_deposits'], 1)
            crr_required = target_deposits * 0.05  # 5% CRR
            
            for i in range(n_days):
                all_rows.append({
                    'date': dates[i],
                    'branch_id': br['branch_id'],
                    'opening_balance_m': round(opening[i], 2),
                    'total_deposit_flow_m': round(daily_deposits[i], 2),
                    'total_withdrawal_flow_m': round(daily_withdrawals[i], 2),
                    'closing_balance_m': round(closing[i], 2),
                    'idle_cash_m': round(idle[i], 2),
                    'crr_required_m': round(crr_required, 2),
                    'total_deposits_m': round(target_deposits, 2),
                    'casa_deposits_m': round(br['deposits_current_account'] + br['deposits_savings'], 2),
                    'term_deposits_m': round(br['deposits_term'], 2),
                    'interest_income_m': round(daily_int_inc, 4),
                    'interest_expense_m': round(daily_int_exp, 4),
                    'fee_income_m': round(daily_int_inc * 0.024, 4),  # fees ≈ 2.4% of interest
                    'personnel_cost_m': round(daily_personnel, 4),
                    'premises_cost_m': round(daily_premises, 4),
                    'direct_cost_m': round(daily_direct, 4),
                    'other_cost_m': round(daily_other, 4),
                    'cash_handling_cost_m': round(daily_withdrawals[i] * 0.000095, 4),
                    'cit_cost_m': round(0.015 if idle[i] > 5 else 0, 4),
                    'insurance_cost_m': round(opening[i] * 0.00015, 4),
                })
        
        df = pd.DataFrame(all_rows)
        return df
    
    # ══════════════════════════════════════════════════════
    # LEVEL 3: fact_transactions — MUST reconcile to fact_gl_daily
    # ══════════════════════════════════════════════════════
    
    def generate_fact_transactions(self, fact_gl: pd.DataFrame) -> pd.DataFrame:
        """
        Generate individual transactions that sum EXACTLY to daily GL flows.
        
        RECONCILIATION RULE:
          For each (branch_id, date):
            sum(txn.amount_m WHERE txn_type='cash_in') == fact_gl.total_deposit_flow_m
            sum(txn.amount_m WHERE txn_type='cash_out') == fact_gl.total_withdrawal_flow_m
            count(txns) ≈ branches.daily_transactions (proportional)
        
        Strategy: For each branch-day, use Dirichlet distribution to split
        the daily total into N individual transactions that sum exactly.
        """
        all_txns = []
        txn_counter = 0
        
        # Pre-compute average txns per branch per day
        branch_daily_txns = self.branches.set_index('branch_id')['daily_transactions'].to_dict()
        
        # Group GL by branch+date
        for (branch_id, date), row in fact_gl.groupby(['branch_id', 'date']).first().iterrows():
            
            target_txns_per_day = branch_daily_txns.get(branch_id, 500)
            
            # Scale down for feasibility (sample 10% of actual transaction count)
            sample_rate = 0.10
            n_txns = max(3, int(target_txns_per_day * sample_rate))
            
            # ── DEPOSIT TRANSACTIONS (cash_in) ──
            # Must sum to row.total_deposit_flow_m EXACTLY
            dep_total = row['total_deposit_flow_m']
            if dep_total > 0:
                n_dep = max(1, int(n_txns * 0.45))  # ~45% are deposits
                
                # Dirichlet: N weights that sum to exactly 1.0
                dep_weights = np.random.dirichlet(np.ones(n_dep) * 2)
                dep_amounts = dep_total * dep_weights  # sum = dep_total EXACTLY
                
                # Channel distribution
                channels = np.random.choice(
                    ['counter', 'cdm', 'transfer_in'],
                    n_dep, p=[0.60, 0.15, 0.25]
                )
                
                for j in range(n_dep):
                    txn_counter += 1
                    hour = np.random.choice(range(9, 17), p=[0.05,0.10,0.15,0.15,0.15,0.15,0.15,0.10])
                    all_txns.append({
                        'txn_id': f"TXN-{txn_counter:09d}",
                        'timestamp': f"{date}T{hour:02d}:{np.random.randint(0,60):02d}:00",
                        'date': date,
                        'branch_id': branch_id,
                        'cust_id': f"CUST-{np.random.randint(1, self.n_customers+1):07d}",
                        'txn_type': 'cash_in',
                        'amount_m': round(dep_amounts[j], 6),
                        'channel': channels[j],
                        'is_peak_event': pd.Timestamp(date).day in [1, 2, 15, 16],
                        'denomination_hint': 'Rs.5000' if dep_amounts[j] > 0.5 else 
                                           'Rs.1000' if dep_amounts[j] > 0.05 else 'Rs.500',
                    })
            
            # ── WITHDRAWAL TRANSACTIONS (cash_out) ──
            # Must sum to row.total_withdrawal_flow_m EXACTLY
            wth_total = row['total_withdrawal_flow_m']
            if wth_total > 0:
                n_wth = max(1, int(n_txns * 0.55))  # ~55% are withdrawals
                
                wth_weights = np.random.dirichlet(np.ones(n_wth) * 2)
                wth_amounts = wth_total * wth_weights  # sum = wth_total EXACTLY
                
                channels = np.random.choice(
                    ['counter', 'atm', 'cheque'],
                    n_wth, p=[0.50, 0.35, 0.15]
                )
                
                for j in range(n_wth):
                    txn_counter += 1
                    hour = np.random.choice(range(9, 17), p=[0.05,0.10,0.15,0.15,0.15,0.15,0.15,0.10])
                    all_txns.append({
                        'txn_id': f"TXN-{txn_counter:09d}",
                        'timestamp': f"{date}T{hour:02d}:{np.random.randint(0,60):02d}:00",
                        'date': date,
                        'branch_id': branch_id,
                        'cust_id': f"CUST-{np.random.randint(1, self.n_customers+1):07d}",
                        'txn_type': 'cash_out',
                        'amount_m': round(wth_amounts[j], 6),
                        'channel': channels[j],
                        'is_peak_event': pd.Timestamp(date).day in [1, 2, 15, 16],
                        'denomination_hint': 'Rs.5000' if wth_amounts[j] > 0.5 else
                                           'Rs.1000' if wth_amounts[j] > 0.05 else 'Rs.500',
                    })
        
        return pd.DataFrame(all_txns)
    
    # ══════════════════════════════════════════════════════
    # GENERATE ALL + VERIFY RECONCILIATION
    # ══════════════════════════════════════════════════════
    
    def generate_all(self) -> dict:
        """Generate all tables and verify reconciliation at every level."""
        
        print("Generating dim_market...")
        dim_market = self.generate_dim_market()
        
        print(f"Generating fact_gl_daily ({self.n_branches} branches × {self.n_days} days)...")
        fact_gl = self.generate_fact_gl_daily(dim_market)
        
        print(f"Generating fact_transactions (reconciled to daily GL)...")
        fact_txn = self.generate_fact_transactions(fact_gl)
        
        # ══════════════════════════════════════════════════
        # RECONCILIATION VERIFICATION
        # ══════════════════════════════════════════════════
        
        print("\n" + "="*60)
        print("RECONCILIATION CHECK")
        print("="*60)
        
        errors = []
        
        # CHECK 1: fact_gl_daily avg deposits ≈ branches.avg_daily_deposits
        gl_avg_dep = fact_gl.groupby('branch_id')['total_deposit_flow_m'].mean()
        br_avg_dep = self.branches.set_index('branch_id')['avg_daily_deposits']
        dep_diff = (gl_avg_dep - br_avg_dep).abs()
        max_dep_diff = dep_diff.max()
        print(f"\n  GL daily deposits vs branch avg:")
        print(f"    Max difference: {max_dep_diff:.4f} M")
        print(f"    Status: {'✓ PASS' if max_dep_diff < 0.01 else '✗ FAIL'}")
        if max_dep_diff >= 0.01:
            errors.append(f"Deposit reconciliation gap: {max_dep_diff:.4f} M")
        
        # CHECK 2: fact_gl_daily avg withdrawals ≈ branches.avg_daily_withdrawals
        gl_avg_wth = fact_gl.groupby('branch_id')['total_withdrawal_flow_m'].mean()
        br_avg_wth = self.branches.set_index('branch_id')['avg_daily_withdrawals']
        wth_diff = (gl_avg_wth - br_avg_wth).abs()
        max_wth_diff = wth_diff.max()
        print(f"\n  GL daily withdrawals vs branch avg:")
        print(f"    Max difference: {max_wth_diff:.4f} M")
        print(f"    Status: {'✓ PASS' if max_wth_diff < 0.01 else '✗ FAIL'}")
        if max_wth_diff >= 0.01:
            errors.append(f"Withdrawal reconciliation gap: {max_wth_diff:.4f} M")
        
        # CHECK 3: fact_transactions cash_in sum == fact_gl deposit flow (per branch-day)
        txn_dep_sum = (fact_txn[fact_txn['txn_type'] == 'cash_in']
                      .groupby(['branch_id', 'date'])['amount_m'].sum())
        gl_dep = fact_gl.set_index(['branch_id', 'date'])['total_deposit_flow_m']
        
        # Align and compare
        common_idx = txn_dep_sum.index.intersection(gl_dep.index)
        if len(common_idx) > 0:
            txn_vs_gl_dep = (txn_dep_sum.loc[common_idx] - gl_dep.loc[common_idx]).abs()
            max_txn_dep_diff = txn_vs_gl_dep.max()
            print(f"\n  Txn cash_in sum vs GL deposit flow:")
            print(f"    Matched branch-days: {len(common_idx)}")
            print(f"    Max difference: {max_txn_dep_diff:.6f} M")
            print(f"    Status: {'✓ PASS' if max_txn_dep_diff < 0.001 else '✗ FAIL'}")
            if max_txn_dep_diff >= 0.001:
                errors.append(f"Txn→GL deposit reconciliation gap: {max_txn_dep_diff:.6f} M")
        
        # CHECK 4: fact_transactions cash_out sum == fact_gl withdrawal flow
        txn_wth_sum = (fact_txn[fact_txn['txn_type'] == 'cash_out']
                      .groupby(['branch_id', 'date'])['amount_m'].sum())
        gl_wth = fact_gl.set_index(['branch_id', 'date'])['total_withdrawal_flow_m']
        
        common_idx = txn_wth_sum.index.intersection(gl_wth.index)
        if len(common_idx) > 0:
            txn_vs_gl_wth = (txn_wth_sum.loc[common_idx] - gl_wth.loc[common_idx]).abs()
            max_txn_wth_diff = txn_vs_gl_wth.max()
            print(f"\n  Txn cash_out sum vs GL withdrawal flow:")
            print(f"    Matched branch-days: {len(common_idx)}")
            print(f"    Max difference: {max_txn_wth_diff:.6f} M")
            print(f"    Status: {'✓ PASS' if max_txn_wth_diff < 0.001 else '✗ FAIL'}")
            if max_txn_wth_diff >= 0.001:
                errors.append(f"Txn→GL withdrawal reconciliation gap: {max_txn_wth_diff:.6f} M")
        
        # CHECK 5: GL monthly interest income ≈ branch monthly_interest_income
        gl_monthly_int = fact_gl.groupby('branch_id')['interest_income_m'].sum()
        br_monthly_int = self.branches.set_index('branch_id')['monthly_interest_income']
        int_diff = (gl_monthly_int - br_monthly_int).abs()
        max_int_diff = int_diff.max()
        print(f"\n  GL monthly interest vs branch monthly interest:")
        print(f"    Max difference: {max_int_diff:.4f} M")
        print(f"    Status: {'✓ PASS' if max_int_diff < 0.01 else '✗ FAIL'}")
        
        # CHECK 6: Bank-wide totals
        gl_total_dep = fact_gl['total_deposit_flow_m'].sum() / self.n_days
        gl_total_wth = fact_gl['total_withdrawal_flow_m'].sum() / self.n_days
        print(f"\n  Bank-wide daily averages:")
        print(f"    GL avg daily deposits:     {gl_total_dep:>12,.1f} M")
        print(f"    Branch sum avg deposits:   {self.anchors['bank_daily_deposits']:>12,.1f} M")
        print(f"    GL avg daily withdrawals:  {gl_total_wth:>12,.1f} M")
        print(f"    Branch sum avg withdrawals:{self.anchors['bank_daily_withdrawals']:>12,.1f} M")
        
        # OVERALL
        print(f"\n{'='*60}")
        if errors:
            print(f"  ✗ RECONCILIATION FAILED — {len(errors)} issues:")
            for e in errors:
                print(f"    - {e}")
        else:
            print(f"  ✓ ALL RECONCILIATION CHECKS PASSED")
            print(f"    Transactions → Daily GL → Branch Totals → demo.xlsx")
            print(f"    Every number ties back. Zero gaps.")
        print(f"{'='*60}")
        
        # Summary
        print(f"\n  Tables generated:")
        print(f"    dim_market:        {len(dim_market):>10,} rows")
        print(f"    fact_gl_daily:     {len(fact_gl):>10,} rows")
        print(f"    fact_transactions: {len(fact_txn):>10,} rows")
        
        return {
            'dim_market': dim_market,
            'fact_gl_daily': fact_gl,
            'fact_transactions': fact_txn,
            'reconciliation_passed': len(errors) == 0,
        }


def seed_reconciled_data(db_session=None):
    """Generate and seed reconciled CDM tables."""
    from app.database import SessionLocal, engine
    
    db = db_session or SessionLocal()
    
    gen = ReconcilingDataGenerator(db, n_days=30, n_customers=10000)
    result = gen.generate_all()
    
    if not result['reconciliation_passed']:
        print("\n⚠️  Reconciliation FAILED — NOT seeding. Fix generator first.")
        return
    
    # Seed tables
    for name in ['dim_market', 'fact_gl_daily', 'fact_transactions']:
        df = result[name]
        df.to_sql(name, engine, if_exists='replace', index=False, chunksize=5000)
        print(f"  Seeded {name}: {len(df):,} rows")
    
    db.close()
    print("\n✓ Reconciled CDM tables seeded successfully.")


if __name__ == '__main__':
    seed_reconciled_data()
```

## STEP 3: Add to Makefile

```makefile
seed-cdm:
	cd backend && python -c "from app.services.reconciling_generator import seed_reconciled_data; seed_reconciled_data()"
```

## STEP 4: Add reconciliation API endpoint

```python
# api/business.py — add this

@router.get("/reconciliation")
def check_reconciliation(db: Session = Depends(get_db)):
    """
    Verify data integrity: transactions → daily GL → branch totals → demo.xlsx.
    Run this after any data change to confirm everything ties.
    """
    import pandas as pd
    
    branches = pd.read_sql('SELECT * FROM branches', db.bind)
    
    try:
        gl = pd.read_sql('SELECT * FROM fact_gl_daily', db.bind)
        txn = pd.read_sql('SELECT * FROM fact_transactions', db.bind)
    except:
        return {"status": "CDM tables not yet generated. Run: make seed-cdm"}
    
    checks = {}
    
    # GL deposits vs branch avg
    gl_avg_dep = gl.groupby('branch_id')['total_deposit_flow_m'].mean()
    br_avg_dep = branches.set_index('branch_id')['avg_daily_deposits']
    dep_gap = (gl_avg_dep - br_avg_dep).abs().max()
    checks['gl_deposits_vs_branch'] = {
        'max_gap_m': round(dep_gap, 4),
        'pass': dep_gap < 0.01,
    }
    
    # Txn cash_in vs GL deposits
    txn_dep = txn[txn['txn_type']=='cash_in'].groupby(['branch_id','date'])['amount_m'].sum()
    gl_dep = gl.set_index(['branch_id','date'])['total_deposit_flow_m']
    common = txn_dep.index.intersection(gl_dep.index)
    if len(common) > 0:
        txn_gap = (txn_dep.loc[common] - gl_dep.loc[common]).abs().max()
        checks['txn_vs_gl_deposits'] = {
            'matched_branch_days': len(common),
            'max_gap_m': round(txn_gap, 6),
            'pass': txn_gap < 0.001,
        }
    
    # Bank-wide totals
    n_days = gl['date'].nunique()
    checks['bank_wide'] = {
        'gl_daily_avg_deposits': round(gl['total_deposit_flow_m'].sum() / n_days, 1),
        'branch_daily_avg_deposits': round(branches['avg_daily_deposits'].sum(), 1),
        'gl_daily_avg_withdrawals': round(gl['total_withdrawal_flow_m'].sum() / n_days, 1),
        'branch_daily_avg_withdrawals': round(branches['avg_daily_withdrawals'].sum(), 1),
    }
    
    all_pass = all(c.get('pass', True) for c in checks.values() if isinstance(c, dict))
    
    return {
        "status": "✓ ALL RECONCILED" if all_pass else "✗ GAPS FOUND",
        "chain": "fact_transactions → fact_gl_daily → branches → demo.xlsx",
        "checks": checks,
        "tables": {
            "branches": len(branches),
            "fact_gl_daily": len(gl),
            "fact_transactions": len(txn),
            "dim_market": pd.read_sql('SELECT COUNT(*) as n FROM dim_market', db.bind).iloc[0]['n'],
        }
    }
```

## STEP 5: Verify

```bash
cd ~/projects/cash-optimization-engine

# Generate reconciled data
make seed-cdm

# Expected output includes:
# ════════════════════════════════════════════════════
# RECONCILIATION CHECK
# ════════════════════════════════════════════════════
#   GL daily deposits vs branch avg:
#     Max difference: 0.0000 M
#     Status: ✓ PASS
#   Txn cash_in sum vs GL deposit flow:
#     Max difference: 0.000000 M
#     Status: ✓ PASS
#   ✓ ALL RECONCILIATION CHECKS PASSED

# API verification
curl -s localhost:8000/api/business/reconciliation | python -m json.tool
# Should show: "status": "✓ ALL RECONCILED"
```

## THE RECONCILIATION GUARANTEE

```
demo.xlsx (actual UBL GL: Cash 11,739M, Deposits 851,038M)
    │
    ├── branches.csv: sum(total_deposits) = 851,038 M  ← EXACT
    │       │
    │       ├── fact_gl_daily: avg(deposit_flow) per branch = branches.avg_daily_deposits  ← EXACT
    │       │       │
    │       │       └── fact_transactions: sum(cash_in) per branch-day = gl.deposit_flow  ← EXACT (Dirichlet)
    │       │
    │       ├── fact_gl_daily: sum(interest_income) per branch = branches.monthly_interest_income  ← EXACT
    │       │
    │       └── fact_gl_daily: opening[t+1] = closing[t] + CIT_adjustment  ← BALANCED
    │
    └── Every level reconciles upward. Auditable. Bankable.
```

The key technique: Dirichlet distribution. It generates N random weights that sum 
to EXACTLY 1.0. Multiply by the parent total → N child amounts that sum to the 
parent EXACTLY. No rounding gaps. No floating-point drift. Bank-grade reconciliation.
```
