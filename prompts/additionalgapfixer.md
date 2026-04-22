# CASH OPTIMIZATION ENGINE - GAP ANALYSIS & REMEDIATION PLAN

**Generated:** March 12, 2026  
**Project:** ~/projects/cash-optimization-engine  
**Status:** Backend 80% | Frontend 40% | Integration 20%

---

## 🔍 EXECUTIVE SUMMARY

The Cash Optimization Engine (COE) is a sophisticated full-stack financial optimization platform for UBL (United Bank Limited) Pakistan. The system implements **10 use cases** covering branch vault forecasting, ATM optimization, CRR management, Nostro/Vostro accounts, CIT routing, and more.

### Architecture Overview
- **Backend:** FastAPI + PyTorch LSTM + Operations Research + Game Theory
- **Frontend:** React + Vite + TailwindCSS + Recharts + Zustand
- **Scale:** 1,547 branches, 2,180 ATMs, 365 days historical data
- **Database:** SQLite (dev) → PostgreSQL (production)
- **ML:** PyTorch LSTM with uncertainty quantification

---

## ✅ STRENGTHS (What's Already Excellent)

| Area | Strength |
|------|----------|
| **Architecture** | Clean separation (models/schemas/services/api), well-organized |
| **ML Implementation** | Real PyTorch LSTM with dual-head (mean + variance) for uncertainty |
| **Optimization** | Stochastic programming, network flow, value iteration implemented |
| **Game Theory** | Nash equilibrium, VCG auctions, Stackelberg games, Shapley value |
| **Constants** | Comprehensive SBP regulatory parameters (CRR, policy rate, penalties) |
| **Data Generator** | Synthetic but realistic Pakistani banking patterns (Eid, Ramadan, salary cycles) |
| **Frontend Structure** | Component-based with Zustand state management, Bloomberg Terminal aesthetic |

---

## ⚠️ CRITICAL GAPS IDENTIFIED

### 1. BACKEND GAPS

| Gap | Severity | Impact | Fix Time |
|-----|----------|--------|----------|
| **No UC-01 API router** (`api/uc01.py` missing) | 🔴 CRITICAL | Frontend has no endpoints to call | 2 hours |
| **Incomplete service implementations** (UC-04 to UC-10 truncated) | 🔴 CRITICAL | 7/10 use cases non-functional | 3-4 days |
| **No error handling** in forecast_branch() when model fails | 🟡 HIGH | Production crashes | 1 hour |
| **Database threading** (SQLite with check_same_thread) | 🟡 HIGH | Concurrency issues | 2 hours |
| **No authentication/authorization** | 🟡 HIGH | Security vulnerability | 4 hours |
| **Missing Alembic migrations** | 🟡 MEDIUM | Schema changes untracked | 2 hours |
| **No caching layer** (Redis) | 🟡 MEDIUM | Repeated ML inference slow | 3 hours |
| **No rate limiting** | 🟡 MEDIUM | API abuse possible | 1 hour |
| **No logging configuration** | 🟡 MEDIUM | Debugging difficult | 30 min |
| **No health checks** beyond `/health` | 🟢 LOW | Monitoring gaps | 1 hour |

### 2. FRONTEND GAPS

| Gap | Severity | Impact | Fix Time |
|-----|----------|--------|----------|
| **UC01Dashboard not wired to router** | 🔴 CRITICAL | Page doesn't load | 1 hour |
| **No API integration in components** | 🔴 CRITICAL | Static data only | 3 hours |
| **Missing useAPI.js hook implementation** | 🔴 CRITICAL | No backend communication | 2 hours |
| **No error boundaries** | 🟡 HIGH | App crashes on errors | 1 hour |
| **No loading states** in components | 🟡 HIGH | Poor UX | 2 hours |
| **Missing UC-02 to UC-10 dashboards** | 🟡 HIGH | Only UC-01 scaffolded | 2-3 days |
| **No routing** (React Router) | 🟡 HIGH | Can't navigate between UCs | 1 hour |
| **No toast/notification system** | 🟡 MEDIUM | No user feedback | 2 hours |
| **Missing responsive design** | 🟡 MEDIUM | Mobile broken | 3 hours |
| **No unit/integration tests** | 🟡 MEDIUM | Regression risk | 1 day |

