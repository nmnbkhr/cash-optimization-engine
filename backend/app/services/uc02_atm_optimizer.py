"""
UC-02: ATM Cash Replenishment Optimization
============================================
Optimizes ATM-level cash replenishment across the UBL network.
ALL computation runs locally: PyTorch LSTM + DQN on GPU, value iteration,
Stackelberg game theory. No external API calls.

Classes:
    ATMDemandLSTM         - PyTorch LSTM for 7-day ATM dispense forecasting
    ATMInventoryOptimizer - (s,S) inventory policy via value iteration
    ATMReplenishmentDQN   - Deep Q-Network for replenishment decisions
    ATMEnvironment        - Simulation environment for DQN training
    StackelbergCITGame    - Bank vs CIT company strategic interaction

Functions:
    prepare_atm_features  - Feature engineering from dispense history
    train_atm_model       - End-to-end LSTM training pipeline
    forecast_atm          - Inference pipeline for a single ATM
    dqn_recommend         - DQN-based replenishment recommendation
    get_atm_network_summary - Aggregate UC-02 metrics across all ATMs
"""

import collections
import logging
import math
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import pk_calendar
from app.core.constants import (
    ATM_PARTIAL_STOCKOUT,
    ATM_STOCKOUT_PENALTY,
    CIT_COST_PER_KM,
    CIT_COST_PER_TRIP,
    POLICY_RATE,
)
from app.database import SessionLocal
from app.models.atm import ATM, ATMCassette

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths & device
# ---------------------------------------------------------------------------
MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
LSTM_MODEL_PATH = MODEL_DIR / "uc02_atm_lstm_best.pt"
DQN_MODEL_PATH = MODEL_DIR / "uc02_dqn_best.pt"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info("UC-02 using device: %s", DEVICE)

# ---------------------------------------------------------------------------
# Islamic / Pakistan calendar helpers
# ---------------------------------------------------------------------------
# Single source of truth is app.core.pk_calendar (SBP-verified for 2026).
def _is_eid_window(d: date, window: int = 7) -> bool:
    """True if *d* is within *window* days of either Eid (Fitr or Adha)."""
    feats = pk_calendar.calendar_features(d)
    return abs(feats["days_to_eid_fitr"]) <= window or abs(feats["days_to_eid_adha"]) <= window


ATM_TYPE_MAP: Dict[str, int] = {"lobby": 0, "offsite": 1, "mall": 2}

# Standard denomination mix for ATM cassettes
DENOM_MIX = {5000: 0.40, 1000: 0.30, 500: 0.20, 100: 0.10}


# ---------------------------------------------------------------------------
# Synthetic dispense data generator
# ---------------------------------------------------------------------------
def _generate_synthetic_dispense(
    avg_daily: float,
    n_days: int = 365,
    start_date: Optional[date] = None,
    atm_type: str = "lobby",
    seed: Optional[int] = None,
) -> List[Tuple[date, float]]:
    """
    Generate synthetic daily dispense data from an ATM's avg_daily_dispense
    with realistic day-of-week and seasonal patterns.
    """
    rng = np.random.default_rng(seed)
    if start_date is None:
        start_date = date.today() - timedelta(days=n_days)

    # Day-of-week multipliers (Mon=0 .. Sun=6)
    # Friday/Saturday higher (weekend in Pakistan), Sunday lower
    dow_mult = np.array([1.0, 0.95, 0.95, 1.0, 1.15, 1.20, 0.80])

    # ATM type multiplier for variability
    type_var = {"lobby": 0.15, "offsite": 0.25, "mall": 0.20}
    noise_std = type_var.get(atm_type, 0.20)

    data = []
    for i in range(n_days):
        d = start_date + timedelta(days=i)
        base = avg_daily

        # Day-of-week effect
        base *= dow_mult[d.weekday()]

        # Salary day surge (1st and 15th)
        if d.day in (1, 2, 15, 16):
            base *= 1.35

        # Eid window surge
        if _is_eid_window(d, 5):
            base *= 1.60
        elif _is_eid_window(d, 10):
            base *= 1.25

        # Ramadan pattern (higher evenings -> higher daily)
        if pk_calendar.is_ramadan(d)[0]:
            base *= 1.15

        # Month-end effect
        if d.day >= 28:
            base *= 1.10

        # Seasonal: slightly higher in winter (Nov-Feb)
        if d.month in (11, 12, 1, 2):
            base *= 1.05

        # Random noise
        dispense = max(0.0, base * (1.0 + rng.normal(0, noise_std)))
        data.append((d, round(dispense, 2)))

    return data


# ======================================================================
# 1. ATMDemandLSTM
# ======================================================================

