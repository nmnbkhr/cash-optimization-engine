"""
t3_span_sweep.py — READ-ONLY: pick the EWMA span S for the T3 managed-level target.

T3 = EWMA(closing_balance_m, span=S). We do NOT default to the smoothest span. Rule:
choose the SMALLEST S that (a) clears ~60% persistence coverage overall within +-12.5%
and (b) keeps event-window coverage (pre_eid, salary) within ~10pts of calm periods,
so the least smoothing that still retains the event signal wins.

For each S in {3,5,7} reports persistence-baseline coverage by horizon 1..7 and the
event-window vs calm coverage. No ML, no DB writes. Prints and STOPS.

Usage (from backend/):  python -m scripts.t3_span_sweep
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
SPANS = (3, 5, 7)
EVENT_MONTHS = ("2026-03", "2026-05")


def _load() -> pd.DataFrame:
    con = sqlite3.connect(DB_PATH)
    gl = pd.read_sql_query(
        "SELECT date, branch_id, closing_balance_m FROM fact_gl_daily", con)
    cal = pd.read_sql_query(
        "SELECT date, is_salary_window, is_pre_eid_surge FROM dim_calendar", con)
    con.close()
    gl = gl.sort_values(["branch_id", "date"]).reset_index(drop=True)
    gl = gl.merge(cal, on="date", how="left")
    gl[["is_salary_window", "is_pre_eid_surge"]] = (
        gl[["is_salary_window", "is_pre_eid_surge"]].fillna(0).astype(int))
    for S in SPANS:
        gl[f"T3_{S}"] = (gl.groupby("branch_id")["closing_balance_m"]
                         .transform(lambda s: s.ewm(span=S, adjust=False).mean()))
    return gl


def _persist(gl: pd.DataFrame, col: str, by_h: bool = False):
    per_h, hits, tot = {}, 0, 0
    for h in HORIZONS:
        fut = gl.groupby("branch_id")[col].shift(-h)
        base = gl[col]
        valid = (base.abs() > 1e-9) & fut.notna() & base.notna()
        within = ((fut - base).abs() / base.abs() <= BAND) & valid
        hh, tt = int(within.sum()), int(valid.sum())
        per_h[h] = 100.0 * hh / tt if tt else float("nan")
        hits += hh
        tot += tt
    overall = 100.0 * hits / tot if tot else float("nan")
    return (overall, per_h) if by_h else overall


def _med_pct_change(gl: pd.DataFrame, col: str) -> float:
    pct = gl.groupby("branch_id")[col].transform(lambda s: s.pct_change().abs())
    return 100.0 * float(np.nanmedian(pct.values))


def main() -> None:
    gl = _load()
    ev = gl[gl["date"].str.slice(0, 7).isin(EVENT_MONTHS)].copy()

    print("=" * 90)
    print("T3 EWMA-SPAN SWEEP  (least-smoothing rule; persistence baseline, no ML)")
    print(f"  branch-days: {len(gl):,}   dates: {gl['date'].min()} .. {gl['date'].max()}")
    print(f"  event months: {' & '.join(EVENT_MONTHS)} (Eid-ul-Fitr + Eid-ul-Adha)")
    print("=" * 90)

    print("\n[overall] persistence within +-12.5% and median |%chg|")
    print(f"  {'span':<6}{'med|%chg|':>12}{'overall':>10}" +
          "".join(f"  h={h}" for h in HORIZONS))
    for S in SPANS:
        col = f"T3_{S}"
        ov, per_h = _persist(gl, col, by_h=True)
        mp = _med_pct_change(gl, col)
        print(f"  S={S:<4}{mp:>11.2f}%{ov:>9.1f}%" +
              "".join(f"{per_h[h]:6.1f}" for h in HORIZONS))

    print("\n[event windows] persistence within +-12.5% (Mar+May 2026), gap vs calm")
    print(f"  {'span':<6}{'pre_eid':>10}{'salary':>10}{'calm':>10}"
          f"{'pre_eid gap':>14}{'salary gap':>12}")
    for S in SPANS:
        col = f"T3_{S}"
        pe = _persist(ev[ev["is_pre_eid_surge"] == 1], col)
        sa = _persist(ev[ev["is_salary_window"] == 1], col)
        calm = _persist(
            ev[(ev["is_pre_eid_surge"] == 0) & (ev["is_salary_window"] == 0)], col)
        print(f"  S={S:<4}{pe:>9.1f}%{sa:>9.1f}%{calm:>9.1f}%"
              f"{calm - pe:>13.1f}{calm - sa:>12.1f}")

    print("\n" + "=" * 90)
    print("Rule: smallest S with overall >= ~60% AND event gap within ~10pts of calm.")


if __name__ == "__main__":
    main()
