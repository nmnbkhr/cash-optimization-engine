"""
Synthetic data generator for UBL Cash Optimization Engine.

Generates realistic banking data for 1,547 branches and 2,180 ATMs
across Pakistan with 365 days of historical vault positions, CRR data,
Nostro/Vostro accounts, and denomination inventories.
"""
import datetime
import random
from typing import Dict, List, Any

import numpy as np

from app.database import SessionLocal, engine, Base
from app.models import (
    Branch, VaultPosition, Transaction, ATM, ATMCassette,
    CITTrip, CRRPosition, NostroAccount, VostroAccount,
    DenominationInventory,
)
from app.models.branch import BranchType
from app.core.constants import (
    CITY_DISTRIBUTION, CITY_REGIONS, BRANCH_TYPES, BRANCH_TYPE_DISTRIBUTION,
    DENOMINATIONS, UBL_TOTAL_BRANCHES, UBL_TOTAL_ATMS,
    UBL_DEPOSIT_BASE_TRILLIONS, CRR_WEEKLY_AVG, CRR_DAILY_MIN,
    OVERNIGHT_REPO_RATE, ATM_CASSETTES,
)

# Reproducibility
np.random.seed(42)
random.seed(42)

# --------------------------------------------------------------------------- #
#  Reference data
# --------------------------------------------------------------------------- #

PAKISTANI_FIRST_NAMES = [
    "Ahmed", "Ali", "Asad", "Bilal", "Danish", "Fahad", "Faisal", "Hamza",
    "Hassan", "Imran", "Junaid", "Kamran", "Kashif", "Khalid", "Mansoor",
    "Noman", "Omar", "Qasim", "Rashid", "Saad", "Shahid", "Tariq", "Usman",
    "Waqas", "Yasir", "Zubair", "Amir", "Babar", "Ehsan", "Farhan",
    "Aisha", "Fatima", "Hira", "Kiran", "Mariam", "Nadia", "Rabia",
    "Saba", "Saima", "Samina", "Sana", "Sara", "Sidra", "Uzma", "Zara",
]

PAKISTANI_LAST_NAMES = [
    "Khan", "Ahmed", "Ali", "Sheikh", "Malik", "Iqbal", "Hussain", "Akhtar",
    "Butt", "Chaudhry", "Qureshi", "Raza", "Siddiqui", "Javed", "Aslam",
    "Mirza", "Gill", "Bhatti", "Mughal", "Hashmi", "Durrani", "Afridi",
    "Shah", "Baig", "Ansari", "Niazi", "Khattak", "Yousuf", "Rehman",
]

# Approximate city centre coordinates
CITY_COORDINATES: Dict[str, tuple] = {
    "Karachi": (24.8607, 67.0011), "Lahore": (31.5204, 74.3587),
    "Islamabad": (33.6844, 73.0479), "Rawalpindi": (33.5651, 73.0169),
    "Faisalabad": (31.4504, 73.1350), "Multan": (30.1575, 71.5249),
    "Peshawar": (34.0151, 71.5249), "Hyderabad": (25.3960, 68.3578),
    "Quetta": (30.1798, 66.9750), "Sialkot": (32.4945, 74.5229),
    "Gujranwala": (32.1877, 74.1945), "Bahawalpur": (29.3544, 71.6911),
    "Sukkur": (27.7052, 68.8574), "Abbottabad": (34.1688, 73.2215),
    "Mardan": (34.1986, 72.0404), "Sahiwal": (30.6682, 73.1114),
    "Larkana": (27.5570, 68.2141), "Sheikhupura": (31.7167, 73.9850),
    "Jhang": (31.2681, 72.3181), "Rahim Yar Khan": (28.4202, 70.2952),
    "Gujrat": (32.5742, 74.0789), "Kasur": (31.1186, 74.4634),
    "Sargodha": (32.0836, 72.6711), "Okara": (30.8138, 73.4534),
    "Mingora": (34.7717, 72.3602), "Dera Ghazi Khan": (30.0489, 70.6455),
    "Nawabshah": (26.2442, 68.4100), "Mirpur Khas": (25.5276, 69.0159),
    "Chiniot": (31.7167, 72.9789), "Kamoke": (31.9787, 74.2239),
    "Sadiqabad": (28.3091, 70.1327), "Burewala": (30.1500, 72.1500),
    "Jacobabad": (28.2769, 68.4514), "Muzaffargarh": (30.0729, 71.1932),
    "Muridke": (31.8020, 74.2550), "Jhelum": (32.9425, 73.7257),
    "Khanewal": (30.3018, 71.9321), "Hafizabad": (32.0710, 73.6880),
    "Kohat": (33.5886, 71.4429), "Khairpur": (27.5295, 68.7592),
    "Daska": (32.3322, 74.3500), "Hub": (25.0500, 66.8900),
    "Chaman": (30.9210, 66.4597), "Nowshera": (34.0153, 71.9747),
    "Taxila": (33.7690, 72.8376), "Swabi": (34.1200, 72.4700),
    "Bannu": (32.9897, 70.5986), "Dera Ismail Khan": (31.8314, 70.9019),
    "Chakwal": (32.9328, 72.8630), "Toba Tek Singh": (30.9709, 72.4826),
    "Vehari": (30.0452, 72.3489), "Attock": (33.7660, 72.3609),
    "Bhakkar": (31.6082, 71.0648), "Layyah": (30.9693, 70.9428),
    "Lodhran": (29.5343, 71.6338), "Mandi Bahauddin": (32.5861, 73.4917),
    "Narowal": (32.1020, 74.8730), "Pakpattan": (30.3500, 73.3900),
    "Rajanpur": (29.1044, 70.3301), "Hangu": (33.5312, 71.0595),
    "Tank": (32.2226, 70.3826), "Zhob": (31.3517, 69.4494),
}

