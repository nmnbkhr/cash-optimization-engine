"""
Forecast Lab — multi-model comparison (additive; does not touch ensemble_forecast)
═══════════════════════════════════════════════════════════════════════════════════
Trains and compares three forecasters for ONE branch's daily cash flow, so the analyst
can see HOW each model works, its accuracy BY HORIZON, interval coverage, feature
importances, and tune every knob:

  • xgboost  — direct multi-horizon gradient boosting on engineered lag/rolling/calendar
               features (h is a model feature). Reports feature importances.
  • sarima   — statsmodels SARIMAX, weekly-seasonal (order + seasonal_order tunable).
  • prophet  — additive/multiplicative trend + weekly/yearly seasonality.

Accuracy is a rolling-origin backtest: for each of the last `origins` origins we refit on
history up to that origin, forecast `horizon` steps, and score against the realised
values. Errors are aggregated per horizon (day+1 … day+H) and overall. Intervals are
model-native (SARIMA conf_int, Prophet yhat_lower/upper) or split-residual for XGBoost;
coverage = fraction of realised points that fell inside the band.

All amounts in PKR Millions. Anchored to _as_of() = latest ledger date on/before today,
consistent with the reconciled business layer.
"""
from __future__ import annotations

import logging
import sqlite3
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

DB_PATH = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")

TARGETS = {
    "withdrawal": "total_withdrawal_flow_m",
    "deposit": "total_deposit_flow_m",
}

# Numeric calendar features shared by the ML model (target-date calendar is leakage-safe:
# the Pakistani banking calendar is deterministic and known for any future date).
_CAL_FEATS = [
    "day_of_week", "is_weekend", "is_friday", "is_bank_holiday",
    "is_salary_window", "days_to_payday", "is_pre_eid_surge",
    "days_to_eid_fitr", "days_to_eid_adha", "is_ramadan", "ramadan_day",
    "is_month_end", "is_quarter_end", "is_pre_holiday", "is_post_holiday", "is_bridge_day",
]

MODEL_KEYS = ("xgboost", "sarima", "prophet")

# Sensible defaults; every one is overridable via the `params` payload.
DEFAULT_PARAMS = {
    "xgboost": {"n_estimators": 300, "max_depth": 5, "learning_rate": 0.05},
    "sarima": {"p": 1, "d": 1, "q": 1, "P": 1, "D": 0, "Q": 1, "s": 7},
    "prophet": {"seasonality_mode": "additive", "weekly_seasonality": True,
                "yearly_seasonality": True},
}


def _mape(actual: np.ndarray, pred: np.ndarray, floor: float = 0.5) -> float:
    a, p = np.asarray(actual, float), np.asarray(pred, float)
    denom = np.maximum(np.abs(a), floor)      # floor guards near-zero flow days
    return float(np.mean(np.abs(a - p) / denom) * 100.0)


def _smape(actual: np.ndarray, pred: np.ndarray) -> float:
    a, p = np.asarray(actual, float), np.asarray(pred, float)
    denom = (np.abs(a) + np.abs(p)) / 2.0
    denom = np.where(denom == 0, 1.0, denom)
    return float(np.mean(np.abs(a - p) / denom) * 100.0)


def _mae(actual: np.ndarray, pred: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(actual, float) - np.asarray(pred, float))))


