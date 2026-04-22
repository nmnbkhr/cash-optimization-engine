# COE — ENHANCED BUSINESS FEATURES (Split Into 3 Focused Prompts)
# ══════════════════════════════════════════════════════════════
# Your mega-prompt is good but too big for one Claude Code session.
# Split into 3 focused pastes. Each builds on the previous.
# ══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────
# ANALYSIS: What's genuinely NEW vs what you already have
# ─────────────────────────────────────────────────────────────
#
# ALREADY BUILT (don't rebuild):
#  ✅ business_output.py with vault_recommendation, atm_load_orders, 
#     netting, crr_deployment, nostro_vostro, denomination_plan,
#     cit_route_sheet, digital_shift_report, value_realized_report
#  ✅ 30 UI pages, 105 API endpoints
#  ✅ Command Center with live Execute
#  ✅ SBP rates from EasyData (2,825 series)
#  ✅ Reconciling data generator (Dirichlet)
#
# GENUINELY NEW (worth building):
#  ⬜ CDM recycling recommendation (you have NO cdms table)
#  ⬜ IEC interbank swap matching (completely new)
#  ⬜ Seasonal peak preparation (Eid/Ramadan adjustments)
#  ⬜ Compliance risk scoring (CMS penalties, CCTV, note fitness)
#  ⬜ Integrated daily action plan (merges all UCs into one sheet)
#  ⬜ Updated regulatory constants (CRR 3% daily min is NEW — Jan 2026)
#  ⬜ Forecast activation (your prompt COE_ACTIVATE_FORECASTING covers this)
#
# RISKY / SKIP:
#  ⚠️ WebSocket for real-time — overkill for demo, adds complexity
#  ⚠️ Role-based Zustand views — nice but not core value
#  ⚠️ PostgreSQL migration — premature, SQLite works fine for demo
#  ⚠️ Celery stubs — noise, no demo value
#  ⚠️ New ensemble_forecast_service.py — you already have ensemble_forecast.py
#     (use COE_ACTIVATE_FORECASTING prompt to wire it up instead)

# ─────────────────────────────────────────────────────────────
# PROMPT 1 OF 3: REGULATORY CONSTANTS + CDM + IEC + COMPLIANCE
# ─────────────────────────────────────────────────────────────

## Paste this into Claude Code FIRST:

```
STRICTLY ADDITIVE. Do NOT modify any existing UC-01 through UC-10 service files,
API route files, or their frontend components. Only ADD new files or APPEND 
new methods to business_output.py.

Frontend stack: React 19.2, Vite 7.3, TailwindCSS 4.2, Zustand 5.0, Recharts 3.8, Axios, Lucide React.
Backend: FastAPI, SQLAlchemy, SQLite, pandas, numpy, scipy, OR-Tools, PyTorch, XGBoost.

## PART A: Update Regulatory Constants

Create file: backend/app/core/regulatory_constants.py

```python
"""
SBP Regulatory Constants — 2026 Values
═══════════════════════════════════════
Hardcoded with effective dates and circular references.
These change infrequently (1-2x per year). When SBP issues a new circular,
update here and all calculations across the app will pick up the new values.
"""

# ── CRR (Cash Reserve Requirement) ──
# Per DMMD Circular No. 01 of 2026 (effective January 30, 2026):
# - Weekly average: 5% of demand + time liabilities (maturity < 1 year)
# - Daily minimum: 3% (NEW — previously no daily floor enforced this strictly)
# - CRR deposits at SBP are NON-REMUNERATIVE (earn 0%)
# - Vault cash does NOT count toward CRR
CRR_WEEKLY_AVG = 0.05        # 5%
CRR_DAILY_MIN = 0.03         # 3% daily minimum
CRR_EFFECTIVE_DATE = "2026-01-30"
CRR_CIRCULAR = "DMMD Circular No. 01 of 2026"
CRR_VAULT_COUNTS = False     # Vault cash does NOT count toward CRR

# ── SLR (Statutory Liquidity Requirement) ──
# ~19% for conventional banks
# Vault cash DOES count toward SLR (unlike CRR)
SLR_RATE = 0.19
SLR_VAULT_COUNTS = True

# ── SBP Policy Rate ──
# Maintained at 10.50% as of April 2026
SBP_POLICY_RATE = 0.1050
SBP_POLICY_EFFECTIVE = "2025-12-16"