# Branch-type-specific parameters: (vault_cap_range_M, avg_dep_range_M, avg_wdl_range_M, daily_txn_range)
BRANCH_TYPE_PARAMS = {
    "Hub":          ((500, 1000), (80, 200),  (60, 150),  (2000, 5000)),
    "Cash-Surplus": ((100, 300),  (30, 80),   (15, 40),   (500, 2000)),
    "Deficit":      ((50, 150),   (10, 30),   (25, 60),   (300, 1000)),
    "Balanced":     ((80, 200),   (20, 50),   (18, 45),   (400, 1200)),
    "Seasonal":     ((60, 180),   (15, 45),   (12, 35),   (200, 800)),
}

BRANCH_TYPE_ENUM_MAP = {
    "Cash-Surplus": BranchType.CASH_SURPLUS,
    "Deficit": BranchType.DEFICIT,
    "Balanced": BranchType.BALANCED,
    "Seasonal": BranchType.SEASONAL,
    "Hub": BranchType.HUB,
}

# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

def _random_name() -> str:
    return f"{random.choice(PAKISTANI_FIRST_NAMES)} {random.choice(PAKISTANI_LAST_NAMES)}"


def _city_code(city: str) -> str:
    return city[:3].upper()


def _jitter_coords(lat: float, lng: float) -> tuple:
    """Add small random offset to keep branches spread within city."""
    return (
        lat + np.random.uniform(-0.05, 0.05),
        lng + np.random.uniform(-0.05, 0.05),
    )


def _millions(val: float) -> float:
    """Convert from conceptual millions to raw PKR."""
    return val * 1_000_000


def _bulk_insert(db, objects: list, chunk_size: int = 5000):
    """Insert a list of ORM objects in chunks for performance."""
    for i in range(0, len(objects), chunk_size):
        db.bulk_save_objects(objects[i : i + chunk_size])
        db.flush()


# --------------------------------------------------------------------------- #
#  Generators
# --------------------------------------------------------------------------- #

