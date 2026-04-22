# COE — BUSINESS OUTPUT LAYER
# ══════════════════════════════════════════════════════════════
# The ML, game theory, optimization is the ENGINE.
# This prompt builds the STEERING WHEEL — what people actually see and do.
# ══════════════════════════════════════════════════════════════

# WHO USES THIS APP AND WHAT DO THEY NEED?

## 1. BRANCH MANAGER (1,527 people)
Doesn't care about LSTM or Nash equilibrium.
Needs to know every morning:
- "How much cash should I keep in vault TODAY?" (a number, not a chart)
- "What denomination mix should I prepare?"
- "When is CIT coming? What should I hand over / receive?"
- "Am I performing well? What's my score this month?"
- "How much money did my branch save/waste this month by following/ignoring recommendations?"

## 2. REGIONAL HEAD (8-10 people, covering Karachi/Lahore/Islamabad/etc.)
Needs to know:
- "Which of my 150-380 branches are hoarding cash? How much is stuck?"
- "Where can I net cash between my branches instead of going to central vault?"
- "What's my region's total idle cash and what would it earn if freed?"
- "Which branches are ignoring recommendations? Who needs intervention?"
- "My region's CIT cost this month vs last month vs target"

## 3. HEAD OF CASH MANAGEMENT / TREASURY
Needs to know:
- "What's our bank-wide CRR position RIGHT NOW? Are we over-holding?"
- "How much can I deploy overnight? At what rate? Expected income?"
- "Nostro accounts — which are overfunded? How much can I repatriate?"
- "Total cash operations cost this month — trend up or down?"
- "CDM mandate progress — are we on track for 25% by CY2028?"

## 4. CFO / ALCO / BOARD
Needs to know:
- "What is the total P&L impact of cash optimization this quarter?"
- "Revenue gained from freed cash deployed in repo/T-bills"
- "Cost saved from CIT reduction, insurance, penalties"
- "ROI on the optimization engine investment"
- "Comparison: what we'd have earned with old approach vs new"

---

# WHAT EACH USE CASE MUST PRODUCE AS BUSINESS OUTPUT

## UC-01 OUTPUT: Daily Branch Cash Plan
```
┌─────────────────────────────────────────────────────┐
│ DAILY CASH PLAN — Saddar Main (KHI-0001)            │
│ Date: Monday, April 7, 2026                         │
├─────────────────────────────────────────────────────┤
│ RECOMMENDED VAULT OPENING:    PKR 42.0 M            │
│ Current vault:                PKR 95.0 M            │
│ ACTION: Release PKR 53.0 M to CIT pickup            │
│                                                     │
│ Expected deposits today:      PKR 68.5 M            │
│ Expected withdrawals today:   PKR 31.2 M            │
│ Net cash position by EOD:     PKR 79.3 M            │
│                                                     │
│ DENOMINATION PLAN:                                  │
│   Rs.5000: 40%  |  Rs.1000: 35%  |  Rs.500: 20%    │
│   Rs.100:   5%  |  Fresh notes needed: 15%          │
│                                                     │
│ CIT SCHEDULE:                                       │
│   10:30 AM — Pickup 53.0 M (excess vault)           │
│   No delivery scheduled                             │
│                                                     │
│ MONTHLY SCORECARD:                                  │
│   Cash Efficiency Score:  75.2% (rank: 342/1,527)   │
│   Savings this month:    PKR 0.48 M (on track)      │
│   Savings YTD:           PKR 3.84 M                 │
│   Penalties avoided:     2 (vault compliance ✓)      │
│   Model adherence:       88% (good)                 │
└─────────────────────────────────────────────────────┘
```

## UC-02 OUTPUT: ATM Load Order
```
┌─────────────────────────────────────────────────────┐
│ ATM LOAD ORDERS — Today's Schedule                  │
├────────┬──────────┬────────┬────────┬───────────────┤
│ ATM ID │ Location │ Load   │ Denom  │ Next Service  │
├────────┼──────────┼────────┼────────┼───────────────┤
│ ATM-341│ DHA VI   │ 2.1 M  │ 50/30/20│ Thursday     │
│ ATM-089│ Saddar   │ Skip   │ —      │ Saturday      │
│ ATM-512│ Clifton  │ 3.5 M  │ 40/35/25│ Wednesday    │
└────────┴──────────┴────────┴────────┴───────────────┘
│ Fleet savings this week: PKR 1.2 M (vs old schedule)│
└─────────────────────────────────────────────────────┘
```