# ── KIBOR Benchmark ──
# Overnight weighted repo rate ~10.54% (early April 2026)
# Use as primary opportunity cost reference for idle cash
KIBOR_OVERNIGHT = 0.1054
KIBOR_REFERENCE = "Overnight weighted average repo rate"

# ── CDM Mandate ──
# Per PSP&OD Circular Letter No. 01 of 2025:
# - At least 25% of branches must have CDMs by end of CY2028
# - Prioritize high-cash branches
# - Requirements: instant credit, biometric for non-customers,
#   disputes resolved within 3 working days, CCTV with 60-day retention
CDM_TARGET_PCT = 0.25
CDM_DEADLINE = "2028-12-31"
CDM_CIRCULAR = "PSP&OD Circular Letter No. 01 of 2025"
CDM_REQUIREMENTS = {
    "instant_credit": True,
    "biometric_non_customers": True,
    "dispute_resolution_days": 3,
    "cctv_retention_days": 60,
}

# ── CMS (Currency Management Strategy) ──
# Machine-sorted/authenticated ATM-fit notes mandatory
# Penalties: Rs 100K+ per violation
CMS_PENALTY_PER_VIOLATION = 0.1  # PKR 100K = 0.1 PKR Millions
CMS_VIOLATIONS = [
    "Unauthenticated notes issued to public",
    "Soiled/unfit notes not segregated",
    "Improper note packing/banding",
    "CCTV non-functional or < 60-day retention",
    "IEC swap not reported to SBP Finance Department",
]

# ── SBP-BSC Service Charge ──
SBP_BSC_CHARGE = 0.0012  # 0.12% on currency chest operations

# ── CIT Costs ──
CIT_NORMAL_COST = 0.015    # PKR 15K per trip (in millions)
CIT_EMERGENCY_COST = 0.045  # PKR 45K per emergency trip (3× normal)
CIT_VEHICLE_MAX = 100.0     # PKR 100M max value per vehicle

# ── ATM ──
ATM_TARGET_DOC = 2.2        # Target Days-of-Cash
ATM_MIN_UPTIME = 0.985      # 98.5% minimum

# ── Vault ──
VAULT_INSURANCE_RATE = 0.00015  # 0.015% of insured value per day
VAULT_SECURITY_WINDOW = ("08:00", "16:00")  # Daylight hours for CIT

# ── Digital Transaction Costs ──
CASH_TXN_COST = 0.000095   # PKR 95 per cash transaction (in millions)
DIGITAL_TXN_COST = 0.000008  # PKR 8 per digital transaction (in millions)
```

Now update business_output.py to import from this file instead of 
using hardcoded numbers in __init__:

```python
from app.core.regulatory_constants import *

class CashOptimizationEngine:
    def __init__(self, db):
        self.db = db
        self.kibor_overnight = KIBOR_OVERNIGHT
        self.sbp_crr_rate = CRR_WEEKLY_AVG
        self.crr_daily_min = CRR_DAILY_MIN
        self.sbp_bsc_charge = SBP_BSC_CHARGE
        # ... etc
```

## PART B: Add CDM Table + Recycling Recommendation

Create SQLAlchemy model for CDMs:

```python
# backend/app/models/cdm.py
class CDM(Base):
    __tablename__ = 'cdms'
    id = Column(Integer, primary_key=True)
    branch_id = Column(String, ForeignKey('branches.branch_id'))
    cdm_type = Column(String)          # 'basic_deposit', 'recycler'
    installed_date = Column(String, nullable=True)
    status = Column(String)            # 'installed', 'planned', 'none'
    monthly_deposits_m = Column(Float, default=0)
    recycling_ratio = Column(Float, default=0)  # % of deposited cash reused
    notes_authenticated = Column(Integer, default=0)
    cctv_compliant = Column(Boolean, default=True)
    biometric_enabled = Column(Boolean, default=False)