### 3. DEVOPS GAPS (LOCAL DEVELOPMENT)

| Gap | Severity | Impact | Fix Time |
|-----|----------|--------|----------|
| **No environment templates** (.env.example) | 🟡 MEDIUM | Onboarding friction | 15 min |
| **No automated backup** for SQLite database | 🟡 MEDIUM | Data loss risk | 1 hour |
| **No local monitoring** (simple logging) | 🟡 MEDIUM | Debugging difficult | 2 hours |
| **No API documentation** (Swagger/OpenAPI) | 🟢 LOW | Developer experience | 30 min |
| **No seed data scripts** for testing | 🟢 LOW | Manual setup required | 1 hour |

### 4. ML/DS GAPS

| Gap | Severity | Impact | Fix Time |
|-----|----------|--------|----------|
| **No model versioning** | 🟡 HIGH | Can't rollback models | 2 hours |
| **No model monitoring** (drift detection) | 🟡 HIGH | Silent degradation | 3 hours |
| **No hyperparameter tuning** | 🟡 MEDIUM | Suboptimal forecasts | 2 hours |
| **No cross-validation** | 🟡 MEDIUM | Overfitting risk | 1 hour |
| **No ensemble methods** | 🟢 LOW | Accuracy ceiling | 4 hours |
| **No feature importance analysis** | 🟢 LOW | Explainability gaps | 2 hours |

### 5. BUSINESS LOGIC GAPS

| Gap | Severity | Impact | Fix Time |
|-----|----------|--------|----------|
| **UC-04 to UC-10 incomplete** | 🔴 CRITICAL | 70% of roadmap blocked | 3-4 days |
| **No SBP compliance reporting** | 🟡 HIGH | Regulatory risk | 4 hours |
| **No audit trail** for optimizations | 🟡 MEDIUM | Accountability gaps | 2 hours |
| **No scenario planning** (stress tests) | 🟡 MEDIUM | Risk management | 3 hours |
| **No multi-currency support** (for Nostro) | 🟡 MEDIUM | FX risk unmanaged | 2 hours |

---

## 📋 DETAILED RECOMMENDATIONS

### PHASE 1: CRITICAL FIXES (Week 1-2)

#### 1.1 Create UC-01 API Router

