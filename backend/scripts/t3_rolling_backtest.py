"""
t3_rolling_backtest.py — Phase 3 Task 4: rolling-origin backtest on the T3 managed level.

Trains ONE model on data <= 2025-12-31, calibrates on Jan-Feb 2026, then rolls daily
origins through three forward, out-of-sample windows:
    * calm:        September 2026
    * Eid-ul-Fitr: March 2026
    * Eid-ul-Adha: May 2026
Every origin yields a 7-day path; coverage/MAPE/band are aggregated overall, by horizon,
and by segment (branch_type, salary, pre_eid). MODEL is compared head-to-head with the
PERSISTENCE baseline on the SAME origins. Read-only (no persistence to forecasts).

Usage (from backend/):  python -m scripts.t3_rolling_backtest
"""
from __future__ import annotations

import pandas as pd

from app.services.managed_level_forecast import ManagedLevelForecastService

WINDOWS = {
    "calm (Sep 2026)": ("2026-09-01", "2026-09-30"),
    "Eid-ul-Fitr (Mar 2026)": ("2026-03-01", "2026-03-31"),
    "Eid-ul-Adha (May 2026)": ("2026-05-01", "2026-05-31"),
}
TRAIN_MAX = "2025-12-31"
CAL_START, CAL_END = "2026-01-01", "2026-02-28"


def _origins(start: str, end: str) -> list[pd.Timestamp]:
    return list(pd.date_range(start, end, freq="D"))


def _row(label, m, p):
    """one comparison line: model vs persistence."""
    mb = m.get("median_band_pct", float("nan"))
    return (f"  {label:<26} "
            f"MODEL cov={m['coverage_pct']:5.1f}% mape={m['mape']:5.1f}% band={mb:5.1f}%   "
            f"PERSIST cov={p['coverage_pct']:5.1f}% mape={p['mape']:5.1f}%   "
            f"(n={m['n']:,})")


def _print_block(title, model, persist):
    print(f"\n{'-' * 100}\n{title}\n{'-' * 100}")
    print(_row("OVERALL", model["overall"], persist["overall"]))
    print("  by horizon:")
    for h in range(1, 8):
        print(_row(f"    h={h}", model["by_horizon"][h], persist["by_horizon"][h]))
    print("  by branch_type:")
    for k in sorted(model["by_branch_type"]):
        print(_row(f"    {k}", model["by_branch_type"][k], persist["by_branch_type"][k]))
    print("  by salary window:")
    for k in sorted(model["by_salary_window"]):
        print(_row(f"    {k}", model["by_salary_window"][k], persist["by_salary_window"][k]))
    print("  by pre-Eid surge:")
    for k in sorted(model["by_pre_eid"]):
        print(_row(f"    {k}", model["by_pre_eid"][k], persist["by_pre_eid"][k]))


def main() -> None:
    svc = ManagedLevelForecastService()
    info = svc.fit(train_target_max=TRAIN_MAX, cal_start=CAL_START, cal_end=CAL_END)

    print("=" * 100)
    print("PHASE 3 — ROLLING-ORIGIN BACKTEST: T3 managed level (EWMA span="
          f"{svc.span}), MODEL vs PERSISTENCE")
    print(f"  train target<= {info['train_target_max']}  calib {info['cal_window']}  "
          f"train_rows={info['train_rows']:,} calib_rows={info['calib_rows']:,} "
          f"feats={info['features']}")
    print(f"  band=+/-12.5%   all backtest origins are forward & out-of-sample")
    print("=" * 100)

    # combined (all three windows) + each window
    all_origins = []
    blocks = []
    for name, (s, e) in WINDOWS.items():
        og = _origins(s, e)
        all_origins += og
        bt = svc.rolling_backtest(og)
        blocks.append((f"{name}  [{bt['n_origins']} origins, {bt['n_rows']:,} rows]",
                       bt["model"], bt["persistence"]))

    combined = svc.rolling_backtest(all_origins)
    _print_block(f"ALL WINDOWS COMBINED  [{combined['n_origins']} origins, "
                 f"{combined['n_rows']:,} rows]", combined["model"], combined["persistence"])
    for title, m, p in blocks:
        _print_block(title, m, p)

    print("\n" + "=" * 100)
    print("STOP — read coverage-by-segment together; decide if Phase 3 needs a second pass.")


if __name__ == "__main__":
    main()