def generate_branches(db) -> List[Branch]:
    """Create 1,547 branches distributed across Pakistani cities."""
    branches: List[Branch] = []
    hub_branches: Dict[str, List[Branch]] = {}  # region -> list of hub branches

    # Build ordered list of (city, count) for deterministic generation
    city_list = list(CITY_DISTRIBUTION.items())

    # Assign branch types using weighted random
    type_names = list(BRANCH_TYPE_DISTRIBUTION.keys())
    type_weights = [BRANCH_TYPE_DISTRIBUTION[t] for t in type_names]

    branch_counter: Dict[str, int] = {}

    for city, count in city_list:
        code = _city_code(city)
        region = CITY_REGIONS.get(city, "Other")
        base_lat, base_lng = CITY_COORDINATES.get(city, (30.0, 70.0))

        for i in range(1, count + 1):
            branch_counter.setdefault(code, 0)
            branch_counter[code] += 1
            num = branch_counter[code]

            btype = np.random.choice(type_names, p=type_weights)
            params = BRANCH_TYPE_PARAMS[btype]

            vault_cap = _millions(np.random.uniform(*params[0]))
            avg_dep = _millions(np.random.uniform(*params[1]))
            avg_wdl = _millions(np.random.uniform(*params[2]))
            daily_txn = int(np.random.uniform(*params[3]))

            current_bal = vault_cap * np.random.uniform(0.40, 0.90)
            optimal_bal = avg_wdl * 3  # 3-day buffer
            idle = max(0.0, current_bal - optimal_bal)
            efficiency = (1.0 - idle / current_bal) if current_bal > 0 else 0.0

            lat, lng = _jitter_coords(base_lat, base_lng)

            is_hub = btype == "Hub"
            branch_id_str = f"{code}-{num:03d}"
            name = f"{city} CPC Hub" if is_hub else f"{city} Branch {num}"

            b = Branch(
                branch_id=branch_id_str,
                name=name,
                city=city,
                region=region,
                branch_type=BRANCH_TYPE_ENUM_MAP[btype],
                vault_capacity=vault_cap,
                avg_daily_deposits=avg_dep,
                avg_daily_withdrawals=avg_wdl,
                current_vault_balance=current_bal,
                optimal_vault_balance=optimal_bal,
                idle_cash=idle,
                cash_efficiency_score=round(efficiency, 4),
                daily_transactions=daily_txn,
                latitude=round(lat, 6),
                longitude=round(lng, 6),
                manager_name=_random_name(),
                is_cpc=is_hub,
                feeding_branch_id=None,  # set after all branches created
            )
            branches.append(b)

            if is_hub:
                hub_branches.setdefault(region, []).append(b)

    # Persist branches so they get IDs (use add_all, not bulk, to keep them in session)
    db.add_all(branches)
    db.commit()

    # Refresh to get generated IDs
    for b in branches:
        db.refresh(b)

    # Assign feeding_branch_id for non-hub branches
    region_hub_map: Dict[str, List[int]] = {}
    for region, hubs in hub_branches.items():
        region_hub_map[region] = [h.id for h in hubs]

    # Fallback: collect all hub IDs
    all_hub_ids = [h.id for hubs in hub_branches.values() for h in hubs]

    for b in branches:
        if not b.is_cpc:
            regional_hubs = region_hub_map.get(b.region, all_hub_ids)
            if regional_hubs:
                b.feeding_branch_id = random.choice(regional_hubs)

    db.commit()
    print(f"  Created {len(branches)} branches")
    return branches