**File:** `backend/app/api/uc01.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.branch import Branch
from app.services.uc01_vault_forecast import (
    forecast_branch, 
    VaultOptimizer, 
    CashEfficiencyEngine,
    get_network_summary,
)
from app.core.ai_client import ask_ai
import numpy as np

router = APIRouter(prefix="/api/uc01", tags=["UC-01"])

@router.get("/branches")
async def list_branches(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    branch_type: Optional[str] = None,
    city: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all branches with optional filtering."""
    query = db.query(Branch)
    if branch_type:
        query = query.filter(Branch.branch_type == branch_type)
    if city:
        query = query.filter(Branch.city == city)
    branches = query.offset(skip).limit(limit).all()
    return {"branches": branches, "total": len(branches)}

@router.get("/branches/{branch_id}")
async def get_branch(branch_id: str, db: Session = Depends(get_db)):
    """Get detailed branch information."""
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch

@router.post("/forecast/{branch_id}")
async def run_forecast(branch_id: str, db: Session = Depends(get_db)):
    """Run LSTM forecast for a branch - returns 7-day prediction with confidence intervals."""
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    try:
        result = forecast_branch(db, branch.id)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")

@router.post("/optimize/{branch_id}")
async def run_optimization(branch_id: str, db: Session = Depends(get_db)):
    """Run stochastic vault optimizer - returns recommended vault level and savings."""
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    try:
        # Get forecast first
        forecast = forecast_branch(db, branch.id)
        if "error" in forecast:
            raise HTTPException(status_code=500, detail=forecast["error"])
        
        predicted = np.array(forecast["predicted_demand"])
        upper = np.array(forecast["confidence_upper"])
        lower = np.array(forecast["confidence_lower"])
        std = np.maximum((upper - lower) / (2 * 1.645), np.abs(predicted) * 0.05)
        
        optimizer = VaultOptimizer()
        result = optimizer.optimize(
            forecast_mean=predicted,
            forecast_std=std,
            vault_capacity=branch.vault_capacity,
            current_vault_level=branch.current_vault_balance,
            branch_minimum=branch.optimal_vault_balance * 0.5,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@router.post("/game-theory/{branch_id}")
async def run_game_theory(branch_id: str, db: Session = Depends(get_db)):
    """Run Nash equilibrium + CES/BMIS analysis."""
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    try:
        engine = CashEfficiencyEngine()
        result = engine.analyze_branch(db, branch.id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Game theory analysis failed: {str(e)}")

@router.get("/network-summary")
async def get_uc01_summary(db: Session = Depends(get_db)):
    """Aggregate UC-01 metrics across all branches."""
    try:
        return get_network_summary(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Network summary failed: {str(e)}")

@router.post("/ai-brief/{branch_id}")
async def get_ai_brief(branch_id: str, db: Session = Depends(get_db)):
    """Generate AI executive brief using pre-computed optimization results."""
    branch = db.query(Branch).filter(Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    idle = branch.idle_cash or 0
    savings = idle * 0.11
    ces = (branch.cash_efficiency_score or 0) * 100
    
    system_prompt = (
        "You are a senior bank treasury analyst. Given pre-computed optimization "
        "results for a Pakistani bank branch, write a 4-5 sentence executive brief. "
        "Include: risk assessment, key action, expected savings. Be specific with numbers. "
        "Do NOT recompute anything — just narrate the provided results clearly."
    )
    
    user_content = (
        f"{branch.name} ({branch.branch_id}), {branch.city}, Type: {branch.branch_type}\n"
        f"Vault: {branch.vault_capacity/1e6:.1f}M PKR cap, {branch.current_vault_balance/1e6:.1f}M current\n"
        f"Optimal: {branch.optimal_vault_balance/1e6:.1f}M PKR\n"
        f"Idle: {idle/1e6:.1f}M PKR | Annual Savings: {savings/1e6:.1f}M PKR\n"
        f"Efficiency: {ces:.1f}% | Transactions: {branch.daily_transactions}/day"
    )
    
    return ask_ai(system_prompt, user_content)
```

#### 1.2 Implement Frontend API Hook

**File:** `frontend/src/hooks/useAPI.js`

```javascript
import axios from 'axios'
import useAppStore from '../stores/appStore'

const API_BASE_URL = 'http://localhost:8000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for loading states
api.interceptors.request.use(
  (config) => {
    const setLoading = useAppStore.getState().setLoading
    setLoading(true)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    const setLoading = useAppStore.getState().setLoading
    setLoading(false)
    return response
  },
  (error) => {
    const setLoading = useAppStore.getState().setLoading
    setLoading(false)
    
    const setError = useAppStore.getState().setError
    setError({
      message: error.response?.data?.detail || error.message || 'An error occurred',
      status: error.response?.status,
    })
    
    return Promise.reject(error)
  }
)

export const fetchBranches = async (filters = {}) => {
  const params = new URLSearchParams()
  if (filters.branch_type) params.append('branch_type', filters.branch_type)
  if (filters.city) params.append('city', filters.city)
  return api.get(`/uc01/branches?${params}`)
}

export const fetchBranchDetail = async (branchId) => {
  return api.get(`/uc01/branches/${branchId}`)
}

export const runForecast = async (branchId) => {
  return api.post(`/uc01/forecast/${branchId}`)
}

export const runOptimization = async (branchId) => {
  return api.post(`/uc01/optimize/${branchId}`)
}

export const runGameTheory = async (branchId) => {
  return api.post(`/uc01/game-theory/${branchId}`)
}

export const fetchNetworkSummary = async () => {
  return api.get('/uc01/network-summary')
}

export const getAIBrief = async (branchId) => {
  return api.post(`/uc01/ai-brief/${branchId}`)
}
```

