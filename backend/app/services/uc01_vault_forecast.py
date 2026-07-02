"""
UC-01: Branch Vault Cash Forecasting & Right-Sizing
====================================================
Flagship use case for cash optimization engine.
ALL computation runs locally: PyTorch LSTM on GPU, scipy optimization,
pure Python game theory. No external API calls.

Classes:
    BranchCashLSTM  - PyTorch LSTM for 7-day cash demand forecasting
    VaultOptimizer  - Two-stage stochastic program (SAA) for vault sizing
    CashEfficiencyEngine - Game theory mechanism design + scoring

Functions:
    prepare_features  - Feature engineering from VaultPosition records
    train_model       - End-to-end LSTM training pipeline
    forecast_branch   - Inference pipeline for a single branch
    get_network_summary - Aggregate UC-01 metrics across all branches
"""

import logging
import math
import os
import pathlib
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from scipy.optimize import minimize_scalar
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import pk_calendar
from app.core.constants import (
    BRANCH_TYPES,
    CIT_EMERGENCY_COST,
    DENOMINATIONS,
    POLICY_RATE,
)
from app.core.game_theory import find_nash_equilibria, iterated_elimination
from app.database import SessionLocal
from app.models.branch import Branch, BranchType
from app.models.vault_position import VaultPosition

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent.parent  # backend/
MODEL_DIR = _BACKEND_DIR / "models"
MODEL_PATH = MODEL_DIR / "uc01_lstm_best.pt"

# ---------------------------------------------------------------------------
# Device
# ---------------------------------------------------------------------------
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info("UC-01 using device: %s", DEVICE)

# ---------------------------------------------------------------------------
# Islamic / Pakistan calendar helpers
# ---------------------------------------------------------------------------
# Single source of truth is app.core.pk_calendar (SBP-verified for 2026).
# These thin wrappers preserve the LSTM's binary calendar features.
def _is_eid_window(d: date, window: int = 7) -> bool:
    """True if *d* is within *window* days of either Eid (Fitr or Adha)."""
    feats = pk_calendar.calendar_features(d)
    return abs(feats["days_to_eid_fitr"]) <= window or abs(feats["days_to_eid_adha"]) <= window


def _is_ashura_window(d: date, window: int = 7) -> bool:
    """First-10-of-Muharram proxy: within *window* days of the gazetted Ashura cluster."""
    return any(
        name == "Ashura" and abs((d - hd).days) <= window
        for hd, (name, _t) in pk_calendar.HOLIDAY_MAP.items()
    )


BRANCH_TYPE_MAP: Dict[str, int] = {bt: i for i, bt in enumerate(BRANCH_TYPES)}


# ======================================================================
# 1. BranchCashLSTM
# ======================================================================