def generate_vault_positions(db, branches: List[Branch]) -> int:
    """Generate 365 days of daily vault positions for every branch."""
    end_date = datetime.date(2025, 3, 12)
    start_date = end_date - datetime.timedelta(days=364)
    total_days = 365

    # Ramadan 2024 approx: Mar 12 - Apr 10; Eid al-Fitr ~Apr 10-12
    # Ramadan 2025 approx: Mar 1 - Mar 30; Eid al-Fitr ~Mar 30-Apr 1
    # Eid al-Adha 2024 approx: Jun 17-19
    ramadan_2024_start = datetime.date(2024, 3, 12)
    ramadan_2024_end = datetime.date(2024, 4, 10)
    eid_fitr_2024 = (datetime.date(2024, 4, 10), datetime.date(2024, 4, 13))
    eid_adha_2024 = (datetime.date(2024, 6, 17), datetime.date(2024, 6, 20))
    ramadan_2025_start = datetime.date(2025, 3, 1)
    ramadan_2025_end = datetime.date(2025, 3, 12)  # up to our end date

    positions = []
    count = 0

    for b in branches:
        vault_cap = b.vault_capacity
        avg_dep = b.avg_daily_deposits
        avg_wdl = b.avg_daily_withdrawals
        is_seasonal = b.branch_type == BranchType.SEASONAL

        # Start with a reasonable opening balance
        balance = vault_cap * np.random.uniform(0.45, 0.70)

        for day_offset in range(total_days):
            current_date = start_date + datetime.timedelta(days=day_offset)
            dow = current_date.weekday()  # 0=Mon, 6=Sun
            dom = current_date.day
            month = current_date.month

            # --- Multipliers ---
            dow_dep_mult = 1.0
            dow_wdl_mult = 1.0

            # Day-of-week effect
            if dow <= 3:  # Mon-Thu: higher activity
                dow_wdl_mult = np.random.uniform(1.0, 1.15)
                dow_dep_mult = np.random.uniform(0.95, 1.10)
            elif dow == 4:  # Fri: reduced
                dow_wdl_mult = np.random.uniform(0.70, 0.85)
                dow_dep_mult = np.random.uniform(0.65, 0.80)
            elif dow == 5:  # Sat: half day
                dow_wdl_mult = np.random.uniform(0.40, 0.60)
                dow_dep_mult = np.random.uniform(0.35, 0.55)
            else:  # Sun: closed/minimal
                dow_wdl_mult = np.random.uniform(0.05, 0.15)
                dow_dep_mult = np.random.uniform(0.05, 0.10)

            # Salary days (1st and 15th)
            salary_mult = 1.0
            if dom in (1, 2, 15, 16):
                salary_mult = np.random.uniform(2.0, 3.0)

            # Ramadan effect
            ramadan_mult = 1.0
            if (ramadan_2024_start <= current_date <= ramadan_2024_end) or \
               (ramadan_2025_start <= current_date <= ramadan_2025_end):
                ramadan_mult = np.random.uniform(1.2, 1.5)

            # Eid spikes
            eid_mult = 1.0
            if (eid_fitr_2024[0] <= current_date <= eid_fitr_2024[1]) or \
               (eid_adha_2024[0] <= current_date <= eid_adha_2024[1]):
                eid_mult = np.random.uniform(3.0, 5.0)

            # Seasonal crop effect (for Seasonal branches)
            crop_mult = 1.0
            if is_seasonal:
                # Rabi: Nov-Apr (harvest payments); Kharif: May-Oct
                if month in (11, 12, 1, 2, 3, 4):
                    crop_mult = np.random.uniform(1.3, 1.8)
                else:
                    crop_mult = np.random.uniform(0.7, 0.9)

            # Combined multipliers
            wdl_mult = dow_wdl_mult * salary_mult * ramadan_mult * eid_mult * crop_mult
            dep_mult = dow_dep_mult * crop_mult

            # Add daily noise (+-15%)
            noise_dep = np.random.uniform(0.85, 1.15)
            noise_wdl = np.random.uniform(0.85, 1.15)

            deposits = avg_dep * dep_mult * noise_dep
            withdrawals = avg_wdl * wdl_mult * noise_wdl

            # Ensure balance stays within realistic bounds
            opening_balance = balance
            closing_balance = opening_balance + deposits - withdrawals

            # Clamp: don't go below 10% capacity or above 95%
            closing_balance = max(vault_cap * 0.10, min(vault_cap * 0.95, closing_balance))

            # Adjust deposits/withdrawals to match clamped closing
            net_flow = closing_balance - opening_balance
            if net_flow >= 0:
                deposits = net_flow + withdrawals  # recompute to keep consistent
            else:
                withdrawals = deposits - net_flow

            utilization = closing_balance / vault_cap if vault_cap > 0 else 0.0

            vp = VaultPosition(
                branch_id=b.id,
                date=current_date,
                opening_balance=round(opening_balance, 2),
                closing_balance=round(closing_balance, 2),
                deposits=round(max(0, deposits), 2),
                withdrawals=round(max(0, withdrawals), 2),
                net_flow=round(net_flow, 2),
                vault_utilization=round(utilization, 4),
            )
            positions.append(vp)
            count += 1
            balance = closing_balance

            # Batch insert to keep memory low
            if len(positions) >= 10000:
                _bulk_insert(db, positions, chunk_size=10000)
                db.commit()
                positions = []

    # Final flush
    if positions:
        _bulk_insert(db, positions, chunk_size=10000)
        db.commit()

    print(f"  Created {count:,} vault position records")
    return count


