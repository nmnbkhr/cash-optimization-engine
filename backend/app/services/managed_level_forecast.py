"""
Managed-Level Forecast Service (UC-01, Phase 3)
===============================================
NORTH STAR: per branch, predict the 7-day-forward MANAGED CASH LEVEL (h=1..7) with a
calibrated interval, and measure whether the realized level fell within +/-12.5% of the
point prediction.

Why a NEW target (vs Phase 2's raw closing)
-------------------------------------------
Phase 2 forecast the raw daily `closing_balance_m` and cleared only ~26% within +/-12.5%.
The read-only decomposition (scripts/target_volatility_analysis.py) showed the raw closing
carries a CIT-reset sawtooth: var(cit_net)/var(d_closing) ~= 1.40, i.e. CIT moves opposite
to demand and is the optimizer's *lever*, not a demand signal. Forecasting it scores the
demand model against a control action it doesn't own.

TARGET = T3 = EWMA(closing_balance_m, span=S) -- the smoothed level a treasury manages
toward. The span sweep (scripts/t3_span_sweep.py) chose S=7 by the least-smoothing rule:
S=7 is the SMALLEST span clearing ~60% persistence overall (S=5 only 50.9%), and the
event-window coverage stays on par with calm periods at every span (gaps <= ~3.6pts), so
S=7 does not wash out the Eid/salary signal -- it just clears the bar.

Design (unchanged from Phase 2 except the target)
-------------------------------------------------
* DIRECT multi-horizon, h as a model feature (one XGBoost on stacked (branch, t, h) rows).
* Features known at/ before origin t: lag/EWMA/roll of the TARGET strictly up to t, branch
  flow rolls up to t, branch encodings, plus the DETERMINISTIC calendar of target date t+h.
  EWMA is causal (ewm adjust=False) so T3[t] uses only closing[<=t] -- NO leakage. The
  label is T3[t+h]; origin features never reference any index > t.
* INTERVAL: split-conformal on the T3 residual directly, stratified by
  horizon h x (branch_type x is_salary_window x is_pre_eid_surge).

All amounts in PKR Millions.
"""
from __future__ import annotations

import logging
import pickle
import sqlite3
import threading
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = str(_BACKEND_ROOT / "cash_engine.db")
# Trained artifact: lets the 100s train happen ONCE (offline / first boot) instead of
# inside every forecast request. Loaded in ~5s; invalidated when the GL data changes.
ARTIFACT_PATH = str(_BACKEND_ROOT / "models" / "uc01_managedlevel.pkl")

EWMA_SPAN = 7                         # T3 smoothing span (chosen by least-smoothing rule)
HORIZONS = list(range(1, 8))          # h = 1..7 days
CONF_LEVEL = 0.95                     # conformal interval coverage
BAND = 0.125                          # business band: +/-12.5%
TRAIN_STRIDE = 4                      # subsample train origins for tractability
MIN_STRATUM = 60                      # min calibration points to trust a stratum's q
MODEL_VERSION = "uc01-managedlevel-direct-xgb-v1"

