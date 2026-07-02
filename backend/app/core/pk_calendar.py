"""
pk_calendar.py — Pakistan Banking Calendar & Cash-Demand Feature Engineering
============================================================================
Drop-in module for the Cash Optimization Engine (COE).

Replaces the hardcoded / approximate Eid-Ramadan-Muharram dates currently
embedded in `app/services/uc01_vault_forecast.py` with a single source of
truth, and exposes calendar features that capture the events that actually
move branch & ATM cash demand in Pakistan:

    - Gazetted bank holidays (SBP / Cabinet Division notifications)
    - Eid-ul-Fitr / Eid-ul-Adha surge windows (biggest cash-out events)
    - Ramadan (elevated deposits early, withdrawals near Eid) + Zakat day
    - Muharram / Ashura
    - Salary-credit & pension days (with holiday/weekend shift)
    - Month-end / quarter-end / fiscal-year-end (30 June) effects
    - Pre-holiday cash-stocking and post-holiday replenishment signals
    - Bridge days (single working day trapped between off-days)

All dates for 2026 are cross-checked against SBP & Cabinet Division
notifications. 2024-2025 are historical (observed). 2027 is PROJECTED and
must be re-confirmed after moon sighting — see HIJRI_PROJECTED flags.

Usage
-----
    from app.core.pk_calendar import calendar_features, build_calendar_dataframe

    feats = calendar_features(date(2026, 5, 26))   # -> dict of features
    cal_df = build_calendar_dataframe("2024-01-01", "2027-12-31")  # -> DataFrame
    # then:  dim_market = dim_market.merge(cal_df, on="date", how="left")

No third-party deps required for the feature functions (stdlib datetime only).
`build_calendar_dataframe` uses pandas if available.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

# ===========================================================================
# 1. HOLIDAY MASTER (date -> (name, type))
#    type in: religious | national | bank | optional
#    "bank" = closed for public dealing only (internal ops continue)
# ===========================================================================

# Multi-day religious clusters are expanded to individual dates below.
# Sources: SBP BPRD circulars + Cabinet Division notifications.

_RELIGIOUS_CLUSTERS: Dict[str, List[Tuple[date, date]]] = {
    # name : list of (start, end) inclusive ranges, one per year
    "Eid-ul-Fitr": [
        (date(2024, 4, 10), date(2024, 4, 12)),
        (date(2025, 3, 31), date(2025, 4, 2)),
        (date(2026, 3, 20), date(2026, 3, 22)),   # SBP: banks closed 20-23 Mar (23 = Pakistan Day)
        (date(2027, 3, 10), date(2027, 3, 12)),   # PROJECTED
    ],
    "Eid-ul-Adha": [
        (date(2024, 6, 17), date(2024, 6, 19)),
        (date(2025, 6, 7), date(2025, 6, 9)),
        (date(2026, 5, 26), date(2026, 5, 28)),   # SBP: banks closed 26-28 May 2026
        (date(2027, 5, 16), date(2027, 5, 18)),   # PROJECTED
    ],
    "Ashura": [
        (date(2024, 7, 16), date(2024, 7, 17)),
        (date(2025, 7, 5), date(2025, 7, 6)),
        (date(2026, 6, 25), date(2026, 6, 26)),
        (date(2027, 6, 15), date(2027, 6, 16)),   # PROJECTED
    ],
}

_SINGLE_DAY_HOLIDAYS: Dict[str, List[Tuple[date, str]]] = {
    # name : [(date, type)]
    "Kashmir Day": [(date(y, 2, 5), "national") for y in (2024, 2025, 2026, 2027)],
    "Pakistan Day": [(date(y, 3, 23), "national") for y in (2024, 2025, 2026, 2027)],
    "Labour Day": [(date(y, 5, 1), "national") for y in (2024, 2025, 2026, 2027)],
    "Independence Day": [(date(y, 8, 14), "national") for y in (2024, 2025, 2026, 2027)],
    "Iqbal Day": [(date(y, 11, 9), "national") for y in (2024, 2025, 2026, 2027)],
    "Quaid-e-Azam Day / Christmas": [(date(y, 12, 25), "national") for y in (2024, 2025, 2026, 2027)],
    "Youm-e-Takbeer": [(date(2026, 5, 28), "national")],  # observed alongside Eid-ul-Adha 2026
    "Eid Milad-un-Nabi": [
        (date(2024, 9, 16), "religious"),
        (date(2025, 9, 5), "religious"),
        (date(2026, 8, 25), "religious"),
        (date(2027, 8, 15), "religious"),  # PROJECTED
    ],
    # Bank-specific closures for public dealing (annual / half-yearly closing)
    "Bank Annual Closing (FY start)": [(date(y, 7, 1), "bank") for y in (2024, 2025, 2026, 2027)],
    "New Year (Bank Closing)": [(date(y, 1, 1), "bank") for y in (2024, 2025, 2026, 2027)],
}

# Years where the projected Hijri dates still need moon-sighting confirmation
HIJRI_PROJECTED_YEARS = {2027}

# Ramadan start dates (1 Ramadan) — drives the Zakat deduction day & fasting window
_RAMADAN_STARTS: Dict[int, date] = {
    2024: date(2024, 3, 12),
    2025: date(2025, 3, 1),
    2026: date(2026, 2, 18),
    2027: date(2027, 2, 8),   # PROJECTED
}


def _build_holiday_map() -> Dict[date, Tuple[str, str]]:
    """Expand clusters + singles into a flat {date: (name, type)} map."""
    m: Dict[date, Tuple[str, str]] = {}
    for name, ranges in _RELIGIOUS_CLUSTERS.items():
        for start, end in ranges:
            d = start
            while d <= end:
                m[d] = (name, "religious")
                d += timedelta(days=1)
    for name, entries in _SINGLE_DAY_HOLIDAYS.items():
        for d, typ in entries:
            # don't overwrite a religious cluster day with a single-day label
            m.setdefault(d, (name, typ))
    return m


HOLIDAY_MAP: Dict[date, Tuple[str, str]] = _build_holiday_map()

# Eid surge windows (days BEFORE Eid with elevated cash-out demand)
_EID_FITR_DATES = [r[0] for r in _RELIGIOUS_CLUSTERS["Eid-ul-Fitr"]]
_EID_ADHA_DATES = [r[0] for r in _RELIGIOUS_CLUSTERS["Eid-ul-Adha"]]
EID_FITR_SURGE_DAYS = 10   # Eidi, shopping, travel — biggest annual cash-out
EID_ADHA_SURGE_DAYS = 7    # animal purchase

# ===========================================================================
# 2. CORE CALENDAR PREDICATES
# ===========================================================================

def is_weekend(d: date) -> bool:
    """Pakistani banks: Sat (5) & Sun (6) closed."""
    return d.weekday() >= 5


def is_bank_holiday(d: date) -> bool:
    return d in HOLIDAY_MAP


def holiday_info(d: date) -> Tuple[str, str]:
    return HOLIDAY_MAP.get(d, ("", ""))


def is_working_day(d: date) -> bool:
    return not is_weekend(d) and not is_bank_holiday(d)


def prev_working_day(d: date) -> date:
    x = d - timedelta(days=1)
    while not is_working_day(x):
        x -= timedelta(days=1)
    return x


def next_working_day(d: date) -> date:
    x = d + timedelta(days=1)
    while not is_working_day(x):
        x += timedelta(days=1)
    return x


# ===========================================================================
# 3. SALARY & PENSION MODEL
#    Govt + most private salaries credit on the 1st; if the 1st is a
#    non-working day, banks credit on the LAST working day before it.
#    Pension (govt) also ~1st. Cash-withdrawal pressure runs from the
#    payday through ~day 7, and spikes again at month-end.
# ===========================================================================

def salary_credit_day(year: int, month: int) -> date:
    """Effective salary/pension credit date for a given month."""
    first = date(year, month, 1)
    if is_working_day(first):
        return first
    return prev_working_day(first)


def is_salary_credit_day(d: date) -> bool:
    return d == salary_credit_day(d.year, d.month)


def is_pension_day(d: date) -> bool:
    # Govt pensions follow the same month-start credit convention
    return is_salary_credit_day(d)


def days_to_payday(d: date) -> int:
    """Signed days to nearest salary credit day (0 on payday, + = upcoming)."""
    this_month = salary_credit_day(d.year, d.month)
    if d <= this_month:
        return (this_month - d).days
    # look to next month
    ny, nm = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    nxt = salary_credit_day(ny, nm)
    return (nxt - d).days


def is_salary_window(d: date) -> bool:
    """Heightened cash demand: month-end run-up (>=27) or post-payday (<=7)."""
    return d.day >= 27 or d.day <= 7


# ===========================================================================
# 4. EVENT-DISTANCE HELPERS
# ===========================================================================

def _signed_days_to_nearest(d: date, refs: List[date], cap: int = 30) -> int:
    """Signed distance (capped) to the nearest reference date."""
    best = cap
    for r in refs:
        delta = (r - d).days
        if abs(delta) < abs(best):
            best = delta
    return max(-cap, min(cap, best))


def is_ramadan(d: date) -> Tuple[bool, int]:
    """(in_ramadan, ramadan_day[1..30] or 0)."""
    start = _RAMADAN_STARTS.get(d.year)
    if start and start <= d <= start + timedelta(days=29):
        return True, (d - start).days + 1
    return False, 0


def is_zakat_deduction_day(d: date) -> bool:
    """1 Ramadan — compulsory Zakat deduction; large one-off account debits."""
    return d == _RAMADAN_STARTS.get(d.year)


def is_pre_eid_surge(d: date) -> bool:
    for e in _EID_FITR_DATES:
        if 0 < (e - d).days <= EID_FITR_SURGE_DAYS:
            return True
    for e in _EID_ADHA_DATES:
        if 0 < (e - d).days <= EID_ADHA_SURGE_DAYS:
            return True
    return False


def is_pre_holiday(d: date) -> bool:
    """Working day immediately before a holiday cluster/long weekend."""
    return is_working_day(d) and not is_working_day(d + timedelta(days=1))


def is_post_holiday(d: date) -> bool:
    """First working day after a holiday cluster/weekend."""
    return is_working_day(d) and not is_working_day(d - timedelta(days=1))


def is_bridge_day(d: date) -> bool:
    """Single working day sandwiched between two off-days (low traffic)."""
    return (
        is_working_day(d)
        and not is_working_day(d - timedelta(days=1))
        and not is_working_day(d + timedelta(days=1))
    )


# ===========================================================================
# 5. MASTER FEATURE FUNCTION
# ===========================================================================

def calendar_features(d: date) -> Dict[str, object]:
    """Full feature dict for a single date — ready to feed the forecaster."""
    name, htype = holiday_info(d)
    in_ram, ram_day = is_ramadan(d)
    quarter = (d.month - 1) // 3 + 1

    return {
        "date": d.isoformat(),
        # --- working calendar
        "day_of_week": d.weekday(),                 # 0=Mon ... 6=Sun
        "day_of_month": d.day,
        "week_of_month": (d.day - 1) // 7 + 1,
        "month": d.month,
        "quarter": quarter,
        "is_weekend": int(is_weekend(d)),
        "is_friday": int(d.weekday() == 4),
        "is_bank_holiday": int(bool(name)),
        "holiday_name": name,
        "holiday_type": htype,
        "is_working_day": int(is_working_day(d)),
        "is_pre_holiday": int(is_pre_holiday(d)),
        "is_post_holiday": int(is_post_holiday(d)),
        "is_bridge_day": int(is_bridge_day(d)),
        # --- salary / pension
        "is_salary_credit_day": int(is_salary_credit_day(d)),
        "is_pension_day": int(is_pension_day(d)),
        "is_salary_window": int(is_salary_window(d)),
        "days_to_payday": days_to_payday(d),
        # --- month / quarter / fiscal-year boundaries
        "is_month_start": int(d.day <= 3),
        "is_month_end": int(d.day >= 27),
        "is_quarter_end": int(d.month in (3, 6, 9, 12) and d.day >= 27),
        "is_fiscal_year_end": int(d.month == 6 and d.day >= 27),   # FY ends 30 June
        "is_calendar_year_end": int(d.month == 12 and d.day >= 27),
        # --- Islamic calendar / surge windows
        "is_ramadan": int(in_ram),
        "ramadan_day": ram_day,
        "is_zakat_day": int(is_zakat_deduction_day(d)),
        "is_pre_eid_surge": int(is_pre_eid_surge(d)),
        "is_eid_fitr_window": int(any(abs((e - d).days) <= 3 for e in _EID_FITR_DATES)),
        "is_eid_adha_window": int(any(abs((e - d).days) <= 3 for e in _EID_ADHA_DATES)),
        "days_to_eid_fitr": _signed_days_to_nearest(d, _EID_FITR_DATES),
        "days_to_eid_adha": _signed_days_to_nearest(d, _EID_ADHA_DATES),
        # --- data-quality flag for downstream uncertainty widening
        "hijri_projected": int(d.year in HIJRI_PROJECTED_YEARS),
    }


# Numeric feature columns (exclude string/id cols) — handy for model wiring
FEATURE_COLUMNS: List[str] = [
    k for k, v in calendar_features(date(2026, 1, 1)).items()
    if k not in ("date", "holiday_name", "holiday_type")
]


# ===========================================================================
# 6. DATAFRAME BUILDER (for merging into dim_market / dim_calendar)
# ===========================================================================

def build_calendar_dataframe(start: str, end: str):
    """Return a pandas DataFrame of daily calendar features over [start, end]."""
    import pandas as pd  # local import keeps stdlib-only feature funcs dep-free

    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    rows = []
    d = d0
    while d <= d1:
        rows.append(calendar_features(d))
        d += timedelta(days=1)
    return pd.DataFrame(rows)


# ===========================================================================
# 7. DEMAND MULTIPLIER (for the SYNTHETIC generator)
#    Use this so generated history actually CONTAINS the spikes the model
#    must learn — directly closing the "anomalies smoothed as noise" gap.
#    Returns a multiplicative factor on baseline withdrawal demand.
# ===========================================================================

def withdrawal_demand_multiplier(d: date) -> float:
    f = 1.0
    # Salary / pension liquidity pulse
    if is_salary_window(d):
        f *= 1.35
    if is_salary_credit_day(d):
        f *= 1.15
    # Eid-ul-Fitr is the dominant annual cash-out
    for e in _EID_FITR_DATES:
        gap = (e - d).days
        if 0 < gap <= EID_FITR_SURGE_DAYS:
            f *= 1.0 + 1.2 * (1 - gap / EID_FITR_SURGE_DAYS)   # ramps to ~2.2x day before
    for e in _EID_ADHA_DATES:
        gap = (e - d).days
        if 0 < gap <= EID_ADHA_SURGE_DAYS:
            f *= 1.0 + 0.8 * (1 - gap / EID_ADHA_SURGE_DAYS)
    # Ramadan: lower early (saving/deposits), rising toward Eid
    in_ram, rd = is_ramadan(d)
    if in_ram:
        f *= 0.95 + 0.02 * rd
    # Pre-holiday stocking, post-holiday dip, bridge-day dip
    if is_pre_holiday(d):
        f *= 1.20
    if is_bridge_day(d):
        f *= 0.55
    # Month/quarter-end corporate sweeps
    if is_quarter_end := (d.month in (3, 6, 9, 12) and d.day >= 27):
        f *= 1.10
    return round(f, 4)


def deposit_demand_multiplier(d: date) -> float:
    f = 1.0
    # Ramadan early: charity/savings inflows; Zakat day large debits handled separately
    in_ram, rd = is_ramadan(d)
    if in_ram and rd <= 15:
        f *= 1.10
    # Post-Eid deposits (gift money banked, businesses settling)
    if is_post_holiday(d):
        f *= 1.15
    # Month-end corporate deposits
    if d.day >= 27:
        f *= 1.08
    return round(f, 4)


# ===========================================================================
# 8. CLI / sanity check
# ===========================================================================
if __name__ == "__main__":
    import json
    sample = [
        date(2026, 2, 18),   # 1 Ramadan / Zakat day
        date(2026, 3, 19),   # day before Eid-ul-Fitr (pre-holiday + surge)
        date(2026, 3, 20),   # Eid-ul-Fitr
        date(2026, 5, 1),    # Labour Day (Fri)
        date(2026, 5, 26),   # Eid-ul-Adha
        date(2026, 6, 30),   # fiscal year-end
        date(2026, 7, 1),    # bank annual closing
        date(2026, 9, 1),    # salary credit day (Tue)
    ]
    for s in sample:
        feats = calendar_features(s)
        print(s.isoformat(), "->",
              "HOL" if feats["is_bank_holiday"] else "   ",
              f"wd_mult={withdrawal_demand_multiplier(s):.2f}",
              f"dep_mult={deposit_demand_multiplier(s):.2f}",
              "|", feats["holiday_name"] or
              ("salary_window" if feats["is_salary_window"] else ""))
    print(f"\n{len(HOLIDAY_MAP)} holiday-dates loaded (2024-2027). "
          f"{len(FEATURE_COLUMNS)} numeric features per day.")