def generate_atms(db, branches: List[Branch]) -> tuple:
    """Generate 2,180 ATMs distributed proportionally across cities."""
    total_atm_target = UBL_TOTAL_ATMS

    # Count branches per city
    city_branch_count = {}
    city_branches: Dict[str, List[Branch]] = {}
    for b in branches:
        city_branch_count[b.city] = city_branch_count.get(b.city, 0) + 1
        city_branches.setdefault(b.city, []).append(b)

    total_branch_count = sum(city_branch_count.values())

    # Distribute ATMs proportionally to branch count
    atm_per_city: Dict[str, int] = {}
    allocated = 0
    cities_sorted = sorted(city_branch_count.keys())
    for city in cities_sorted:
        share = city_branch_count[city] / total_branch_count
        n = int(round(share * total_atm_target))
        atm_per_city[city] = n
        allocated += n

    # Adjust rounding remainder to largest city
    diff = total_atm_target - allocated
    if diff != 0:
        atm_per_city["Karachi"] += diff

    location_types = ["lobby", "offsite", "mall"]
    location_weights = [0.40, 0.35, 0.25]

    atms = []
    cassettes = []
    atm_counter: Dict[str, int] = {}

    for city in cities_sorted:
        code = _city_code(city)
        n_atms = atm_per_city.get(city, 0)
        city_branch_list = city_branches.get(city, [])
        if not city_branch_list or n_atms == 0:
            continue

        base_lat, base_lng = CITY_COORDINATES.get(city, (30.0, 70.0))

        for _ in range(n_atms):
            atm_counter.setdefault(code, 0)
            atm_counter[code] += 1
            num = atm_counter[code]

            parent_branch = random.choice(city_branch_list)
            loc_type = np.random.choice(location_types, p=location_weights)
            total_cap = _millions(np.random.uniform(5, 15))
            avg_dispense = _millions(np.random.uniform(0.5, 3.0))
            days_ago = np.random.randint(0, 7)
            last_loaded_dt = datetime.datetime(2025, 3, 12) - datetime.timedelta(days=int(days_ago))
            uptime = round(np.random.uniform(92.0, 99.9), 2)
            lat, lng = _jitter_coords(base_lat, base_lng)

            atm = ATM(
                atm_id=f"ATM-{code}-{num:04d}",
                branch_id=parent_branch.id,
                location_type=loc_type,
                city=city,
                latitude=round(lat, 6),
                longitude=round(lng, 6),
                total_capacity=total_cap,
                avg_daily_dispense=avg_dispense,
                last_loaded=last_loaded_dt,
                uptime_pct=uptime,
                status="active",
            )
            atms.append(atm)

    # Persist ATMs to get IDs (use add_all to keep in session)
    db.add_all(atms)
    db.commit()

    for atm in atms:
        db.refresh(atm)

    # Generate cassettes: 4 per ATM
    denom_splits = {5000: 0.40, 1000: 0.30, 500: 0.20, 100: 0.10}

    for atm in atms:
        for denom, fraction in denom_splits.items():
            cap = atm.total_capacity * fraction
            current = cap * np.random.uniform(0.20, 0.90)
            reorder = cap * 0.25
            order_up = cap * 0.85

            cass = ATMCassette(
                atm_id=atm.id,
                denomination=denom,
                capacity=round(cap, 2),
                current_level=round(current, 2),
                reorder_point=round(reorder, 2),
                order_up_to=round(order_up, 2),
            )
            cassettes.append(cass)

    _bulk_insert(db, cassettes, chunk_size=5000)
    db.commit()

    print(f"  Created {len(atms):,} ATMs with {len(cassettes):,} cassettes")
    return len(atms), len(cassettes)


def generate_crr_positions(db) -> int:
    """Generate 365 days of CRR (Cash Reserve Ratio) positions."""
    end_date = datetime.date(2025, 3, 12)
    start_date = end_date - datetime.timedelta(days=364)

    deposit_base = UBL_DEPOSIT_BASE_TRILLIONS * 1e12  # to PKR
    positions = []

    for day_offset in range(365):
        current_date = start_date + datetime.timedelta(days=day_offset)

        # Small daily variation in deposit base (+-0.5%)
        daily_deposit = deposit_base * np.random.uniform(0.995, 1.005)

        required_crr = daily_deposit * CRR_WEEKLY_AVG  # 6%

        # Actual CRR: slightly conservative, usually above required
        # Occasionally dip toward 4% minimum
        if np.random.random() < 0.05:  # 5% chance of near-minimum day
            actual_ratio = np.random.uniform(CRR_DAILY_MIN, CRR_DAILY_MIN + 0.005)
        else:
            actual_ratio = np.random.uniform(0.060, 0.068)

        actual_crr = daily_deposit * actual_ratio
        excess = max(0.0, actual_crr - required_crr)
        freed = excess
        overnight_deploy = freed * np.random.uniform(0.75, 0.85)
        income = overnight_deploy * (OVERNIGHT_REPO_RATE / 365)

        iso_week = current_date.isocalendar()[1]

        crr = CRRPosition(
            date=current_date,
            deposit_base=round(daily_deposit, 2),
            required_crr=round(required_crr, 2),
            actual_crr=round(actual_crr, 2),
            crr_ratio=round(actual_ratio, 6),
            excess_crr=round(excess, 2),
            freed_liquidity=round(freed, 2),
            overnight_deployment=round(overnight_deploy, 2),
            income_earned=round(income, 2),
            week_number=iso_week,
            is_compliant=(actual_ratio >= CRR_DAILY_MIN),
        )
        positions.append(crr)

    _bulk_insert(db, positions)
    db.commit()

    print(f"  Created {len(positions)} CRR position records")
    return len(positions)