_ORIGIN_FEATS = [
    "t3_now", "t3_lag1", "t3_lag7",
    "t3_roll7_mean", "t3_roll7_std", "t3_roll30_mean",
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


def _data_fingerprint() -> dict:
    """Cheap signature of the training data; if it changes, a saved artifact is stale."""
    con = sqlite3.connect(DB_PATH)
    try:
        n, mx = con.execute("SELECT COUNT(*), MAX(date) FROM fact_gl_daily").fetchone()
    finally:
        con.close()
    return {"rows": int(n), "max_date": mx, "model_version": MODEL_VERSION, "span": EWMA_SPAN}


class ManagedLevelForecastService:
    def __init__(self, span: int = EWMA_SPAN):
        self.span = span
        self.model: xgb.XGBRegressor | None = None
        self.le_btype = LabelEncoder()
        self.le_city = LabelEncoder()
        self.conformal_q: dict = {}
        self.coverage: dict = {}
        self.is_trained = False
        self._feat_tbl: pd.DataFrame | None = None
        self._cal_tbl: pd.DataFrame | None = None
        self._branch_meta: pd.DataFrame | None = None

    # ------------------------------------------------------------------
    # Data assembly  (T3 target + leakage-safe origin features)
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

        g = gl.groupby("branch_id", sort=False)
        # TARGET T3 = causal EWMA of the closing balance (uses only closing[<=t]).
        gl["t3"] = g["closing_balance_m"].transform(
            lambda s: s.ewm(span=self.span, adjust=False).mean())

        # Origin features (all functions of indices <= t -> no leakage).
        g3 = gl.groupby("branch_id", sort=False)["t3"]
        gl["t3_now"] = gl["t3"]
        gl["t3_lag1"] = g3.shift(1)
        gl["t3_lag7"] = g3.shift(7)
        gl["t3_roll7_mean"] = g3.transform(lambda s: s.rolling(7, min_periods=1).mean())
        gl["t3_roll7_std"] = g3.transform(lambda s: s.rolling(7, min_periods=1).std())
        gl["t3_roll30_mean"] = g3.transform(lambda s: s.rolling(30, min_periods=1).mean())
        gl["dep_now"] = gl["total_deposit_flow_m"]
        gl["wth_now"] = gl["total_withdrawal_flow_m"]
        gl["dep_roll7"] = g["total_deposit_flow_m"].transform(lambda s: s.rolling(7, min_periods=1).mean())
        gl["wth_roll7"] = g["total_withdrawal_flow_m"].transform(lambda s: s.rolling(7, min_periods=1).mean())
        gl["net_roll7"] = gl["dep_roll7"] - gl["wth_roll7"]
        for c in ("t3_lag1", "t3_lag7"):
            gl[c] = gl[c].fillna(gl["t3_now"])
        gl["t3_roll7_std"] = gl["t3_roll7_std"].fillna(0.0)

        # feat_tbl carries the T3 LABEL (column "t3") and the origin features.
        feat_tbl = gl[["branch_id", "date_dt", "t3"] + _ORIGIN_FEATS].copy()

        cal["date_dt"] = pd.to_datetime(cal["date"])
        cal = cal.rename(columns={c: f"tgt_{c}" for c in cal.columns if c not in ("date", "date_dt")})

        self._feat_tbl = feat_tbl
        self._cal_tbl = cal
        self._branch_meta = branches[["branch_id", "branch_type"]].copy()
        self._branch_meta["branch_type"] = self._branch_meta["branch_type"].fillna("BALANCED").astype(str)
        return feat_tbl, cal

    def _segment(self, df: pd.DataFrame) -> pd.Series:
        return (df["branch_type"].astype(str) + "|sal"
                + df["tgt_is_salary_window"].astype(int).astype(str) + "|eid"
                + df["tgt_is_pre_eid_surge"].astype(int).astype(str))

    def _build_supervised(self, target_dates, stride=1) -> pd.DataFrame:
        """Stacked (branch, origin t, h) rows: origin features at t + target calendar at
        t+h, label y = T3 at t+h. origin_dt = target_dt - h guarantees features are <= t."""
        feat_tbl, cal = self._feat_tbl, self._cal_tbl
        tdates = sorted(pd.to_datetime(sorted(set(target_dates))))
        if stride > 1:
            tdates = tdates[::stride]
        tset = pd.DatetimeIndex(tdates)

        labels = feat_tbl[feat_tbl["date_dt"].isin(tset)][["branch_id", "date_dt", "t3"]] \
            .rename(columns={"date_dt": "target_dt", "t3": "y"})
        labels = labels.merge(self._branch_meta, on="branch_id", how="left")
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
        sup = sup.merge(cal[["date_dt"] + _TGT_CAL], left_on="target_dt",
                        right_on="date_dt", how="left")
        sup[_TGT_CAL] = sup[_TGT_CAL].fillna(0)
        sup["segment"] = self._segment(sup)
        return sup

    # ------------------------------------------------------------------
    # Fit  (explicit temporal windows -> clean forward backtest)
    # ------------------------------------------------------------------
    def fit(self, train_target_max: str, cal_start: str, cal_end: str) -> dict:
        """Train on target dates [day31 .. train_target_max], calibrate on
        [cal_start .. cal_end]. Both strictly precede any backtest origin."""
        feat_tbl, _ = self._load()
        all_dates = pd.to_datetime(sorted(feat_tbl["date_dt"].unique()))
        tmax = pd.Timestamp(train_target_max)
        cs, ce = pd.Timestamp(cal_start), pd.Timestamp(cal_end)

        train_dates = [d for d in all_dates[31:] if d <= tmax]
        cal_dates = [d for d in all_dates if cs <= d <= ce]

        train = self._build_supervised(train_dates, stride=TRAIN_STRIDE)
        calib = self._build_supervised(cal_dates, stride=1)

        self.model = xgb.XGBRegressor(
            n_estimators=300, max_depth=7, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1)
        self.model.fit(train[FEATURE_COLS].values, train["y"].values)
        self._fit_conformal(calib)
        self.is_trained = True
        return {"status": "trained", "span": self.span,
                "train_rows": len(train), "calib_rows": len(calib),
                "train_target_max": train_target_max,
                "cal_window": [cal_start, cal_end], "features": len(FEATURE_COLS)}

    def _fit_conformal(self, calib: pd.DataFrame):
        preds = self.model.predict(calib[FEATURE_COLS].values)
        calib = calib.assign(resid=np.abs(calib["y"].values - preds))

        def q_of(resids):
            n = len(resids)
            k = min(n, int(np.ceil((n + 1) * CONF_LEVEL)))
            return float(np.sort(resids)[k - 1])

        self.conformal_q = {("__global__",): q_of(calib["resid"].values)}
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
    # Coverage summarizer (model AND persistence on the SAME rows)
    # ------------------------------------------------------------------
    @staticmethod
    def _summ(g: pd.DataFrame, pred_col: str, band_col: str | None) -> dict:
        y = g["y"].values
        pred = g[pred_col].values
        ape = np.abs(y - pred) / np.where(y != 0, np.abs(y), np.nan)
        within = ape <= BAND
        out = {"n": int(len(g)),
               "coverage_pct": round(100.0 * np.nanmean(within), 1),
               "mape": round(100.0 * np.nanmean(ape), 1)}
        if band_col is not None:
            out["median_band_pct"] = round(100.0 * np.nanmedian(g[band_col].values), 1)
        return out

    def _coverage_tables(self, ev: pd.DataFrame, pred_col: str, band_col: str | None) -> dict:
        s = lambda g: self._summ(g, pred_col, band_col)
        return {
            "overall": s(ev),
            "by_horizon": {int(h): s(g) for h, g in ev.groupby("h")},
            "by_branch_type": {str(b): s(g) for b, g in ev.groupby("branch_type")},
            "by_salary_window": {f"salary={int(k)}": s(g)
                                 for k, g in ev.groupby(ev["tgt_is_salary_window"].astype(int))},
            "by_pre_eid": {f"pre_eid={int(k)}": s(g)
                           for k, g in ev.groupby(ev["tgt_is_pre_eid_surge"].astype(int))},
        }

    # ------------------------------------------------------------------
    # Rolling-origin backtest (origins span Eid + calm; all forward of fit)
    # ------------------------------------------------------------------
    def rolling_backtest(self, origin_dates) -> dict:
        """For each origin date, predict h=1..7. Compares MODEL vs PERSISTENCE
        (persist pred = last known level t3_now) on identical rows."""
        if not self.is_trained:
            raise RuntimeError("call fit() before rolling_backtest()")
        origin_set = pd.DatetimeIndex(sorted(pd.to_datetime(sorted(set(origin_dates)))))
        target_dates = set()
        for od in origin_set:
            for h in HORIZONS:
                target_dates.add(od + pd.Timedelta(days=h))
        sup = self._build_supervised(target_dates, stride=1)
        # keep only rows whose origin is an actual backtest origin
        sup = sup[sup["origin_dt"].isin(origin_set)].copy()

        preds = self.model.predict(sup[FEATURE_COLS].values)
        ev = self._apply_interval(sup, preds)
        ev["persist_pred"] = ev["t3_now"]   # naive baseline on the same target

        return {
            "n_origins": len(origin_set),
            "n_rows": int(len(ev)),
            "model": self._coverage_tables(ev, "predicted", "band_pct"),
            "persistence": self._coverage_tables(ev, "persist_pred", None),
        }

    # ------------------------------------------------------------------
    # Forecast path (per branch, 7-day) from the latest usable origin
    # ------------------------------------------------------------------
    def forecast_path(self, branch_ids=None) -> list[dict]:
        if not self.is_trained:
            raise RuntimeError("model not trained")
        feat_tbl, cal = self._feat_tbl, self._cal_tbl
        max_dt = feat_tbl["date_dt"].max()
        origin_dt = max_dt - pd.Timedelta(days=7)

        origins = feat_tbl[feat_tbl["date_dt"] == origin_dt].copy()
        if branch_ids:
            origins = origins[origins["branch_id"].isin(branch_ids)]
        origins = origins.merge(self._branch_meta, on="branch_id", how="left")
        origins["branch_type"] = origins["branch_type"].fillna("BALANCED").astype(str)
        actual_map = feat_tbl.set_index(["branch_id", "date_dt"])["t3"]

        rows = []
        for h in HORIZONS:
            d = origins.copy()
            d["h"] = h
            d["target_dt"] = origin_dt + pd.Timedelta(days=h)
            d = d.merge(cal[["date_dt"] + _TGT_CAL], left_on="target_dt",
                        right_on="date_dt", how="left")
            d[_TGT_CAL] = d[_TGT_CAL].fillna(0)
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
            if actual is not None and not np.isnan(actual) and actual != 0:
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
        return [{"branch_id": bid,
                 "origin_date": pd.Timestamp(origin_dt).date().isoformat(),
                 "path": sorted(path, key=lambda x: x["horizon"])}
                for bid, path in result.items()]

    # ------------------------------------------------------------------
    # Trained-artifact persistence (serving only; outputs are identical)
    # ------------------------------------------------------------------
    def save(self, path: str = ARTIFACT_PATH) -> str:
        """Pickle the trained model + conformal quantiles + encoders. The model is the exact
        fitted object, so a loaded service reproduces predictions bit-for-bit."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "model": self.model, "conformal_q": self.conformal_q,
                "coverage": self.coverage, "le_btype": self.le_btype,
                "le_city": self.le_city, "span": self.span,
                "fingerprint": _data_fingerprint(),
            }, f)
        return path

    def load_trained(self, path: str = ARTIFACT_PATH) -> bool:
        """Restore a previously trained model. Returns False (caller should train) if the
        artifact is absent, unreadable, or its data fingerprint no longer matches the DB."""
        p = Path(path)
        if not p.exists():
            return False
        try:
            with open(path, "rb") as f:
                blob = pickle.load(f)
        except Exception:
            logger.warning("forecast artifact unreadable; will retrain")
            return False
        if blob.get("fingerprint") != _data_fingerprint():
            logger.info("forecast artifact stale (GL data changed); will retrain")
            return False
        self.model = blob["model"]
        self.conformal_q = blob["conformal_q"]
        self.coverage = blob.get("coverage", {})
        self.span = blob.get("span", self.span)
        self.le_btype = blob["le_btype"]
        self.le_city = blob["le_city"]
        self.is_trained = True
        return True

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


_SERVICE: ManagedLevelForecastService | None = None
_LOCK = threading.Lock()


def _default_split(svc: ManagedLevelForecastService) -> dict:
    """Production forward split: calibrate on the last 60 days, train before that."""
    if svc._feat_tbl is None:
        svc._load()
    all_dates = pd.to_datetime(sorted(svc._feat_tbl["date_dt"].unique()))
    return svc.fit(
        train_target_max=all_dates[-61].date().isoformat(),
        cal_start=all_dates[-60].date().isoformat(),
        cal_end=all_dates[-1].date().isoformat())


def get_service(force_retrain: bool = False) -> ManagedLevelForecastService:
    """Return the cached service. Loads the persisted artifact (~5s) if available and fresh;
    otherwise trains once (~100s) and saves it. The lock ensures concurrent first-callers
    wait for a single train instead of each kicking off their own."""
    global _SERVICE
    if _SERVICE is not None and _SERVICE.is_trained and not force_retrain:
        return _SERVICE
    with _LOCK:
        if _SERVICE is not None and _SERVICE.is_trained and not force_retrain:
            return _SERVICE
        svc = ManagedLevelForecastService()
        if not force_retrain and svc.load_trained():
            svc._load()                      # rebuild feat/cal frames for forecast_path (~5s)
            logger.info("UC-01 forecast: loaded trained artifact from disk")
        else:
            _default_split(svc)              # fit() loads frames + trains (~100s)
            svc.save()
            logger.info("UC-01 forecast: trained and saved artifact -> %s", ARTIFACT_PATH)
        _SERVICE = svc
    return _SERVICE
