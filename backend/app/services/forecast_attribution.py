"""
Forecast Attribution (Phase 4 — oversight layer)
================================================
Explains the FROZEN T3 managed-level model without retraining it. Uses XGBoost's native
TreeSHAP (`booster.predict(..., pred_contribs=True)`), which yields exact SHAP values for
tree models — identical to shap.TreeExplainer but with no extra dependency.

For each (branch, horizon) forecast it returns the top-3 signed drivers as contributions
in PKR Millions and as a % share of the explained move, e.g.:
    "+4.1 M:  55% salary_window,  30% withdrawal_trend,  15% pre_eid"

This module is READ-ONLY against the frozen service: it reuses the trained model, the
conformal quantiles, and the service's own _segment()/_apply_interval() methods and
feature tables. It never mutates managed_level_forecast.py. Amounts in PKR Millions.
"""
from __future__ import annotations

import json
import sqlite3

import numpy as np
import pandas as pd
import xgboost as xgb

from app.services.managed_level_forecast import (
    DB_PATH, FEATURE_COLS, HORIZONS, MODEL_VERSION, _TGT_CAL, get_service)

# Human-readable labels for the model's feature columns.
FEATURE_LABELS = {
    "t3_now": "current_level", "t3_lag1": "level_yesterday", "t3_lag7": "level_last_week",
    "t3_roll7_mean": "level_trend_7d", "t3_roll7_std": "level_volatility_7d",
    "t3_roll30_mean": "level_trend_30d",
    "dep_now": "deposit_today", "wth_now": "withdrawal_today",
    "dep_roll7": "deposit_trend_7d", "wth_roll7": "withdrawal_trend_7d",
    "net_roll7": "net_flow_trend_7d",
    "branch_type_enc": "branch_type", "city_enc": "city",
    "h": "horizon",
    "tgt_day_of_week": "day_of_week", "tgt_is_friday": "friday", "tgt_is_weekend": "weekend",
    "tgt_is_salary_window": "salary_window", "tgt_days_to_payday": "days_to_payday",
    "tgt_is_pre_eid_surge": "pre_eid", "tgt_days_to_eid_fitr": "days_to_eid_fitr",
    "tgt_days_to_eid_adha": "days_to_eid_adha",
    "tgt_is_ramadan": "ramadan", "tgt_ramadan_day": "ramadan_day",
    "tgt_is_month_end": "month_end", "tgt_is_quarter_end": "quarter_end",
    "tgt_is_pre_holiday": "pre_holiday", "tgt_is_post_holiday": "post_holiday",
    "tgt_is_bridge_day": "bridge_day", "tgt_is_bank_holiday": "bank_holiday",
}


def build_forecast_frame(svc, origin_dt: pd.Timestamp, branch_ids=None):
    """Mirror of ManagedLevelForecastService.forecast_path's feature assembly, but for an
    ARBITRARY origin date. Returns (ev_df, X) where ev_df has predicted/lower/upper/
    band_pct/segment/h/target_dt and X is the aligned feature matrix for SHAP.

    Reuses the frozen service's tables + _segment()/_apply_interval() (read-only)."""
    feat_tbl, cal = svc._feat_tbl, svc._cal_tbl
    origin_dt = pd.Timestamp(origin_dt)
    origins = feat_tbl[feat_tbl["date_dt"] == origin_dt].copy()
    if branch_ids:
        origins = origins[origins["branch_id"].isin(branch_ids)]
    origins = origins.merge(svc._branch_meta, on="branch_id", how="left")
    origins["branch_type"] = origins["branch_type"].fillna("BALANCED").astype(str)

    rows = []
    for h in HORIZONS:
        d = origins.copy()
        d["h"] = h
        d["target_dt"] = origin_dt + pd.Timedelta(days=h)
        d = d.merge(cal[["date_dt"] + _TGT_CAL], left_on="target_dt",
                    right_on="date_dt", how="left")
        d[_TGT_CAL] = d[_TGT_CAL].fillna(0)
        d["segment"] = svc._segment(d)
        rows.append(d)
    allh = pd.concat(rows, ignore_index=True)
    X = allh[FEATURE_COLS].values
    preds = svc.model.predict(X)
    ev = svc._apply_interval(allh, preds)
    ev["band_pct_disp"] = ev["band_pct"] * 100.0
    return ev, X