class ATMDemandLSTM(nn.Module):
    """
    Two-layer LSTM for ATM-level 7-day dispense forecasting.
    Dual heads (mean + log_var) for uncertainty quantification.
    """

    NUM_FEATURES = 19  # 7(dow) + 1(dom) + 1(salary) + 1(fri) + 1(eid) + 1(ramadan) + 1(type) + 1(lag1) + 1(lag7) + 1(mean7) + 1(std7) + 2(sin,cos)
    LOOKBACK = 14
    HORIZON = 7

    def __init__(
        self,
        input_size: int = 18,
        hidden_size: int = 48,
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
        x : (batch, seq_len=14, 18)

        Returns
        -------
        mean    : (batch, 7)
        log_var : (batch, 7)
        """
        out, _ = self.lstm(x)
        last_hidden = out[:, -1, :]
        mean = self.head_mean(last_hidden)
        log_var = self.head_logvar(last_hidden)
        return mean, log_var


# ======================================================================
# Feature engineering
# ======================================================================

def prepare_atm_features(
    dispense_history: List[Tuple[date, float]],
    atm_type: str,
) -> Tuple[np.ndarray, np.ndarray, Dict]:
    """
    Convert chronological (date, dispense_amount) tuples into LSTM-ready arrays.

    Returns
    -------
    X : (N, LOOKBACK=14, 18)
    y : (N, HORIZON=7)
    scaler_params : {"mean": float, "std": float}
    """
    lookback = ATMDemandLSTM.LOOKBACK
    horizon = ATMDemandLSTM.HORIZON

    if len(dispense_history) < lookback + horizon:
        logger.warning(
            "Not enough ATM dispense data: got %d, need %d",
            len(dispense_history), lookback + horizon,
        )
        return np.array([]), np.array([]), {}

    # Sort by date
    history = sorted(dispense_history, key=lambda x: x[0])
    n = len(history)
    dates = [h[0] for h in history]
    dispense = np.array([h[1] for h in history], dtype=np.float64)

    # Normalize dispense for scaler
    d_mean = float(dispense.mean()) if dispense.mean() != 0 else 1.0
    d_std = float(dispense.std()) if dispense.std() > 0 else 1.0
    scaler_params = {"mean": d_mean, "std": d_std}

    atm_type_enc = ATM_TYPE_MAP.get(atm_type.lower(), 0) if atm_type else 0

    # Build raw feature matrix (n, 18)
    raw = np.zeros((n, ATMDemandLSTM.NUM_FEATURES), dtype=np.float64)

    for t in range(n):
        d = dates[t]
        col = 0

        # day_of_week one-hot (7 features)
        dow = d.weekday()
        for k in range(7):
            raw[t, col + k] = 1.0 if k == dow else 0.0
        col += 7

        # day_of_month normalised (1 feature)
        raw[t, col] = d.day / 31.0
        col += 1

        # is_salary_day (1 feature)
        raw[t, col] = 1.0 if d.day in (1, 2, 15, 16) else 0.0
        col += 1

        # is_friday (1 feature)
        raw[t, col] = 1.0 if dow == 4 else 0.0
        col += 1

        # is_eid_window (1 feature)
        raw[t, col] = 1.0 if _is_eid_window(d, 7) else 0.0
        col += 1

        # is_ramadan (1 feature)
        raw[t, col] = 1.0 if pk_calendar.is_ramadan(d)[0] else 0.0
        col += 1

        # atm_type_encoded (1 feature, normalized 0-2 -> 0-1)
        raw[t, col] = atm_type_enc / 2.0
        col += 1

        # lagged_dispense_1d (1 feature)
        raw[t, col] = (dispense[t - 1] / d_mean) if t >= 1 else 1.0
        col += 1

        # lagged_dispense_7d (1 feature)
        raw[t, col] = (dispense[t - 7] / d_mean) if t >= 7 else 1.0
        col += 1

        # rolling_mean_7d (1 feature)
        if t >= 7:
            raw[t, col] = dispense[t - 7:t].mean() / d_mean
        else:
            raw[t, col] = 1.0
        col += 1

        # rolling_std_7d (1 feature)
        if t >= 7:
            raw[t, col] = dispense[t - 7:t].std() / d_std if d_std > 0 else 0.0
        else:
            raw[t, col] = 0.0
        col += 1

        # month_sin, month_cos (2 features)
        month_angle = 2.0 * math.pi * d.month / 12.0
        raw[t, col] = math.sin(month_angle)
        col += 1
        raw[t, col] = math.cos(month_angle)
        col += 1
        # col = 18

    # Min-max scale
    feat_min = raw.min(axis=0)
    feat_max = raw.max(axis=0)
    feat_range = feat_max - feat_min
    feat_range[feat_range == 0] = 1.0
    scaled = (raw - feat_min) / feat_range

    # Build sliding windows
    num_samples = n - lookback - horizon + 1
    if num_samples <= 0:
        return np.array([]), np.array([]), scaler_params

    X = np.zeros((num_samples, lookback, ATMDemandLSTM.NUM_FEATURES), dtype=np.float32)
    y = np.zeros((num_samples, horizon), dtype=np.float32)

    for i in range(num_samples):
        X[i] = scaled[i: i + lookback]
        y[i] = dispense[i + lookback: i + lookback + horizon]

    return X, y, scaler_params


# ======================================================================
# LSTM Training
# ======================================================================

def train_atm_model(
    db_session: Session,
    max_epochs: int = 20,
    lr: float = 1e-3,
    patience: int = 10,
) -> Dict:
    """
    Train ATMDemandLSTM on synthetic dispense data from up to 100 ATMs.
    """
    MAX_TRAIN_ATMS = 100

    all_atm_ids = [r[0] for r in db_session.query(ATM.id).filter(ATM.status == "active").all()]
    if not all_atm_ids:
        logger.error("No active ATMs found for training.")
        return {"mape": None, "mae": None, "rmse": None, "epochs_trained": 0}

    rng_sel = np.random.RandomState(42)
    if len(all_atm_ids) > MAX_TRAIN_ATMS:
        selected_ids = rng_sel.choice(all_atm_ids, MAX_TRAIN_ATMS, replace=False).tolist()
    else:
        selected_ids = all_atm_ids

    all_X, all_y = [], []
    scaler_last = {}

    for idx, atm_db_id in enumerate(selected_ids):
        atm = db_session.query(ATM).filter(ATM.id == atm_db_id).first()
        if atm is None or atm.avg_daily_dispense <= 0:
            continue

        # Generate 365 days of synthetic data
        history = _generate_synthetic_dispense(
            avg_daily=atm.avg_daily_dispense,
            n_days=365,
            atm_type=atm.location_type or "lobby",
            seed=42 + idx,
        )

        X, y, sp = prepare_atm_features(history, atm.location_type or "lobby")
        if X.size == 0:
            continue
        all_X.append(X)
        all_y.append(y)
        scaler_last = sp

    if not all_X:
        logger.error("Insufficient data after ATM feature engineering.")
        return {"mape": None, "mae": None, "rmse": None, "epochs_trained": 0}

    X_all = np.concatenate(all_X, axis=0)
    y_all = np.concatenate(all_y, axis=0)

    # Train / val split (80/20)
    n_total = len(X_all)
    split = int(n_total * 0.8)
    X_train, y_train = X_all[:split], y_all[:split]
    X_val, y_val = X_all[split:], y_all[split:]

    if len(X_val) == 0:
        split2 = int(len(X_train) * 0.8)
        X_val, y_val = X_train[split2:], y_train[split2:]
        X_train, y_train = X_train[:split2], y_train[:split2]

    if len(X_train) == 0:
        logger.error("Not enough ATM training samples.")
        return {"mape": None, "mae": None, "rmse": None, "epochs_trained": 0}

    # DataLoader for mini-batch
    BATCH_SIZE = 256
    train_ds = torch.utils.data.TensorDataset(
        torch.tensor(X_train, dtype=torch.float32),
        torch.tensor(y_train, dtype=torch.float32),
    )
    train_loader = torch.utils.data.DataLoader(
        train_ds, batch_size=BATCH_SIZE, shuffle=True, pin_memory=True,
    )
    X_val_t = torch.tensor(X_val, dtype=torch.float32, device=DEVICE)
    y_val_t = torch.tensor(y_val, dtype=torch.float32, device=DEVICE)

    # Model
    model = ATMDemandLSTM(input_size=ATMDemandLSTM.NUM_FEATURES).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    gnll = nn.GaussianNLLLoss()

    best_val_loss = float("inf")
    epochs_no_improve = 0
    best_state = None
    epochs_trained = 0

    for epoch in range(1, max_epochs + 1):
        model.train()
        epoch_loss = 0.0
        n_batches = 0
        for X_b, y_b in train_loader:
            X_b = X_b.to(DEVICE, non_blocking=True)
            y_b = y_b.to(DEVICE, non_blocking=True)
            optimizer.zero_grad()
            mean, log_var = model(X_b)
            var = torch.exp(log_var).clamp(min=1e-6)
            loss = gnll(mean, y_b, var)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()
            epoch_loss += loss.item()
            n_batches += 1

        # Validation
        model.eval()
        with torch.no_grad():
            v_mean, v_logvar = model(X_val_t)
            v_var = torch.exp(v_logvar).clamp(min=1e-6)
            val_loss = gnll(v_mean, y_val_t, v_var).item()

        epochs_trained = epoch
        avg_train = epoch_loss / max(n_batches, 1)
        logger.info("UC-02 Epoch %d  train=%.4f  val=%.4f", epoch, avg_train, val_loss)

        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= patience:
                logger.info("UC-02 early stopping at epoch %d", epoch)
                break

    # Restore best & save
    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "model_state": model.state_dict(),
        "scaler_params": scaler_last,
        "input_size": ATMDemandLSTM.NUM_FEATURES,
    }
    torch.save(checkpoint, str(LSTM_MODEL_PATH))
    logger.info("UC-02 LSTM saved to %s", LSTM_MODEL_PATH)

    # Metrics on val set
    with torch.no_grad():
        preds = model(X_val_t)[0].cpu().numpy()
    actuals = y_val

    mae = float(np.mean(np.abs(preds - actuals)))
    rmse = float(np.sqrt(np.mean((preds - actuals) ** 2)))
    nonzero = np.abs(actuals) > 1e-3
    mape = float(np.mean(np.abs((preds[nonzero] - actuals[nonzero]) / actuals[nonzero]))) * 100 if nonzero.any() else 0.0

    metrics = {
        "mape": round(mape, 2),
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "epochs_trained": epochs_trained,
    }
    logger.info("UC-02 LSTM training complete: %s", metrics)
    return metrics


# ======================================================================
# LSTM Inference
# ======================================================================

def forecast_atm(db_session: Session, atm_db_id: int) -> Dict:
    """
    Run 7-day dispense forecast for a single ATM.
    """
    # Load or train model
    if LSTM_MODEL_PATH.exists():
        checkpoint = torch.load(str(LSTM_MODEL_PATH), map_location=DEVICE, weights_only=False)
    else:
        logger.info("No UC-02 LSTM found -- training from scratch.")
        metrics = train_atm_model(db_session)
        if not LSTM_MODEL_PATH.exists():
            return {"atm_id": str(atm_db_id), "error": "Model training failed."}
        checkpoint = torch.load(str(LSTM_MODEL_PATH), map_location=DEVICE, weights_only=False)

    input_size = checkpoint.get("input_size", ATMDemandLSTM.NUM_FEATURES)
    model = ATMDemandLSTM(input_size=input_size).to(DEVICE)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    # Get ATM info
    atm = db_session.query(ATM).filter(ATM.id == atm_db_id).first()
    if atm is None:
        return {"atm_id": str(atm_db_id), "error": "ATM not found."}

    avg_daily = atm.avg_daily_dispense if atm.avg_daily_dispense and atm.avg_daily_dispense > 0 else 500000.0
    atm_type = atm.location_type or "lobby"

    # Generate synthetic dispense history (last 60 days for context)
    history = _generate_synthetic_dispense(
        avg_daily=avg_daily,
        n_days=60,
        start_date=date.today() - timedelta(days=60),
        atm_type=atm_type,
        seed=hash(atm.atm_id) % (2**31),
    )

    X, y, scaler_params = prepare_atm_features(history, atm_type)
    if X.size == 0:
        return {"atm_id": atm.atm_id, "error": "Feature extraction failed -- insufficient data."}

    # Use last window for inference
    X_input = X[-1:]
    X_t = torch.tensor(X_input, dtype=torch.float32, device=DEVICE)

    with torch.no_grad():
        mean_t, logvar_t = model(X_t)
    pred_mean = mean_t.cpu().numpy().flatten()
    pred_std = np.sqrt(np.exp(logvar_t.cpu().numpy().flatten()).clip(min=1e-6))

    # Clamp predictions and uncertainty to reasonable range relative to ATM's avg dispense
    pred_mean = np.clip(pred_mean, avg_daily * 0.1, avg_daily * 3.0)
    pred_std = np.clip(pred_std, avg_daily * 0.05, avg_daily * 0.5)

    # Forecast dates
    last_date = history[-1][0]
    forecast_dates = [(last_date + timedelta(days=i + 1)) for i in range(ATMDemandLSTM.HORIZON)]

    # Confidence intervals (90%)
    ci_lower = np.maximum(pred_mean - 1.645 * pred_std, 0.0)
    ci_upper = pred_mean + 1.645 * pred_std

    # Denomination breakdown
    denom_breakdown = {}
    for day_idx in range(ATMDemandLSTM.HORIZON):
        day_total = float(pred_mean[day_idx])
        denom_breakdown[forecast_dates[day_idx].isoformat()] = {
            str(d): round(day_total * pct, 2) for d, pct in DENOM_MIX.items()
        }

    # Historical predictions (last 14 available windows)
    historical = []
    n_hist = min(14, len(X))
    if n_hist > 0 and y.size > 0:
        X_hist = X[-n_hist:]
        y_hist = y[-n_hist:]
        X_hist_t = torch.tensor(X_hist, dtype=torch.float32, device=DEVICE)
        with torch.no_grad():
            hist_mean, _ = model(X_hist_t)
        hist_pred = np.clip(hist_mean.cpu().numpy(), avg_daily * 0.1, avg_daily * 3.0)

        for idx in range(n_hist):
            hist_idx = len(history) - len(X) + idx
            if 0 <= hist_idx < len(history):
                hist_date = history[hist_idx][0]
                historical.append({
                    "date": hist_date.isoformat(),
                    "actual": round(float(y_hist[idx, 0]), 2),
                    "predicted": round(float(hist_pred[idx, 0]), 2),
                })

    # Quick model metrics on available data
    if X.size > 0 and y.size > 0:
        X_all_t = torch.tensor(X, dtype=torch.float32, device=DEVICE)
        with torch.no_grad():
            all_mean, _ = model(X_all_t)
        all_preds = all_mean.cpu().numpy()
        all_actuals = y
        mae = float(np.mean(np.abs(all_preds - all_actuals)))
        rmse = float(np.sqrt(np.mean((all_preds - all_actuals) ** 2)))
        nz = np.abs(all_actuals) > 1e-3
        mape = float(np.mean(np.abs((all_preds[nz] - all_actuals[nz]) / all_actuals[nz]))) * 100 if nz.any() else 0.0
    else:
        mape, mae, rmse = 0.0, 0.0, 0.0

    return {
        "atm_id": atm.atm_id,
        "forecast_dates": [d.isoformat() for d in forecast_dates],
        "predicted_dispense": [round(float(v), 2) for v in pred_mean],
        "confidence_lower": [round(float(v), 2) for v in ci_lower],
        "confidence_upper": [round(float(v), 2) for v in ci_upper],
        "denomination_breakdown": denom_breakdown,
        "model_metrics": {
            "mape": round(mape, 2),
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
        },
        "historical": historical[-14:],
    }


# ======================================================================
# 2. ATMInventoryOptimizer -- (s,S) via value iteration
# ======================================================================

class ATMInventoryOptimizer:
    """
    Computes optimal (s, S) inventory policy per denomination cassette
    using value iteration over a 30-day horizon.
    """

    def __init__(
        self,
        policy_rate: float = POLICY_RATE,
        stockout_penalty: float = ATM_STOCKOUT_PENALTY,
        cit_cost: float = CIT_COST_PER_TRIP,
        partial_stockout: float = ATM_PARTIAL_STOCKOUT,
    ):
        self.daily_holding_rate = policy_rate / 365.0
        self.stockout_penalty = stockout_penalty
        self.cit_cost = cit_cost
        self.partial_stockout = partial_stockout

    def _value_iteration_ss(
        self,
        capacity: float,
        daily_demand_mean: float,
        daily_demand_std: float,
        n_levels: int = 20,
        horizon: int = 30,
        gamma: float = 0.99,
    ) -> Tuple[float, float, float, float]:
        """
        Value iteration over discretized inventory levels.

        States: inventory level discretized into n_levels bins.
        Actions: 0 = do_nothing, 1 = replenish_to_S (capacity).
        Transition: level -= demand (stochastic), clipped to [0, capacity].

        Returns (s_opt, S_opt, cost_optimal, cost_baseline).
        """
        if capacity <= 0:
            return 0.0, 0.0, 0.0, 0.0

        levels = np.linspace(0, capacity, n_levels)
        step = levels[1] - levels[0] if n_levels > 1 else capacity

        # Demand samples for expectation
        rng = np.random.default_rng(42)
        n_demand_samples = 50
        demand_samples = np.maximum(
            rng.normal(daily_demand_mean, max(daily_demand_std, 1.0), n_demand_samples),
            0.0,
        )

        # Value function: V[state_idx]
        V = np.zeros(n_levels, dtype=np.float64)
        policy = np.zeros(n_levels, dtype=np.int32)  # 0=nothing, 1=replenish

        # Backward induction over horizon
        for t in range(horizon - 1, -1, -1):
            V_new = np.zeros(n_levels, dtype=np.float64)
            for si in range(n_levels):
                level = levels[si]
                best_cost = float("inf")
                best_action = 0

                for action in [0, 1]:
                    if action == 1:
                        # Replenish to capacity
                        effective_level = capacity
                        trip_cost = self.cit_cost
                    else:
                        effective_level = level
                        trip_cost = 0.0

                    # Expected one-step cost over demand samples
                    costs = []
                    next_vals = []
                    for demand in demand_samples:
                        new_level = max(0.0, effective_level - demand)

                        # Holding cost on average inventory
                        avg_inv = (effective_level + new_level) / 2.0
                        holding = avg_inv * self.daily_holding_rate

                        # Stockout penalty
                        if demand > effective_level:
                            stockout = self.stockout_penalty
                        elif demand > effective_level * 0.8:
                            stockout = self.partial_stockout * 0.3
                        else:
                            stockout = 0.0

                        one_step = trip_cost + holding + stockout

                        # Find closest level index for new_level
                        ni = int(round(new_level / step)) if step > 0 else 0
                        ni = max(0, min(n_levels - 1, ni))
                        next_vals.append(V[ni])
                        costs.append(one_step)

                    expected = np.mean(costs) + gamma * np.mean(next_vals)
                    if expected < best_cost:
                        best_cost = expected
                        best_action = action

                V_new[si] = best_cost
                policy[si] = best_action

            V = V_new

        # Extract (s, S) from policy
        # s = highest level where policy says replenish
        # S = capacity (order-up-to level)
        s_opt = 0.0
        for si in range(n_levels):
            if policy[si] == 1:
                s_opt = max(s_opt, levels[si])

        S_opt = capacity

        # Costs: optimal = V at mid-capacity start, baseline = V at 50% capacity
        mid_idx = n_levels // 2
        cost_optimal = float(V[0])  # worst case: empty
        cost_baseline = float(V[mid_idx])

        return s_opt, S_opt, cost_optimal, cost_baseline

    def optimize(
        self,
        atm_db_id: int,
        db_session: Session,
        forecast_mean: Optional[np.ndarray] = None,
        forecast_std: Optional[np.ndarray] = None,
    ) -> Dict:
        """
        Compute optimal (s, S) policy per denomination for an ATM.
        """
        atm = db_session.query(ATM).filter(ATM.id == atm_db_id).first()
        if atm is None:
            return {"error": f"ATM with id={atm_db_id} not found."}

        cassettes = db_session.query(ATMCassette).filter(ATMCassette.atm_id == atm_db_id).all()
        if not cassettes:
            return {"error": f"No cassettes found for ATM id={atm_db_id}."}

        avg_daily = atm.avg_daily_dispense if atm.avg_daily_dispense and atm.avg_daily_dispense > 0 else 500000.0

        # If no forecast provided, use avg_daily with some variance
        if forecast_mean is None:
            forecast_mean = np.full(7, avg_daily, dtype=np.float64)
        if forecast_std is None:
            forecast_std = np.full(7, avg_daily * 0.20, dtype=np.float64)

        daily_mean = float(np.mean(forecast_mean))
        daily_std = float(np.mean(forecast_std))

        policies = {}
        total_cost_current = 0.0
        total_cost_optimal = 0.0
        earliest_replenish = 999

        for cassette in cassettes:
            denom = cassette.denomination
            capacity = cassette.capacity if cassette.capacity > 0 else 1000000.0
            current = cassette.current_level if cassette.current_level else 0.0

            # Proportion of total demand for this denomination
            denom_pct = DENOM_MIX.get(denom, 0.10)
            denom_daily_mean = daily_mean * denom_pct
            denom_daily_std = daily_std * denom_pct

            s_opt, S_opt, cost_opt, cost_base = self._value_iteration_ss(
                capacity=capacity,
                daily_demand_mean=denom_daily_mean,
                daily_demand_std=denom_daily_std,
            )

            # Determine action
            if current <= s_opt:
                action = "REPLENISH NOW"
                days_until = 0
            elif denom_daily_mean > 0:
                days_until = max(0, int((current - s_opt) / denom_daily_mean))
                if days_until <= 2:
                    action = "REPLENISH SOON"
                else:
                    action = "OK"
            else:
                days_until = 30
                action = "OK"

            earliest_replenish = min(earliest_replenish, days_until)

            # Current cost estimate (30-day holding on current level)
            current_holding_30d = current * self.daily_holding_rate * 30
            optimal_holding_30d = ((s_opt + S_opt) / 2.0) * self.daily_holding_rate * 30
            total_cost_current += current_holding_30d
            total_cost_optimal += optimal_holding_30d

            policies[str(denom)] = {
                "s": round(s_opt, 2),
                "S": round(S_opt, 2),
                "current": round(current, 2),
                "capacity": round(capacity, 2),
                "action": action,
                "days_until_reorder": days_until,
                "daily_demand": round(denom_daily_mean, 2),
            }

        # Recommended load amount
        recommended_load = 0.0
        for cassette in cassettes:
            denom = cassette.denomination
            pol = policies.get(str(denom))
            if pol and pol["action"] in ("REPLENISH NOW", "REPLENISH SOON"):
                recommended_load += max(0.0, pol["S"] - pol["current"])

        annual_savings = max(0.0, (total_cost_current - total_cost_optimal) * (365.0 / 30.0))

        return {
            "atm_id": atm.atm_id,
            "policies": policies,
            "total_expected_cost_current": round(total_cost_current, 2),
            "total_expected_cost_optimal": round(total_cost_optimal, 2),
            "annual_savings": round(annual_savings, 2),
            "next_replenishment_days": earliest_replenish if earliest_replenish < 999 else 0,
            "recommended_load_amount": round(recommended_load, 2),
        }


# ======================================================================
# 3. ATMReplenishmentDQN
# ======================================================================

class ATMReplenishmentDQN(nn.Module):
    """MLP Deep Q-Network: 128 -> 64 -> 32 -> 5 actions."""

    # State: cassette_levels(4) + day_of_week(1) + salary_flag(1) + eid_flag(1)
    #        + days_since_load(1) + forecast_3d(3) + atm_type_onehot(3) = 14
    STATE_DIM = 14
    N_ACTIONS = 5
    ACTION_NAMES = [
        "Do Nothing",
        "Light Load (50%)",
        "Standard Load (75%)",
        "Full Load (100%)",
        "Rebalance",
    ]

    def __init__(self, state_dim: int = 14, n_actions: int = 5):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Returns Q-values for each action: (batch, n_actions)."""
        return self.net(x)


# ---------------------------------------------------------------------------
# ATM Simulation Environment
# ---------------------------------------------------------------------------

class ATMEnvironment:
    """
    Simulates ATM operations over a 30-day episode for DQN training.
    """

    def __init__(
        self,
        capacity: float = 5_000_000.0,
        avg_daily: float = 800_000.0,
        atm_type_idx: int = 0,
        holding_rate: float = POLICY_RATE / 365.0,
        stockout_penalty: float = ATM_STOCKOUT_PENALTY,
        cit_cost: float = CIT_COST_PER_TRIP,
    ):
        self.capacity = capacity
        self.avg_daily = avg_daily
        self.atm_type_idx = atm_type_idx
        self.holding_rate = holding_rate
        self.stockout_penalty = stockout_penalty
        self.cit_cost = cit_cost
        self.horizon = 30
        self.rng = np.random.default_rng()
        self.reset()

    def reset(self) -> np.ndarray:
        """Reset to a random starting state."""
        # Start with 60-90% capacity across 4 cassettes
        fill_pct = self.rng.uniform(0.6, 0.9, 4)
        per_cassette_cap = self.capacity / 4.0
        self.cassette_levels = fill_pct * per_cassette_cap
        self.day = 0
        self.days_since_load = self.rng.integers(0, 10)
        self.total_reward = 0.0
        return self._get_state()

    def _get_state(self) -> np.ndarray:
        """Build 14-dim state vector."""
        state = np.zeros(ATMReplenishmentDQN.STATE_DIM, dtype=np.float32)
        per_cap = self.capacity / 4.0 if self.capacity > 0 else 1.0

        # Cassette levels normalized [0, 1]
        for i in range(4):
            state[i] = self.cassette_levels[i] / per_cap

        # Day of week (normalized)
        state[4] = (self.day % 7) / 6.0

        # Salary flag
        day_of_month = (self.day % 30) + 1
        state[5] = 1.0 if day_of_month in (1, 2, 15, 16) else 0.0

        # Eid flag (random ~5% of days during training)
        state[6] = 1.0 if self.rng.random() < 0.05 else 0.0

        # Days since load (normalized)
        state[7] = min(self.days_since_load / 15.0, 1.0)

        # Forecast 3-day ahead (normalized)
        dow_mult = [1.0, 0.95, 0.95, 1.0, 1.15, 1.20, 0.80]
        for k in range(3):
            future_dow = (self.day + k + 1) % 7
            forecast = self.avg_daily * dow_mult[future_dow]
            state[8 + k] = min(forecast / (self.capacity / 4.0), 2.0) if self.capacity > 0 else 0.5

        # ATM type one-hot (3)
        if 0 <= self.atm_type_idx < 3:
            state[11 + self.atm_type_idx] = 1.0

        return state

    def step(self, action: int) -> Tuple[np.ndarray, float, bool]:
        """
        Execute action, simulate one day.

        Actions: 0=nothing, 1=light(50%), 2=standard(75%), 3=full(100%), 4=rebalance
        Returns: (next_state, reward, done)
        """
        per_cap = self.capacity / 4.0
        trip_cost = 0.0

        # Apply action
        if action == 1:  # Light load 50%
            for i in range(4):
                self.cassette_levels[i] = max(self.cassette_levels[i], per_cap * 0.50)
            trip_cost = self.cit_cost
            self.days_since_load = 0
        elif action == 2:  # Standard load 75%
            for i in range(4):
                self.cassette_levels[i] = max(self.cassette_levels[i], per_cap * 0.75)
            trip_cost = self.cit_cost
            self.days_since_load = 0
        elif action == 3:  # Full load 100%
            for i in range(4):
                self.cassette_levels[i] = per_cap
            trip_cost = self.cit_cost
            self.days_since_load = 0
        elif action == 4:  # Rebalance
            avg_level = np.mean(self.cassette_levels)
            self.cassette_levels[:] = avg_level
            trip_cost = self.cit_cost * 0.5  # cheaper than full trip
            self.days_since_load = 0
        # action == 0: do nothing

        # Simulate daily demand per cassette (proportional to DENOM_MIX)
        denom_pcts = [0.40, 0.30, 0.20, 0.10]
        dow_mult = [1.0, 0.95, 0.95, 1.0, 1.15, 1.20, 0.80]
        dow = self.day % 7
        daily_total = self.avg_daily * dow_mult[dow] * self.rng.normal(1.0, 0.15)
        daily_total = max(0.0, daily_total)

        # Salary day effect
        dom = (self.day % 30) + 1
        if dom in (1, 2, 15, 16):
            daily_total *= 1.30

        holding_cost = 0.0
        stockout_cost = 0.0
        availability = 1.0

        for i in range(4):
            demand_i = daily_total * denom_pcts[i]
            if demand_i > self.cassette_levels[i]:
                shortfall = demand_i - self.cassette_levels[i]
                if self.cassette_levels[i] < demand_i * 0.2:
                    stockout_cost += self.stockout_penalty
                    availability -= 0.25
                else:
                    stockout_cost += ATM_PARTIAL_STOCKOUT * 0.5
                    availability -= 0.10
                self.cassette_levels[i] = 0.0
            else:
                self.cassette_levels[i] -= demand_i

            holding_cost += self.cassette_levels[i] * self.holding_rate

        # Availability bonus
        availability_bonus = 5000.0 * max(0.0, availability)

        # Reward (negative costs + availability bonus)
        reward = -trip_cost - holding_cost - stockout_cost + availability_bonus

        self.day += 1
        self.days_since_load += 1
        self.total_reward += reward
        done = self.day >= self.horizon

        return self._get_state(), reward, done


# ---------------------------------------------------------------------------
# Experience Replay Buffer
# ---------------------------------------------------------------------------

class ReplayBuffer:
    def __init__(self, capacity: int = 10000):
        self.buffer = collections.deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size: int):
        batch = random.sample(self.buffer, min(batch_size, len(self.buffer)))
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            np.array(states, dtype=np.float32),
            np.array(actions, dtype=np.int64),
            np.array(rewards, dtype=np.float32),
            np.array(next_states, dtype=np.float32),
            np.array(dones, dtype=np.float32),
        )

    def __len__(self):
        return len(self.buffer)


