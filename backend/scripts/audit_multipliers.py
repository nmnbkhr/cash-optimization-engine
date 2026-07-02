"""
audit_multipliers.py — READ-ONLY audit of realized demand multipliers.

The realized multiplier for a branch-day = the day's flow divided by that branch's
trailing-90-day median of NORMAL days only (no event flag). The normal-day baseline
is used because ~45% of days carry an event flag, so an all-day median is itself
elevated and compresses every multiplier. "vs a normal day" is the definition the
generator's TARGET_LEVEL is calibrated against.

NORMAL day = none of: salary_window, pre_eid_surge, ramadan, bridge, pre/post-holiday,
bank-holiday. Window is 90 trailing days (excluding the current day); a branch-day is
scored only if its window holds >= 14 normal observations.

Reports percentile spread, HUB-only spread, largest spikes, threshold counts, and a
per-flag mean breakdown — including BOTH ramadan (whole month) and ramadan excluding
the pre-Eid window. No plotting, no DB writes.

Usage (from backend/):
    conda activate coe
    python -m scripts.audit_multipliers
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

_BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = str(_BACKEND_DIR / "cash_engine.db")

WINDOW = 90
MIN_NORMAL_OBS = 14
PCTS = [50, 90, 95, 99]

# Flags reported in the per-flag breakdown
CAL_FLAGS = ["is_pre_eid_surge", "is_salary_window", "is_ramadan", "is_bridge_day"]
# Flags that disqualify a day from the NORMAL-day baseline
NORMAL_EXCLUDE = [
    "is_salary_window", "is_pre_eid_surge", "is_ramadan",
    "is_bridge_day", "is_pre_holiday", "is_post_holiday", "is_bank_holiday",
]
ALL_FLAGS = sorted(set(CAL_FLAGS) | set(NORMAL_EXCLUDE))


def _percentile_row(label: str, s: pd.Series) -> str:
    if len(s) == 0:
        return f"  {label:<22} (no data)"
    p = np.percentile(s, PCTS)
    return (f"  {label:<22} p50={p[0]:6.2f}  p90={p[1]:6.2f}  "
            f"p95={p[2]:6.2f}  p99={p[3]:6.2f}  max={s.max():7.2f}  (n={len(s):,})")


def _realized_mult(df: pd.DataFrame, flow_col: str) -> pd.Series:
    """day flow / trailing-90-day median of NORMAL days (prior 90 days, excl. today)."""
    normal_flow = df[flow_col].where(df["is_normal"])  # event days -> NaN
    med = (
        normal_flow.groupby(df["branch_id"])
        .transform(lambda s: s.shift(1).rolling(WINDOW, min_periods=MIN_NORMAL_OBS).median())
    )
    mult = df[flow_col] / med
    mult[(med <= 0) | med.isna()] = np.nan
    return mult


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    gl = pd.read_sql_query(
        "SELECT date, branch_id, total_deposit_flow_m, total_withdrawal_flow_m "
        "FROM fact_gl_daily", conn)
    branches = pd.read_sql_query("SELECT branch_id, branch_type FROM branches", conn)
    cal = pd.read_sql_query(
        f"SELECT date, {', '.join(ALL_FLAGS)}, days_to_eid_fitr, days_to_eid_adha "
        "FROM dim_calendar", conn)
    conn.close()

    gl = gl.sort_values(["branch_id", "date"]).reset_index(drop=True)
    gl = gl.merge(cal, on="date", how="left")
    gl[ALL_FLAGS] = gl[ALL_FLAGS].fillna(0).astype(int)
    gl["is_normal"] = ~(gl[NORMAL_EXCLUDE] == 1).any(axis=1)
    # Explicit pre-Eid sub-flags (Fitr surge = 10d window, Adha surge = 7d window)
    gl["fitr_surge"] = ((gl["days_to_eid_fitr"] > 0) & (gl["days_to_eid_fitr"] <= 10)).astype(int)
    gl["adha_surge"] = ((gl["days_to_eid_adha"] > 0) & (gl["days_to_eid_adha"] <= 7)).astype(int)

    gl["wth_mult"] = _realized_mult(gl, "total_withdrawal_flow_m")
    gl["dep_mult"] = _realized_mult(gl, "total_deposit_flow_m")
    gl = gl.merge(branches, on="branch_id", how="left")

    print("=" * 80)
    print("REALIZED DEMAND MULTIPLIER AUDIT  (day flow / trailing-90d NORMAL-day median)")
    print(f"  branch-days: {len(gl):,}   normal-day share: {100.0 * gl['is_normal'].mean():.1f}%")
    print(f"  date range: {gl['date'].min()} .. {gl['date'].max()}")
    print("=" * 80)

    for col, name in [("wth_mult", "WITHDRAWALS"), ("dep_mult", "DEPOSITS")]:
        s = gl[col].dropna()
        s_hub = gl.loc[gl["branch_type"].str.upper() == "HUB", col].dropna()
        print(f"\n{'-' * 80}\n{name}  realized multiplier (vs normal-day baseline)\n{'-' * 80}")
        print(_percentile_row("overall", s))
        print(_percentile_row("HUB only", s_hub))

        for thr in (3.5, 5.0):
            n = int((s > thr).sum())
            print(f"  > {thr:>3}x : {n:>9,} branch-days  ({100.0 * n / len(s):5.2f}% of valid)")

        top = gl.loc[s.index].nlargest(10, col)[["date", "branch_id", "branch_type", col]]
        print(f"\n  Top 10 {name.lower()} spikes:")
        print(f"    {'date':<12}{'branch_id':<12}{'branch_type':<14}{'realized_mult':>13}")
        for _, r in top.iterrows():
            print(f"    {r['date']:<12}{r['branch_id']:<12}{str(r['branch_type']):<14}{r[col]:>13.2f}")

        print(f"\n  Mean realized {name.lower()} mult by calendar flag:")
        valid = gl.loc[s.index]
        for flag in CAL_FLAGS:
            mask = valid[flag] == 1
            mean = valid.loc[mask, col].mean() if mask.any() else float("nan")
            print(f"    {flag:<26} mean={mean:6.2f}  (n={int(mask.sum()):,})")
        # Ramadan split: whole month vs excluding the pre-Eid window
        ram_ex = (valid["is_ramadan"] == 1) & (valid["is_pre_eid_surge"] == 0)
        mean_ex = valid.loc[ram_ex, col].mean() if ram_ex.any() else float("nan")
        print(f"    {'is_ramadan (ex pre-Eid)':<26} mean={mean_ex:6.2f}  (n={int(ram_ex.sum()):,})")
        normal = valid.loc[valid["is_normal"], col]
        print(f"    {'normal days':<26} mean={normal.mean():6.2f}  (n={len(normal):,})")

        # DISJOINT (mutually exclusive) buckets — prevents overlap false alarms.
        # "ramadan-only" is the pure level; overlap buckets are higher BY DESIGN
        # (multiplicative composition of co-occurring flags).
        sa = valid["is_salary_window"] == 1
        ra = valid["is_ramadan"] == 1
        br = valid["is_bridge_day"] == 1
        fitr = valid["fitr_surge"] == 1
        adha = valid["adha_surge"] == 1
        buckets = [
            ("normal (no flags)", valid["is_normal"]),
            ("salary-only", sa & ~ra & ~fitr & ~adha & ~br),
            ("ramadan-only (PURE ~1.5-1.6)", ra & ~sa & ~fitr & ~br),
            ("fitr_surge [in Ramadan, hi by design]", fitr),
            ("adha_surge [standalone ~2.2-2.4]", adha),
            ("salary INT ramadan (hi by design)", sa & ra & ~fitr),
        ]
        print(f"\n  Mean realized {name.lower()} mult by bucket "
              f"(fitr/adha are flag-based, may overlap Ramadan):")
        for label, mask in buckets:
            mask = mask & valid[col].notna()
            mean = valid.loc[mask, col].mean() if mask.any() else float("nan")
            print(f"    {label:<36} mean={mean:6.2f}  (n={int(mask.sum()):,})")

    print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