def _top_drivers(contribs_row: np.ndarray, k: int = 3) -> list[dict]:
    """contribs_row = SHAP values per feature (bias column already dropped).
    Returns top-k by |contribution|, signed PKR M + % share among the top-k."""
    order = np.argsort(np.abs(contribs_row))[::-1][:k]
    top_abs = float(np.sum(np.abs(contribs_row[order]))) or 1.0
    out = []
    for i in order:
        c = float(contribs_row[i])
        out.append({
            "feature": FEATURE_COLS[i],
            "label": FEATURE_LABELS.get(FEATURE_COLS[i], FEATURE_COLS[i]),
            "contribution_m": round(c, 3),
            "pct": round(100.0 * abs(c) / top_abs, 1),
            "direction": "up" if c >= 0 else "down",
        })
    return out


def shap_drivers(svc, X: np.ndarray, k: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Returns (contribs without bias [n, F], bias [n]) via native TreeSHAP."""
    booster = svc.model.get_booster()
    raw = booster.predict(xgb.DMatrix(X, feature_names=FEATURE_COLS), pred_contribs=True)
    return raw[:, :-1], raw[:, -1]


def attribution_for_branch(branch_id: str, origin_dt=None, k: int = 3) -> dict:
    """Top-k signed SHAP drivers for one branch's 7-day path (acceptance b)."""
    svc = get_service()
    if origin_dt is None:
        origin_dt = svc._feat_tbl["date_dt"].max() - pd.Timedelta(days=7)
    ev, X = build_forecast_frame(svc, origin_dt, branch_ids=[branch_id])
    if ev.empty:
        return {"branch_id": branch_id, "error": "no origin row for this branch/date"}
    contribs, _ = shap_drivers(svc, X, k=k)
    ev = ev.reset_index(drop=True)
    path = []
    for i, r in ev.iterrows():
        path.append({
            "horizon": int(r["h"]),
            "target_date": pd.Timestamp(r["target_dt"]).date().isoformat(),
            "predicted_m": round(float(r["predicted"]), 3),
            "band_pct": round(float(r["band_pct_disp"]), 2),
            "drivers": _top_drivers(contribs[i], k=k),
        })
    return {
        "branch_id": branch_id,
        "origin_date": pd.Timestamp(origin_dt).date().isoformat(),
        "model_version": MODEL_VERSION,
        "path": sorted(path, key=lambda x: x["horizon"]),
    }


def _ensure_table(con: sqlite3.Connection):
    con.execute("""
        CREATE TABLE IF NOT EXISTS forecast_drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id TEXT, origin_date TEXT, target_date TEXT, horizon INTEGER,
            model_version TEXT, predicted_m REAL, band_pct REAL,
            drivers_json TEXT, created_at TEXT DEFAULT (datetime('now'))
        )""")


def persist_attribution(attribution: dict) -> int:
    """Persist a branch's per-horizon drivers to the additive forecast_drivers table."""
    con = sqlite3.connect(DB_PATH)
    _ensure_table(con)
    n = 0
    for p in attribution.get("path", []):
        con.execute(
            "INSERT INTO forecast_drivers (entity_id, origin_date, target_date, horizon, "
            "model_version, predicted_m, band_pct, drivers_json) VALUES (?,?,?,?,?,?,?,?)",
            (attribution["branch_id"], attribution["origin_date"], p["target_date"],
             p["horizon"], attribution["model_version"], p["predicted_m"], p["band_pct"],
             json.dumps(p["drivers"])))
        n += 1
    con.commit()
    con.close()
    return n


def format_drivers(drivers: list[dict]) -> str:
    """One-line human string, e.g. '+4.1 M: 55% salary_window, 30% withdrawal_trend_7d'."""
    if not drivers:
        return "no significant drivers"
    net = sum(d["contribution_m"] for d in drivers)
    parts = ", ".join(f"{d['pct']:.0f}% {d['label']}" for d in drivers)
    return f"{net:+.1f} M: {parts}"