# ---------------------------------------------------------------------------
# DQN Training
# ---------------------------------------------------------------------------

def _train_dqn(
    n_episodes: int = 2000,
    batch_size: int = 64,
    gamma: float = 0.99,
    lr: float = 1e-3,
    eps_start: float = 1.0,
    eps_end: float = 0.01,
    eps_decay_steps: int = 2000,
    target_update_freq: int = 100,
    buffer_size: int = 10000,
) -> Dict:
    """
    Train the ATMReplenishmentDQN agent via experience replay.
    """
    policy_net = ATMReplenishmentDQN().to(DEVICE)
    target_net = ATMReplenishmentDQN().to(DEVICE)
    target_net.load_state_dict(policy_net.state_dict())
    target_net.eval()

    optimizer = torch.optim.Adam(policy_net.parameters(), lr=lr)
    buffer = ReplayBuffer(buffer_size)

    # Diverse environments for generalization
    env_configs = [
        {"capacity": 5_000_000, "avg_daily": 800_000, "atm_type_idx": 0},
        {"capacity": 3_000_000, "avg_daily": 500_000, "atm_type_idx": 1},
        {"capacity": 8_000_000, "avg_daily": 1_200_000, "atm_type_idx": 2},
        {"capacity": 4_000_000, "avg_daily": 600_000, "atm_type_idx": 0},
        {"capacity": 6_000_000, "avg_daily": 1_000_000, "atm_type_idx": 1},
    ]

    episode_rewards = []
    best_avg_reward = float("-inf")
    best_state_dict = None
    total_steps = 0

    for ep in range(n_episodes):
        cfg = env_configs[ep % len(env_configs)]
        env = ATMEnvironment(**cfg)
        state = env.reset()
        ep_reward = 0.0

        # Epsilon schedule
        eps = max(eps_end, eps_start - (eps_start - eps_end) * total_steps / eps_decay_steps)

        for _ in range(env.horizon):
            # Epsilon-greedy action selection
            if random.random() < eps:
                action = random.randint(0, ATMReplenishmentDQN.N_ACTIONS - 1)
            else:
                with torch.no_grad():
                    state_t = torch.tensor(state, dtype=torch.float32, device=DEVICE).unsqueeze(0)
                    q_vals = policy_net(state_t)
                    action = int(q_vals.argmax(dim=1).item())

            next_state, reward, done = env.step(action)
            buffer.push(state, action, reward, next_state, done)
            state = next_state
            ep_reward += reward
            total_steps += 1

            # Train on mini-batch
            if len(buffer) >= batch_size:
                s_b, a_b, r_b, ns_b, d_b = buffer.sample(batch_size)

                s_t = torch.tensor(s_b, dtype=torch.float32, device=DEVICE)
                a_t = torch.tensor(a_b, dtype=torch.int64, device=DEVICE).unsqueeze(1)
                r_t = torch.tensor(r_b, dtype=torch.float32, device=DEVICE).unsqueeze(1)
                ns_t = torch.tensor(ns_b, dtype=torch.float32, device=DEVICE)
                d_t = torch.tensor(d_b, dtype=torch.float32, device=DEVICE).unsqueeze(1)

                # Current Q-values
                q_current = policy_net(s_t).gather(1, a_t)

                # Target Q-values (Double DQN: use policy net for action selection)
                with torch.no_grad():
                    next_actions = policy_net(ns_t).argmax(dim=1, keepdim=True)
                    q_next = target_net(ns_t).gather(1, next_actions)
                    q_target = r_t + gamma * q_next * (1.0 - d_t)

                loss = nn.functional.mse_loss(q_current, q_target)
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(policy_net.parameters(), max_norm=10.0)
                optimizer.step()

            if done:
                break

        episode_rewards.append(ep_reward)

        # Update target network
        if (ep + 1) % target_update_freq == 0:
            target_net.load_state_dict(policy_net.state_dict())

        # Track best model (rolling avg of last 100 episodes)
        if len(episode_rewards) >= 100 and (ep + 1) % 100 == 0:
            avg_100 = np.mean(episode_rewards[-100:])
            if avg_100 > best_avg_reward:
                best_avg_reward = avg_100
                best_state_dict = {k: v.cpu().clone() for k, v in policy_net.state_dict().items()}
            logger.info(
                "UC-02 DQN ep %d/%d  avg_reward_100=%.1f  eps=%.3f",
                ep + 1, n_episodes, avg_100, eps,
            )

    # Restore best and save
    if best_state_dict is not None:
        policy_net.load_state_dict(best_state_dict)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({"model_state": policy_net.state_dict()}, str(DQN_MODEL_PATH))
    logger.info("UC-02 DQN saved to %s", DQN_MODEL_PATH)

    return {
        "episodes_trained": n_episodes,
        "best_avg_reward_100": round(best_avg_reward, 2),
        "final_epsilon": round(eps, 4),
    }