class ForecastLab:
    def __init__(self):
        self._con = None

    def _get_con(self):
        # busy timeout: promotion writes run alongside the live API's readers; SQLite allows
        # a single writer, so wait for the lock instead of failing immediately (default 0ms).
        return sqlite3.connect(DB_PATH, timeout=30)

    def _as_of(self) -> str | None:
        con = self._get_con()
        try:
            today = str(date.today())
            row = con.execute(
                "SELECT MAX(date) FROM fact_gl_daily WHERE date <= ?", (today,)
            ).fetchone()
            d = row[0] if row and row[0] else None
            if not d:
                row = con.execute("SELECT MIN(date) FROM fact_gl_daily").fetchone()
                d = row[0] if row else None
            return d
        finally:
            con.close()

    # ── data ──────────────────────────────────────────────────────────────────
    def _load(self, branch_id: str, target: str) -> pd.DataFrame:
        """Daily series for one branch: date, y (target flow, PKR M) + calendar features,
        sorted ascending, truncated at the as-of date."""
        col = TARGETS[target]
        as_of = self._as_of()
        con = self._get_con()
        try:
            gl = pd.read_sql_query(
                f"SELECT date, {col} AS y FROM fact_gl_daily "
                "WHERE branch_id = ? AND date <= ? ORDER BY date",
                con, params=(branch_id, as_of),
            )
            cal = pd.read_sql_query("SELECT * FROM dim_calendar", con)
        finally:
            con.close()
        if gl.empty:
            return gl
        cal = cal.drop(columns=[c for c in ("holiday_name", "holiday_type") if c in cal.columns])
        df = gl.merge(cal, on="date", how="left")
        for c in _CAL_FEATS:
            if c not in df.columns:
                df[c] = 0
        df[_CAL_FEATS] = df[_CAL_FEATS].fillna(0)
        df["y"] = df["y"].astype(float).fillna(0.0)
        df["date_dt"] = pd.to_datetime(df["date"])
        return df.reset_index(drop=True)

    # ── XGBoost (direct multi-horizon) ──────────────────────────────────────────
    _ORIGIN_FEATS = ["y_now", "y_lag1", "y_lag7", "y_roll7_mean", "y_roll7_std", "y_roll30_mean"]

    def _origin_row(self, y: np.ndarray, t: int) -> dict:
        """Leakage-safe origin features from indices <= t."""
        def at(i):
            return float(y[i]) if i >= 0 else float(y[0])
        w7 = y[max(0, t - 6): t + 1]
        w30 = y[max(0, t - 29): t + 1]
        return {
            "y_now": at(t), "y_lag1": at(t - 1), "y_lag7": at(t - 7),
            "y_roll7_mean": float(np.mean(w7)), "y_roll7_std": float(np.std(w7)),
            "y_roll30_mean": float(np.mean(w30)),
        }

    def _xgb_feature_cols(self):
        return self._ORIGIN_FEATS + ["h"] + _CAL_FEATS

    def _fit_forecast_xgb(self, df: pd.DataFrame, origin: int, horizon: int,
                          params: dict, level: float, target_cal: np.ndarray | None = None):
        """Train direct multi-horizon XGB on rows with origin index <= `origin`, then
        forecast h=1..H from `origin`. When `target_cal` (H×len(_CAL_FEATS)) is given it
        supplies the target-date calendar for the forecast step — needed to forecast dates
        beyond the loaded series (promotion). Returns (preds, lower, upper, importances)."""
        import xgboost as xgb

        y = df["y"].values
        cal = df[_CAL_FEATS].values
        feat_cols = self._xgb_feature_cols()

        rows, labels, torigin = [], [], []
        for t in range(7, origin + 1):                 # need >=7 history for lag7
            orow = self._origin_row(y, t)
            for h in range(1, horizon + 1):
                tgt = t + h
                if tgt > origin:                        # label must be known (<= origin)
                    continue
                feat = dict(orow)
                feat["h"] = h
                for j, c in enumerate(_CAL_FEATS):
                    feat[c] = float(cal[tgt, j])
                rows.append([feat[c] for c in feat_cols])
                labels.append(float(y[tgt]))
                torigin.append(t)
        if len(rows) < 30:
            raise ValueError("insufficient history for XGBoost")

        X = np.asarray(rows, float)
        Y = np.asarray(labels, float)
        t_arr = np.asarray(torigin)
        hcol = X[:, feat_cols.index("h")]

        def _mk():
            return xgb.XGBRegressor(
                n_estimators=int(params.get("n_estimators", 300)),
                max_depth=int(params.get("max_depth", 5)),
                learning_rate=float(params.get("learning_rate", 0.05)),
                subsample=0.9, colsample_bytree=0.9, objective="reg:squarederror",
                n_jobs=2, random_state=42,
            )

        # Split-conformal: fit on the earlier origins, calibrate the interval on the most
        # recent ~20% of origins (out-of-sample residuals → honest coverage). The point
        # model is then refit on ALL rows so the forecast uses the full history.
        uniq_t = np.unique(t_arr)
        cut = uniq_t[int(len(uniq_t) * 0.8)] if len(uniq_t) > 10 else uniq_t[-1]
        fit_mask, cal_mask = t_arr < cut, t_arr >= cut
        q = {}
        if cal_mask.sum() >= horizon:
            cal_model = _mk(); cal_model.fit(X[fit_mask], Y[fit_mask])
            cal_resid = np.abs(Y[cal_mask] - cal_model.predict(X[cal_mask]))
            cal_h = hcol[cal_mask]
            for h in range(1, horizon + 1):
                r = cal_resid[cal_h == h]
                q[h] = float(np.quantile(r, level)) if len(r) else float(np.quantile(cal_resid, level))

        model = _mk(); model.fit(X, Y)
        if not q:                                       # fallback: in-sample (tight) residuals
            resid = np.abs(Y - model.predict(X))
            for h in range(1, horizon + 1):
                r = resid[hcol == h]
                q[h] = float(np.quantile(r, level)) if len(r) else float(np.quantile(resid, level))

        # Forecast from `origin`
        orow = self._origin_row(y, origin)
        preds, lower, upper = [], [], []
        for h in range(1, horizon + 1):
            tgt = origin + h
            feat = dict(orow); feat["h"] = h
            for j, c in enumerate(_CAL_FEATS):
                if target_cal is not None:
                    feat[c] = float(target_cal[h - 1, j])
                else:
                    feat[c] = float(cal[tgt, j]) if tgt < len(cal) else 0.0
            p = float(model.predict(np.asarray([[feat[c] for c in feat_cols]], float))[0])
            preds.append(p); lower.append(p - q[h]); upper.append(p + q[h])

        imp = sorted(
            [{"feature": c, "importance": round(float(v), 4)}
             for c, v in zip(feat_cols, model.feature_importances_)],
            key=lambda d: -d["importance"],
        )
        return np.array(preds), np.array(lower), np.array(upper), imp

    # ── SARIMA ──────────────────────────────────────────────────────────────────
    def _fit_forecast_sarima(self, df: pd.DataFrame, origin: int, horizon: int,
                             params: dict, level: float):
        from statsmodels.tsa.statespace.sarimax import SARIMAX

        y = df["y"].values[: origin + 1]
        order = (int(params.get("p", 1)), int(params.get("d", 1)), int(params.get("q", 1)))
        seas = (int(params.get("P", 1)), int(params.get("D", 0)),
                int(params.get("Q", 1)), int(params.get("s", 7)))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = SARIMAX(y, order=order, seasonal_order=seas,
                          enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
            fc = res.get_forecast(steps=horizon)
            mean = np.asarray(fc.predicted_mean, float)
            ci = fc.conf_int(alpha=1 - level)
        ci = np.asarray(ci, float)
        return mean, ci[:, 0], ci[:, 1], None

    # ── Prophet ───────────────────────────────────────────────────────────────
    def _fit_forecast_prophet(self, df: pd.DataFrame, origin: int, horizon: int,
                              params: dict, level: float):
        from prophet import Prophet

        logging.getLogger("prophet").setLevel(logging.CRITICAL)
        logging.getLogger("cmdstanpy").setLevel(logging.CRITICAL)
        train = pd.DataFrame({
            "ds": df["date_dt"].values[: origin + 1],
            "y": df["y"].values[: origin + 1],
        })
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m = Prophet(
                interval_width=level,
                seasonality_mode=params.get("seasonality_mode", "additive"),
                weekly_seasonality=bool(params.get("weekly_seasonality", True)),
                yearly_seasonality=bool(params.get("yearly_seasonality", True)),
                daily_seasonality=False,
            )
            m.fit(train)
            future = m.make_future_dataframe(periods=horizon, freq="D")
            out = m.predict(future).tail(horizon)
        return (out["yhat"].values, out["yhat_lower"].values, out["yhat_upper"].values, None)

    _DISPATCH = {
        "xgboost": "_fit_forecast_xgb",
        "sarima": "_fit_forecast_sarima",
        "prophet": "_fit_forecast_prophet",
    }

    # ── orchestration ───────────────────────────────────────────────────────────
    def run(self, branch_id: str, target: str = "withdrawal", horizon: int = 7,
            models=None, params=None, origins: int = 5) -> dict:
        if target not in TARGETS:
            return {"error": f"target must be one of {list(TARGETS)}"}
        horizon = max(1, min(int(horizon), 14))
        origins = max(1, min(int(origins), 12))
        models = [m for m in (models or list(MODEL_KEYS)) if m in MODEL_KEYS] or list(MODEL_KEYS)
        params = params or {}

        df = self._load(branch_id, target)
        if df.empty or len(df) < 60:
            return {"error": f"Branch {branch_id} has insufficient reconciled history "
                             f"({0 if df.empty else len(df)} days; need >= 60)"}

        n = len(df)
        last = n - 1
        # Rolling origins: each must leave `horizon` realised days ahead to score against.
        origin_idxs = [last - horizon - k for k in range(origins)]
        origin_idxs = [o for o in origin_idxs if o >= 40]        # need training history
        if not origin_idxs:
            return {"error": "not enough history for the requested horizon/origins"}
        origin_idxs = sorted(origin_idxs)

        results = {}
        for key in models:
            resolved = {**DEFAULT_PARAMS.get(key, {}), **(params.get(key) or {})}
            per_h = {h: {"ape": [], "cov": []} for h in range(1, horizon + 1)}
            last_path = None
            importances = None
            err = None
            try:
                fn = getattr(self, self._DISPATCH[key])
                for oi in origin_idxs:
                    out = fn(df, oi, horizon, resolved, 0.90)
                    preds, lo, hi, imp = out
                    actual = df["y"].values[oi + 1: oi + 1 + horizon]
                    if imp is not None:
                        importances = imp
                    for i in range(len(actual)):
                        h = i + 1
                        per_h[h]["ape"].append(abs(actual[i] - preds[i]) / max(abs(actual[i]), 0.5) * 100.0)
                        per_h[h]["cov"].append(1.0 if lo[i] <= actual[i] <= hi[i] else 0.0)
                    if oi == origin_idxs[-1]:
                        dates = df["date"].values[oi + 1: oi + 1 + horizon]
                        last_path = [
                            {"date": str(dates[i]), "h": i + 1,
                             "yhat": round(float(preds[i]), 2),
                             "lower": round(float(lo[i]), 2), "upper": round(float(hi[i]), 2),
                             "actual": round(float(actual[i]), 2)}
                            for i in range(len(actual))
                        ]
                all_ape = [a for h in per_h for a in per_h[h]["ape"]]
                all_cov = [c for h in per_h for c in per_h[h]["cov"]]
                by_horizon = [
                    {"h": h,
                     "mape": round(float(np.mean(per_h[h]["ape"])), 1) if per_h[h]["ape"] else None,
                     "coverage": round(float(np.mean(per_h[h]["cov"])) * 100, 0) if per_h[h]["cov"] else None}
                    for h in range(1, horizon + 1)
                ]
                results[key] = {
                    "status": "ok",
                    "params": resolved,
                    "metrics": {
                        "mape": round(float(np.mean(all_ape)), 1) if all_ape else None,
                        "coverage_pct": round(float(np.mean(all_cov)) * 100, 0) if all_cov else None,
                        "by_horizon": by_horizon,
                    },
                    "forecast": last_path or [],
                    "feature_importances": importances,
                }
            except Exception as e:                       # one model failing must not sink the rest
                logger.exception("forecast_lab %s failed", key)
                err = f"{type(e).__name__}: {e}"
                results[key] = {"status": "error", "error": err, "params": resolved}

        ok = {k: v for k, v in results.items() if v.get("status") == "ok" and v["metrics"]["mape"] is not None}
        best = min(ok, key=lambda k: ok[k]["metrics"]["mape"]) if ok else None

        history = [
            {"date": str(d), "value": round(float(v), 2)}
            for d, v in zip(df["date"].values[-40:], df["y"].values[-40:])
        ]

        return {
            "meta": {
                "branch_id": branch_id,
                "target": target,
                "target_column": TARGETS[target],
                "horizon": horizon,
                "origins": len(origin_idxs),
                "as_of": self._as_of(),
                "train_points": n,
                "unit": "PKR Millions",
            },
            "models": results,
            "best_model": best,
            "history": history,
            "feature_glossary": {
                "origin_features": self._ORIGIN_FEATS,
                "calendar_features": _CAL_FEATS,
                "note": "XGBoost uses these; SARIMA/Prophet are univariate on y with built-in seasonality.",
            },
        }

    # ── promotion (Lab → production forecasts table) ────────────────────────────
    def _future_calendar(self, as_of: str, horizon: int):
        """(dates, cal_array) for the `horizon` calendar days AFTER as_of, from dim_calendar."""
        con = self._get_con()
        try:
            cal = pd.read_sql_query(
                "SELECT * FROM dim_calendar WHERE date > ? ORDER BY date LIMIT ?",
                con, params=(as_of, horizon),
            )
        finally:
            con.close()
        for c in _CAL_FEATS:
            if c not in cal.columns:
                cal[c] = 0
        cal[_CAL_FEATS] = cal[_CAL_FEATS].fillna(0)
        return cal["date"].tolist(), cal[_CAL_FEATS].values.astype(float)

    def promote(self, branch_id: str, target: str = "withdrawal", horizon: int = 7,
                model: str = "xgboost", params: dict = None, mape: float = None) -> dict:
        """Train the chosen model on full history and WRITE its forward forecast into the
        `forecasts` table (entity_type=branch_<target>s), so business_output's forecast-driven
        optimizer consumes it. This is the Lab→production link. Replaces any prior promoted
        rows for this branch+entity. All amounts PKR M (table convention)."""
        if target not in TARGETS:
            return {"error": f"target must be one of {list(TARGETS)}"}
        if model not in MODEL_KEYS:
            return {"error": f"model must be one of {list(MODEL_KEYS)}"}
        horizon = max(1, min(int(horizon), 14))
        resolved = {**DEFAULT_PARAMS.get(model, {}), **(params or {})}

        df = self._load(branch_id, target)
        if df.empty or len(df) < 60:
            return {"error": f"Branch {branch_id} has insufficient history"}
        as_of = self._as_of()
        fut_dates, fut_cal = self._future_calendar(as_of, horizon)
        if not fut_dates:
            return {"error": "no future calendar dates available"}
        h = len(fut_dates)
        origin = len(df) - 1

        try:
            if model == "xgboost":
                preds, lo, hi, _ = self._fit_forecast_xgb(df, origin, h, resolved, 0.90, target_cal=fut_cal)
            elif model == "sarima":
                preds, lo, hi, _ = self._fit_forecast_sarima(df, origin, h, resolved, 0.90)
            else:
                preds, lo, hi, _ = self._fit_forecast_prophet(df, origin, h, resolved, 0.90)
        except Exception as e:
            logger.exception("promote %s failed", model)
            return {"error": f"{type(e).__name__}: {e}"}

        from datetime import datetime
        entity_type = f"branch_{target}s"          # branch_withdrawals | branch_deposits
        model_version = f"forecast_lab:{model}"
        created = datetime.now().isoformat()        # real timestamp → newest promotion wins
        con = self._get_con()
        try:
            con.execute(
                "DELETE FROM forecasts WHERE entity_type=? AND entity_id=? AND model_version LIKE 'forecast_lab:%'",
                (entity_type, branch_id),
            )
            for i, d in enumerate(fut_dates):
                con.execute(
                    "INSERT INTO forecasts (entity_type, entity_id, forecast_date, target_date, "
                    "predicted_value, confidence_lower, confidence_upper, mape, model_version, created_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (entity_type, branch_id, as_of, d,
                     float(preds[i]), float(lo[i]), float(hi[i]),
                     float(mape) if mape is not None else None, model_version, created),
                )
            con.commit()
        finally:
            con.close()

        return {
            "promoted": True, "branch_id": branch_id, "target": target,
            "entity_type": entity_type, "model": model, "model_version": model_version,
            "as_of": as_of, "horizon": h, "rows_written": h,
            "forecast": [
                {"target_date": fut_dates[i], "yhat": round(float(preds[i]), 2),
                 "lower": round(float(lo[i]), 2), "upper": round(float(hi[i]), 2)}
                for i in range(h)
            ],
            "note": f"Live: {entity_type} forecast now drives the vault base-stock target for {branch_id}.",
        }

    def promote_all(self, target: str = "withdrawal", model: str = "xgboost") -> dict:
        """Network-wide promotion. Delegates to the ensemble XGBoost+conformal forecaster
        (one global model, all branches, fast) which writes branch_deposits/branch_withdrawals
        to the forecasts table — consumed by the base-stock optimizer for EVERY branch.

        Only XGBoost is supported network-wide (SARIMA/Prophet are per-branch via promote()),
        matching the cost profile: one global fit vs 1,532 univariate fits."""
        if model != "xgboost":
            return {"error": "Network promotion supports 'xgboost' only. "
                             "Use per-branch Promote for SARIMA/Prophet (they refit per series)."}
        if target not in TARGETS:
            return {"error": f"target must be one of {list(TARGETS)}"}
        from datetime import datetime
        try:
            import numpy as _np
            from app.services.ensemble_forecast import get_forecast_service
            svc = get_forecast_service()
            if not getattr(svc, "is_trained", False):
                tr = svc.train()
                if isinstance(tr, dict) and tr.get("status") != "trained":
                    return {"error": f"ensemble training failed: {tr.get('message')}"}

            # Load + engineer ONCE (the ensemble's own predict_all reloaded the 2.24M-row
            # ledger per branch — O(branches × dataset). Here we engineer once and predict
            # every branch's latest feature row in a single vectorized conformal call.)
            df = svc._engineer_features(svc._load_data())
            last_rows = df.sort_values("date").groupby("branch_id").tail(1)
            bids = last_rows["branch_id"].tolist()
            X = last_rows[svc._feature_cols].values.astype(float)

            cmodel = svc.withdrawal_conformal if target == "withdrawal" else svc.deposit_conformal
            res = cmodel.predict(X)
            if isinstance(res, tuple) and len(res) == 2:
                y_pred, intervals = res
                y_pred = _np.asarray(y_pred, float).ravel()
                intervals = _np.asarray(intervals, float)
            else:
                y_pred = _np.asarray(res, float).ravel()
                intervals = None
            mape = (svc.metrics or {}).get(f"mape_{target}s")

            as_of = self._as_of()
            fut_dates, _ = self._future_calendar(as_of, 7)
            created = datetime.now().isoformat()
            entity_type = f"branch_{target}s"
            mv = "forecast_lab:network-xgb"

            rows = []
            for i, bid in enumerate(bids):
                point = float(y_pred[i])
                if intervals is not None and intervals.ndim == 3:
                    lo, hi = float(intervals[i, 0, 0]), float(intervals[i, 1, 0])
                else:
                    lo, hi = point * 0.8, point * 1.2
                for d in fut_dates:
                    rows.append((entity_type, bid, as_of, d, point, lo, hi,
                                 float(mape) if mape is not None else None, mv, created))

            con = self._get_con()
            try:
                con.execute("DELETE FROM forecasts WHERE entity_type=? AND model_version=?",
                            (entity_type, mv))
                con.executemany(
                    "INSERT INTO forecasts (entity_type, entity_id, forecast_date, target_date, "
                    "predicted_value, confidence_lower, confidence_upper, mape, model_version, created_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)", rows,
                )
                con.commit()
            finally:
                con.close()
        except Exception as e:
            logger.exception("promote_all failed")
            return {"error": f"{type(e).__name__}: {e}"}

        return {
            "promoted_all": True,
            "model": "forecast_lab:network-xgb (ensemble global XGBoost + conformal)",
            "target": target,
            "branches": len(bids),
            "rows_written": len(rows),
            "mape": mape,
            "as_of": as_of,
            "note": "All branches now carry a withdrawal forecast; the base-stock optimizer is "
                    "forecast-driven network-wide. Per-branch Promote overrides a specific "
                    "branch (most recent promotion wins).",
        }

    def defaults(self) -> dict:
        """Config the UI needs to render controls: model list, param schema, ranges."""
        return {
            "targets": list(TARGETS),
            "models": list(MODEL_KEYS),
            "horizon": {"default": 7, "min": 1, "max": 14},
            "origins": {"default": 5, "min": 1, "max": 12},
            "default_params": DEFAULT_PARAMS,
            "interval_level": 0.90,
        }


_LAB = None


def get_lab() -> ForecastLab:
    global _LAB
    if _LAB is None:
        _LAB = ForecastLab()
    return _LAB