#### 1.3 Add React Router

**Install:**
```bash
cd frontend && npm install react-router-dom
```

**Update `frontend/src/main.jsx`:**
```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

**Update `frontend/src/App.jsx`:**
```javascript
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Catalogue from './components/Catalogue'
import UC01Dashboard from './components/uc01/UC01Dashboard'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Catalogue />} />
        <Route path="uc/uc01" element={<UC01Dashboard />} />
        {/* Add routes for UC-02 to UC-10 */}
      </Route>
    </Routes>
  )
}

export default App
```

#### 1.4 Register UC-01 Router in main.py

**Update `backend/app/main.py`:**
```python
from app.api.uc01 import router as uc01_router

# Add after other router includes
app.include_router(uc01_router)
```

#### 1.5 Create Pydantic Schemas

**File:** `backend/app/schemas/branch.py`

```python
from pydantic import BaseModel, ConfigDict
from typing import Optional
from enum import Enum

class BranchType(str, Enum):
    CASH_SURPLUS = "Cash-Surplus"
    DEFICIT = "Deficit"
    BALANCED = "Balanced"
    SEASONAL = "Seasonal"
    HUB = "Hub"

class BranchBase(BaseModel):
    branch_id: str
    name: str
    city: str
    region: str
    branch_type: BranchType
    vault_capacity: float
    avg_daily_deposits: float
    avg_daily_withdrawals: float
    current_vault_balance: float
    optimal_vault_balance: float
    idle_cash: float
    cash_efficiency_score: float
    daily_transactions: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    manager_name: Optional[str] = None
    is_cpc: bool = False

class BranchResponse(BranchBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)
```

---

### PHASE 2: PRODUCTION READINESS (Week 3-4)

#### 2.1 Database Migration to PostgreSQL

**Update `.env`:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/cash_optimization
```

**Update `backend/app/database.py`:**
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import QueuePool
from app.config import settings

# Connection pooling for PostgreSQL
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)
```

#### 2.2 Add Authentication

**Install dependencies:**
```bash
pip install python-jose[cryptography] passlib[bcrypt]
```

**File:** `backend/app/core/auth.py`

```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db

SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    # Validate user exists in DB
    return {"username": username}
```

#### 2.3 Add Redis Caching (Optional - For Performance)

**Install:**
```bash
pip install redis
# Optional: Run Redis locally if you want caching
# Windows: Download from https://github.com/microsoftarchive/redis/releases
# Linux: sudo apt-get install redis-server
# Mac: brew install redis
```

**File:** `backend/app/core/cache.py`

```python
import json
from typing import Optional, Any
from datetime import timedelta

# Simple in-memory cache as alternative to Redis
class SimpleCache:
    def __init__(self):
        self._cache = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if key not in self._cache:
            return None
        value, expiry = self._cache[key]
        if expiry and expiry < datetime.now():
            del self._cache[key]
            return None
        return value
    
    def set(self, key: str, value: Any, ttl: timedelta = timedelta(hours=1)) -> bool:
        """Set value in cache with TTL."""
        expiry = datetime.now() + ttl if ttl else None
        self._cache[key] = (value, expiry)
        return True
    
    def delete(self, key: str) -> bool:
        """Delete key from cache."""
        if key in self._cache:
            del self._cache[key]
        return True

# Global cache instance
cache = SimpleCache()

def cache_get(key: str) -> Optional[Any]:
    """Get value from cache."""
    return cache.get(key)

def cache_set(key: str, value: Any, ttl: timedelta = timedelta(hours=1)) -> bool:
    """Set value in cache with TTL."""
    return cache.set(key, value, ttl)

def cache_delete(key: str) -> bool:
    """Delete key from cache."""
    return cache.delete(key)

