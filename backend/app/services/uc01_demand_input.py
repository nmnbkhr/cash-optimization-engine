"""
Reconciled demand input for the UC-01 vault optimizer (Phase B1 cleanup).

The legacy VaultOptimizer expects a 7-day DAILY CASH-DEMAND forecast (mean, std). It used
to be fed by the LSTM in uc01_vault_forecast.py, which trains on the stale/degenerate
`vault_positions` table (deposits == withdrawals -> flat balance -> ~0 demand -> MAPE 100%).

This module replaces that input with the branch's WITHDRAWAL demand taken from the
reconciled ledger (`fact_gl_daily.total_withdrawal_flow_m`) — the same system of record the
frozen T3 managed-level model and the oversight layer read. Withdrawal flow is the right
signal: it is the cash the vault must dispense (T3 forecasts the LEVEL, not the demand, so
it is not the correct optimizer input — but it shares this reconciled spine).

Returns means/stds in RAW PKR so they are dimensionally consistent with the optimizer's
vault_capacity / current_vault_level (also raw PKR). No model training, no writes.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DB_PATH = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")
HORIZON = 7
LOOKBACK_DAYS = 90


def reconciled_demand_forecast(branch_id: str, horizon: int = HORIZON,
                               lookback: int = LOOKBACK_DAYS):
    """7-day daily withdrawal-demand forecast (mean, std) in RAW PKR from the reconciled
    ledger, day-of-week shaped. Returns (mean[H], std[H], meta) or None if no data."""
    import sqlite3
    con = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        "SELECT date, total_withdrawal_flow_m FROM fact_gl_daily "
        "WHERE branch_id = ? ORDER BY date DESC LIMIT ?",
        con, params=(branch_id, lookback))
    con.close()
    if df.empty:
        return None

    df["dt"] = pd.to_datetime(df["date"])
    df["dow"] = df["dt"].dt.dayofweek
    wd = df["total_withdrawal_flow_m"].astype(float)
    overall_mean = float(wd.mean())
    overall_std = float(wd.std(ddof=0)) or max(overall_mean * 0.1, 1e-3)
    dow_mean = df.groupby("dow")["total_withdrawal_flow_m"].mean()

    last = df["dt"].max()
    means_m, stds_m = [], []
    for h in range(1, horizon + 1):
        dow = (last + pd.Timedelta(days=h)).dayofweek
        means_m.append(float(dow_mean.get(dow, overall_mean)))
        stds_m.append(overall_std)

    mean_raw = np.asarray(means_m, dtype=np.float64) * 1e6   # PKR M -> raw PKR
    std_raw = np.asarray(stds_m, dtype=np.float64) * 1e6
    meta = {
        "source": "fact_gl_daily.total_withdrawal_flow_m (reconciled)",
        "lookback_days": int(len(df)),
        "avg_daily_withdrawal_m": round(overall_mean, 2),
        "std_daily_withdrawal_m": round(overall_std, 2),
        "as_of": str(df["date"].max()),
    }
    return mean_raw, std_raw, meta