def generate_nostro_accounts(db) -> int:
    """Generate 35 correspondent bank (Nostro) accounts across 7 currencies."""
    correspondent_banks = {
        "USD": [
            ("Citibank New York", "United States"),
            ("JPMorgan Chase", "United States"),
            ("Bank of America", "United States"),
            ("Wells Fargo", "United States"),
            ("Standard Chartered NY", "United States"),
        ],
        "EUR": [
            ("Deutsche Bank", "Germany"),
            ("Commerzbank", "Germany"),
            ("BNP Paribas", "France"),
            ("ING Bank", "Netherlands"),
            ("Standard Chartered EU", "United Kingdom"),
        ],
        "GBP": [
            ("HSBC London", "United Kingdom"),
            ("Barclays", "United Kingdom"),
            ("Standard Chartered London", "United Kingdom"),
            ("Lloyds Banking Group", "United Kingdom"),
            ("NatWest", "United Kingdom"),
        ],
        "AED": [
            ("Emirates NBD", "UAE"),
            ("Abu Dhabi Commercial Bank", "UAE"),
            ("Mashreq Bank", "UAE"),
            ("Dubai Islamic Bank", "UAE"),
            ("First Abu Dhabi Bank", "UAE"),
        ],
        "SAR": [
            ("Al Rajhi Bank", "Saudi Arabia"),
            ("Saudi National Bank", "Saudi Arabia"),
            ("Riyad Bank", "Saudi Arabia"),
            ("Banque Saudi Fransi", "Saudi Arabia"),
            ("Alinma Bank", "Saudi Arabia"),
        ],
        "CNY": [
            ("Bank of China", "China"),
            ("ICBC", "China"),
            ("China Construction Bank", "China"),
            ("Agricultural Bank of China", "China"),
            ("Bank of Communications", "China"),
        ],
        "JPY": [
            ("MUFG Bank", "Japan"),
            ("Sumitomo Mitsui", "Japan"),
            ("Mizuho Bank", "Japan"),
            ("Resona Bank", "Japan"),
            ("Shinsei Bank", "Japan"),
        ],
    }

    # Overnight rates by currency
    overnight_rates = {
        "USD": 0.053, "EUR": 0.0375, "GBP": 0.050,
        "AED": 0.052, "SAR": 0.055, "CNY": 0.018, "JPY": 0.001,
    }

    # Balance ranges in millions of respective currency
    balance_ranges = {
        "USD": (5, 80), "EUR": (3, 50), "GBP": (2, 40),
        "AED": (10, 200), "SAR": (8, 150), "CNY": (20, 300), "JPY": (100, 2000),
    }

    accounts = []
    for currency, banks in correspondent_banks.items():
        rate = overnight_rates[currency]
        lo, hi = balance_ranges[currency]

        for bank_name, country in banks:
            balance = np.random.uniform(lo, hi) * 1_000_000
            required_min = balance * np.random.uniform(0.15, 0.30)
            excess = max(0.0, balance - required_min)
            acct_num = f"NOS-{currency}-{np.random.randint(100000, 999999)}"

            acc = NostroAccount(
                bank_name=bank_name,
                currency=currency,
                country=country,
                balance=round(balance, 2),
                required_minimum=round(required_min, 2),
                excess_balance=round(excess, 2),
                overnight_rate=rate,
                last_updated=datetime.datetime(2025, 3, 12),
                account_number=acct_num,
            )
            accounts.append(acc)

    _bulk_insert(db, accounts)
    db.commit()

    print(f"  Created {len(accounts)} Nostro accounts")
    return len(accounts)