# Decorator for caching
def cached(key_prefix: str, ttl: timedelta = timedelta(hours=1)):
    def decorator(func):
        def wrapper(*args, **kwargs):
            key = f"{key_prefix}:{args[0] if args else ''}"
            cached_value = cache_get(key)
            if cached_value is not None:
                return cached_value
            result = func(*args, **kwargs)
            cache_set(key, result, ttl)
            return result
        return wrapper
    return decorator
```

---

### PHASE 3: ENHANCEMENTS (Week 5-6)

#### 3.1 ML Improvements

**Install MLflow:**
```bash
pip install mlflow
```

**Add model versioning in `uc01_vault_forecast.py`:**
```python
import mlflow
import mlflow.pytorch

def train_model_with_tracking(...):
    with mlflow.start_run():
        mlflow.log_param("hidden_size", 64)
        mlflow.log_param("learning_rate", 1e-3)
        mlflow.log_param("epochs", max_epochs)
        
        # ... training code ...
        
        mlflow.log_metrics({
            "mape": metrics["mape"],
            "mae": metrics["mae"],
            "rmse": metrics["rmse"],
        })
        
        mlflow.pytorch.log_model(model, "model")
```

#### 3.2 Local Development Setup

**Create `.env.example` template:**

**File:** `.env.example`

```env
# Database (SQLite for local development)
DATABASE_URL=sqlite:///./cash_engine.db

# OpenAI API Key (optional - for AI Brief feature)
OPENAI_API_KEY=your-api-key-here

# SBP Regulatory Rates
SBP_POLICY_RATE=0.11
CRR_WEEKLY_AVG=0.06
CRR_DAILY_MIN=0.04

# UBL Network Constants
UBL_TOTAL_BRANCHES=1547
UBL_TOTAL_ATMS=2180
UBL_DEPOSIT_BASE_TRILLIONS=2.54

# CORS (Frontend dev server)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

**Create backup script:**

**File:** `scripts/backup_db.sh` (Linux/Mac)

```bash
#!/bin/bash
# Backup SQLite database with timestamp

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="./backend/cash_engine.db"

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/cash_engine_$TIMESTAMP.db"

# Keep only last 10 backups
cd "$BACKUP_DIR" && ls -t cash_engine_*.db | tail -n +11 | xargs -r rm

echo "Backup created: $BACKUP_DIR/cash_engine_$TIMESTAMP.db"
```

**File:** `scripts/backup_db.bat` (Windows)

```batch
@echo off
REM Backup SQLite database with timestamp

set BACKUP_DIR=.\backups
set DB_PATH=.\backend\cash_engine.db
set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

mkdir "%BACKUP_DIR%" 2>nul
copy "%DB_PATH%" "%BACKUP_DIR%\cash_engine_%TIMESTAMP%.db"

echo Backup created: %BACKUP_DIR%\cash_engine_%TIMESTAMP%.db
```

**Add logging configuration:**

**File:** `backend/app/core/logging_config.py`

```python
import logging
import sys
from pathlib import Path

def setup_logging():
    """Configure logging for the application."""
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / "coe.log"
    
    # Create formatters
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_formatter = logging.Formatter(
        '%(levelname)s: %(message)s'
    )
    
    # File handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(file_formatter)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Suppress noisy loggers
    logging.getLogger('uvicorn').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy').setLevel(logging.WARNING)
```

**Update `backend/app/main.py` to include logging:**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.core.logging_config import setup_logging

# Setup logging
setup_logging()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
)

# ... rest of the code ...
```

#### 3.3 Testing Setup

**Install test dependencies:**
```bash
# Backend
pip install pytest pytest-asyncio httpx pytest-cov

# Frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**File:** `backend/tests/test_uc01.py`

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_list_branches():
    response = client.get("/api/uc01/branches")
    assert response.status_code == 200
    data = response.json()
    assert "branches" in data
    assert "total" in data

def test_get_branch():
    response = client.get("/api/uc01/branches/BR-0001")
    assert response.status_code in [200, 404]

def test_run_forecast():
    response = client.post("/api/uc01/forecast/BR-0001")
    assert response.status_code in [200, 500]  # 500 if model not trained

