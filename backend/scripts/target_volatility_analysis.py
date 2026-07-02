"""
target_volatility_analysis.py — READ-ONLY volatility decomposition + target comparison.

Phase 2 found ~26% coverage forecasting RAW daily closing balance. Hypothesis: the
reconciled closing swings because CIT resets bounce the vault inside [floor, cap]; CIT
is the optimizer's lever, not a forecast target. This script compares three candidate
forecast targets per branch-day and asks (with NO ML, persistence only) whether the
target reframe — not the model — is what unlocks the +-12.5% band.

  T1  raw closing          = closing_balance_m              (current Phase 2 target)
  T2  closing-before-CIT   = opening + cash_in - cash_out   (strip the CIT reset)
  T3  EWMA closing (span=7)= managed/smoothed level

No DB writes, no model changes, no regen. Prints tables and STOPS.

Usage (from backend/):
    conda activate coe
    python -m scripts.target_volatility_analysis
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

_BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = str(_BACKEND_DIR / "cash_engine.db")

BAND = 0.125
HORIZONS = range(1, 8)
EWMA_SPAN = 7
# Eid-inclusive windows for the event slice (Fitr ~20 Mar 2026, Adha ~27 May 2026).
EVENT_MONTHS = ("2026-03", "2026-05")


def _load() -> pd.DataFrame:
    con = sqlite3.connect(DB_PATH)
    gl = pd.read_sql_query(
        "SELECT date, branch_id, opening_balance_m, total_deposit_flow_m, "
        "total_withdrawal_flow_m, cit_in_m, cit_out_m, closing_balance_m "
        "FROM fact_gl_daily", con)
    br = pd.read_sql_query("SELECT branch_id, branch_type FROM branches", con)
    cal = pd.read_sql_query(
        "SELECT date, is_salary_window, is_pre_eid_surge FROM dim_calendar", con)
    con.close()

    gl = gl.sort_values(["branch_id", "date"]).reset_index(drop=True)
    gl = gl.merge(br, on="branch_id", how="left").merge(cal, on="date", how="left")
    gl[["is_salary_window", "is_pre_eid_surge"]] = (
        gl[["is_salary_window", "is_pre_eid_surge"]].fillna(0).astype(int))

    # Three candidate targets.
    gl["T1"] = gl["closing_balance_m"]
    gl["T2"] = (gl["opening_balance_m"] + gl["total_deposit_flow_m"]
                - gl["total_withdrawal_flow_m"])
    gl["T3"] = (gl.groupby("branch_id")["closing_balance_m"]
                .transform(lambda s: s.ewm(span=EWMA_SPAN, adjust=False).mean()))
    gl["cit_net"] = gl["cit_in_m"] - gl["cit_out_m"]
    gl["close_delta"] = gl.groupby("branch_id")["closing_balance_m"].diff()
    return gl


def _vol_stats(gl: pd.DataFrame, col: str) -> tuple[float, float]:
    """median |pct change| (overall) and median per-branch CoV."""
    g = gl.groupby("branch_id")[col]
    pct = g.transform(lambda s: s.pct_change().abs())
    med_abs_pct = 100.0 * np.nanmedian(pct.values)
    cov = g.agg(lambda s: s.std() / s.mean() if s.mean() else np.nan)
    return med_abs_pct, 100.0 * float(np.nanmedian(cov.values))


def _persistence_within(gl: pd.DataFrame, col: str, horizons=HORIZONS,
                        by_h: bool = False):
    """% of branch-days where |val(t+h)-val(t)|/|val(t)| <= BAND, persistence baseline."""
    per_h = {}
    hits = tot = 0
    for h in horizons:
        fut = gl.groupby("branch_id")[col].shift(-h)
        base = gl[col]
        ok = (base.abs() > 1e-9)
        err = (fut - base).abs() / base.abs()
        valid = ok & fut.notna() & base.notna()
        within = (err <= BAND) & valid
        hh, tt = int(within.sum()), int(valid.sum())
        per_h[h] = 100.0 * hh / tt if tt else float("nan")
        hits += hh
        tot += tt
    overall = 100.0 * hits / tot if tot else float("nan")
    return (overall, per_h) if by_h else overall


def main() -> None:
    gl = _load()
    types = ["HUB", "CASH_SURPLUS", "DEFICIT", "SEASONAL", "BALANCED"]
    gl["bt"] = gl["branch_type"].str.upper()

    print("=" * 92)
    print("TARGET VOLATILITY DECOMPOSITION + PERSISTENCE FEASIBILITY  (read-only, no ML)")
    print(f"  branch-days: {len(gl):,}   branches: {gl['branch_id'].nunique():,}   "
          f"dates: {gl['date'].min()} .. {gl['date'].max()}")
    print(f"  T1=raw closing  T2=closing-before-CIT (open+dep-wth)  T3=EWMA(closing,span={EWMA_SPAN})")
    print("=" * 92)

    # ---- (1) day-to-day volatility + (3) persistence floor, per target ----
    print("\n[1+3] OVERALL: volatility (median |%chg|, median per-branch CoV) "
          "+ persistence within +-12.5%")
    print(f"  {'target':<8}{'med|%chg|':>12}{'CoV%':>10}{'persist<=12.5%':>18}")
    for col in ("T1", "T2", "T3"):
        mp, cov = _vol_stats(gl, col)
        pw = _persistence_within(gl, col)
        print(f"  {col:<8}{mp:>11.2f}%{cov:>9.1f}%{pw:>17.1f}%")

    print("\n[1] volatility by branch_type  (median |%chg| / median per-branch CoV%)")
    print(f"  {'branch_type':<14}" + "".join(f"{t:>22}" for t in ("T1", "T2", "T3")))
    for bt in types:
        sub = gl[gl["bt"] == bt]
        if sub.empty:
            continue
        cells = []
        for col in ("T1", "T2", "T3"):
            mp, cov = _vol_stats(sub, col)
            cells.append(f"{mp:6.1f}% / {cov:5.0f}%")
        print(f"  {bt:<14}" + "".join(f"{c:>22}" for c in cells))

    # ---- (2) CIT share of T1 variance ----
    print("\n[2] CIT-driven share of raw-closing variance: var(cit_in-cit_out) / var(d_closing)")
    vnet = gl["cit_net"].var()
    vdel = gl["close_delta"].var()
    print(f"  {'overall':<14} var(cit_net)={vnet:12.1f}  var(d_close)={vdel:12.1f}  "
          f"ratio={vnet / vdel if vdel else float('nan'):6.2f}")
    for bt in types:
        sub = gl[gl["bt"] == bt]
        if sub.empty:
            continue
        vn, vd = sub["cit_net"].var(), sub["close_delta"].var()
        print(f"  {bt:<14} var(cit_net)={vn:12.1f}  var(d_close)={vd:12.1f}  "
              f"ratio={vn / vd if vd else float('nan'):6.2f}")

    # ---- (3/4) persistence by horizon ----
    print("\n[4a] persistence within +-12.5% by horizon (full range)")
    print(f"  {'target':<8}" + "".join(f"  h={h}" for h in HORIZONS))
    for col in ("T1", "T2", "T3"):
        _, per_h = _persistence_within(gl, col, by_h=True)
        print(f"  {col:<8}" + "".join(f"{per_h[h]:6.1f}" for h in HORIZONS))

    # ---- (4) event-window slice (Eid-inclusive months) ----
    ev = gl[gl["date"].str.slice(0, 7).isin(EVENT_MONTHS)].copy()
    print(f"\n[4b] EVENT-INCLUSIVE slice ({' & '.join(EVENT_MONTHS)}, n={len(ev):,} branch-days)")
    for label, mask in [
        ("all event-months", pd.Series(True, index=ev.index)),
        ("is_salary_window", ev["is_salary_window"] == 1),
        ("is_pre_eid_surge", ev["is_pre_eid_surge"] == 1),
        ("calm (neither flag)",
         (ev["is_salary_window"] == 0) & (ev["is_pre_eid_surge"] == 0)),
    ]:
        sub = ev[mask]
        if sub.empty:
            print(f"  {label:<22} (no data)")
            continue
        cells = [f"{_persistence_within(sub, col):5.1f}%" for col in ("T1", "T2", "T3")]
        print(f"  {label:<22}  T1={cells[0]}  T2={cells[1]}  T3={cells[2]}  (n={len(sub):,})")

    print("\n" + "=" * 92)
    print("STOP — read together; pick the Phase 3 target.")


if __name__ == "__main__":
    main()
