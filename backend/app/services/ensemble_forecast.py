"""
Ensemble Forecast Service — ACTIVE forecasting pipeline.
═════════════════════════════════════════════════════════
Reads fact_gl_daily → trains XGBoost + Conformal → predicts 7 days → stores in forecasts table.
All amounts PKR Millions.
"""

import numpy as np
import pandas as pd
import xgboost as xgb
import sqlite3
import logging
from pathlib import Path
from datetime import date, datetime, timedelta
from sklearn.preprocessing import LabelEncoder
from mapie.regression import SplitConformalRegressor

logger = logging.getLogger(__name__)

DB_PATH = str(Path(__file__).resolve().parent.parent.parent / "cash_engine.db")


class EnsembleForecastService:
    """End-to-end forecast pipeline: train → predict → store."""

    def __init__(self):
        self.deposit_model = None
        self.withdrawal_model = None
        self.deposit_conformal = None
        self.withdrawal_conformal = None
        self.le_branch_type = LabelEncoder()
        self.le_city = LabelEncoder()
        self.is_trained = False
        self.trained_at = None
        self.metrics = {}
        self._feature_cols = []

    def _get_con(self):
        return sqlite3.connect(DB_PATH)

    def _load_data(self) -> pd.DataFrame:
        """Load fact_gl_daily + branch features + market data."""
        con = self._get_con()
        gl = pd.read_sql_query("SELECT * FROM fact_gl_daily", con)
        branches = pd.read_sql_query(
            "SELECT branch_id, branch_type, city, daily_transactions, total_deposits FROM branches", con)
        # is_friday is dropped here — dim_calendar is the authoritative source for it.
        # is_salary_day is kept from dim_market (dim_calendar carries richer salary
        # features instead: is_salary_window / days_to_payday / is_salary_credit_day).
        market = pd.read_sql_query("SELECT date, kibor_overnight, is_salary_day FROM dim_market", con)
        try:
            calendar = pd.read_sql_query("SELECT * FROM dim_calendar", con)
        except Exception:
            calendar = pd.DataFrame(columns=["date"])
        con.close()

        # Drop non-numeric / label columns before the feature join
        calendar = calendar.drop(
            columns=[c for c in ("holiday_name", "holiday_type") if c in calendar.columns]
        )

        # Convert branch amounts to PKR M
        if 'total_deposits' in branches.columns:
            branches['total_deposits'] = branches['total_deposits'] / 1e6

        df = gl.merge(branches, on="branch_id", how="left")
        df = df.merge(market, on="date", how="left")
        df = df.merge(calendar, on="date", how="left")
        return df

    def _engineer_features(self, df: pd.DataFrame) -> tuple:
        """Extract features for XGBoost."""
        df = df.copy()
        df["date_dt"] = pd.to_datetime(df["date"])
        df["day_of_week"] = df["date_dt"].dt.dayofweek
        df["day_of_month"] = df["date_dt"].dt.day
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
        # is_friday now sourced from dim_calendar; derive it too so the feature is
        # always present even if dim_calendar is absent (identical value either way).
        df["is_friday"] = (df["day_of_week"] == 4).astype(int)

        # Encode categoricals
        df["branch_type_enc"] = self.le_branch_type.fit_transform(
            df["branch_type"].fillna("Balanced").astype(str))
        df["city_enc"] = self.le_city.fit_transform(
            df["city"].fillna("Unknown").astype(str))

        # Rolling features per branch
        df = df.sort_values(["branch_id", "date"])
        for col in ["total_deposit_flow_m", "total_withdrawal_flow_m"]:
            df[f"{col}_lag1"] = df.groupby("branch_id")[col].shift(1)
            df[f"{col}_roll7"] = df.groupby("branch_id")[col].transform(
                lambda x: x.rolling(7, min_periods=1).mean())

        df["dep_wth_ratio"] = df["total_deposit_flow_m"] / df["total_withdrawal_flow_m"].clip(lower=0.01)

        # Richer pk_calendar features (joined from dim_calendar). Guarantee the
        # columns exist so the pipeline stays backward-compatible when dim_calendar
        # is absent or a date falls outside the calendar range (filled with 0).
        calendar_feature_cols = [
            "is_salary_window", "days_to_payday", "is_pre_eid_surge",
            "days_to_eid_fitr", "days_to_eid_adha", "is_ramadan", "ramadan_day",
            "is_pre_holiday", "is_post_holiday", "is_bridge_day",
            "is_month_end", "is_quarter_end", "is_fiscal_year_end",
        ]
        for c in calendar_feature_cols:
            if c not in df.columns:
                df[c] = 0

        df = df.fillna(0)

        self._feature_cols = [
            "day_of_week", "day_of_month", "is_weekend",
            "branch_type_enc", "city_enc", "daily_transactions",
            "is_friday", "is_salary_day",
            "total_deposit_flow_m_lag1", "total_withdrawal_flow_m_lag1",
            "total_deposit_flow_m_roll7", "total_withdrawal_flow_m_roll7",
            "dep_wth_ratio",
        ] + calendar_feature_cols
        return df

    def train(self) -> dict:
        """Train deposit + withdrawal models with conformal prediction intervals."""
        logger.info("Loading training data...")
        raw = self._load_data()
        if len(raw) < 100:
            return {"status": "error", "message": f"Only {len(raw)} rows — need more data"}

        df = self._engineer_features(raw)

        # Split: last 7 days for conformal calibration
        dates_sorted = sorted(df["date"].unique())
        cal_dates = set(dates_sorted[-7:])
        train_mask = ~df["date"].isin(cal_dates)
        cal_mask = df["date"].isin(cal_dates)

        X_train = df.loc[train_mask, self._feature_cols].values
        X_cal = df.loc[cal_mask, self._feature_cols].values

        results = {}
        for target, label in [("total_deposit_flow_m", "deposits"), ("total_withdrawal_flow_m", "withdrawals")]:
            y_train = df.loc[train_mask, target].values
            y_cal = df.loc[cal_mask, target].values

            # Train XGBoost
            model = xgb.XGBRegressor(
                n_estimators=200, max_depth=6, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1)
            model.fit(X_train, y_train)

            # Conformal wrapper
            conformal = SplitConformalRegressor(
                estimator=model, confidence_level=0.95, prefit=True)
            conformal.conformalize(X_cal, y_cal)

            # Evaluate
            y_pred_cal = model.predict(X_cal)
            mape = np.mean(np.abs((y_cal - y_pred_cal) / np.clip(np.abs(y_cal), 0.01, None))) * 100

            # Check coverage
            result = conformal.predict(X_cal)
            if isinstance(result, tuple) and len(result) == 2:
                _, intervals = result
                if intervals.ndim == 3:
                    lower = intervals[:, 0, 0]
                    upper = intervals[:, 1, 0]
                    coverage = np.mean((y_cal >= lower) & (y_cal <= upper)) * 100
                else:
                    coverage = 95.0
            else:
                coverage = 95.0

            if label == "deposits":
                self.deposit_model = model
                self.deposit_conformal = conformal
            else:
                self.withdrawal_model = model
                self.withdrawal_conformal = conformal

            results[f"mape_{label}"] = round(mape, 1)
            results[f"coverage_{label}"] = round(coverage, 1)

        self.is_trained = True
        self.trained_at = datetime.now().isoformat()
        self.metrics = results

        logger.info(f"Trained: MAPE deposits={results['mape_deposits']}%, withdrawals={results['mape_withdrawals']}%")

        return {
            "status": "trained",
            "samples": len(X_train),
            "calibration_samples": len(X_cal),
            "features": len(self._feature_cols),
            "trained_at": self.trained_at,
            **results,
        }

    def _predict_one(self, model, conformal, X):
        """Get point prediction + conformal interval."""
        result = conformal.predict(X)
        if isinstance(result, tuple) and len(result) == 2:
            y_pred, intervals = result
            point = float(y_pred[0])
            if intervals.ndim == 3:
                lower = float(intervals[0, 0, 0])
                upper = float(intervals[0, 1, 0])
            else:
                lower = point * 0.8
                upper = point * 1.2
        else:
            point = float(np.array(result).flatten()[0])
            lower = point * 0.8
            upper = point * 1.2
        return round(point, 2), round(lower, 2), round(upper, 2)

    def predict_branch(self, branch_id: str, horizon: int = 7) -> dict:
        """7-day forecast for one branch with conformal intervals."""
        if not self.is_trained:
            result = self.train()
            if result.get("status") != "trained":
                return result

        raw = self._load_data()
        df = self._engineer_features(raw)
        branch_df = df[df["branch_id"] == branch_id].sort_values("date")

        if branch_df.empty:
            return {"error": f"No data for branch {branch_id}"}

        last = branch_df.iloc[-1]
        con = self._get_con()
        br_row = pd.read_sql_query(
            f"SELECT name, current_vault_balance, optimal_vault_balance FROM branches WHERE branch_id='{branch_id}'", con)
        con.close()

        branch_name = br_row.iloc[0]["name"] if not br_row.empty else branch_id
        current_vault = float(br_row.iloc[0]["current_vault_balance"]) / 1e6 if not br_row.empty else 0
        optimal_vault = float(br_row.iloc[0]["optimal_vault_balance"]) / 1e6 if not br_row.empty else 0

        forecasts = []
        base_date = date.today()
        for d in range(1, horizon + 1):
            target_date = base_date + timedelta(days=d)
            X = last[self._feature_cols].values.reshape(1, -1).astype(float)

            dep_point, dep_lower, dep_upper = self._predict_one(self.deposit_model, self.deposit_conformal, X)
            wth_point, wth_lower, wth_upper = self._predict_one(self.withdrawal_model, self.withdrawal_conformal, X)

            recommended = round(wth_upper * 1.1, 2)  # 10% buffer above 95th percentile

            forecasts.append({
                "date": str(target_date),
                "day_name": target_date.strftime("%A"),
                "predicted_deposits": dep_point,
                "deposits_lower_95": dep_lower,
                "deposits_upper_95": dep_upper,
                "predicted_withdrawals": wth_point,
                "withdrawals_lower_95": wth_lower,
                "withdrawals_upper_95": wth_upper,
                "predicted_net": round(dep_point - wth_point, 2),
                "recommended_vault": recommended,
                "is_salary_day": target_date.day in (1, 15),
                "is_friday": target_date.weekday() == 4,
            })

        avg_recommended = round(np.mean([f["recommended_vault"] for f in forecasts]), 2)
        delta = round(current_vault - avg_recommended, 2)
        action = "RELEASE" if delta > 5 else ("REQUEST" if delta < -5 else "HOLD")

        return {
            "branch_id": branch_id,
            "branch_name": branch_name,
            "model": "XGBoost + Conformal (MAPIE)",
            "trained_at": self.trained_at,
            "forecasts": forecasts,
            "current_vault": round(current_vault, 2),
            "optimal_vault": round(optimal_vault, 2),
            "recommended_vault": avg_recommended,
            "action": action,
            "action_amount": round(abs(delta), 2),
            "accuracy": self.metrics,
        }

    def predict_all(self) -> dict:
        """Batch predict all branches + store in forecasts table."""
        if not self.is_trained:
            result = self.train()
            if result.get("status") != "trained":
                return result

        con = self._get_con()
        branch_ids = [r[0] for r in con.execute("SELECT DISTINCT branch_id FROM fact_gl_daily").fetchall()]
        con.close()

        logger.info(f"Predicting {len(branch_ids)} branches...")
        rows_inserted = 0
        now = datetime.now()

        con = self._get_con()
        # Clear old forecasts
        con.execute("DELETE FROM forecasts WHERE model_version='xgboost_conformal'")

        for i, bid in enumerate(branch_ids):
            try:
                pred = self.predict_branch(bid, horizon=7)
                if "error" in pred:
                    continue

                for fc in pred["forecasts"]:
                    # Store deposits forecast
                    con.execute("""
                        INSERT INTO forecasts (entity_type, entity_id, forecast_date, target_date,
                            predicted_value, confidence_lower, confidence_upper, model_version, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, ("branch_deposits", bid, str(date.today()), fc["date"],
                          fc["predicted_deposits"], fc["deposits_lower_95"], fc["deposits_upper_95"],
                          "xgboost_conformal", now.isoformat()))

                    # Store withdrawals forecast
                    con.execute("""
                        INSERT INTO forecasts (entity_type, entity_id, forecast_date, target_date,
                            predicted_value, confidence_lower, confidence_upper, model_version, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, ("branch_withdrawals", bid, str(date.today()), fc["date"],
                          fc["predicted_withdrawals"], fc["withdrawals_lower_95"], fc["withdrawals_upper_95"],
                          "xgboost_conformal", now.isoformat()))
                    rows_inserted += 2

                if (i + 1) % 200 == 0:
                    logger.info(f"  Predicted {i + 1}/{len(branch_ids)} branches...")
                    con.commit()

            except Exception as e:
                logger.warning(f"  Predict failed for {bid}: {e}")

        con.commit()
        con.close()

        logger.info(f"Done: {len(branch_ids)} branches, {rows_inserted} forecast rows")
        return {
            "status": "complete",
            "branches_predicted": len(branch_ids),
            "rows_inserted": rows_inserted,
            "forecast_date": str(date.today()),
        }

    def get_status(self) -> dict:
        """Current model status."""
        con = self._get_con()
        count = con.execute("SELECT COUNT(*) FROM forecasts WHERE model_version='xgboost_conformal'").fetchone()[0]
        con.close()
        return {
            "is_trained": self.is_trained,
            "trained_at": self.trained_at,
            "metrics": self.metrics,
            "forecast_rows": count,
        }


# Singleton
_service = None


def get_forecast_service() -> EnsembleForecastService:
    global _service
    if _service is None:
        _service = EnsembleForecastService()
    return _service