```

Seed CDM data: assign 'installed' to top 20% cash-heavy branches,
'planned' to next 10%, 'none' to rest.

Add method to business_output.py:

```python
def cdm_recycling_recommendation(self, branch_id=None):
    """
    CDM priority recommendation with recycling economics.
    
    Per PSP&OD Circular Letter No. 01 of 2025:
    - 25% of branches must have CDMs by CY2028
    - Prioritize high-cash branches
    
    Economics:
    - CDM with recycler reuses 60-70% of deposited cash for withdrawals
    - Reduces CIT trips by 30-50% (cash stays in machine)
    - Saves: (trips_reduced × CIT_cost) + (recycled_cash × KIBOR_daily)
    - CDM install cost: ~PKR 3-5M
    - Payback period: typically 8-14 months for high-cash branches
    
    Returns prioritized list with ROI calculation.
    """
```

## PART C: Add IEC (Interbank Exchange) Opportunity Finder

Add method to business_output.py:

```python
def iec_opportunity_finder(self, city=None):
    """
    Interbank Exchange Cash Swap Matching.
    
    IEC allows banks to swap denominations directly with other banks
    instead of going through SBP-BSC (which charges 0.12%).
    
    Per CMS rules: IEC swaps must be reported to SBP Finance Department.
    
    Logic:
    1. Within our own network: find branches with opposite denomination needs
       Branch A has excess Rs.5000, needs Rs.100 → swap internally first
    2. Across banks: identify swap-worthy mismatches (min PKR 3-5M)
       This is modeled as a simulation since we don't have other banks' data
    3. Report format: SBP-compliant JSON with swap details
    
    Savings per swap:
      BSC charge avoided: amount × 0.12%
      CIT trips avoided: 1-2 round trips
      Time saved: 2-3 business days vs SBP-BSC processing
    """
```

## PART D: Add Compliance Risk Assessment

Add method to business_output.py:

```python
def compliance_risk_assessment(self):
    """
    Branch-level SBP compliance scoring.
    
    Checks per CMS rules:
    1. Note fitness: are machine-sorted notes being issued?
    2. CCTV: functional with 60-day retention?
    3. Packing: proper banding and labeling?
    4. CDM mandate: on track for 25% by CY2028?
    5. IEC reporting: swaps reported to SBP Finance?
    
    Scoring:
    - GREEN: all compliant, zero exposure
    - YELLOW: 1-2 issues, estimated fine risk < PKR 500K
    - RED: 3+ issues or critical violation, fine risk > PKR 500K
    
    Returns per-branch risk score with specific mitigation actions.
    """