## UC-03 OUTPUT: Netting Orders
```
┌─────────────────────────────────────────────────────┐
│ INTER-BRANCH NETTING — Karachi Region               │
│ Date: April 7, 2026                                 │
├──────────────┬───────────────┬───────┬──────────────┤
│ FROM         │ TO            │ Amount│ CIT Trips    │
│              │               │ (M)   │ Saved        │
├──────────────┼───────────────┼───────┼──────────────┤
│ Saddar       │ → Clifton     │ 15.0  │ 1            │
│ Tariq Road   │ → DHA VI      │  8.5  │ 1            │
│ Korangi Ind. │ → PECHS       │ 12.0  │ 1            │
├──────────────┼───────────────┼───────┼──────────────┤
│ TOTAL        │               │ 35.5  │ 3 trips saved│
│ Savings      │               │       │ PKR 45,000   │
└──────────────┴───────────────┴───────┴──────────────┘
```

## UC-04 OUTPUT: CRR Deployment Recommendation
```
┌─────────────────────────────────────────────────────┐
│ CRR POSITION — Monday April 7 (Day 4 of 7)         │
├─────────────────────────────────────────────────────┤
│ Deposit base:           PKR 851,038 M               │
│ Required weekly avg:    PKR  51,062 M (6.0%)        │
│ Cumulative held (4 days): PKR 198,500 M             │
│ Daily avg so far:       PKR  49,625 M (5.83%)       │
│                                                     │
│ RECOMMENDATION FOR TODAY:                           │
│   Hold at SBP:          PKR 38,000 M (4.47%)       │
│   Free for deployment:  PKR 13,062 M               │
│   Deploy in overnight repo @ 10.5%                  │
│   Expected income TODAY: PKR 3.75 M                 │
│                                                     │
│ Remaining 3 days need avg: PKR 53,833 M (6.33%)    │
│ Compliance probability:  99.8% ✓                    │
│ Week-to-date repo income: PKR 12.1 M               │
└─────────────────────────────────────────────────────┘
```

## UC-05 OUTPUT: Nostro Action List
```
┌─────────────────────────────────────────────────────┐
│ NOSTRO OPTIMIZATION — Actions for Treasury           │
├──────────────────┬────────┬────────┬────────────────┤
│ Account          │Currency│ Idle   │ Action         │
├──────────────────┼────────┼────────┼────────────────┤
│ Citi New York    │ USD    │ $2.1M  │ Place O/N dep  │
│ HSBC London      │ GBP    │ £0.8M  │ Repatriate     │
│ Emirates NBD     │ AED    │ AED 5M │ Hold (LC due)  │
│ Deutsche Bank    │ EUR    │ €1.2M  │ Place O/N dep  │
├──────────────────┼────────┼────────┼────────────────┤
│ Total idle (PKR equiv):  PKR 485 M                  │
│ Expected monthly income if deployed: PKR 4.2 M      │
└──────────────────┴────────┴────────┴────────────────┘
```

## UC-06 OUTPUT: Vostro Deployment Plan
```
Stable vostro (below 99th percentile outflow): PKR 18,500 M
→ Move to 3-month T-bills: PKR 12,000 M @ 11.5%
→ Keep in overnight: PKR 6,500 M @ 10.5%
→ Incremental yield gain: PKR 12.0 M/month
```

## UC-07 OUTPUT: Denomination Orders (per branch type)
```
Branch Type: Cash-Surplus (Bazaar)
Recommended: Rs.5000: 25% | Rs.1000: 40% | Rs.500: 25% | Rs.100: 10%
Reason: High-volume small transactions. Customers need change.
SBP compliance: ✓ Fresh note ratio: 18% (target: 15%)
```

## UC-08 OUTPUT: CIT Route Sheet
```
Vehicle KHI-07 | Driver: [name] | Route: Karachi South
Stop 1: 09:00 Saddar (Pickup 53.0 M)
Stop 2: 09:45 PECHS (Deliver 12.0 M)
Stop 3: 10:20 Clifton (Deliver 15.0 M)
Stop 4: 11:00 DHA VI (Deliver 26.0 M)
Return: 11:45 Central Vault
Total km: 34 | Total value: 53.0 M | Security: Standard
```