def generate_vostro_accounts(db) -> int:
    """Generate 20 respondent bank (Vostro) accounts."""
    respondent_banks = [
        ("Afghan United Bank", "AFN", "Afghanistan"),
        ("Da Afghanistan Bank", "AFN", "Afghanistan"),
        ("National Bank of Tajikistan", "TJS", "Tajikistan"),
        ("Bank of Ceylon", "LKR", "Sri Lanka"),
        ("People's Bank Sri Lanka", "LKR", "Sri Lanka"),
        ("Nepal Rastra Bank", "NPR", "Nepal"),
        ("Himalayan Bank", "NPR", "Nepal"),
        ("Habib Bank AG Zurich", "CHF", "Switzerland"),
        ("Al Baraka Banking Group", "BHD", "Bahrain"),
        ("National Bank of Oman", "OMR", "Oman"),
        ("Bangladesh Bank", "BDT", "Bangladesh"),
        ("Sonali Bank", "BDT", "Bangladesh"),
        ("Maldives Monetary Authority", "MVR", "Maldives"),
        ("Trade Bank of Iraq", "IQD", "Iraq"),
        ("Bank of Khartoum", "SDG", "Sudan"),
        ("Habib Metropolitan Bank (Bahrain)", "BHD", "Bahrain"),
        ("Bank Alfalah (Bahrain)", "BHD", "Bahrain"),
        ("Central Bank of Iran", "IRR", "Iran"),
        ("Azizi Bank", "AFN", "Afghanistan"),
        ("National Bank of Kazakhstan", "KZT", "Kazakhstan"),
    ]

    deployment_options = [
        "T-Bills", "Overnight Repo", "Term Deposit", "Idle", "Money Market",
    ]

    accounts = []
    for bank_name, currency, country in respondent_banks:
        # Balances in PKR (millions range: 50M - 5B)
        avg_balance = np.random.uniform(50, 5000) * 1_000_000
        volatility = np.random.uniform(0.05, 0.20)
        stable = avg_balance * np.random.uniform(0.60, 0.80)
        current_balance = avg_balance * np.random.uniform(0.80, 1.20)
        deployable = max(0.0, current_balance - stable * 0.5)
        deployment = random.choice(deployment_options)
        yield_rate = np.random.uniform(0.08, 0.12)

        acc = VostroAccount(
            bank_name=bank_name,
            currency=currency,
            country=country,
            balance=round(current_balance, 2),
            average_balance_30d=round(avg_balance, 2),
            volatility=round(volatility, 4),
            stable_portion=round(stable, 2),
            deployable_amount=round(deployable, 2),
            current_deployment=deployment,
            yield_rate=round(yield_rate, 4),
            last_updated=datetime.datetime(2025, 3, 12),
        )
        accounts.append(acc)

    _bulk_insert(db, accounts)
    db.commit()

    print(f"  Created {len(accounts)} Vostro accounts")
    return len(accounts)


def generate_denomination_inventory(db, branches: List[Branch]) -> int:
    """Generate current denomination inventory for each branch."""
    # Denomination distribution weights (by value share in typical vault)
    denom_value_weights = {
        5000: 0.35, 1000: 0.30, 500: 0.15,
        100: 0.10, 50: 0.05, 20: 0.03, 10: 0.02,
    }

    today = datetime.date(2025, 3, 12)
    records = []

    for b in branches:
        vault_bal = b.current_vault_balance

        for denom in DENOMINATIONS:
            weight = denom_value_weights[denom]
            # Total value allocated to this denomination
            denom_value = vault_bal * weight * np.random.uniform(0.80, 1.20)
            total_quantity = max(1, int(denom_value / denom))

            # Split into fit (~85%) and soiled (~15%)
            fit_ratio = np.random.uniform(0.80, 0.90)
            fit_qty = int(total_quantity * fit_ratio)
            soiled_qty = total_quantity - fit_qty

            # Fit record
            rec_fit = DenominationInventory(
                branch_id=b.id,
                date=today,
                denomination=denom,
                quantity=fit_qty,
                value=round(fit_qty * denom, 2),
                is_fit=True,
                is_soiled=False,
            )
            records.append(rec_fit)

            # Soiled record
            rec_soiled = DenominationInventory(
                branch_id=b.id,
                date=today,
                denomination=denom,
                quantity=soiled_qty,
                value=round(soiled_qty * denom, 2),
                is_fit=False,
                is_soiled=True,
            )
            records.append(rec_soiled)

        # Batch periodically
        if len(records) >= 10000:
            _bulk_insert(db, records, chunk_size=10000)
            db.commit()
            records = []

    if records:
        _bulk_insert(db, records, chunk_size=10000)
        db.commit()

    total = len(branches) * len(DENOMINATIONS) * 2  # fit + soiled per denom
    print(f"  Created {total:,} denomination inventory records")
    return total


# --------------------------------------------------------------------------- #
#  CIT Trip generator
# --------------------------------------------------------------------------- #