```

## PART E: API Routes for New Methods

Add to backend/app/api/business.py (or create business_enhanced.py):

```python
@router.get("/cdm-recycling")
def cdm_recycling(branch_id: str = None, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.cdm_recycling_recommendation(branch_id)

@router.get("/iec-opportunities")
def iec_opportunities(city: str = None, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.iec_opportunity_finder(city)

@router.get("/compliance-risk")
def compliance_risk(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.compliance_risk_assessment()
```

## VERIFY:
```bash
curl -s localhost:8000/api/business/cdm-recycling | python -m json.tool | head -30
curl -s localhost:8000/api/business/iec-opportunities?city=Karachi | python -m json.tool | head -30
curl -s localhost:8000/api/business/compliance-risk | python -m json.tool | head -30
```
```

# ─────────────────────────────────────────────────────────────
# PROMPT 2 OF 3: SEASONAL + INTEGRATED PLAN + VALUE CALCULATOR
# ─────────────────────────────────────────────────────────────

## Paste this into Claude Code SECOND (after Prompt 1 is verified working):

```
ADDITIVE ONLY. Do NOT modify UC-01 through UC-10 files.

Prompt 1 added: regulatory_constants.py, CDM model + recommendation,
IEC opportunity finder, compliance risk assessment.

Now add the remaining business methods.

## PART A: Seasonal Peak Preparation

Add to business_output.py:

```python
def seasonal_peak_preparation(self, event_name, start_date, duration_days=7, uplift_factor=1.15):
    """
    Eid / Ramadan / Payroll cash surge preparation.
    
    Events and their effects on Pakistani banking:
    - Eid-ul-Fitr: +30-40% cash demand, +20% small denominations (Eidi)
    - Eid-ul-Adha: +20-25% cash demand, large withdrawals for cattle
    - Ramadan: +15-20% evenings, reduced mornings, Sehr/Iftar patterns
    - Month-end payroll: +35% on 1st and 15th
    - Independence Day (Aug 14): moderate spike
    - Muharram: slight reduction in commercial areas
    
    Actions:
    1. Increase vault buffers by uplift_factor × normal optimal
    2. Adjust denomination mix: +15-20% Rs.100/Rs.500 for Eid
    3. Schedule extra CIT trips for days -2 through +2
    4. Alert ATM loading team for DoC target increase
    5. Compute KIBOR cost of holding extra buffer
    
    Returns: per-branch preparation plan with extra cash needed,
    denomination adjustments, CIT schedule changes, and 
    opportunity cost (buffer × KIBOR × duration / 365).
    """
```

## PART B: Integrated Cash Action Plan

Add to business_output.py:

```python
def integrated_cash_action_plan(self, branch_id=None, city=None, plan_date=None):
    """
    THE DAILY DECISION SHEET — merges all UCs into one actionable plan.
    
    This is what the Branch Manager prints every morning.
    One page. Every decision. No technical jargon.
    
    Combines outputs from:
    - UC-01: Vault recommendation (RELEASE/REQUEST/HOLD + amount)
    - UC-02: ATM load orders for this branch's ATMs
    - UC-03: Netting matches (direct transfers to/from nearby branches)
    - UC-07: Denomination mix for today
    - UC-08: CIT schedule (pickup/delivery times)
    - CDM: Recycling status + reuse ratio
    - Compliance: Risk status (green/yellow/red)
    - Forecast: Tomorrow's predicted demand (if model trained)
    
    Returns a print-friendly dict structured as:
    {
        "header": {branch_id, branch_name, date, printed_at},
        "vault_action": {action, amount, reason},
        "atm_orders": [{atm_id, action, load_amount, denom}],
        "netting_transfers": [{from/to, amount, cit_time}],
        "denomination_plan": {rs5000_pct, rs1000_pct, ...},
        "cit_schedule": [{time, type, amount}],
        "compliance_status": {score, color, issues},
        "forecast_tomorrow": {deposits, withdrawals, recommended_vault},
        "scorecard": {ces, rank, savings_mtd},
        "kibor_impact": {idle_cash, daily_loss, annual_loss},
    }
    """
```

## PART C: Value Calculator

Add to business_output.py:

```python
def value_calculator(self, network_wide=True):
    """
    Total value quantification for stakeholder reporting.
    
    Formula:
    Value = (Idle Cash Freed × KIBOR)
          + (CIT Trips Saved × CIT_COST)
          + (BSC Charges Avoided)
          + (SBP Penalties Avoided × CMS_PENALTY)
          + (Digital Shift Savings × (CASH_TXN_COST - DIGITAL_TXN_COST) × shifted_txns)
          - (CDM Installation Cost amortized)
          - (Incremental Ops Cost)
    
    Returns breakdown by UC contribution + total annual PKR impact.
    Used for: board presentations, investor pitches, ROI justification.
    """
```

## PART D: API Routes

```python
@router.post("/seasonal-scenario")
def seasonal_scenario(body: dict, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.seasonal_peak_preparation(
        body.get('event', 'Eid-ul-Fitr'),
        body.get('start_date', str(date.today())),
        body.get('duration_days', 7),
        body.get('uplift_factor', 1.15)
    )

@router.get("/integrated-plan/{branch_id}")
def integrated_plan(branch_id: str, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.integrated_cash_action_plan(branch_id=branch_id)

@router.get("/integrated-plan")
def integrated_plan_city(city: str = None, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.integrated_cash_action_plan(city=city)

@router.get("/value-calculator")
def value_calculator(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.value_calculator()
```

## VERIFY:
```bash
curl -s -X POST localhost:8000/api/business/seasonal-scenario \
  -H "Content-Type: application/json" \
  -d '{"event":"Eid-ul-Fitr","uplift_factor":1.15}' | python -m json.tool | head -30

curl -s localhost:8000/api/business/integrated-plan/KHI-0001 | python -m json.tool

curl -s localhost:8000/api/business/value-calculator | python -m json.tool
```
```

# ─────────────────────────────────────────────────────────────
# PROMPT 3 OF 3: FRONTEND PAGES FOR NEW FEATURES
# ─────────────────────────────────────────────────────────────

## Paste this into Claude Code THIRD (after Prompts 1+2 are verified):

```
ADDITIVE ONLY. The backend now has these new endpoints (from Prompts 1+2):
  GET  /api/business/cdm-recycling
  GET  /api/business/iec-opportunities?city=
  GET  /api/business/compliance-risk
  POST /api/business/seasonal-scenario
  GET  /api/business/integrated-plan/{branch_id}
  GET  /api/business/value-calculator

Build 4 new frontend pages. Use existing stack ONLY:
  React 19.2, TailwindCSS 4.2, Zustand 5.0, Recharts 3.8, Axios, Lucide React.

## PAGE 1: /cdm-plan — CDM Deployment & Recycling Dashboard

File: src/pages/CDMPlan.jsx

Shows:
- Progress bar: "278 / 483 branches (58%) — target 25% by CY2028" 
  (CDM_TARGET_PCT × total_branches)
- Priority list: top 20 branches that should get CDMs next
  (sorted by cash volume, ROI, CIT reduction potential)
- Each row: branch name, monthly cash volume, projected CIT saving, 
  payback months, [Recommend] badge
- Chart (Recharts BarChart): CIT trips before vs after CDM per branch type
- Regulatory box: PSP&OD Circular No. 01/2025 requirements checklist

## PAGE 2: /iec-hub — Interbank Exchange Cash Swap Hub

File: src/pages/IECHub.jsx

Shows:
- City filter dropdown
- Swap opportunity cards:
  "Branch X has excess Rs.5000 (₨12M) | Branch Y needs Rs.5000 (₨8M)
   Swap: ₨8M | Saves: BSC ₨9,600 + CIT ₨15,000"
- Total swap value and annual savings
- SBP reporting reminder: "IEC swaps must be reported to SBP Finance Dept"

## PAGE 3: /compliance-monitor — CMS Compliance Dashboard

File: src/pages/ComplianceMonitor.jsx

Shows:
- 3 big numbers: branches GREEN / YELLOW / RED
- Per-branch table: branch, note_fitness, cctv_status, packing, 
  cdm_progress, risk_score, estimated_fine_risk, mitigation_action
- Filter tabs: All | Critical (RED) | Warning (YELLOW) | Compliant (GREEN)
- Total estimated penalty exposure: ₨ X (if all violations fined)
- Regulatory reference: CMS 2015 + DMMD circulars

## PAGE 4: /seasonal-prep — Eid / Ramadan Peak Preparation

File: src/pages/SeasonalPrep.jsx

Shows:
- Event selector: [Eid-ul-Fitr] [Eid-ul-Adha] [Ramadan] [Payroll] [Custom]
- Uplift slider: 1.0× to 1.5× (default 1.15 for Eid)
- Duration: 3-14 days
- "Calculate" button → POST /api/business/seasonal-scenario
- Results:
  - Extra cash needed bank-wide: ₨ X M
  - Extra CIT trips: N
  - KIBOR cost of extra buffer: ₨ Y M (over duration)
  - Denomination adjustment table: +15% Rs.100, +10% Rs.500, etc.
  - Per-branch preparation list (top 20 highest-impact branches)
- Side-by-side: Normal day vs Peak day vault levels (Recharts)

## ALSO: Enhance existing Branch Plan page

In BranchPlanView.jsx, add a section at the bottom (APPEND, don't replace):

"Daily Action Sheet" — calls GET /api/business/integrated-plan/{branch_id}
Shows the consolidated plan as a print-friendly card:
  - Vault: RELEASE ₨53M
  - ATMs: Load ATM-341 ₨2.1M, Skip ATM-089
  - Netting: Send ₨15M to Clifton branch
  - Denomination: 40/35/20/5 split
  - CIT: Pickup at 10:30 AM
  - Compliance: GREEN ✓
  - Forecast: Tomorrow deposits ₨68.5M (95% band: ₨52-85M)
  - [Print Action Sheet] button → window.print() with print-friendly CSS

## ADD ROUTES + NAV

Add routes for the 4 new pages in your router.
Add nav links in sidebar under "Business Views" section:
  - /cdm-plan → "CDM Deployment" (icon: Cpu from Lucide)
  - /iec-hub → "IEC Swap Hub" (icon: ArrowLeftRight)
  - /compliance-monitor → "Compliance" (icon: ShieldCheck)
  - /seasonal-prep → "Seasonal Prep" (icon: Calendar)

## VERIFY:
Open each page in browser. Each should load data from the new endpoints.
```