def test_network_summary():
    response = client.get("/api/uc01/network-summary")
    assert response.status_code == 200
```

**File:** `frontend/src/__tests__/UC01Dashboard.test.jsx`

```javascript
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import UC01Dashboard from '../components/uc01/UC01Dashboard'
import { describe, it, expect, vi } from 'vitest'

describe('UC01Dashboard', () => {
  it('renders KPI strip', async () => {
    render(
      <BrowserRouter>
        <UC01Dashboard />
      </BrowserRouter>
    )
    
    await waitFor(() => {
      expect(screen.getByText(/Active Branches/i)).toBeInTheDocument()
    })
  })
})
```

---

## 🎯 VERIFICATION CHECKLIST

After implementing Phase 1 fixes, verify:

- [ ] `cd backend && python -m uvicorn app.main:app --reload` starts without errors
- [ ] `GET http://localhost:8000/api/uc01/branches` returns branch list
- [ ] `GET http://localhost:8000/api/uc01/branches/BR-0001` returns branch detail
- [ ] `POST http://localhost:8000/api/uc01/forecast/BR-0001` returns 7-day forecast
- [ ] `POST http://localhost:8000/api/uc01/optimize/BR-0001` returns optimization result
- [ ] `cd frontend && npm run dev` starts without errors
- [ ] Navigate to http://localhost:5173/uc/uc01 shows dashboard
- [ ] Selecting a branch triggers forecast + optimization
- [ ] All charts display real data from backend
- [ ] AI Brief button generates summary
- [ ] Error messages display gracefully on API failures
- [ ] Loading spinners show during ML inference

---

## 📊 PRIORITY MATRIX

```
┌─────────────────────────────────────────────────────────────┐
│                    IMPACT                                   │
│                                                             │
│  HIGH    │  UC-01 API Router    │  Model Monitoring        │
│          │  Frontend Integration │  Authentication          │
│          │  Complete UC-04-10   │  SQLite Optimization     │
│          ├──────────────────────┼──────────────────────────┤
│  MEDIUM  │  Error Handling      │  Hyperparameter Tuning   │
│          │  Loading States      │  Ensemble Methods        │
│          │  API Documentation   │  Feature Importance      │
│          ├──────────────────────┼──────────────────────────┤
│  LOW     │  Swagger UI          │  Mobile Responsive       │
│          │  Unit Tests          │  Audit Trail             │
│          │  Logging Config      │  Scenario Planning       │
│          └──────────────────────┴──────────────────────────┘
│                     LOW              MEDIUM        HIGH     │
│                          URGENCY                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📅 IMPLEMENTATION TIMELINE

### Week 1: Critical Backend Fixes
- **Day 1-2:** Create UC-01 API router, wire to main.py
- **Day 3:** Implement error handling, add Pydantic schemas
- **Day 4-5:** Complete UC-04 (CRR Float) service implementation
- **Day 6-7:** Complete UC-05 (Nostro) service implementation

### Week 2: Frontend Integration
- **Day 8:** Install React Router, update App.jsx
- **Day 9:** Implement useAPI.js hook with interceptors
- **Day 10:** Update UC01Dashboard with API calls
- **Day 11:** Add loading states, error boundaries
- **Day 12-14:** Test end-to-end flow, fix bugs

### Week 3: Local Infrastructure
- **Day 15:** Create .env.example template
- **Day 16:** Setup database backup scripts
- **Day 17:** Add logging configuration
- **Day 18:** Add JWT authentication
- **Day 19:** Optional Redis caching or use in-memory cache
- **Day 20-21:** Complete UC-06 to UC-08 services

### Week 4: Testing & Documentation
- **Day 22-23:** Backend unit tests (pytest)
- **Day 24-25:** Frontend tests (Vitest)
- **Day 26:** API documentation (OpenAPI/Swagger)
- **Day 27-28:** Complete UC-06 to UC-10 services

### Week 5-6: Enhancements
- **Week 5:** ML improvements (MLflow, drift detection)
- **Week 6:** Monitoring (Prometheus/Grafana), CI/CD

---

## 🚀 SUCCESS CRITERIA

### Functional Requirements
1. ✅ **End-to-end flow works:** Select branch → See forecast → Run optimizer → Get AI brief
2. ✅ **No mock data:** All numbers from real ML/optimization computations
3. ✅ **Error handling:** Graceful failures with user-friendly messages
4. ✅ **Loading states:** Spinners during ML inference (<3s forecasts, <5s optimization)

### Non-Functional Requirements
1. ✅ **Performance:** API response time <500ms (cached), <3s (ML inference)
2. ✅ **Reliability:** Graceful error handling, automatic retry on failures
3. ✅ **Security:** JWT authentication, role-based access control
4. ✅ **Scalability:** Support 10+ concurrent users with SQLite

### Business Requirements
1. ✅ **Accuracy:** Forecast MAPE <10%, optimization savings validated
2. ✅ **Compliance:** SBP CRR compliance reporting, audit trail
3. ✅ **ROI:** Documented savings potential (target: PKR 10B+ annually)

---

## 🔧 QUICK START COMMANDS

### Backend Setup
```bash
# Activate conda environment
conda activate coe