# ---------------------------------------------------------------------------
# DQN Inference
# ---------------------------------------------------------------------------

def dqn_recommend(db_session: Session, atm_db_id: int) -> Dict:
    """
    Use trained DQN to recommend a replenishment action for an ATM.
    """
    # Load or train
    if DQN_MODEL_PATH.exists():
        checkpoint = torch.load(str(DQN_MODEL_PATH), map_location=DEVICE, weights_only=False)
    else:
        logger.info("No UC-02 DQN found -- training from scratch.")
        _train_dqn()
        if not DQN_MODEL_PATH.exists():
            return {"atm_id": str(atm_db_id), "error": "DQN training failed."}
        checkpoint = torch.load(str(DQN_MODEL_PATH), map_location=DEVICE, weights_only=False)

    model = ATMReplenishmentDQN().to(DEVICE)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    # Get ATM info
    atm = db_session.query(ATM).filter(ATM.id == atm_db_id).first()
    if atm is None:
        return {"atm_id": str(atm_db_id), "error": "ATM not found."}

    cassettes = db_session.query(ATMCassette).filter(ATMCassette.atm_id == atm_db_id).all()

    # Build state vector
    state = np.zeros(ATMReplenishmentDQN.STATE_DIM, dtype=np.float32)
    total_cap = atm.total_capacity if atm.total_capacity and atm.total_capacity > 0 else 5_000_000.0
    per_cap = total_cap / 4.0

    # Cassette levels
    cassette_levels = [0.0] * 4
    for c in cassettes:
        denom = c.denomination
        idx_map = {5000: 0, 1000: 1, 500: 2, 100: 3}
        idx = idx_map.get(denom, None)
        if idx is not None:
            cassette_levels[idx] = c.current_level if c.current_level else 0.0

    for i in range(4):
        state[i] = cassette_levels[i] / per_cap if per_cap > 0 else 0.0

    # Day of week
    today = date.today()
    state[4] = today.weekday() / 6.0

    # Salary flag
    state[5] = 1.0 if today.day in (1, 2, 15, 16) else 0.0

    # Eid flag
    state[6] = 1.0 if _is_eid_window(today, 7) else 0.0

    # Days since load
    if atm.last_loaded:
        last_loaded_date = atm.last_loaded.date() if isinstance(atm.last_loaded, datetime) else atm.last_loaded
        days_since = (today - last_loaded_date).days
    else:
        days_since = 7
    state[7] = min(days_since / 15.0, 1.0)

    # Forecast 3-day (simple heuristic from avg_daily)
    avg_daily = atm.avg_daily_dispense if atm.avg_daily_dispense and atm.avg_daily_dispense > 0 else 500000.0
    dow_mult = [1.0, 0.95, 0.95, 1.0, 1.15, 1.20, 0.80]
    for k in range(3):
        future_dow = (today.weekday() + k + 1) % 7
        forecast = avg_daily * dow_mult[future_dow]
        state[8 + k] = min(forecast / per_cap, 2.0) if per_cap > 0 else 0.5

    # ATM type one-hot
    type_idx = ATM_TYPE_MAP.get((atm.location_type or "lobby").lower(), 0)
    if 0 <= type_idx < 3:
        state[11 + type_idx] = 1.0

    # Run inference
    with torch.no_grad():
        state_t = torch.tensor(state, dtype=torch.float32, device=DEVICE).unsqueeze(0)
        q_values = model(state_t).cpu().numpy().flatten()

    action = int(np.argmax(q_values))
    action_name = ATMReplenishmentDQN.ACTION_NAMES[action]

    # State description
    state_desc = {
        "cassette_fill_pcts": [round(cassette_levels[i] / per_cap * 100, 1) if per_cap > 0 else 0.0 for i in range(4)],
        "day_of_week": today.strftime("%A"),
        "is_salary_period": bool(state[5]),
        "is_eid_window": bool(state[6]),
        "days_since_load": days_since,
        "avg_daily_dispense": round(avg_daily, 2),
    }

    # Cost comparison (approximate 30-day simulation)
    def _simulate_cost(strategy_fn, n_days=30):
        """Run a 30-day cost simulation with a given strategy."""
        sim_rng = np.random.default_rng(123)
        levels = np.array(cassette_levels, dtype=np.float64)
        total_cost = 0.0
        daily_rate = POLICY_RATE / 365.0

        for day in range(n_days):
            # Strategy decides action
            act = strategy_fn(levels, per_cap, day)
            if act > 0:
                total_cost += CIT_COST_PER_TRIP
                fill_targets = {1: 0.5, 2: 0.75, 3: 1.0, 4: 0.0}
                target_pct = fill_targets.get(act, 0.75)
                if act == 4:  # rebalance
                    avg_l = np.mean(levels)
                    levels[:] = avg_l
                    total_cost -= CIT_COST_PER_TRIP * 0.5  # cheaper
                else:
                    for i in range(4):
                        levels[i] = max(levels[i], per_cap * target_pct)

            # Demand
            demand_total = avg_daily * sim_rng.normal(1.0, 0.15)
            demand_total = max(0.0, demand_total)
            denom_pcts = [0.40, 0.30, 0.20, 0.10]
            for i in range(4):
                d_i = demand_total * denom_pcts[i]
                if d_i > levels[i]:
                    total_cost += ATM_STOCKOUT_PENALTY
                    levels[i] = 0.0
                else:
                    levels[i] -= d_i
                total_cost += levels[i] * daily_rate

        return total_cost

    # DQN strategy
    def dqn_strategy(levels, per_cap_val, day):
        s = np.zeros(ATMReplenishmentDQN.STATE_DIM, dtype=np.float32)
        for i in range(4):
            s[i] = levels[i] / per_cap_val if per_cap_val > 0 else 0.0
        s[4] = (day % 7) / 6.0
        s[7] = min(day / 15.0, 1.0)
        if 0 <= type_idx < 3:
            s[11 + type_idx] = 1.0
        with torch.no_grad():
            st = torch.tensor(s, dtype=torch.float32, device=DEVICE).unsqueeze(0)
            qv = model(st).cpu().numpy().flatten()
        return int(np.argmax(qv))

    # (s,S) strategy: replenish to full when any cassette < 30%
    def ss_strategy(levels, per_cap_val, day):
        for i in range(4):
            if levels[i] < per_cap_val * 0.30:
                return 3  # full load
        return 0

    # Baseline: fixed weekly replenishment
    def baseline_strategy(levels, per_cap_val, day):
        return 3 if day % 7 == 0 else 0

    dqn_cost = _simulate_cost(dqn_strategy)
    ss_cost = _simulate_cost(ss_strategy)
    baseline_cost = _simulate_cost(baseline_strategy)

    return {
        "atm_id": atm.atm_id,
        "recommended_action": action,
        "action_name": action_name,
        "q_values": {
            ATMReplenishmentDQN.ACTION_NAMES[i]: round(float(q_values[i]), 2)
            for i in range(ATMReplenishmentDQN.N_ACTIONS)
        },
        "state_description": state_desc,
        "comparison": {
            "dqn_cost": round(dqn_cost, 2),
            "ss_cost": round(ss_cost, 2),
            "baseline_cost": round(baseline_cost, 2),
            "dqn_vs_baseline_savings_pct": round(
                (1.0 - dqn_cost / baseline_cost) * 100, 1
            ) if baseline_cost > 0 else 0.0,
        },
    }


