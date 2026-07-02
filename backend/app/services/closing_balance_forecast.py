"""
Closing-Balance Forecast Service (UC-01, Phase 2)
=================================================
NORTH STAR: per branch, predict the 7-day-forward CLOSING BALANCE (h=1..7) with a
calibrated interval, and measure whether the realized closing fell within +/-12.5%
of the point prediction.

Design choices
--------------
* TARGET = reconciled `fact_gl_daily.closing_balance_m` (the vault chain already
  guarantees closing = opening + cash_in - cash_out + cit_in - cit_out, and
  opening[t+1] = closing[t]). We supervise the balance directly.

* DIRECT multi-horizon, with horizon `h` as a model feature (single XGBoost trained
  on stacked (branch, origin t, h) rows). Chosen over RECURSIVE because recursive
  feeds each day's prediction into the next and COMPOUNDS error across the 7 days;
  direct predicts closing[t+h] in one shot from features known at t plus the
  deterministic calendar of the target date t+h (holidays / salary / Eid are known
  in advance). One model + h-feature (vs 7 separate models) keeps it simple while
  still being direct.

* INTERVAL is conformalized on the CLOSING-BALANCE residual DIRECTLY (split conformal,
  the method MAPIE uses), stratified by horizon h x volatility segment
  (branch_type x is_salary_window x is_eid_window). We do NOT sum per-day flow
  intervals (flows are correlated -> the summed band balloons). See `_fit_conformal`.

All amounts in PKR Millions.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger(__name__)

DB_PATH = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")

HORIZONS = list(range(1, 8))          # h = 1..7 days
CONF_LEVEL = 0.95                     # conformal interval coverage
BAND = 0.125                          # business band: +/-12.5%
TEST_DAYS = 30                        # final holdout window (Task 4)
CAL_DAYS = 60                         # calibration window (held out, before test)
TRAIN_STRIDE = 4                      # subsample train origins for tractability
MIN_STRATUM = 60                      # min calibration points to trust a stratum's q
MODEL_VERSION = "uc01-closingbal-direct-xgb-v1"

# Origin features (known at time t) and target-date calendar features (known ahead).
_ORIGIN_FEATS = [
    "closing_now", "closing_lag1", "closing_lag7",
    "closing_roll7_mean", "closing_roll7_std", "closing_roll30_mean",
    "dep_now", "wth_now", "dep_roll7", "wth_roll7", "net_roll7",
    "branch_type_enc", "city_enc",
]
_TGT_CAL = [
    "tgt_day_of_week", "tgt_is_friday", "tgt_is_weekend",
    "tgt_is_salary_window", "tgt_days_to_payday",
    "tgt_is_pre_eid_surge", "tgt_days_to_eid_fitr", "tgt_days_to_eid_adha",
    "tgt_is_ramadan", "tgt_ramadan_day",
    "tgt_is_month_end", "tgt_is_quarter_end",
    "tgt_is_pre_holiday", "tgt_is_post_holiday", "tgt_is_bridge_day", "tgt_is_bank_holiday",
]
FEATURE_COLS = _ORIGIN_FEATS + ["h"] + _TGT_CAL


class ClosingBalanceForecastService:
    def __init__(self):
        self.model: xgb.XGBRegressor | None = None
        self.le_btype = LabelEncoder()
        self.le_city = LabelEncoder()
        self.conformal_q: dict = {}      # (segment, h) -> q   and  ("__h__", h) -> q  and ("__global__",) -> q
        self.coverage: dict = {}         # holdout coverage tables
        self.is_trained = False
        self._feat_tbl: pd.DataFrame | None = None   # per (branch, origin) features (for forecast_path)
        self._cal_tbl: pd.DataFrame | None = None     # per date calendar features
        self._branch_meta: pd.DataFrame | None = None

    # ------------------------------------------------------------------
    # Data assembly
    # ------------------------------------------------------------------
    def _load(self):
        con = sqlite3.connect(DB_PATH)
        gl = pd.read_sql_query(
            "SELECT date, branch_id, closing_balance_m, total_deposit_flow_m, "
            "total_withdrawal_flow_m FROM fact_gl_daily", con)
        branches = pd.read_sql_query(
            "SELECT branch_id, branch_type, city FROM branches", con)
        cal = pd.read_sql_query(
            "SELECT date, day_of_week, is_friday, is_weekend, is_salary_window, "
            "days_to_payday, is_pre_eid_surge, days_to_eid_fitr, days_to_eid_adha, "
            "is_ramadan, ramadan_day, is_month_end, is_quarter_end, is_pre_holiday, "
            "is_post_holiday, is_bridge_day, is_bank_holiday FROM dim_calendar", con)
        con.close()

        gl = gl.merge(branches, on="branch_id", how="left")
        gl["branch_type"] = gl["branch_type"].fillna("BALANCED").astype(str)
        gl["city"] = gl["city"].fillna("Unknown").astype(str)
        gl["branch_type_enc"] = self.le_btype.fit_transform(gl["branch_type"])
        gl["city_enc"] = self.le_city.fit_transform(gl["city"])
        gl["date_dt"] = pd.to_datetime(gl["date"])
        gl = gl.sort_values(["branch_id", "date_dt"]).reset_index(drop=True)

        # Origin features (all known at time t; closing[t] itself is allowed)
        g = gl.groupby("branch_id", sort=False)
        gl["closing_now"] = gl["closing_balance_m"]
        gl["closing_lag1"] = g["closing_balance_m"].shift(1)
        gl["closing_lag7"] = g["closing_balance_m"].shift(7)
        gl["closing_roll7_mean"] = g["closing_balance_m"].transform(lambda s: s.rolling(7, min_periods=1).mean())
        gl["closing_roll7_std"] = g["closing_balance_m"].transform(lambda s: s.rolling(7, min_periods=1).std())
        gl["closing_roll30_mean"] = g["closing_balance_m"].transform(lambda s: s.rolling(30, min_periods=1).mean())
        gl["dep_now"] = gl["total_deposit_flow_m"]
        gl["wth_now"] = gl["total_withdrawal_flow_m"]
        gl["dep_roll7"] = g["total_deposit_flow_m"].transform(lambda s: s.rolling(7, min_periods=1).mean())
        gl["wth_roll7"] = g["total_withdrawal_flow_m"].transform(lambda s: s.rolling(7, min_periods=1).mean())
        gl["net_roll7"] = gl["dep_roll7"] - gl["wth_roll7"]
        # Fill leading-lag NaNs with the origin's own closing (known, non-leaky)
        for c in ("closing_lag1", "closing_lag7"):
            gl[c] = gl[c].fillna(gl["closing_now"])
        gl["closing_roll7_std"] = gl["closing_roll7_std"].fillna(0.0)

        feat_tbl = gl[["branch_id", "date_dt", "closing_balance_m"] + _ORIGIN_FEATS].copy()

        # Target-date calendar (prefix tgt_); also carry the segment flags
        cal["date_dt"] = pd.to_datetime(cal["date"])
        cal = cal.rename(columns={c: f"tgt_{c}" for c in cal.columns if c not in ("date", "date_dt")})
        cal["is_eid_window"] = (cal["tgt_is_pre_eid_surge"] == 1).astype(int)

        self._feat_tbl = feat_tbl
        self._cal_tbl = cal
        self._branch_meta = branches
        return feat_tbl, cal

    def _segment(self, df: pd.DataFrame) -> pd.Series:
        return (df["branch_type"].astype(str) + "|sal"
                + df["tgt_is_salary_window"].astype(int).astype(str) + "|eid"
                + df["is_eid_window"].astype(int).astype(str))

    def _build_supervised(self, feat_tbl, cal, target_dates, stride=1) -> pd.DataFrame:
        """Stacked (branch, origin t, h) rows: origin features + target calendar,
        label = closing_balance at the target date t+h."""
        tdates = sorted(pd.to_datetime(sorted(target_dates)))
        if stride > 1:
            tdates = tdates[::stride]
        tset = pd.DatetimeIndex(tdates)

        # label rows (branch x target_date) restricted to chosen targets
        labels = feat_tbl[feat_tbl["date_dt"].isin(tset)][
            ["branch_id", "date_dt", "closing_balance_m"]
        ].rename(columns={"date_dt": "target_dt", "closing_balance_m": "y"})
        # attach branch_type string for segmentation
        labels = labels.merge(self._branch_meta[["branch_id", "branch_type"]], on="branch_id", how="left")
        labels["branch_type"] = labels["branch_type"].fillna("BALANCED").astype(str)

        origin_cols = ["branch_id", "date_dt"] + _ORIGIN_FEATS
        parts = []
        for h in HORIZONS:
            d = labels.copy()
            d["h"] = h
            d["origin_dt"] = d["target_dt"] - pd.Timedelta(days=h)
            d = d.merge(feat_tbl[origin_cols], left_on=["branch_id", "origin_dt"],
                        right_on=["branch_id", "date_dt"], how="inner")
            parts.append(d)
        sup = pd.concat(parts, ignore_index=True)
        sup = sup.merge(cal[["date_dt"] + _TGT_CAL + ["is_eid_window"]],
                        left_on="target_dt", right_on="date_dt", how="left")
        sup[_TGT_CAL] = sup[_TGT_CAL].fillna(0)
        sup["is_eid_window"] = sup["is_eid_window"].fillna(0)
        sup["segment"] = self._segment(sup)
        return sup

    # ------------------------------------------------------------------
    # Train + conformal
    # ------------------------------------------------------------------
    def train(self) -> dict:
        feat_tbl, cal = self._load()
        all_dates = pd.to_datetime(sorted(feat_tbl["date_dt"].unique()))
        test_dates = set(all_dates[-TEST_DAYS:])
        cal_dates = set(all_dates[-(TEST_DAYS + CAL_DAYS):-TEST_DAYS])
        # train targets must leave room for the longest lag/horizon; drop the first 31 days
        train_dates = set(all_dates[31:-(TEST_DAYS + CAL_DAYS)])

        logger.info("Building supervised frames (train stride=%d)...", TRAIN_STRIDE)
        train = self._build_supervised(feat_tbl, cal, train_dates, stride=TRAIN_STRIDE)
        calib = self._build_supervised(feat_tbl, cal, cal_dates, stride=1)
        test = self._build_supervised(feat_tbl, cal, test_dates, stride=1)

        self.model = xgb.XGBRegressor(
            n_estimators=300, max_depth=7, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1)
        self.model.fit(train[FEATURE_COLS].values, train["y"].values)

        self._fit_conformal(calib)

        # Held-out evaluation (Task 4) on the last 30 days
        self.coverage = self._evaluate(test)
        self.is_trained = True
        return {
            "status": "trained",
            "train_rows": len(train), "calib_rows": len(calib), "test_rows": len(test),
            "features": len(FEATURE_COLS),
            "horizons": HORIZONS,
            "coverage_overall": self.coverage["overall"],
        }

    def _fit_conformal(self, calib: pd.DataFrame):
        """Split-conformal on the CLOSING-BALANCE residual, stratified by (segment, h).
        q = (1-alpha) empirical quantile of |residual| with finite-sample correction.
        Falls back to per-horizon, then global, when a stratum is sparse."""
        preds = self.model.predict(calib[FEATURE_COLS].values)
        calib = calib.assign(resid=np.abs(calib["y"].values - preds))

        def q_of(resids):
            n = len(resids)
            k = min(n, int(np.ceil((n + 1) * CONF_LEVEL)))  # finite-sample conformal level
            return float(np.sort(resids)[k - 1])

        self.conformal_q = {}
        self.conformal_q[("__global__",)] = q_of(calib["resid"].values)
        for h, grp in calib.groupby("h"):
            self.conformal_q[("__h__", h)] = q_of(grp["resid"].values)
        for (seg, h), grp in calib.groupby(["segment", "h"]):
            if len(grp) >= MIN_STRATUM:
                self.conformal_q[(seg, h)] = q_of(grp["resid"].values)

    def _q_lookup(self, segment, h):
        return (self.conformal_q.get((segment, h))
                or self.conformal_q.get(("__h__", h))
                or self.conformal_q[("__global__",)])

    def _apply_interval(self, df: pd.DataFrame, preds: np.ndarray) -> pd.DataFrame:
        q = np.array([self._q_lookup(s, h) for s, h in zip(df["segment"], df["h"])])
        out = df.copy()
        out["predicted"] = preds
        out["lower"] = preds - q
        out["upper"] = preds + q
        out["band_pct"] = (out["upper"] - out["lower"]) / 2.0 / np.where(preds != 0, preds, np.nan)
        return out

    # ------------------------------------------------------------------
    # Evaluation (coverage = % within +/-12.5%)
    # ------------------------------------------------------------------
    def _evaluate(self, test: pd.DataFrame) -> dict:
        preds = self.model.predict(test[FEATURE_COLS].values)
        ev = self._apply_interval(test, preds)
        y = test["y"].values
        ev["abs_pct_err"] = np.abs(y - preds) / np.where(y != 0, np.abs(y), np.nan)
        ev["within_125"] = ev["abs_pct_err"] <= BAND

        def summ(g):
            return {
                "n": int(len(g)),
                "coverage_pct": round(100.0 * g["within_125"].mean(), 1),
                "median_band_pct": round(100.0 * g["band_pct"].median(), 1),
                "mape": round(100.0 * g["abs_pct_err"].mean(), 1),
            }

        out = {"overall": summ(ev),
               "by_horizon": {int(h): summ(g) for h, g in ev.groupby("h")},
               "by_branch_type": {str(b): summ(g) for b, g in ev.groupby("branch_type")},
               "by_salary_window": {f"salary={int(k)}": summ(g) for k, g in ev.groupby(ev["tgt_is_salary_window"].astype(int))},
               "by_eid_window": {f"eid={int(k)}": summ(g) for k, g in ev.groupby(ev["is_eid_window"].astype(int))}}
        return out

    # ------------------------------------------------------------------
    # Forecast path (per branch, 7-day) from the latest usable origin
    # ------------------------------------------------------------------
    def forecast_path(self, branch_ids=None) -> list[dict]:
        if not self.is_trained:
            self.train()
        feat_tbl, cal = self._feat_tbl, self._cal_tbl
        max_dt = feat_tbl["date_dt"].max()
        origin_dt = max_dt - pd.Timedelta(days=7)   # so all 7 targets stay within the calendar/data

        origins = feat_tbl[feat_tbl["date_dt"] == origin_dt].copy()
        if branch_ids:
            origins = origins[origins["branch_id"].isin(branch_ids)]
        origins = origins.merge(self._branch_meta[["branch_id", "branch_type"]], on="branch_id", how="left")
        origins["branch_type"] = origins["branch_type"].fillna("BALANCED").astype(str)

        # actuals (if present) for realized within_125
        actual_map = feat_tbl.set_index(["branch_id", "date_dt"])["closing_balance_m"]

        rows = []
        for h in HORIZONS:
            d = origins.copy()
            d["h"] = h
            d["target_dt"] = origin_dt + pd.Timedelta(days=h)
            d = d.merge(cal[["date_dt"] + _TGT_CAL + ["is_eid_window"]],
                        left_on="target_dt", right_on="date_dt", how="left")
            d[_TGT_CAL] = d[_TGT_CAL].fillna(0)
            d["is_eid_window"] = d["is_eid_window"].fillna(0)
            d["segment"] = self._segment(d)
            rows.append(d)
        allh = pd.concat(rows, ignore_index=True)
        preds = self.model.predict(allh[FEATURE_COLS].values)
        ev = self._apply_interval(allh, preds)

        result = {}
        for _, r in ev.iterrows():
            bid = r["branch_id"]
            key = (bid, pd.Timestamp(r["target_dt"]))
            actual = float(actual_map.get(key, np.nan)) if key in actual_map.index else None
            within = None
            if actual is not None and actual not in (0, np.nan) and not np.isnan(actual):
                within = bool(abs(actual - r["predicted"]) / abs(actual) <= BAND)
            result.setdefault(bid, []).append({
                "horizon": int(r["h"]),
                "target_date": pd.Timestamp(r["target_dt"]).date().isoformat(),
                "predicted": round(float(r["predicted"]), 3),
                "lower": round(float(r["lower"]), 3),
                "upper": round(float(r["upper"]), 3),
                "band_pct": round(float(r["band_pct"]) * 100, 2),
                "actual": round(actual, 3) if actual is not None else None,
                "within_125": within,
            })
        out = []
        for bid, path in result.items():
            out.append({"branch_id": bid,
                        "origin_date": pd.Timestamp(origin_dt).date().isoformat(),
                        "path": sorted(path, key=lambda x: x["horizon"])})
        return out

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def persist(self, paths: list[dict]) -> int:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        n = 0
        for b in paths:
            for p in b["path"]:
                mape = (abs(p["actual"] - p["predicted"]) / abs(p["actual"]) * 100
                        if p["actual"] else None)
                cur.execute(
                    "INSERT INTO forecasts (entity_type, entity_id, forecast_date, target_date, "
                    "predicted_value, confidence_lower, confidence_upper, actual_value, mape, "
                    "model_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))",
                    ("branch", b["branch_id"], b["origin_date"], p["target_date"],
                     p["predicted"], p["lower"], p["upper"], p["actual"], mape, MODEL_VERSION))
                n += 1
        con.commit()
        con.close()
        return n


_SERVICE: ClosingBalanceForecastService | None = None


def get_service() -> ClosingBalanceForecastService:
    """Lazily train + cache a single service instance."""
    global _SERVICE
    if _SERVICE is None or not _SERVICE.is_trained:
        svc = ClosingBalanceForecastService()
        svc.train()
        _SERVICE = svc
    return _SERVICE