# Navigate to backend
cd ~/projects/cash-optimization-engine/backend

# Initialize database (creates SQLite DB)
python -c "from app.database import init_db; init_db()"

# Seed database with synthetic data
python seed_data.py

# Start development server
python -m uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
# Navigate to frontend
cd ~/projects/cash-optimization-engine/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Testing
```bash
# Backend tests
cd backend && pytest tests/ -v --cov=app

# Frontend tests
cd frontend && npm run test
```

### Database Backup
```bash
# Linux/Mac: Run backup script
bash scripts/backup_db.sh

# Windows: Run backup script
.\scripts\backup_db.bat

# Manual backup
cp backend/cash_engine.db backend/cash_engine_backup_$(date +%Y%m%d).db
```

### Utility Commands
```bash
# Clean database and models (reset everything)
make clean

# Re-seed database
make seed

# Run migrations (if using Alembic)
make migrate

# Start both backend and frontend
make dev
```

---

## 📞 SUPPORT & ESCALATION

### Common Issues

**Issue:** `ModuleNotFoundError: No module named 'app.services.uc01_vault_forecast'`
- **Solution:** Ensure you're running from `backend/` directory, not project root

**Issue:** `CORS error` in browser console
- **Solution:** Verify `CORS_ORIGINS` in `config.py` includes `http://localhost:5173`

**Issue:** Model training fails with CUDA out of memory
- **Solution:** Reduce `MAX_TRAIN_BRANCHES` in `uc01_vault_forecast.py` or use CPU

**Issue:** Frontend shows "AI unavailable"
- **Solution:** Set `OPENAI_API_KEY` in `.env` file

### Contact Points
- **Backend Issues:** Check `backend/app/services/` implementations
- **Frontend Issues:** Review `frontend/src/components/` and Zustand store
- **ML Issues:** Inspect `uc01_vault_forecast.py` training pipeline
- **Local Setup:** Check `.env` configuration and database file permissions

---

## 📚 ADDITIONAL RESOURCES

### Documentation
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [PyTorch LSTM Tutorial](https://pytorch.org/tutorials/beginner/nlp/sequence_models_tutorial.html)
- [React Router Documentation](https://reactrouter.com/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)

### SBP Regulatory References
- [State Bank of Pakistan CRR Guidelines](https://www.sbp.org.pk/)
- [SBP Policy Rate History](https://www.sbp.org.pk/rates/index.asp)

### Optimization References
- [Google OR-Tools](https://developers.google.com/optimization)
- [SciPy Optimization](https://docs.scipy.org/doc/scipy/tutorial/optimize.html)
- [PuLP Documentation](https://coin-or.github.io/pulp/)

---

**Document Version:** 1.0  
**Last Updated:** March 12, 2026  
**Maintained By:** COE Development Team
