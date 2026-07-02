"""
Exceptions Queue (Phase 4 — scalable human-in-the-loop oversight)
=================================================================
This is the payoff of the honest conformal bands. Instead of asking a human to approve
~3,700 node recommendations a day, the engine AUTO-HANDLES the confident majority and
routes only the uncertain minority to a human — each flagged item arriving WITH the
reason it was flagged, the SHAP drivers, and any constitution violation.

A branch is flagged when EITHER:
  * forecast uncertainty is high  — conformal band_pct (already computed by the frozen
    model) exceeds BAND_PCT_THRESHOLD at any horizon, OR
  * the recommendation breaches a HARD constitution rule (auto-flag, always escalates).

Everything is grounded in signals that already exist: band_pct from the conformal
intervals, SHAP from forecast_attribution, limits from the Cash Constitution. No new ML.
Amounts in PKR Millions.
"""
from __future__ import annotations

import sqlite3

import numpy as np
import pandas as pd

from app.config import settings
from app.core.cash_constitution import CONSTITUTION
from app.services.forecast_attribution import (
    _top_drivers, build_forecast_frame, shap_drivers)
from app.services.managed_level_forecast import DB_PATH, get_service

# % half-width above which a forecast is "uncertain" and escalates to a human.
# Sourced from config.OVERSIGHT_BAND_THRESHOLD — a documented capacity-driven operations
# knob (see app/config.py), NOT a forecaster parameter. 50% yields a genuine minority
# (~16% of nodes) at a calm origin; the flagged share grows during known-hard windows
# (pre-Eid/Ramadan) BY DESIGN — exactly where human attention should concentrate.
BAND_PCT_THRESHOLD = settings.OVERSIGHT_BAND_THRESHOLD


def _branch_meta_full() -> pd.DataFrame:
    con = sqlite3.connect(DB_PATH)
    b = pd.read_sql_query(
        "SELECT branch_id, branch_type, city, vault_capacity, optimal_vault_balance, "
        "current_vault_balance, avg_daily_withdrawals FROM branches", con)
    con.close()
    b["vault_capacity_m"] = b["vault_capacity"] / 1e6
    b["optimal_m"] = b["optimal_vault_balance"] / 1e6
    b["current_m"] = b["current_vault_balance"].fillna(0) / 1e6
    # SBP operational minimum, same definition as business_output.vault_recommendation.
    b["vault_min_m"] = np.maximum((b["avg_daily_withdrawals"].fillna(0) / 1e6) * 0.3, 2.0)
    return b


def _descriptor(row: pd.Series) -> str:
    """Compact segment label for the flag reason, e.g. 'pre-Eid HUB' / 'salary-window DEFICIT'."""
    tags = []
    if int(row.get("tgt_is_pre_eid_surge", 0)) == 1:
        tags.append("pre-Eid")
    if int(row.get("tgt_is_salary_window", 0)) == 1:
        tags.append("salary-window")
    if int(row.get("tgt_is_ramadan", 0)) == 1:
        tags.append("Ramadan")
    tags.append(str(row.get("branch_type", "")))
    return " ".join(t for t in tags if t)


def build_queue(origin_date: str | None = None, band_threshold: float = BAND_PCT_THRESHOLD,
                limit: int | None = None) -> dict:
    """Score every branch at one origin; return the flagged set ranked by priority."""
    svc = get_service()
    if origin_date is None:
        origin_dt = svc._feat_tbl["date_dt"].max() - pd.Timedelta(days=7)
    else:
        origin_dt = pd.Timestamp(origin_date)

    ev, X = build_forecast_frame(svc, origin_dt)
    contribs, _ = shap_drivers(svc, X)
    ev = ev.reset_index(drop=True)
    meta = _branch_meta_full().set_index("branch_id")

    total_nodes = ev["branch_id"].nunique()
    flagged = []

    for bid, grp in ev.groupby("branch_id"):
        gi = grp.index.to_numpy()
        max_pos = gi[int(np.argmax(grp["band_pct_disp"].values))]
        worst = ev.loc[max_pos]
        max_band = float(grp["band_pct_disp"].max())
        mean_band = float(grp["band_pct_disp"].mean())
        pred_worst = float(worst["predicted"])

        # Constitution check on the branch's CURRENT vault position (a standing breach of
        # the insured maximum / operational minimum is a hard exception regardless of the
        # forecast). Uses the same limits as business_output.vault_recommendation.
        m = meta.loc[bid] if bid in meta.index else None
        plan = {"vault_balance_m": float(m["current_m"]) if m is not None else pred_worst}
        if m is not None:
            plan["vault_capacity_m"] = float(m["vault_capacity_m"])
            plan["vault_min_m"] = float(m["vault_min_m"])
        rec = CONSTITUTION.enforce(plan, {"action": "VAULT_POSITION",
                                          "current_m": plan["vault_balance_m"]})
        hard = [v for v in rec["constitution_violations"] if v["severity"] == "hard"]

        wide = max_band > band_threshold
        if not (wide or hard):
            continue   # auto-handled

        drivers = _top_drivers(contribs[max_pos])
        if hard:
            reason = f"constitution: {rec['block_reason']} (±{max_band:.0f}% band)"
        else:
            reason = f"wide band: {_descriptor(worst)}, ±{max_band:.0f}%"

        flagged.append({
            "branch_id": bid,
            "branch_type": str(worst.get("branch_type", "")),
            "city": str(m["city"]) if m is not None else None,
            "origin_date": pd.Timestamp(origin_dt).date().isoformat(),
            "worst_horizon": int(worst["h"]),
            "worst_target_date": pd.Timestamp(worst["target_dt"]).date().isoformat(),
            "predicted_m": round(pred_worst, 3),
            "lower_m": round(float(worst["lower"]), 3),
            "upper_m": round(float(worst["upper"]), 3),
            "max_band_pct": round(max_band, 2),
            "mean_band_pct": round(mean_band, 2),
            "constitution_status": rec["constitution_status"],
            "hard_violations": hard,
            "reason": reason,
            "drivers": drivers,
            # priority: hard breaches first, then by band width
            "_priority": (1 if hard else 0, max_band),
        })

    flagged.sort(key=lambda r: r["_priority"], reverse=True)
    for r in flagged:
        del r["_priority"]
    if limit:
        flagged = flagged[:limit]

    hard_count = sum(1 for r in flagged if r["constitution_status"] == "BLOCKED")
    return {
        "origin_date": pd.Timestamp(origin_dt).date().isoformat(),
        "band_pct_threshold": band_threshold,
        "policy": {
            "name": "OVERSIGHT_BAND_THRESHOLD",
            "value_pct": band_threshold,
            "is_default": abs(band_threshold - settings.OVERSIGHT_BAND_THRESHOLD) < 1e-9,
            "rationale": ("Capacity-driven operations knob (config, not a forecaster "
                          "parameter): branches with a 7-day band wider than this route to "
                          "human review. Tune to reviewer capacity; the share rises in "
                          "pre-Eid/Ramadan by design."),
        },
        "total_nodes": int(total_nodes),
        "auto_handled": int(total_nodes - len(flagged)),
        "flagged_count": len(flagged),
        "flagged_pct": round(100.0 * len(flagged) / total_nodes, 1) if total_nodes else 0.0,
        "blocked_count": hard_count,
        "exceptions": flagged,
    }
