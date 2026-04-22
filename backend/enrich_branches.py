"""
Enrich existing branches with:
1. Financial columns derived from demo.xlsx bank-wide totals
2. Real UBL branch coordinates

Run: cd backend && conda run -n coe python enrich_branches.py
"""

import sqlite3
import math
import sys
sys.path.insert(0, '.')

from app.core.ubl_branch_geo import get_coordinates_for_city

# ══════════════════════════════════════════════════════
# REAL UBL GL TOTALS FROM demo.xlsx (PKR Millions, Jan 2016)
# ══════════════════════════════════════════════════════

BANK_TOTALS = {
    "total_deposits": 851_038.0,        # Total customer deposits
    "monthly_interest_income": 7_197.6,  # Gross revenue (proxy)
    "monthly_interest_expense": 3_500.0, # Estimated ~49% of revenue
    "monthly_personnel_cost": 903.5,
    "monthly_premises_cost": 328.1,
    "monthly_direct_cost": 70.5,
    "monthly_other_cost": 698.7,
}

# CASA split ratios (typical Pakistani bank)
CASA_CURRENT_PCT = 0.55
CASA_SAVINGS_PCT = 0.25
TERM_PCT = 0.20


def enrich():
    con = sqlite3.connect('cash_engine.db')
    con.row_factory = sqlite3.Row

    # Check if columns already exist
    cols = [r[1] for r in con.execute("PRAGMA table_info(branches)").fetchall()]
    new_cols = [
        ("total_deposits", "REAL DEFAULT 0"),
        ("deposits_current_account", "REAL DEFAULT 0"),
        ("deposits_savings", "REAL DEFAULT 0"),
        ("deposits_term", "REAL DEFAULT 0"),
        ("monthly_interest_income", "REAL DEFAULT 0"),
        ("monthly_interest_expense", "REAL DEFAULT 0"),
        ("monthly_personnel_cost", "REAL DEFAULT 0"),
        ("monthly_premises_cost", "REAL DEFAULT 0"),
        ("monthly_direct_cost", "REAL DEFAULT 0"),
        ("monthly_other_cost", "REAL DEFAULT 0"),
    ]

    for col_name, col_type in new_cols:
        if col_name not in cols:
            con.execute(f"ALTER TABLE branches ADD COLUMN {col_name} {col_type}")
            print(f"  Added column: {col_name}")

    con.commit()

    # ── Load all branches ──
    branches = con.execute(
        "SELECT id, branch_id, city, avg_daily_deposits, daily_transactions FROM branches"
    ).fetchall()

    n = len(branches)
    print(f"\nEnriching {n} branches...")

    # ── Compute allocation weights ──
    total_daily_dep = sum(r["avg_daily_deposits"] for r in branches)
    total_daily_txn = sum(r["daily_transactions"] for r in branches)

    # Track city branch counters for geocoding
    city_counters = {}

    for br in branches:
        bid = br["branch_id"]
        daily_dep = br["avg_daily_deposits"]
        daily_txn = br["daily_transactions"]
        city = br["city"]

        # Allocation weights
        dep_weight = daily_dep / total_daily_dep if total_daily_dep > 0 else 1 / n
        txn_weight = daily_txn / total_daily_txn if total_daily_txn > 0 else 1 / n

        # Financial columns (allocated from bank-wide, stored in raw PKR to match existing data)
        total_dep = BANK_TOTALS["total_deposits"] * dep_weight * 1e6  # PKR M -> raw PKR
        int_inc = BANK_TOTALS["monthly_interest_income"] * dep_weight * 1e6
        int_exp = BANK_TOTALS["monthly_interest_expense"] * dep_weight * 1e6
        personnel = BANK_TOTALS["monthly_personnel_cost"] * txn_weight * 1e6
        premises = BANK_TOTALS["monthly_premises_cost"] * txn_weight * 1e6
        direct = BANK_TOTALS["monthly_direct_cost"] * txn_weight * 1e6
        other = BANK_TOTALS["monthly_other_cost"] * txn_weight * 1e6

        # Real coordinates
        idx = city_counters.get(city, 0)
        city_counters[city] = idx + 1
        lat, lng = get_coordinates_for_city(city, idx)

        con.execute("""
            UPDATE branches SET
                total_deposits = ?,
                deposits_current_account = ?,
                deposits_savings = ?,
                deposits_term = ?,
                monthly_interest_income = ?,
                monthly_interest_expense = ?,
                monthly_personnel_cost = ?,
                monthly_premises_cost = ?,
                monthly_direct_cost = ?,
                monthly_other_cost = ?,
                latitude = ?,
                longitude = ?
            WHERE id = ?
        """, (
            total_dep,
            total_dep * CASA_CURRENT_PCT,
            total_dep * CASA_SAVINGS_PCT,
            total_dep * TERM_PCT,
            int_inc,
            int_exp,
            personnel,
            premises,
            direct,
            other,
            lat,
            lng,
            br["id"],
        ))

    con.commit()

    # ── Verify reconciliation ──
    print("\n=== RECONCILIATION CHECK ===")
    row = con.execute("""
        SELECT
            SUM(total_deposits) as td,
            SUM(monthly_interest_income) as ii,
            SUM(monthly_personnel_cost) as pc,
            SUM(monthly_premises_cost) as prem,
            SUM(monthly_direct_cost) as dc,
            SUM(monthly_other_cost) as oc
        FROM branches
    """).fetchone()

    checks = [
        ("Total Deposits", row["td"] / 1e6, BANK_TOTALS["total_deposits"]),
        ("Monthly Int Income", row["ii"] / 1e6, BANK_TOTALS["monthly_interest_income"]),
        ("Monthly Personnel", row["pc"] / 1e6, BANK_TOTALS["monthly_personnel_cost"]),
        ("Monthly Premises", row["prem"] / 1e6, BANK_TOTALS["monthly_premises_cost"]),
        ("Monthly Direct", row["dc"] / 1e6, BANK_TOTALS["monthly_direct_cost"]),
        ("Monthly Other", row["oc"] / 1e6, BANK_TOTALS["monthly_other_cost"]),
    ]

    all_pass = True
    for label, actual, expected in checks:
        diff = abs(actual - expected)
        ok = diff < 0.1
        if not ok:
            all_pass = False
        print(f"  {label:25s}  actual={actual:>12,.1f}  expected={expected:>12,.1f}  {'PASS' if ok else 'FAIL'}")

    if all_pass:
        print("\n  ALL RECONCILED — SUM(branches) == demo.xlsx totals")
    else:
        print("\n  RECONCILIATION GAPS FOUND")

    # Check coordinates
    sample = con.execute(
        "SELECT branch_id, city, latitude, longitude FROM branches WHERE city='Karachi' LIMIT 3"
    ).fetchall()
    print("\n=== SAMPLE COORDINATES ===")
    for r in sample:
        print(f"  {r['branch_id']} ({r['city']}): {r['latitude']:.4f}, {r['longitude']:.4f}")

    con.close()
    print(f"\nDone. {n} branches enriched.")


if __name__ == "__main__":
    enrich()