# ======================================================================
# 4. StackelbergCITGame
# ======================================================================

class StackelbergCITGame:
    """
    Stackelberg game between Bank (leader) and CIT company (follower).
    Bank chooses scheduling strategy; CIT responds with pricing/routing.
    """

    BANK_STRATEGIES = ["Fixed_Schedule", "Demand_Driven", "Hybrid"]
    CIT_RESPONSES = {
        "Fixed_Schedule": {
            "description": "CIT optimizes batch routes with predictable schedule",
            "per_trip_cost": 12_000,
            "avg_stockout_rate": 0.08,
            "uptime": 0.92,
            "route_efficiency": 0.90,
        },
        "Demand_Driven": {
            "description": "CIT charges premium for on-demand responsive service",
            "per_trip_cost": 22_000,
            "avg_stockout_rate": 0.02,
            "uptime": 0.98,
            "route_efficiency": 0.65,
        },
        "Hybrid": {
            "description": "CIT offers shared-savings model with base schedule + surge",
            "per_trip_cost": 15_000,
            "avg_stockout_rate": 0.04,
            "uptime": 0.96,
            "route_efficiency": 0.82,
        },
    }

    # Contract types
    CONTRACTS = [
        {
            "type": "Fixed-Fee",
            "base_cost_per_trip": 15_000,
            "description": "Fixed PKR 15K per trip regardless of performance",
        },
        {
            "type": "Performance-Based",
            "base_cost_per_trip": 10_000,
            "bonus_per_pct_uptime": 2_000,
            "penalty_per_stockout": 5_000,
            "description": "Base 10K + bonus/penalty tied to ATM uptime",
        },
        {
            "type": "Shared-Savings",
            "base_cost_per_trip": 12_000,
            "savings_share_pct": 0.20,
            "description": "12K per trip + CIT gets 20% of documented savings",
        },
    ]

    def __init__(
        self,
        n_atms: int = 100,
        avg_trips_per_atm_month: float = 4.0,
    ):
        self.n_atms = n_atms
        self.avg_trips = avg_trips_per_atm_month

    def analyze(self) -> Dict:
        """
        Backward induction Stackelberg analysis.

        For each bank strategy, compute CIT's best response, then bank picks
        the strategy that maximizes its own payoff.
        """
        monthly_trips = self.n_atms * self.avg_trips

        # ---- CIT best responses (follower) per bank strategy ----
        cit_responses = {}
        bank_payoffs = {}

        for strategy in self.BANK_STRATEGIES:
            resp = self.CIT_RESPONSES[strategy]
            trip_cost = resp["per_trip_cost"]
            stockout_rate = resp["avg_stockout_rate"]
            uptime = resp["uptime"]

            # CIT monthly revenue
            cit_revenue = monthly_trips * trip_cost
            # CIT cost (fuel, labor, insurance ~ 60% of revenue for fixed, more for demand)
            cost_ratio = {"Fixed_Schedule": 0.55, "Demand_Driven": 0.75, "Hybrid": 0.62}
            cit_cost = cit_revenue * cost_ratio.get(strategy, 0.65)
            cit_profit = cit_revenue - cit_cost

            # Bank cost
            bank_trip_cost = monthly_trips * trip_cost
            # Stockout penalty cost
            stockout_events = self.n_atms * 30 * stockout_rate  # events per month
            bank_stockout_cost = stockout_events * ATM_STOCKOUT_PENALTY
            # Holding cost (inversely related to stockout rate)
            avg_idle_per_atm = 2_000_000 * (1.0 - stockout_rate)
            bank_holding_cost = self.n_atms * avg_idle_per_atm * (POLICY_RATE / 12.0)

            bank_total_cost = bank_trip_cost + bank_stockout_cost + bank_holding_cost
            # Bank "payoff" is negative cost (higher = better)
            bank_payoff = -bank_total_cost

            cit_responses[strategy] = {
                "cit_response": resp["description"],
                "cit_monthly_profit": round(cit_profit, 2),
                "bank_monthly_cost": round(bank_total_cost, 2),
                "stockout_rate": stockout_rate,
                "uptime": uptime,
            }
            bank_payoffs[strategy] = bank_payoff

        # ---- Stackelberg equilibrium (bank maximizes, knowing CIT response) ----
        best_bank_strategy = max(bank_payoffs, key=bank_payoffs.get)
        best_cit_response = self.CIT_RESPONSES[best_bank_strategy]["description"]

        # ---- Contract comparison ----
        contract_comparison = []
        baseline_monthly_cost = monthly_trips * 15_000  # fixed-fee baseline

        for contract in self.CONTRACTS:
            ctype = contract["type"]
            if ctype == "Fixed-Fee":
                monthly_cost = monthly_trips * contract["base_cost_per_trip"]
                effective_uptime = 0.93
                risk = "Low variance, but no incentive for CIT to optimize"
            elif ctype == "Performance-Based":
                base = monthly_trips * contract["base_cost_per_trip"]
                # Assume CIT achieves 96% uptime when incentivized
                uptime_pct = 96.0
                bonus = (uptime_pct - 90.0) * contract["bonus_per_pct_uptime"] * self.n_atms
                stockout_events = self.n_atms * 30 * 0.04
                penalty = stockout_events * contract["penalty_per_stockout"]
                monthly_cost = base + bonus - penalty
                effective_uptime = 0.96
                risk = "Higher variance; strong CIT incentive alignment"
            else:  # Shared-Savings
                base = monthly_trips * contract["base_cost_per_trip"]
                # Estimated savings from optimization
                savings = baseline_monthly_cost * 0.15  # 15% savings
                cit_share = savings * contract["savings_share_pct"]
                monthly_cost = base + cit_share
                effective_uptime = 0.95
                risk = "Moderate variance; aligned incentives with shared upside"

            contract_comparison.append({
                "type": ctype,
                "monthly_cost": round(monthly_cost, 2),
                "annual_cost": round(monthly_cost * 12, 2),
                "uptime": effective_uptime,
                "risk": risk,
                "vs_baseline_pct": round((1.0 - monthly_cost / baseline_monthly_cost) * 100, 1) if baseline_monthly_cost > 0 else 0.0,
            })

        # Recommend the contract with lowest total cost of ownership
        # (monthly_cost + stockout penalty estimate)
        def _tco(c):
            stockout_map = {"Fixed-Fee": 0.07, "Performance-Based": 0.04, "Shared-Savings": 0.05}
            sr = stockout_map.get(c["type"], 0.05)
            penalty = self.n_atms * 30 * sr * ATM_STOCKOUT_PENALTY
            return c["monthly_cost"] + penalty

        recommended_contract = min(contract_comparison, key=_tco)["type"]

        explanation = (
            f"In the Stackelberg game, the bank (leader) selects '{best_bank_strategy}' "
            f"scheduling, anticipating CIT's best response. The CIT company (follower) "
            f"responds by {best_cit_response.lower()}. "
            f"The recommended contract is '{recommended_contract}' which balances cost "
            f"efficiency with service quality. Under this equilibrium, the bank achieves "
            f"the best trade-off between CIT costs, holding costs, and stockout penalties "
            f"across the {self.n_atms}-ATM network."
        )

        return {
            "bank_strategies": self.BANK_STRATEGIES,
            "cit_responses": cit_responses,
            "contract_comparison": contract_comparison,
            "stackelberg_equilibrium": {
                "bank": best_bank_strategy,
                "cit": best_cit_response,
            },
            "recommended_contract": recommended_contract,
            "explanation": explanation,
        }