class BranchCashLSTM(nn.Module):
    """
    Two-layer LSTM that predicts next-7-day cash demand per branch.

    Outputs both a *mean* and *log-variance* per day so that we can
    train with Gaussian NLL and later extract uncertainty estimates.
    """

    NUM_FEATURES = 25  # see prepare_features()
    LOOKBACK = 30
    HORIZON = 7

    def __init__(
        self,
        input_size: int = 25,
        hidden_size: int = 64,
        num_layers: int = 2,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0.0,
            batch_first=True,
        )
        self.head_mean = nn.Linear(hidden_size, self.HORIZON)
        self.head_logvar = nn.Linear(hidden_size, self.HORIZON)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Parameters
        ----------
        x : (batch, seq_len=30, num_features)

        Returns
        -------
        mean : (batch, 7)
        log_var : (batch, 7)
        """
        # LSTM output: (batch, seq_len, hidden)
        out, _ = self.lstm(x)
        last_hidden = out[:, -1, :]  # (batch, hidden)
        mean = self.head_mean(last_hidden)
        log_var = self.head_logvar(last_hidden)
        return mean, log_var


# ======================================================================
# Feature engineering
# ======================================================================

def prepare_features(
    vault_positions: List[VaultPosition],
    branch_type: str,
) -> Tuple[np.ndarray, np.ndarray, Dict]:
    """
    Convert a chronologically-sorted list of VaultPosition ORM objects into
    numpy feature arrays suitable for the LSTM.

    Returns
    -------
    X : np.ndarray, shape (N - LOOKBACK - HORIZON + 1, LOOKBACK, num_features)
    y : np.ndarray, shape (N - LOOKBACK - HORIZON + 1, HORIZON)
    scaler_params : dict  {"min": array, "max": array} per-feature
    """
    lookback = BranchCashLSTM.LOOKBACK
    horizon = BranchCashLSTM.HORIZON

    if len(vault_positions) < lookback + horizon:
        logger.warning(
            "Not enough data for features: got %d, need at least %d",
            len(vault_positions),
            lookback + horizon,
        )
        return np.array([]), np.array([]), {}

    # Sort by date
    positions = sorted(vault_positions, key=lambda vp: vp.date)

    n = len(positions)
    dates = [vp.date for vp in positions]
    demand = np.array([vp.withdrawals - vp.deposits for vp in positions], dtype=np.float64)
    deposits = np.array([vp.deposits for vp in positions], dtype=np.float64)
    withdrawals = np.array([vp.withdrawals for vp in positions], dtype=np.float64)

    branch_type_enc = BRANCH_TYPE_MAP.get(branch_type, 0)

    # Build raw feature matrix (n, num_features)
    raw = np.zeros((n, BranchCashLSTM.NUM_FEATURES), dtype=np.float64)

    for t in range(n):
        d = dates[t]
        col = 0

        # day_of_week one-hot (7)
        dow = d.weekday()  # 0=Monday
        for k in range(7):
            raw[t, col + k] = 1.0 if k == dow else 0.0
        col += 7

        # day_of_month normalised
        raw[t, col] = d.day / 31.0
        col += 1

        # is_salary_day
        raw[t, col] = 1.0 if d.day in (1, 15) else 0.0
        col += 1

        # is_friday
        raw[t, col] = 1.0 if dow == 4 else 0.0
        col += 1

        # is_eid_window (+-7 days)
        raw[t, col] = 1.0 if _is_eid_window(d, 7) else 0.0
        col += 1

        # is_ramadan
        raw[t, col] = 1.0 if pk_calendar.is_ramadan(d)[0] else 0.0
        col += 1

        # is_muharram
        raw[t, col] = 1.0 if _is_ashura_window(d, 7) else 0.0
        col += 1

        # crop_season (Seasonal branches: Rabi Nov-Apr=1, Kharif May-Oct=1 for Seasonal only)
        if branch_type == "Seasonal":
            raw[t, col] = 1.0 if d.month <= 4 or d.month >= 11 else 0.0
        else:
            raw[t, col] = 0.0
        col += 1

        # month_sin, month_cos
        month_angle = 2 * math.pi * d.month / 12.0
        raw[t, col] = math.sin(month_angle)
        col += 1
        raw[t, col] = math.cos(month_angle)
        col += 1

        # lagged demand (1d, 7d, 30d) - fill with 0 for unavailable lags
        raw[t, col] = demand[t - 1] if t >= 1 else 0.0
        col += 1
        raw[t, col] = demand[t - 7] if t >= 7 else 0.0
        col += 1
        raw[t, col] = demand[t - 30] if t >= 30 else 0.0
        col += 1

        # rolling_mean_7d, rolling_std_7d
        if t >= 7:
            window = demand[t - 7: t]
            raw[t, col] = window.mean()
            raw[t, col + 1] = window.std()
        else:
            raw[t, col] = 0.0
            raw[t, col + 1] = 0.0
        col += 2

        # deposit_withdrawal_ratio
        total = deposits[t] + withdrawals[t]
        raw[t, col] = (deposits[t] / total) if total > 0 else 0.5
        col += 1

        # branch_type_encoded (normalised 0-1 over 5 types)
        raw[t, col] = branch_type_enc / max(len(BRANCH_TYPES) - 1, 1)
        col += 1
        # col should now be 25

    # ---------- Min-max scaling ----------
    feat_min = raw.min(axis=0)
    feat_max = raw.max(axis=0)
    feat_range = feat_max - feat_min
    feat_range[feat_range == 0] = 1.0  # avoid division by zero
    scaled = (raw - feat_min) / feat_range

    scaler_params = {"min": feat_min, "max": feat_max}

    # ---------- Build sliding windows ----------
    num_samples = n - lookback - horizon + 1
    if num_samples <= 0:
        return np.array([]), np.array([]), scaler_params

    X = np.zeros((num_samples, lookback, BranchCashLSTM.NUM_FEATURES), dtype=np.float32)
    y = np.zeros((num_samples, horizon), dtype=np.float32)

    for i in range(num_samples):
        X[i] = scaled[i: i + lookback]
        y[i] = demand[i + lookback: i + lookback + horizon]

    return X, y, scaler_params


# ======================================================================
# Training
# ======================================================================

def train_model(
    db_session: Session,
    branch_id: Optional[int] = None,
    max_epochs: int = 20,
    lr: float = 1e-3,
    patience: int = 10,
) -> Dict:
    """
    Train the BranchCashLSTM.

    If *branch_id* is given, train on that branch only; otherwise train a
    shared model across all branches.

    Returns dict with {mape, mae, rmse, epochs_trained}.
    """
    # ---- Gather data ----
    # Sample a subset of branches for training (max 50) to fit in GPU memory
    MAX_TRAIN_BRANCHES = 50
    if branch_id is not None:
        branch_ids_to_use = [branch_id]
    else:
        all_branch_ids = [
            r[0] for r in db_session.query(Branch.id).all()
        ]
        if len(all_branch_ids) > MAX_TRAIN_BRANCHES:
            rng = np.random.RandomState(42)
            branch_ids_to_use = rng.choice(
                all_branch_ids, MAX_TRAIN_BRANCHES, replace=False
            ).tolist()
        else:
            branch_ids_to_use = all_branch_ids

    # Build aggregated X, y
    all_X, all_y = [], []
    scaler_params_last = {}

    for bid in branch_ids_to_use:
        positions = (
            db_session.query(VaultPosition)
            .filter(VaultPosition.branch_id == bid)
            .order_by(VaultPosition.date)
            .all()
        )
        if not positions:
            continue
        branch = db_session.query(Branch).filter(Branch.id == bid).first()
        btype = branch.branch_type.value if branch and branch.branch_type else "Balanced"
        X, y, sp = prepare_features(positions, btype)
        if X.size == 0:
            continue
        all_X.append(X)
        all_y.append(y)
        scaler_params_last = sp

    if not all_X:
        logger.error("Insufficient data after feature engineering.")
        return {"mape": None, "mae": None, "rmse": None, "epochs_trained": 0}

    X_all = np.concatenate(all_X, axis=0)
    y_all = np.concatenate(all_y, axis=0)

    # ---- Train / val split ----
    split = min(300, int(len(X_all) * 0.8))
    X_train, y_train = X_all[:split], y_all[:split]
    X_val, y_val = X_all[split:], y_all[split:]

    if len(X_val) == 0:
        # Not enough for validation; use last 20% of train
        split2 = int(len(X_train) * 0.8)
        X_val, y_val = X_train[split2:], y_train[split2:]
        X_train, y_train = X_train[:split2], y_train[:split2]

    if len(X_train) == 0:
        logger.error("Not enough training samples.")
        return {"mape": None, "mae": None, "rmse": None, "epochs_trained": 0}

    # Use DataLoader for mini-batch training to avoid GPU OOM
    BATCH_SIZE = 256
    train_dataset = torch.utils.data.TensorDataset(
        torch.tensor(X_train, dtype=torch.float32),
        torch.tensor(y_train, dtype=torch.float32),
    )
    train_loader = torch.utils.data.DataLoader(
        train_dataset, batch_size=BATCH_SIZE, shuffle=True, pin_memory=True,
    )
    X_val_t = torch.tensor(X_val, dtype=torch.float32, device=DEVICE)
    y_val_t = torch.tensor(y_val, dtype=torch.float32, device=DEVICE)

    # ---- Model / optim ----
    model = BranchCashLSTM(input_size=BranchCashLSTM.NUM_FEATURES).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    gnll = nn.GaussianNLLLoss()

    best_val_loss = float("inf")
    epochs_no_improve = 0
    best_state = None
    epochs_trained = 0

    for epoch in range(1, max_epochs + 1):
        # --- Train (mini-batch) ---
        model.train()
        epoch_loss = 0.0
        n_batches = 0
        for X_batch, y_batch in train_loader:
            X_batch = X_batch.to(DEVICE)
            y_batch = y_batch.to(DEVICE)
            optimizer.zero_grad()
            mean, log_var = model(X_batch)
            var = torch.exp(log_var).clamp(min=1e-6)
            loss = gnll(mean, y_batch, var)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()
            epoch_loss += loss.item()
            n_batches += 1

        # --- Val (can fit in one batch with 50 branches) ---
        model.eval()
        with torch.no_grad():
            v_mean, v_logvar = model(X_val_t)
            v_var = torch.exp(v_logvar).clamp(min=1e-6)
            val_loss = gnll(v_mean, y_val_t, v_var).item()

        epochs_trained = epoch
        avg_train_loss = epoch_loss / max(n_batches, 1)
        logger.info("Epoch %d  train=%.4f  val=%.4f", epoch, avg_train_loss, val_loss)

        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= patience:
                logger.info("Early stopping at epoch %d", epoch)
                break

    # ---- Restore best & save ----
    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "model_state": model.state_dict(),
        "scaler_params": {
            "min": scaler_params_last.get("min", np.array([])),
            "max": scaler_params_last.get("max", np.array([])),
        },
        "input_size": BranchCashLSTM.NUM_FEATURES,
    }
    torch.save(checkpoint, str(MODEL_PATH))
    logger.info("Model saved to %s", MODEL_PATH)

    # ---- Compute metrics on val ----
    with torch.no_grad():
        preds = model(X_val_t)[0].cpu().numpy()
    actuals = y_val

    mae = float(np.mean(np.abs(preds - actuals)))
    rmse = float(np.sqrt(np.mean((preds - actuals) ** 2)))
    # MAPE (avoid div-by-zero)
    nonzero = np.abs(actuals) > 1e-3
    if nonzero.any():
        mape = float(np.mean(np.abs((preds[nonzero] - actuals[nonzero]) / actuals[nonzero]))) * 100
    else:
        mape = 0.0

    metrics = {
        "mape": round(mape, 2),
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "epochs_trained": epochs_trained,
    }
    logger.info("Training complete: %s", metrics)
    return metrics


# ======================================================================
# Inference
# ======================================================================

def forecast_branch(db_session: Session, branch_id: int) -> Dict:
    """
    Run full inference for a single branch: load model, predict next 7 days,
    compute confidence intervals, and return structured result dict.
    """
    # ---- Load or train model ----
    if MODEL_PATH.exists():
        checkpoint = torch.load(str(MODEL_PATH), map_location=DEVICE, weights_only=False)
    else:
        logger.info("No saved model found — training from scratch.")
        metrics = train_model(db_session)
        if not MODEL_PATH.exists():
            return {
                "branch_id": str(branch_id),
                "error": "Model training failed — insufficient data.",
            }
        checkpoint = torch.load(str(MODEL_PATH), map_location=DEVICE, weights_only=False)

    input_size = checkpoint.get("input_size", BranchCashLSTM.NUM_FEATURES)
    model = BranchCashLSTM(input_size=input_size).to(DEVICE)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    # ---- Get branch info ----
    branch = db_session.query(Branch).filter(Branch.id == branch_id).first()
    if branch is None:
        return {"branch_id": str(branch_id), "error": "Branch not found."}

    btype = branch.branch_type.value if branch.branch_type else "Balanced"
    branch_code = branch.branch_id  # string code like "BR-0001"

    # ---- Get last 30+ days of vault data ----
    lookback = BranchCashLSTM.LOOKBACK
    horizon = BranchCashLSTM.HORIZON
    required_days = lookback + horizon  # need enough for at least one sample + context

    positions = (
        db_session.query(VaultPosition)
        .filter(VaultPosition.branch_id == branch_id)
        .order_by(VaultPosition.date.desc())
        .limit(required_days + 30)  # extra buffer
        .all()
    )
    positions = sorted(positions, key=lambda vp: vp.date)

    if len(positions) < lookback:
        return {
            "branch_id": branch_code,
            "error": f"Insufficient data: need {lookback} days, have {len(positions)}.",
        }

    # ---- Prepare features for the last lookback window ----
    X_full, y_full, scaler_params = prepare_features(positions, btype)

    # Use stored scaler from checkpoint if available
    stored_scaler = checkpoint.get("scaler_params", {})
    s_min = stored_scaler.get("min", np.array([]))
    s_max = stored_scaler.get("max", np.array([]))

    # Build the *last* lookback window from raw positions for inference
    last_positions = positions[-lookback:]
    # We need a quick feature extraction for just this window
    # Re-use prepare_features with a larger context so the window is valid
    ctx_positions = positions[-(lookback + horizon):]  # ensure at least one sample
    X_ctx, _, _ = prepare_features(ctx_positions, btype)

    if X_ctx.size == 0:
        # Fallback: use last lookback from full features
        if X_full.size == 0:
            return {"branch_id": branch_code, "error": "Feature extraction failed."}
        X_input = X_full[-1:]
    else:
        X_input = X_ctx[-1:]  # last window

    X_t = torch.tensor(X_input, dtype=torch.float32, device=DEVICE)

    # ---- Inference ----
    with torch.no_grad():
        mean_t, logvar_t = model(X_t)
    pred_mean = mean_t.cpu().numpy().flatten()
    pred_std = np.sqrt(np.exp(logvar_t.cpu().numpy().flatten()).clip(min=1e-6))

    # ---- Forecast dates ----
    last_date = positions[-1].date
    forecast_dates = [(last_date + timedelta(days=i + 1)) for i in range(horizon)]

    # ---- Confidence intervals (90%: z=1.645) ----
    ci_lower = pred_mean - 1.645 * pred_std
    ci_upper = pred_mean + 1.645 * pred_std

    # ---- Historical comparison (last 30 days) ----
    # Re-run model on available windows to get historical predictions
    historical = []
    if X_full.size > 0 and y_full.size > 0:
        n_hist = min(30, len(X_full))
        X_hist = X_full[-n_hist:]
        y_hist = y_full[-n_hist:]
        X_hist_t = torch.tensor(X_hist, dtype=torch.float32, device=DEVICE)
        with torch.no_grad():
            hist_mean, _ = model(X_hist_t)
        hist_pred = hist_mean.cpu().numpy()

        # Dates corresponding to these predictions
        # Each X_full[i] predicts demand starting at lookback + i
        for idx in range(n_hist):
            pos_idx = len(positions) - len(X_full) + idx - 1
            if 0 <= pos_idx < len(positions):
                # The predicted values are for horizon days; take day-1 prediction
                actual_demand = float(y_hist[idx, 0])
                predicted_demand = float(hist_pred[idx, 0])
                hist_date = positions[pos_idx].date + timedelta(days=lookback)
                historical.append({
                    "date": hist_date.isoformat(),
                    "actual": round(actual_demand, 2),
                    "predicted": round(predicted_demand, 2),
                })

    # ---- Model metrics (quick on available data) ----
    if X_full.size > 0 and y_full.size > 0:
        X_all_t = torch.tensor(X_full, dtype=torch.float32, device=DEVICE)
        with torch.no_grad():
            all_mean, _ = model(X_all_t)
        all_preds = all_mean.cpu().numpy()
        all_actuals = y_full

        mae = float(np.mean(np.abs(all_preds - all_actuals)))
        rmse = float(np.sqrt(np.mean((all_preds - all_actuals) ** 2)))
        nonzero = np.abs(all_actuals) > 1e-3
        if nonzero.any():
            mape = float(np.mean(np.abs(
                (all_preds[nonzero] - all_actuals[nonzero]) / all_actuals[nonzero]
            ))) * 100
        else:
            mape = 0.0
    else:
        mape, mae, rmse = 0.0, 0.0, 0.0

    return {
        "branch_id": branch_code,
        "forecast_dates": [d.isoformat() for d in forecast_dates],
        "predicted_demand": [round(float(v), 2) for v in pred_mean],
        "confidence_lower": [round(float(v), 2) for v in ci_lower],
        "confidence_upper": [round(float(v), 2) for v in ci_upper],
        "model_metrics": {
            "mape": round(mape, 2),
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
        },
        "historical": historical[-30:],
    }


# ======================================================================
# 2. VaultOptimizer
# ======================================================================

class VaultOptimizer:
    """
    Two-stage stochastic program using Sample Average Approximation (SAA).
    Finds the optimal vault cash level that minimises the sum of idle-cash
    carrying cost and emergency CIT cost across demand scenarios.
    """

    # Realistic denomination split for Pakistani Rupee
    DENOMINATION_SPLIT = {
        5000: 0.40,
        1000: 0.25,
        500: 0.20,
        100: 0.10,
        50: 0.03,
        20: 0.015,
        10: 0.005,
    }

    def __init__(
        self,
        policy_rate: float = POLICY_RATE,
        emergency_cit_cost: float = CIT_EMERGENCY_COST,
    ):
        self.policy_rate = policy_rate
        self.daily_rate = policy_rate / 365.0
        self.emergency_cost = emergency_cit_cost

    def _expected_cost(
        self,
        v0: float,
        demand_scenarios: np.ndarray,
    ) -> float:
        """
        Compute expected 7-day cost across *demand_scenarios*.

        Parameters
        ----------
        v0 : candidate vault level
        demand_scenarios : (N, 7) array of sampled daily demand
        """
        # idle cost per day: max(0, v0 - D_day) * daily_rate
        idle = np.maximum(0.0, v0 - demand_scenarios) * self.daily_rate
        # emergency: if demand on any day exceeds v0
        stockout = (demand_scenarios > v0).astype(np.float64) * self.emergency_cost

        total_per_scenario = idle.sum(axis=1) + stockout.sum(axis=1)
        return float(total_per_scenario.mean())

    def optimize(
        self,
        forecast_mean: np.ndarray,
        forecast_std: np.ndarray,
        vault_capacity: float,
        current_vault_level: float = 0.0,
        branch_minimum: Optional[float] = None,
        n_scenarios: int = 1000,
    ) -> Dict:
        """
        SAA optimisation.

        Parameters
        ----------
        forecast_mean : (7,) predicted daily demand means
        forecast_std  : (7,) predicted daily demand stds
        vault_capacity : maximum vault capacity
        current_vault_level : current vault balance for comparison
        branch_minimum : hard floor (e.g., regulatory minimum)
        n_scenarios : number of Monte-Carlo scenarios

        Returns
        -------
        dict with optimal_vault_level, costs, savings, etc.
        """
        forecast_mean = np.asarray(forecast_mean, dtype=np.float64)
        forecast_std = np.asarray(forecast_std, dtype=np.float64).clip(min=1e-3)

        # Generate demand scenarios: N(mean, std) per day
        rng = np.random.default_rng(42)
        scenarios = rng.normal(
            loc=forecast_mean[np.newaxis, :],
            scale=forecast_std[np.newaxis, :],
            size=(n_scenarios, len(forecast_mean)),
        )
        scenarios = np.maximum(scenarios, 0.0)  # demand cannot be negative

        # Bounds for vault level
        lower = branch_minimum if branch_minimum is not None else 0.0
        upper = vault_capacity if vault_capacity > 0 else forecast_mean.max() * 5

        # Optimise
        result = minimize_scalar(
            self._expected_cost,
            bounds=(lower, upper),
            args=(scenarios,),
            method="bounded",
        )
        optimal_v0 = float(result.x)

        # Costs
        cost_optimal = self._expected_cost(optimal_v0, scenarios)
        cost_current = (
            self._expected_cost(current_vault_level, scenarios)
            if current_vault_level > 0
            else cost_optimal
        )

        daily_saving = max(0.0, cost_current - cost_optimal)
        annual_savings = daily_saving * (365.0 / 7.0)  # scale weekly to annual

        # Stockout probability at optimal level
        stockout_days = (scenarios > optimal_v0).any(axis=1)
        stockout_prob = float(stockout_days.mean())

        # Confidence interval on optimal level (bootstrap-like from scenarios)
        scenario_totals = scenarios.sum(axis=1)
        ci_lower = float(np.percentile(scenario_totals, 5))
        ci_upper = float(np.percentile(scenario_totals, 95))

        # Histogram of total 7-day demand for visualisation
        hist_counts, _ = np.histogram(scenario_totals, bins=50)
        scenario_distribution = hist_counts.tolist()

        # Denomination split
        denomination_split = {
            denom: round(optimal_v0 * pct, 2)
            for denom, pct in self.DENOMINATION_SPLIT.items()
        }

        return {
            "optimal_vault_level": round(optimal_v0, 2),
            "current_vault_level": round(current_vault_level, 2),
            "expected_daily_cost_current": round(cost_current / 7.0, 2),
            "expected_daily_cost_optimal": round(cost_optimal / 7.0, 2),
            "annual_savings": round(annual_savings, 2),
            "confidence_interval": [round(ci_lower, 2), round(ci_upper, 2)],
            "scenario_distribution": scenario_distribution,
            "stockout_probability": round(stockout_prob, 4),
            "denomination_split": denomination_split,
        }


# ======================================================================
# 3. CashEfficiencyEngine
# ======================================================================

class CashEfficiencyEngine:
    """
    Game theory mechanism design and branch scoring.
    Computes CES (Cash Efficiency Score), BMIS (Branch Manager Incentive Score),
    and Nash equilibrium analysis for the Hoard / Trust / Aggressive game.
    """

    # Manager strategies
    MANAGER_STRATEGIES = ["Hoard", "Trust Model", "Aggressive Minimize"]
    # Treasury strategies
    TREASURY_STRATEGIES = ["Guarantee CIT", "No Guarantee", "Penalty Only"]

    # Payoff matrices
    PAYOFF_MANAGER = np.array([
        [3, 3, 1],   # Hoard
        [8, 5, 4],   # Trust Model
        [6, 2, 1],   # Aggressive Minimize
    ], dtype=np.float64)

    PAYOFF_TREASURY = np.array([
        [2, 3, 4],   # Hoard
        [9, 6, 5],   # Trust Model
        [4, 1, 2],   # Aggressive Minimize
    ], dtype=np.float64)

    def compute_ces(self, avg_idle_cash: float, avg_vault_balance: float) -> float:
        """
        Cash Efficiency Score = 1 - (avg_idle / avg_balance).
        Clamped to [0, 1].
        """
        if avg_vault_balance <= 0:
            return 0.0
        return max(0.0, min(1.0, 1.0 - (avg_idle_cash / avg_vault_balance)))

    def compute_bmis(
        self,
        ces: float,
        stockout_rate: float = 0.05,
        forecast_adherence: float = 0.85,
    ) -> float:
        """
        Branch Manager Incentive Score.
        BMIS = 0.5 * CES + 0.3 * (1 - stockout_rate) + 0.2 * adherence
        """
        return 0.5 * ces + 0.3 * (1.0 - stockout_rate) + 0.2 * forecast_adherence

    def nash_equilibrium_analysis(self) -> Dict:
        """
        Analyse the 3x3 branch-manager vs. treasury game.
        Returns payoff matrices, Nash equilibria, and recommended strategy.
        """
        equilibria = find_nash_equilibria(self.PAYOFF_MANAGER, self.PAYOFF_TREASURY)

        # Also run iterated elimination to confirm
        _, _, remaining_rows, remaining_cols = iterated_elimination(
            self.PAYOFF_MANAGER.copy(), self.PAYOFF_TREASURY.copy()
        )

        # Determine recommended strategy
        if equilibria:
            best = equilibria[0]
            rec_manager = self.MANAGER_STRATEGIES[best[0]]
            rec_treasury = self.TREASURY_STRATEGIES[best[1]]
        else:
            rec_manager = self.MANAGER_STRATEGIES[1]  # default Trust Model
            rec_treasury = self.TREASURY_STRATEGIES[0]  # default Guarantee CIT

        explanation = (
            f"The Nash equilibrium is ({rec_manager}, {rec_treasury}). "
            f"When Treasury guarantees emergency CIT coverage, branch managers "
            f"are incentivized to trust the forecasting model rather than hoarding "
            f"excess cash. This yields the highest combined utility for both "
            f"parties: low idle-cash cost for Treasury and operational safety for "
            f"the branch manager."
        )

        return {
            "manager_strategies": list(self.MANAGER_STRATEGIES),
            "treasury_strategies": list(self.TREASURY_STRATEGIES),
            "payoff_matrix_manager": self.PAYOFF_MANAGER.tolist(),
            "payoff_matrix_treasury": self.PAYOFF_TREASURY.tolist(),
            "nash_equilibria": equilibria,
            "iterated_elimination_remaining": {
                "rows": remaining_rows,
                "cols": remaining_cols,
            },
            "recommended_strategy": {
                "manager": rec_manager,
                "treasury": rec_treasury,
            },
            "explanation": explanation,
        }

    def analyze_branch(self, db_session: Session, branch_id: int) -> Dict:
        """
        Full game-theory-informed analysis for a single branch.
        Combines CES, BMIS, Nash equilibrium, and peer ranking.
        """
        branch = db_session.query(Branch).filter(Branch.id == branch_id).first()
        if branch is None:
            return {"error": f"Branch {branch_id} not found."}

        # ---- Vault position stats ----
        positions = (
            db_session.query(VaultPosition)
            .filter(VaultPosition.branch_id == branch_id)
            .order_by(VaultPosition.date.desc())
            .limit(90)
            .all()
        )

        if not positions:
            return {
                "branch_id": branch.branch_id,
                "error": "No vault position data available.",
            }

        avg_balance = float(np.mean([vp.closing_balance for vp in positions]))
        avg_deposits = float(np.mean([vp.deposits for vp in positions]))
        avg_withdrawals = float(np.mean([vp.withdrawals for vp in positions]))
        demand = avg_withdrawals - avg_deposits
        avg_idle = max(0.0, avg_balance - demand) if demand > 0 else max(0.0, avg_balance * 0.3)

        # ---- Scores ----
        ces = self.compute_ces(avg_idle, avg_balance)
        bmis = self.compute_bmis(ces)

        # ---- Nash equilibrium (same for all branches) ----
        nash = self.nash_equilibrium_analysis()

        # ---- Peer ranking ----
        all_branches = db_session.query(Branch).all()
        branch_scores = []
        for b in all_branches:
            b_idle = b.idle_cash if b.idle_cash else 0.0
            b_bal = b.current_vault_balance if b.current_vault_balance else 1.0
            b_ces = self.compute_ces(b_idle, b_bal)
            branch_scores.append((b.id, b_ces))

        branch_scores.sort(key=lambda x: x[1], reverse=True)
        rank = next(
            (i + 1 for i, (bid, _) in enumerate(branch_scores) if bid == branch_id),
            len(branch_scores),
        )

        return {
            "branch_id": branch.branch_id,
            "branch_name": branch.name,
            "branch_type": branch.branch_type.value if branch.branch_type else "Unknown",
            "avg_vault_balance": round(avg_balance, 2),
            "avg_idle_cash": round(avg_idle, 2),
            "avg_daily_demand": round(demand, 2),
            "cash_efficiency_score": round(ces, 4),
            "branch_manager_incentive_score": round(bmis, 4),
            "peer_rank": rank,
            "total_branches": len(all_branches),
            "nash_equilibrium": nash,
        }


# ======================================================================
# Network summary
# ======================================================================

def get_network_summary(db_session: Session) -> Dict:
    """
    Aggregate UC-01 metrics across all branches in the network.
    """
    from app.core.reconciled import apply_reconciled_to_orm

    branches = db_session.query(Branch).all()

    if not branches:
        return {
            "total_branches": 0,
            "total_idle_cash": 0.0,
            "avg_ces": 0.0,
            "total_annual_savings": 0.0,
            "avg_forecast_accuracy": 0.0,
            "sbp_policy_rate": POLICY_RATE,
            "top_idle_branches": [],
            "branch_type_breakdown": {},
        }

    # Reconcile idle/balance to the ledger so UC-01 matches the CFO layer (~33B, not
    # the stale ~50B snapshot). In-memory only, under no_autoflush, never committed.
    with db_session.no_autoflush:
        data_source = "reconciled" if apply_reconciled_to_orm(db_session, branches) else "snapshot"

    engine = CashEfficiencyEngine()
    optimizer = VaultOptimizer()
    daily_rate = optimizer.daily_rate

    total_idle = 0.0
    total_savings = 0.0
    ces_scores = []
    branch_idle_list = []
    type_breakdown: Dict[str, int] = {}

    for b in branches:
        idle = b.idle_cash if b.idle_cash else 0.0
        balance = b.current_vault_balance if b.current_vault_balance else 0.0

        total_idle += idle

        ces = engine.compute_ces(idle, balance)
        ces_scores.append(ces)

        # Estimated annual saving = idle_cash * daily_rate * 365
        saving = idle * daily_rate * 365
        total_savings += saving

        btype = b.branch_type.value if b.branch_type else "Unknown"
        type_breakdown[btype] = type_breakdown.get(btype, 0) + 1

        branch_idle_list.append({
            "branch_id": b.branch_id,
            "name": b.name,
            "city": b.city,
            "branch_type": btype,
            "idle_cash": round(idle, 2),
            "vault_balance": round(balance, 2),
            "ces": round(ces, 4),
        })

    # Sort by idle cash descending, take top 15
    branch_idle_list.sort(key=lambda x: x["idle_cash"], reverse=True)
    top_idle = branch_idle_list[:15]

    avg_ces = float(np.mean(ces_scores)) if ces_scores else 0.0

    # Average forecast accuracy: estimate from CES (higher CES => better adherence)
    avg_forecast_accuracy = min(1.0, avg_ces + 0.15)  # heuristic baseline

    return {
        "total_branches": len(branches),
        "total_idle_cash": round(total_idle, 2),
        "avg_ces": round(avg_ces, 4),
        "total_annual_savings": round(total_savings, 2),
        "avg_forecast_accuracy": round(avg_forecast_accuracy, 4),
        "sbp_policy_rate": POLICY_RATE,
        "top_idle_branches": top_idle,
        "branch_type_breakdown": type_breakdown,
        "data_source": data_source,
    }