## UC-09 OUTPUT: Incentive Campaign Report
```
Segment: Retail Mass (920,000 customers)
Campaign: 0.5% cashback on Raast transfers
Period: March 2026
Digital shift achieved: 2.8% (→ 34,000 fewer cash transactions)
Cash handling cost saved: PKR 18.2 M
Campaign cost: PKR 8.5 M
NET SAVING: PKR 9.7 M ✓
```

## UC-10 OUTPUT: Cash P&L Report
```
┌─────────────────────────────────────────────────────┐
│ CASH OPERATIONS P&L — March 2026                    │
├─────────────────────────────────────────────────────┤
│ REVENUE FROM FREED CASH                             │
│   Overnight repo income:           PKR   312.5 M    │
│   T-bill deployment income:        PKR    85.0 M    │
│   Nostro optimization income:      PKR     4.2 M    │
│   Vostro deployment income:        PKR    12.0 M    │
│   CRR float income:               PKR    48.3 M    │
│                                    ─────────────    │
│   Total revenue gained:           PKR   461.0 M    │
│                                                     │
│ COST REDUCTION                                      │
│   CIT trips reduced (180 fewer):   PKR     2.7 M   │
│   Insurance premium reduction:     PKR     1.8 M   │
│   SBP penalties avoided:           PKR     0.9 M   │
│   Security cost optimization:      PKR     1.2 M   │
│   Digital shift savings:           PKR     9.7 M   │
│                                    ─────────────    │
│   Total cost saved:               PKR    16.3 M    │
│                                                     │
│ ═══════════════════════════════════════════════════ │
│ NET P&L IMPACT THIS MONTH:        PKR   477.3 M    │
│ ANNUALIZED:                        PKR 5,727.6 M   │
│ ═══════════════════════════════════════════════════ │
│                                                     │
│ vs. BEFORE optimization:           PKR     0.0 M   │
│ INCREMENTAL VALUE CREATED:         PKR   477.3 M   │
└─────────────────────────────────────────────────────┘
```

## CONSOLIDATED EXECUTIVE DASHBOARD
```
┌─────────────────────────────────────────────────────────────┐
│ UBL CASH OPTIMIZATION — EXECUTIVE DASHBOARD                 │
│ Period: March 2026 | All amounts PKR Millions               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ IDLE CASH ELIMINATED          REVENUE GENERATED             │
│ ┌───────────────────┐        ┌───────────────────┐         │
│ │ Before:  8,057 M  │        │ Repo:      312.5  │         │
│ │ After:   2,890 M  │        │ T-bill:     85.0  │         │
│ │ Freed:   5,167 M  │        │ CRR float:  48.3  │         │
│ │ ▓▓▓▓▓▓▓▓░░░ 64%  │        │ Nostro:      4.2  │         │
│ └───────────────────┘        │ Vostro:     12.0  │         │
│                              │ ────────────────  │         │
│ COST REDUCED                 │ Total:     461.0  │         │
│ ┌───────────────────┐        └───────────────────┘         │
│ │ CIT:        2.7   │                                      │
│ │ Insurance:  1.8   │        NET P&L IMPACT                │
│ │ Penalties:  0.9   │        ┌───────────────────┐         │
│ │ Security:   1.2   │        │ This month: 477.3 │         │
│ │ Digital:    9.7   │        │ YTD:      1,431.9 │         │
│ │ ────────────────  │        │ Annual:   5,727.6 │         │
│ │ Total:     16.3   │        └───────────────────┘         │
│ └───────────────────┘                                      │
│                                                             │
│ BRANCH PERFORMANCE                                          │
│ Top 5:  Saddar, Korangi, Anarkali, D-Ground, Raja Bazaar   │
│ Bottom 5: [branches ignoring recommendations]               │
│ Avg CES: 74.2% (up from 58.5%)                             │
│                                                             │
│ REGULATORY COMPLIANCE                                       │
│ CRR violations: 0 | SBP penalties: 0 | CDM progress: 18%  │
├─────────────────────────────────────────────────────────────┤
│ [Download Report]  [Share with ALCO]  [Monthly Trend]       │
└─────────────────────────────────────────────────────────────┘
```

---

# CLAUDE CODE PROMPT — BUILD THE BUSINESS OUTPUT LAYER

## Paste this into Claude Code:

```
The cash-optimization-engine project is running on native Ubuntu. All 10 use cases 
are built and working with demo data (real UBL GL amounts, PKR Millions). The ML models, 
optimizers, and game theory engines produce technical results.

NOW BUILD THE BUSINESS OUTPUT LAYER — the part that makes this app useful to actual 
bank employees who don't care about LSTM or Nash equilibrium.

## WHAT TO BUILD

### 1. NEW BACKEND SERVICE: services/business_output.py

This service takes the RAW optimization outputs from all 10 UC services and transforms 
them into ACTIONABLE BUSINESS DECISIONS. It is the translation layer between math and business.

```python
class BusinessOutputEngine:
    """
    Translates optimization results into actionable plans.
    All amounts in PKR Millions.
    """
    
    def daily_branch_plan(self, db, branch_id, date=None) -> dict:
        """
        THE MOST IMPORTANT OUTPUT. What a branch manager sees every morning.
        
        Calls internally:
        - uc01: forecast_branch() → get expected deposits/withdrawals
        - uc01: optimize_vault() → get recommended vault level
        - uc07: get_denomination_plan() → get denomination split
        - uc08: get_branch_cit_schedule() → get CIT timing
        - uc01: compute_game_theory() → get CES/BMIS scores
        
        Returns:
        {
            "branch_id": "KHI-0001",
            "branch_name": "Saddar Main",
            "date": "2026-04-07",
            "plan": {
                "recommended_vault_opening": 42.0,      # PKR M — THE KEY NUMBER
                "current_vault": 95.0,                    # PKR M
                "action": "RELEASE",                      # RELEASE / HOLD / REQUEST
                "action_amount": 53.0,                    # PKR M to release/request
                "expected_deposits": 68.5,                # PKR M
                "expected_withdrawals": 31.2,             # PKR M
                "expected_eod_position": 79.3,            # PKR M
            },
            "denomination": {
                "rs_5000_pct": 40,
                "rs_1000_pct": 35,
                "rs_500_pct": 20,
                "rs_100_and_below_pct": 5,
                "fresh_notes_needed_pct": 15,
            },
            "cit_schedule": [
                {"time": "10:30", "type": "pickup", "amount": 53.0}
            ],
            "scorecard": {
                "ces": 0.752,                             # Cash Efficiency Score
                "ces_rank": 342,                          # out of 1,527
                "savings_this_month": 0.48,               # PKR M
                "savings_ytd": 3.84,                      # PKR M
                "model_adherence_pct": 88,
                "penalties_avoided": 2,
                "sbp_compliance": True,
            }
        }
        """
    
    def regional_summary(self, db, region_or_city) -> dict:
        """
        What a Regional Head sees.
        Aggregates all branches in a city/region.
        
        Returns:
        {
            "region": "Karachi",
            "total_branches": 380,
            "total_idle_cash": 2850.0,          # PKR M stuck in vaults
            "total_freed_cash": 1920.0,         # PKR M freed this month
            "total_savings_this_month": 17.6,   # PKR M
            "netting_opportunities": [           # from UC-03
                {"from": "Saddar", "to": "Clifton", "amount": 15.0, "trips_saved": 1}
            ],
            "cit_stats": {
                "trips_this_month": 2400,
                "trips_saved": 180,
                "cost_saved": 2.7                # PKR M
            },
            "branch_rankings": {
                "top_5": [...],                   # highest CES
                "bottom_5": [...],                # lowest CES — need attention
                "non_compliant": [...]            # ignoring recommendations
            },
            "atm_stats": {
                "total_atms": 520,
                "avg_uptime": 97.8,
                "cash_savings": 0.45              # PKR M from UC-02
            }
        }
        """
    
    def treasury_dashboard(self, db) -> dict:
        """
        What Head of Treasury / Cash Management sees.
        Bank-wide position.
        
        Returns:
        {
            "crr_position": {                    # from UC-04
                "deposit_base": 851038.0,
                "crr_held_today": 38000.0,
                "crr_pct_today": 4.47,
                "weekly_avg_so_far": 5.83,
                "free_for_deployment": 13062.0,
                "recommended_deployment": "overnight_repo",
                "expected_income_today": 3.75,
                "week_income_so_far": 12.1,
                "compliance_probability": 99.8,
            },
            "nostro_position": {                 # from UC-05
                "total_nostro_balances": 4005.0,
                "total_idle": 485.0,
                "actions": [
                    {"bank": "Citi", "currency": "USD", "idle": 210.0, 
                     "action": "place_overnight"},
                    {"bank": "HSBC", "currency": "GBP", "idle": 80.0,
                     "action": "repatriate"},
                ],
                "monthly_income_if_deployed": 4.2,
            },
            "vostro_position": {                 # from UC-06
                "stable_portion": 18500.0,
                "deployed_in_tbills": 12000.0,
                "in_overnight": 6500.0,
                "incremental_yield_monthly": 12.0,
            },
            "digital_shift": {                   # from UC-09
                "cash_txn_pct_current": 62.0,
                "cash_txn_pct_target": 55.0,
                "shift_this_month": 2.8,
                "cost_saved": 9.7,
            },
            "cdm_progress": {
                "installed": 278,
                "target": 387,                   # 25% of 1,547
                "pct_complete": 71.8,
                "deadline": "CY2028",
            },
        }
        """
    
    def executive_pnl(self, db, period="monthly") -> dict:
        """
        What CFO / ALCO / Board sees.
        The bottom line.
        
        Returns:
        {
            "period": "March 2026",
            "revenue_generated": {
                "repo_income": 312.5,
                "tbill_deployment": 85.0,
                "crr_float_income": 48.3,
                "nostro_optimization": 4.2,
                "vostro_deployment": 12.0,
                "total": 461.0,
            },
            "cost_reduced": {
                "cit_trips_saved": 2.7,
                "insurance_reduction": 1.8,
                "sbp_penalties_avoided": 0.9,
                "security_optimization": 1.2,
                "digital_shift_savings": 9.7,
                "total": 16.3,
            },
            "net_pnl_impact": 477.3,
            "annualized": 5727.6,
            "idle_cash_before": 8057.0,
            "idle_cash_after": 2890.0,
            "idle_cash_freed": 5167.0,
            "freed_pct": 64.1,
            "avg_ces_before": 58.5,
            "avg_ces_after": 74.2,
            "compliance": {
                "crr_violations": 0,
                "sbp_penalties": 0,
                "cdm_progress_pct": 71.8,
            },
            "top_contributing_branches": [...],    # top 10 by savings
            "underperforming_branches": [...],     # bottom 10
        }
        """
    
    def consolidated_report(self, db) -> dict:
        """
        Combines all UCs into one unified output.
        This is the app's HOME PAGE after login.
        
        Returns all of the above plus:
        - use_case_status: {uc01: {active, savings_mtd, ...}, uc02: {...}, ...}
        - monthly_trend: last 6 months of P&L impact
        - recommendations: top 5 highest-impact actions not yet taken
        """