# ======================================================================
# Network Summary
# ======================================================================

def get_atm_network_summary(db_session: Session) -> Dict:
    """
    Aggregate ATM metrics across the entire network.
    """
    atms = db_session.query(ATM).all()
    if not atms:
        return {
            "total_atms": 0,
            "avg_uptime": 0.0,
            "total_capacity": 0.0,
            "avg_daily_dispense": 0.0,
            "atms_needing_replenishment": 0,
            "type_breakdown": {},
            "status_breakdown": {},
            "city_breakdown": {},
        }

    total_capacity = 0.0
    total_dispense = 0.0
    uptimes = []
    type_counts: Dict[str, int] = {}
    status_counts: Dict[str, int] = {}
    city_counts: Dict[str, int] = {}
    atms_needing_replenish = 0

    atm_ids = [a.id for a in atms]

    # Batch-fetch cassettes for all ATMs
    all_cassettes = (
        db_session.query(ATMCassette)
        .filter(ATMCassette.atm_id.in_(atm_ids))
        .all()
    )
    cassette_map: Dict[int, List[ATMCassette]] = {}
    for c in all_cassettes:
        cassette_map.setdefault(c.atm_id, []).append(c)

    for atm_obj in atms:
        cap = atm_obj.total_capacity if atm_obj.total_capacity else 0.0
        total_capacity += cap

        disp = atm_obj.avg_daily_dispense if atm_obj.avg_daily_dispense else 0.0
        total_dispense += disp

        up = atm_obj.uptime_pct if atm_obj.uptime_pct is not None else 100.0
        uptimes.append(up)

        loc = atm_obj.location_type or "unknown"
        type_counts[loc] = type_counts.get(loc, 0) + 1

        st = atm_obj.status or "unknown"
        status_counts[st] = status_counts.get(st, 0) + 1

        city = atm_obj.city or "unknown"
        city_counts[city] = city_counts.get(city, 0) + 1

        # Check if any cassette below reorder point
        cass_list = cassette_map.get(atm_obj.id, [])
        for c in cass_list:
            current = c.current_level if c.current_level else 0.0
            reorder = c.reorder_point if c.reorder_point else 0.0
            if current <= reorder and reorder > 0:
                atms_needing_replenish += 1
                break  # count ATM once

    n = len(atms)
    avg_uptime = float(np.mean(uptimes)) if uptimes else 0.0
    avg_dispense = total_dispense / n if n > 0 else 0.0

    # Sort city breakdown by count descending, top 20
    city_sorted = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)
    city_top = dict(city_sorted[:20])

    # Estimated network idle cash
    total_idle = sum(
        sum(
            max(0.0, (c.current_level or 0.0) - (c.reorder_point or 0.0))
            for c in cassette_map.get(a.id, [])
        )
        for a in atms
    )
    daily_holding_cost = total_idle * (POLICY_RATE / 365.0)
    annual_holding_cost = daily_holding_cost * 365.0

    return {
        "total_atms": n,
        "active_atms": status_counts.get("active", 0),
        "avg_uptime": round(avg_uptime, 2),
        "total_capacity": round(total_capacity, 2),
        "avg_daily_dispense": round(avg_dispense, 2),
        "total_daily_dispense": round(total_dispense, 2),
        "atms_needing_replenishment": atms_needing_replenish,
        "replenishment_pct": round(atms_needing_replenish / n * 100, 1) if n > 0 else 0.0,
        "type_breakdown": type_counts,
        "status_breakdown": status_counts,
        "city_breakdown": city_top,
        "network_idle_cash": round(total_idle, 2),
        "daily_holding_cost": round(daily_holding_cost, 2),
        "annual_holding_cost": round(annual_holding_cost, 2),
        "sbp_policy_rate": POLICY_RATE,
    }