def generate_cit_trips(db, branches=None) -> int:
    """Generate realistic CIT trip records for the last 30 days."""
    from app.core.constants import (
        CIT_COST_PER_TRIP, CIT_COST_PER_KM, CIT_FLEET_SIZE,
        CIT_MAX_VALUE_PER_TRIP, CIT_EMERGENCY_COST,
    )

    if branches is None:
        branches = db.query(Branch).all()

    # Group branches by city
    city_branches: Dict[str, List] = {}
    for b in branches:
        city = b.city or "Unknown"
        city_branches.setdefault(city, []).append(b)

    # Top cities by branch count get CIT routes
    top_cities = sorted(city_branches.keys(), key=lambda c: -len(city_branches[c]))[:10]
    today = datetime.date.today()
    records = []
    trip_counter = 0

    for day_offset in range(30):
        trip_date = today - datetime.timedelta(days=day_offset)
        for city in top_cities:
            city_br = city_branches[city]
            n_branches = len(city_br)
            # 2-8 trips per day per city depending on size
            n_trips = max(2, min(8, n_branches // 20))

            for t in range(n_trips):
                trip_counter += 1
                vehicle_num = random.randint(1, min(CIT_FLEET_SIZE, 150))
                vehicle_id = f"CIT-{vehicle_num:03d}"

                # Pick 2-8 random branches for the route
                n_stops = random.randint(2, min(8, len(city_br)))
                route_branches = random.sample(city_br, n_stops)
                route_bids = [rb.branch_id for rb in route_branches]

                # Estimate distance (random realistic range)
                dist_km = round(random.uniform(8.0, 65.0), 2)
                value_carried = round(random.uniform(5_000_000, CIT_MAX_VALUE_PER_TRIP * 0.6), 2)
                duration = round(0.5 * n_stops + dist_km / 30.0 + random.uniform(0.2, 1.0), 2)

                # Cost
                is_emergency = random.random() < 0.05  # 5% emergency trips
                base_cost = CIT_EMERGENCY_COST if is_emergency else CIT_COST_PER_TRIP
                cost = round(base_cost + dist_km * CIT_COST_PER_KM + random.uniform(500, 3000), 2)

                status = "emergency" if is_emergency else random.choice(
                    ["completed"] * 8 + ["in_progress"] * 1 + ["planned"] * 1
                )

                records.append(CITTrip(
                    trip_id=f"TRIP-{trip_date.strftime('%Y%m%d')}-{trip_counter:04d}",
                    date=trip_date,
                    vehicle_id=vehicle_id,
                    route=route_bids,
                    total_distance_km=dist_km,
                    total_value_carried=value_carried,
                    cost=cost,
                    duration_hours=duration,
                    num_stops=n_stops,
                    status=status,
                ))

        if len(records) >= 500:
            db.add_all(records)
            db.commit()
            records = []

    if records:
        db.add_all(records)
        db.commit()

    print(f"  Created {trip_counter:,} CIT trip records")
    return trip_counter


def seed_cit_trips_standalone():
    """Seed CIT trips without regenerating other data. Safe to call multiple times."""
    db = SessionLocal()
    try:
        existing = db.query(CITTrip).count()
        if existing > 0:
            print(f"  CIT trips already exist ({existing} records), skipping.")
            return existing
        count = generate_cit_trips(db)
        return count
    finally:
        db.close()


# --------------------------------------------------------------------------- #
#  Master generator
# --------------------------------------------------------------------------- #

def generate_all() -> Dict[str, Any]:
    """Generate all synthetic data and return summary statistics."""
    db = SessionLocal()
    stats: Dict[str, Any] = {}

    try:
        print("\n[1/6] Generating branches...")
        branches = generate_branches(db)
        stats["branches"] = len(branches)

        print("[2/6] Generating vault positions (this may take a minute)...")
        vp_count = generate_vault_positions(db, branches)
        stats["vault_positions"] = vp_count

        print("[3/6] Generating ATMs and cassettes...")
        atm_count, cassette_count = generate_atms(db, branches)
        stats["atms"] = atm_count
        stats["atm_cassettes"] = cassette_count

        print("[4/6] Generating CRR positions...")
        crr_count = generate_crr_positions(db)
        stats["crr_positions"] = crr_count

        print("[5/6] Generating Nostro accounts...")
        nostro_count = generate_nostro_accounts(db)
        stats["nostro_accounts"] = nostro_count

        print("[5/6] Generating Vostro accounts...")
        vostro_count = generate_vostro_accounts(db)
        stats["vostro_accounts"] = vostro_count

        print("[6/7] Generating denomination inventory...")
        denom_count = generate_denomination_inventory(db, branches)
        stats["denomination_inventory"] = denom_count

        print("[7/7] Generating CIT trips...")
        cit_count = generate_cit_trips(db, branches)
        stats["cit_trips"] = cit_count

    except Exception as e:
        db.rollback()
        print(f"\nError during data generation: {e}")
        raise
    finally:
        db.close()

    return stats