```

### 2. NEW API ENDPOINTS: api/business.py

```python
GET  /api/business/branch-plan/{branch_id}       → daily_branch_plan()
GET  /api/business/branch-plan/{branch_id}?date=  → specific date plan
GET  /api/business/region/{city}                  → regional_summary()
GET  /api/business/treasury                       → treasury_dashboard()
GET  /api/business/executive-pnl                  → executive_pnl()
GET  /api/business/executive-pnl?period=quarterly → quarterly view
GET  /api/business/consolidated                   → consolidated_report()
GET  /api/business/recommendations                → top actions to take
```

### 3. NEW FRONTEND PAGES

Build these as NEW pages/routes in the React app. Don't modify existing UC dashboards.

#### Page: /branch-plan (Branch Manager View)
- Dropdown to select branch (or auto-detect from login)
- Shows the daily plan card (vault recommendation, denomination, CIT schedule)
- Monthly scorecard with CES trend chart
- Simple, clean, NO technical jargon. A branch manager in Multan can understand it.
- Colors: green = good, gold = attention, red = action needed
- BIG NUMBERS for the key figure: "KEEP PKR 42 M IN VAULT TODAY"
- Print-friendly version for branch managers who print it every morning

#### Page: /regional (Regional Head View)  
- Select region/city from dropdown
- Heatmap of branches by idle cash (dark red = lots of idle, green = optimized)
- Netting opportunities table with "approve" buttons
- Branch ranking table sortable by CES, idle cash, savings
- CIT cost trend chart (monthly)
- Alert section: branches that are non-compliant or ignoring recommendations

#### Page: /treasury (Treasury/Cash Mgmt View)
- CRR position gauge (big visual — shows where we are vs 4% and 6%)
- Deployment recommendation: "Deploy PKR X in repo NOW"
- Nostro accounts world map with idle balances
- Vostro split visualization
- Digital shift progress bar
- CDM rollout progress

#### Page: /executive (CFO/ALCO/Board View)
- P&L waterfall: Idle Cash Freed → Repo Income → T-bill Income → CRR Float → 
  Nostro → Vostro → Cost Saved → NET IMPACT
- Monthly trend line: P&L impact over time
- Idle cash elimination progress (before/after donut chart)
- CES improvement trend (bank-wide average over time)
- Comparison table: projected vs actual savings per UC
- "Download ALCO Report" button → generates PDF/DOCX

#### Page: / (Home — Consolidated Dashboard)
- This replaces or sits above the UC catalogue
- Shows the 4 key numbers BIG:
  1. Idle Cash Freed: PKR 5,167 M (with progress ring)
  2. Revenue Generated: PKR 461 M/month
  3. Cost Saved: PKR 16.3 M/month  
  4. Net P&L Impact: PKR 477 M/month
- Below: 10 UC cards showing status + individual savings contribution
- Below: Top 5 recommended actions right now
- Role switcher: "I am a: [Branch Manager] [Regional Head] [Treasury] [Executive]"
  → navigates to the appropriate view

### 4. CRITICAL DESIGN RULES FOR BUSINESS PAGES

- NO technical terms: Say "recommended vault level" not "stochastic optimization output"
- NO ML jargon: Say "forecast accuracy: 95%" not "MAPE: 5.2%"  
- NO game theory language: Say "branch score" not "Nash equilibrium BMIS"
- BIG NUMBERS for key decisions: The most important number on each page should be 
  the LARGEST visual element
- ACTION-ORIENTED: Every panel should answer "what should I DO?" not "what happened?"
- PKR formatting: Always show "PKR X.X M" or "PKR X.X B" — never raw numbers
- PRINT-FRIENDLY: Branch plan page must print clean on A4 paper
- TREND CONTEXT: Every number should show vs. last month and vs. target
- Color coding: 
  Green = on track / good / savings
  Gold = attention / near threshold
  Red = action needed / loss / non-compliant

### 5. KEEP EXISTING UC DASHBOARDS

The existing technical UC dashboards (UC-01 through UC-10 with the charts, game theory 
panels, optimizer outputs) stay as they are. They're the "technical detail" view.

The new business pages LINK to them:
- Branch plan shows "View forecast details →" which links to UC-01 dashboard for that branch
- Treasury page shows "View CRR optimization →" which links to UC-04
- But the business pages are the PRIMARY interface. UC dashboards are drill-down.

### 6. NAVIGATION STRUCTURE

```
/ (Home — Consolidated Dashboard with role switcher)
├── /branch-plan         (Branch Manager daily plan)
├── /regional            (Regional Head overview)
├── /treasury            (Treasury/Cash Mgmt)
├── /executive           (CFO/ALCO P&L)
├── /catalogue           (existing UC catalogue — technical)
│   ├── /uc/01           (existing UC-01 dashboard)
│   ├── /uc/02           (existing UC-02 dashboard)
│   └── ... /uc/10
└── /settings
```

### 7. THE BUSINESS OUTPUT SERVICE MUST USE EXISTING UC SERVICES

business_output.py does NOT duplicate computation. It CALLS existing UC services:

```python
from services.uc01_vault_forecast import forecast_branch, optimize_vault, compute_game_theory
from services.uc02_atm_optimizer import optimize_atm, get_atm_fleet_summary
from services.uc03_netting import compute_netting, run_auction
from services.uc04_crr_float import optimize_crr_week
from services.uc05_nostro import optimize_nostro_portfolio
from services.uc06_vostro import compute_lar
from services.uc07_denomination import optimize_denomination
from services.uc08_cit_routing import optimize_routes
from services.uc09_digital_incentive import get_segment_analysis
from services.uc10_pnl_attribution import compute_cash_pnl
```

It's a FACADE that composes outputs from all 10 UCs into business-ready views.

### 8. VERIFY

After building, test each business endpoint:
```bash
curl localhost:8000/api/business/consolidated | python -m json.tool
curl localhost:8000/api/business/branch-plan/KHI-0001 | python -m json.tool
curl localhost:8000/api/business/region/Karachi | python -m json.tool
curl localhost:8000/api/business/treasury | python -m json.tool
curl localhost:8000/api/business/executive-pnl | python -m json.tool
```

Each should return real computed numbers from the demo data, not hardcoded values.

Then open the browser and navigate each business page.
The branch plan page should show "KEEP PKR 42 M IN VAULT TODAY" in big text.
The executive page should show the P&L waterfall with real numbers.
```
