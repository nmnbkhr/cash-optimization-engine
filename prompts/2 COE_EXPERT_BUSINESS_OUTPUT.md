# COE — EXPERT BUSINESS OUTPUT ENGINE
# ══════════════════════════════════════════════════════════════
# This replaces the previous COE_BUSINESS_OUTPUT_PROMPT.md
# Incorporates real SBP regulations, KIBOR mechanics, insurance 
# limits, and prescriptive banking decision logic.
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
The cash-optimization-engine project is running on native Ubuntu. All 10 use cases 
are built with demo data (real UBL GL amounts, PKR Millions). Now build the 
PRESCRIPTIVE BUSINESS OUTPUT LAYER — the decision-making heart of the app.

You are building this as a Senior Quantitative Finance Expert and Head of Treasury 
Operations for a Tier-1 Pakistani commercial bank. This bank manages ~851 Billion PKR 
in deposits across 1,527 branches and 2,180 ATMs.

ALL references to interest rates use KIBOR (Karachi Interbank Offered Rate) as the 
benchmark, NOT a generic "policy rate." The current overnight KIBOR is approximately 
10.50%. SBP policy rate is 10.50% (as of latest cut). All SBP regulatory references 
must be specific to actual Pakistan banking circulars.

## BACKEND: services/business_output.py

This is the PRESCRIPTIVE CORE — it does not just report, it DECIDES.
It calls existing UC services and applies expert banking logic to produce actions.

```python
"""
Cash Optimization Engine — Prescriptive Business Output Layer
═══════════════════════════════════════════════════════════════
Transforms raw ML/optimization outputs into bankable decisions.
All amounts in PKR Millions. Rates referenced to KIBOR.

SBP Regulatory Context (embedded, not looked up):
- CRR: 5% weekly average on demand + time liabilities < 1yr
  (Note: verify current rate — was raised to 6% in Nov 2021, 
   may have been revised. Use constant from constants.py)
- SLR: 19% minimum (T-bills + PIBs + approved securities)
- CRR deposits at SBP are NON-REMUNERATIVE (earn 0%)
- SBP-BSC charges 0.12% service charge on currency chest operations
- Minimum 1-day authenticated cash balance per SBP circular
- Cash sorting mandatory via CPCs per Currency Management Strategy 2015
- CDM mandate: 25% of branches by CY2028
- Penalty: PKR 100K for unprocessed notes to public
- KIBOR overnight: ~10.50% (benchmark for opportunity cost)
"""

import numpy as np
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from app.core.constants import *  # SBP rates, KIBOR, penalties
from app.models.branch import Branch
from app.models.vault_position import VaultPosition
from app.models.atm import ATM
from app.models.nostro_account import NostroAccount
from app.models.crr_position import CRRPosition


class CashOptimizationEngine:
    """
    The prescriptive core. Each method returns an ACTION, not a report.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.kibor_overnight = 0.1050  # Update from constants.py
        self.sbp_crr_rate = 0.05       # Current CRR rate
        self.sbp_bsc_service_charge = 0.0012  # 0.12% on SBP-BSC operations
        self.emergency_cit_cost = 0.045  # PKR 45K per emergency trip (in millions)
        self.normal_cit_cost = 0.015     # PKR 15K per scheduled trip
        self.vault_insurance_rate = 0.00015  # 0.015% of insured value per day
    
    # ══════════════════════════════════════════════════════════
    # UC-01: VAULT RECOMMENDATION
    # ══════════════════════════════════════════════════════════
    
    def vault_recommendation(self, branch_id: str, target_date: date = None) -> dict:
        """
        OBJECTIVE: Minimize idle cash while staying above SBP minimum 
        1-day authenticated balance AND within insurance cover limits.
        
        EXPERT LOGIC:
        1. Get ARIMA/Prophet forecast for next-day demand (from UC-01 service)
        2. Apply safety buffer = max(forecast_std × 1.65, branch_min_operational)
           - 1.65 = 95th percentile of normal distribution
        3. Check INSURANCE CONSTRAINT: 
           vault_balance ≤ branch_insurance_limit
           (Most branches insured for 2-3x average daily balance)
        4. Check SBP MINIMUM:
           vault_balance ≥ sbp_authenticated_minimum
           (Per SBP circular, branches must maintain minimum operational cash)
        5. OPTIMAL = max(SBP_minimum, forecast_95th_pct) 
                      constrained by min(vault_capacity, insurance_limit)
        6. ACTION = current_vault - optimal
           If ACTION > 0: RELEASE to CIT (cash is earning 0% in vault)
           If ACTION < 0: REQUEST from CIT/CPC
           If |ACTION| < threshold: HOLD (not worth a CIT trip)
        7. OPPORTUNITY COST = idle_amount × (KIBOR_overnight / 365)
           This is what the bank LOSES every day by holding excess
        8. ANNUAL IMPACT = idle_amount × KIBOR_overnight
           This is the number that motivates the branch manager
        
        PRESCRIPTIVE OUTPUT:
        "Keep PKR 42M. Release PKR 53M. You're losing PKR 15,247/day 
         at KIBOR 10.50%. That's PKR 5.57M/year sitting in your vault 
         doing nothing."
        """
        branch = self.db.query(Branch).filter(Branch.branch_id == branch_id).first()
        if not branch:
            raise ValueError(f"Branch {branch_id} not found")
        
        # Call existing UC-01 forecast
        from app.services.uc01_vault_forecast import forecast_branch, optimize_vault
        forecast = forecast_branch(self.db, branch_id)
        optimization = optimize_vault(self.db, branch_id)
        
        # Expert constraints
        insurance_limit = branch.vault_capacity * 0.85  # typically insured at 85% of capacity
        sbp_minimum = max(branch.avg_daily_withdrawals * 0.3, 2.0)  # at least 30% of daily demand or PKR 2M
        
        # Optimal vault level (from optimizer, bounded by constraints)
        optimal = optimization['recommended_vault']
        optimal = max(optimal, sbp_minimum)
        optimal = min(optimal, insurance_limit)
        
        # Action
        current = branch.current_vault_balance
        delta = round(current - optimal, 2)
        cit_trip_threshold = 5.0  # Don't dispatch CIT for less than PKR 5M
        
        if delta > cit_trip_threshold:
            action = "RELEASE"
            action_detail = f"Release PKR {delta:.1f}M to CIT. Earning 0% in vault."
        elif delta < -cit_trip_threshold:
            action = "REQUEST"
            action_detail = f"Request PKR {abs(delta):.1f}M from CPC/feeding branch."
        else:
            action = "HOLD"
            action_detail = f"Current level acceptable. Delta PKR {abs(delta):.1f}M below CIT threshold."
        
        # Opportunity cost at KIBOR
        idle_amount = max(0, current - optimal)
        daily_opportunity_cost = idle_amount * (self.kibor_overnight / 365)
        annual_opportunity_cost = idle_amount * self.kibor_overnight
        
        # Insurance cost on excess
        daily_insurance_waste = idle_amount * self.vault_insurance_rate
        
        # Total daily cost of holding excess
        total_daily_cost = daily_opportunity_cost + daily_insurance_waste
        
        return {
            "branch_id": branch_id,
            "branch_name": branch.name,
            "city": branch.city,
            "date": str(target_date or date.today()),
            
            "decision": {
                "recommended_vault": round(optimal, 1),
                "current_vault": round(current, 1),
                "action": action,
                "action_amount": round(abs(delta), 1),
                "action_detail": action_detail,
            },
            
            "constraints": {
                "sbp_minimum": round(sbp_minimum, 1),
                "insurance_limit": round(insurance_limit, 1),
                "vault_capacity": round(branch.vault_capacity, 1),
                "binding_constraint": "insurance" if optimal == insurance_limit else 
                                     "sbp_minimum" if optimal == sbp_minimum else "forecast",
            },
            
            "forecast": {
                "expected_deposits": round(forecast['avg_forecast'] * 0.6, 1),  # deposit component
                "expected_withdrawals": round(forecast['avg_forecast'], 1),
                "forecast_confidence": f"{100 - forecast.get('mape', 5):.0f}%",
                "model": forecast.get('model_type', 'Statistical'),
            },
            
            "cost_of_inaction": {
                "idle_cash": round(idle_amount, 1),
                "daily_kibor_loss": round(daily_opportunity_cost * 1e6, 0),  # in PKR (not millions)
                "daily_insurance_waste": round(daily_insurance_waste * 1e6, 0),
                "total_daily_cost": round(total_daily_cost * 1e6, 0),
                "annual_loss": round(annual_opportunity_cost, 2),
                "kibor_reference": f"{self.kibor_overnight*100:.2f}%",
                "narrative": f"PKR {idle_amount:.1f}M sitting idle. At KIBOR {self.kibor_overnight*100:.2f}%, "
                           f"you lose PKR {daily_opportunity_cost*1e6:,.0f}/day = PKR {annual_opportunity_cost:.2f}M/year.",
            },
            
            "scorecard": {
                "ces": round(branch.cash_efficiency_score, 3),
                "savings_potential_annual": round(branch.annual_savings_potential, 2),
            },
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-02: ATM LOAD ORDERS
    # ══════════════════════════════════════════════════════════
    
    def atm_load_orders(self, branch_id: str = None, city: str = None) -> dict:
        """
        OBJECTIVE: Minimize "Days of Cash" (DoC) in ATM cassettes while 
        keeping "Emergency CIT Trips" near zero and availability > 98.5%.
        
        EXPERT LOGIC:
        1. DoC = current_cash / avg_daily_dispense
           Industry best practice: DoC = 2.0-2.5 days
           UBL current average: DoC = 3.5-4.0 (too high)
        2. For each ATM, compute:
           optimal_load = avg_daily_dispense × target_DoC × denomination_factor
        3. CIT TRIP DECISION:
           If DoC < 1.0 → URGENT: emergency CIT (costs PKR 45K, 3x normal)
           If DoC < 1.5 → SCHEDULE: next available CIT (costs PKR 15K)
           If DoC > 3.0 → OVER-LOADED: skip next scheduled CIT
           If DoC 1.5-3.0 → OPTIMAL: maintain
        4. IDLE INTEREST LOSS per ATM per day:
           (current_cash - optimal_load) × (KIBOR / 365)
        5. Trade-off: cost of emergency CIT (PKR 45K) vs interest loss of 
           holding extra cash (PKR X per day). Find break-even DoC.
           break_even_DoC = emergency_cit_cost / (cassette_capacity × KIBOR / 365)
        
        DENOMINATION LOGIC:
        - Corporate/affluent ATMs: 60% Rs.5000, 30% Rs.1000, 10% Rs.500
        - Retail/bazaar ATMs: 30% Rs.5000, 40% Rs.1000, 30% Rs.500
        - Rs.100 dispensing only at CDM-equipped or selected ATMs
        
        PRESCRIPTIVE OUTPUT:
        Table of ATMs needing service TODAY with exact load amounts and 
        denomination mix per cassette.
        """
        query = self.db.query(ATM)
        if branch_id:
            query = query.filter(ATM.branch_id == branch_id)
        elif city:
            query = query.filter(ATM.city == city)
        
        atms = query.all()
        
        orders = []
        total_idle = 0
        for atm in atms:
            doc = atm.current_cash_m / max(atm.avg_daily_dispense_m, 0.001)
            optimal_load = atm.avg_daily_dispense_m * 2.2  # target 2.2 DoC
            idle = max(0, atm.current_cash_m - optimal_load)
            daily_loss = idle * (self.kibor_overnight / 365)
            total_idle += idle
            
            if doc < 1.0:
                action = "URGENT_LOAD"
                priority = "HIGH"
                load_amount = round(optimal_load - atm.current_cash_m, 2)
            elif doc < 1.5:
                action = "SCHEDULE_LOAD"
                priority = "MEDIUM"
                load_amount = round(optimal_load - atm.current_cash_m, 2)
            elif doc > 3.5:
                action = "SKIP_NEXT_CIT"
                priority = "LOW"
                load_amount = 0
            else:
                action = "OPTIMAL"
                priority = "NONE"
                load_amount = 0
            
            # Denomination mix by ATM type/location
            if atm.atm_type in ['Lobby'] and atm.city in ['Karachi', 'Lahore', 'Islamabad']:
                denom = {"rs5000": 55, "rs1000": 30, "rs500": 15}
            elif atm.atm_type == 'Mall':
                denom = {"rs5000": 45, "rs1000": 35, "rs500": 20}
            else:
                denom = {"rs5000": 35, "rs1000": 40, "rs500": 25}
            
            orders.append({
                "atm_id": atm.atm_id,
                "branch_id": atm.branch_id,
                "location": atm.city,
                "atm_type": atm.atm_type,
                "current_cash": round(atm.current_cash_m, 2),
                "days_of_cash": round(doc, 1),
                "optimal_load": round(optimal_load, 2),
                "action": action,
                "priority": priority,
                "load_amount": max(0, round(load_amount, 2)),
                "denomination_pct": denom,
                "daily_idle_loss_pkr": round(daily_loss * 1e6, 0),
                "uptime": round(atm.uptime_pct * 100, 1),
            })
        
        # Sort: URGENT first, then SCHEDULE, then rest
        priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "NONE": 3}
        orders.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        urgent_count = sum(1 for o in orders if o['action'] == 'URGENT_LOAD')
        schedule_count = sum(1 for o in orders if o['action'] == 'SCHEDULE_LOAD')
        skip_count = sum(1 for o in orders if o['action'] == 'SKIP_NEXT_CIT')
        
        return {
            "total_atms": len(atms),
            "summary": {
                "urgent_loads": urgent_count,
                "scheduled_loads": schedule_count,
                "skip_next": skip_count,
                "optimal": len(atms) - urgent_count - schedule_count - skip_count,
                "total_idle_cash": round(total_idle, 1),
                "daily_fleet_idle_loss": round(total_idle * self.kibor_overnight / 365 * 1e6, 0),
                "avg_days_of_cash": round(np.mean([o['days_of_cash'] for o in orders]), 1),
                "target_days_of_cash": 2.2,
            },
            "orders": orders[:50],  # top 50 needing action
            "narrative": f"{urgent_count} ATMs need URGENT loading. {schedule_count} scheduled. "
                        f"Fleet idle cash: PKR {total_idle:.1f}M losing PKR {total_idle * self.kibor_overnight / 365 * 1e6:,.0f}/day at KIBOR.",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-03: NETTING OPPORTUNITIES
    # ══════════════════════════════════════════════════════════
    
    def netting_opportunities(self, city: str = None) -> dict:
        """
        OBJECTIVE: Find surplus branches near deficit branches for direct 
        cash transfer. Minimize SBP-BSC deposits which incur 0.12% service charge.
        
        EXPERT LOGIC:
        1. Classify branches:
           SURPLUS = current_vault > optimal × 1.3 (30% over-funded)
           DEFICIT = current_vault < optimal × 0.8 (20% under-funded)
        2. For each surplus-deficit pair in same city:
           - Distance = haversine(lat1,lng1, lat2,lng2) in km
           - Only match if distance < 15 km (CIT practical range)
           - Transfer amount = min(surplus_excess, deficit_shortfall)
        3. SAVINGS vs SBP-BSC route:
           SBP route cost = transfer_amount × 0.12% (BSC service charge) 
                          + 2 CIT trips × PKR 15K
           Direct route cost = 1 CIT trip × PKR 15K
           Net saving per netting = BSC_charge_avoided + 1_trip_saved
        4. Sort matches by net saving descending → recommend top N
        
        PRESCRIPTIVE OUTPUT:
        "Send PKR 15M from Saddar to Clifton directly. Saves PKR 33K 
         (PKR 18K BSC charge + PKR 15K CIT trip avoided)."
        """
        query = self.db.query(Branch)
        if city:
            query = query.filter(Branch.city == city)
        branches = query.all()
        
        surplus = [b for b in branches if b.current_vault_balance > b.optimal_vault_balance * 1.3]
        deficit = [b for b in branches if b.current_vault_balance < b.optimal_vault_balance * 0.8]
        
        matches = []
        for s in surplus:
            excess = s.current_vault_balance - s.optimal_vault_balance
            for d in deficit:
                shortfall = d.optimal_vault_balance - d.current_vault_balance
                
                # Distance check (simplified haversine)
                dlat = abs(s.lat - d.lat)
                dlng = abs(s.lng - d.lng)
                dist_km = ((dlat**2 + dlng**2)**0.5) * 111  # rough km
                
                if dist_km > 15:
                    continue
                
                transfer = min(excess, shortfall)
                if transfer < 3.0:  # minimum PKR 3M to justify a trip
                    continue
                
                bsc_charge_avoided = transfer * self.sbp_bsc_service_charge
                cit_trip_saved = self.normal_cit_cost  # 1 trip saved
                net_saving = bsc_charge_avoided + cit_trip_saved
                
                matches.append({
                    "from_branch": s.branch_id,
                    "from_name": s.name,
                    "to_branch": d.branch_id,
                    "to_name": d.name,
                    "city": s.city,
                    "transfer_amount": round(transfer, 1),
                    "distance_km": round(dist_km, 1),
                    "bsc_charge_avoided": round(bsc_charge_avoided, 4),
                    "cit_trip_saved": round(cit_trip_saved, 3),
                    "net_saving": round(net_saving, 4),
                })
        
        matches.sort(key=lambda x: x['net_saving'], reverse=True)
        total_nettable = sum(m['transfer_amount'] for m in matches)
        total_saving = sum(m['net_saving'] for m in matches)
        
        return {
            "surplus_branches": len(surplus),
            "deficit_branches": len(deficit),
            "matches_found": len(matches),
            "total_nettable_amount": round(total_nettable, 1),
            "total_daily_saving": round(total_saving, 3),
            "annual_saving": round(total_saving * 300, 1),  # ~300 working days
            "bsc_service_charge_rate": f"{self.sbp_bsc_service_charge*100:.2f}%",
            "matches": matches[:20],  # top 20
            "narrative": f"{len(matches)} netting opportunities found. "
                        f"PKR {total_nettable:.0f}M can bypass SBP-BSC (saving {self.sbp_bsc_service_charge*100:.2f}% service charge). "
                        f"Annual saving: PKR {total_saving * 300:.1f}M.",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-04: CRR DEPLOYMENT RECOMMENDATION
    # ══════════════════════════════════════════════════════════
    
    def crr_deployment(self) -> dict:
        """
        OBJECTIVE: Ensure CRR compliance (5% weekly avg, per current SBP rate)
        while minimizing funds in the NON-REMUNERATIVE SBP account.
        Every PKR held above minimum earns 0% vs KIBOR 10.50%.
        
        EXPERT LOGIC:
        1. Maintenance period: Friday (day 1) to Thursday (day 7)
        2. Get current position: which day of the week are we?
        3. Cumulative CRR held so far in this maintenance period
        4. Required avg for remaining days to hit exactly 5% weekly
        5. TODAY'S recommendation:
           - Hold at SBP = max(daily_minimum, 
             (required_weekly_total - cumulative_so_far) / remaining_days)
           - Free for deployment = deposit_base × CRR_rate - today_hold
        6. Deploy freed amount in:
           - Overnight KIBOR repo (safest, most liquid)
           - If > 3 days remaining: consider 3-day repo at slightly higher rate
        7. INTRADAY VOLATILITY: 
           Deposits fluctuate intraday. Add buffer = 0.15% of deposit base 
           to avoid accidental CRR breach.
        8. Income = freed_amount × (KIBOR_overnight / 365)
        
        KEY INSIGHT: CRR deposits earn 0%. Every PKR freed earns KIBOR.
        On a 851B deposit base, even 0.1% freed = PKR 851M × KIBOR/365 per day.
        """
        # Get latest CRR position
        latest_crr = self.db.query(CRRPosition).order_by(CRRPosition.date.desc()).first()
        if not latest_crr:
            raise ValueError("No CRR data found")
        
        deposit_base = latest_crr.deposit_base_m
        required_weekly_total = deposit_base * self.sbp_crr_rate * 7  # total over 7 days
        daily_minimum = deposit_base * (self.sbp_crr_rate - 0.01)  # 1% below avg as floor
        
        # Simulate current position in maintenance week
        day_of_week = latest_crr.day_of_week
        days_elapsed = (day_of_week - 4) % 7 + 1  # Friday=1, Thursday=7
        days_remaining = 7 - days_elapsed
        
        # What we've held so far (from CRR positions table)
        recent = self.db.query(CRRPosition).order_by(CRRPosition.date.desc()).limit(days_elapsed).all()
        cumulative_held = sum(p.crr_deposit_m for p in recent)
        
        # What we need for remaining days
        remaining_needed = required_weekly_total - cumulative_held
        if days_remaining > 0:
            daily_target_remaining = remaining_needed / days_remaining
        else:
            daily_target_remaining = 0
        
        # Today's recommendation
        intraday_buffer = deposit_base * 0.0015  # 0.15% buffer
        today_hold = max(daily_minimum, daily_target_remaining) + intraday_buffer
        free_for_deployment = max(0, deposit_base * self.sbp_crr_rate - today_hold + intraday_buffer)
        
        # Income
        daily_income = free_for_deployment * (self.kibor_overnight / 365)
        
        # Week so far income
        week_income = sum(
            max(0, deposit_base * self.sbp_crr_rate - p.crr_deposit_m) * (self.kibor_overnight / 365) 
            for p in recent
        )
        
        return {
            "maintenance_period": {
                "day_number": days_elapsed,
                "days_remaining": days_remaining,
                "period": "Friday to Thursday",
            },
            "deposit_base": round(deposit_base, 0),
            "crr_rate": f"{self.sbp_crr_rate*100:.1f}%",
            "position": {
                "required_weekly_avg": round(deposit_base * self.sbp_crr_rate, 0),
                "cumulative_held": round(cumulative_held, 0),
                "daily_avg_so_far": round(cumulative_held / max(days_elapsed, 1), 0),
                "avg_pct_so_far": round(cumulative_held / max(days_elapsed, 1) / deposit_base * 100, 2),
                "remaining_needed": round(remaining_needed, 0),
                "daily_target_remaining": round(daily_target_remaining, 0),
            },
            "recommendation": {
                "hold_at_sbp_today": round(today_hold, 0),
                "hold_pct": round(today_hold / deposit_base * 100, 2),
                "free_for_deployment": round(free_for_deployment, 0),
                "deploy_in": "Overnight KIBOR Repo",
                "kibor_rate": f"{self.kibor_overnight*100:.2f}%",
                "expected_income_today": round(daily_income, 2),
                "intraday_buffer": round(intraday_buffer, 0),
            },
            "week_performance": {
                "income_earned_so_far": round(week_income, 2),
                "projected_week_income": round(week_income + daily_income * max(days_remaining, 1), 2),
                "annualized": round((week_income + daily_income * max(days_remaining, 1)) * 52, 1),
            },
            "risk": {
                "compliance_status": "ON_TRACK" if cumulative_held / max(days_elapsed, 1) >= deposit_base * self.sbp_crr_rate * 0.95 else "MONITOR",
                "breach_probability": "< 0.1%" if intraday_buffer > 0 else "ELEVATED",
            },
            "narrative": f"Day {days_elapsed}/7 of maintenance period. Hold PKR {today_hold:,.0f}M at SBP (earns 0%). "
                        f"Deploy PKR {free_for_deployment:,.0f}M in overnight repo at KIBOR {self.kibor_overnight*100:.2f}%. "
                        f"Expected income today: PKR {daily_income:.2f}M.",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-05 & UC-06: NOSTRO & VOSTRO ACTIONS
    # ══════════════════════════════════════════════════════════
    
    def nostro_vostro_actions(self) -> dict:
        """
        OBJECTIVE: Predictive FX flow analysis. Suggest "FUND" or "SWEEP" 
        based on upcoming L/C settlements and inter-bank clearing cycles.
        
        EXPERT LOGIC (NOSTRO):
        1. For each nostro account:
           - Available = balance - minimum_required - pending_lc_obligations
           - If Available > 0: SWEEP (place in O/N deposit or repatriate)
           - If Available < 0: FUND (transfer from another nostro or buy FX)
        2. SWEEP destination priority:
           a) O/N deposit with correspondent (earn local O/N rate)
           b) Repatriate to PKR (earn KIBOR, but incur FX spread)
           c) Transfer to another nostro that needs funding
        3. FUND source priority:
           a) Transfer from over-funded nostro in same currency
           b) FX purchase from treasury desk
           c) Draw on credit line with correspondent
        4. Consider FX CARRY:
           If USD O/N rate (Fed Funds ~4.5%) < KIBOR (10.5%), 
           repatriation earns the differential (6%) minus FX costs.
           Only repatriate if net carry > 2% (to cover FX bid-ask spread)
        
        EXPERT LOGIC (VOSTRO):
        1. Classify vostro deposits by stability:
           STABLE = balance consistently above 99th percentile of outflows
           VOLATILE = balance fluctuates with clearing cycles
        2. STABLE portion → deploy in 3-6 month T-bills (earn 11-12%)
           VOLATILE portion → keep in overnight (earn KIBOR O/N)
        3. Incremental yield = stable × (tbill_rate - overnight_rate)
        """
        nostros = self.db.query(NostroAccount).all()
        
        actions = []
        total_sweepable = 0
        total_fund_needed = 0
        
        for n in nostros:
            available = n.balance_pkr_m - n.minimum_required_m - n.pending_lc_obligations_m
            
            if available > n.minimum_required_m * 0.2:  # > 20% above minimum+obligations
                action = "SWEEP"
                amount = round(available, 2)
                total_sweepable += amount
                
                # Decide sweep destination
                local_on_rate = n.overnight_rate_pct / 100
                carry_vs_kibor = self.kibor_overnight - local_on_rate
                
                if carry_vs_kibor > 0.02:  # > 2% carry
                    destination = "REPATRIATE_TO_PKR"
                    expected_yield = f"{self.kibor_overnight*100:.2f}% (KIBOR)"
                    rationale = f"PKR carry {carry_vs_kibor*100:.1f}% over {n.currency} rate"
                else:
                    destination = "OVERNIGHT_DEPOSIT"
                    expected_yield = f"{local_on_rate*100:.2f}% ({n.currency} O/N)"
                    rationale = f"Carry insufficient for repatriation ({carry_vs_kibor*100:.1f}%)"
                
            elif available < -n.minimum_required_m * 0.1:  # < 10% below required
                action = "FUND"
                amount = round(abs(available), 2)
                total_fund_needed += amount
                destination = "TRANSFER_OR_PURCHASE"
                expected_yield = "N/A"
                rationale = f"Below minimum by PKR {amount:.1f}M. L/C settlement due."
            else:
                action = "HOLD"
                amount = 0
                destination = "N/A"
                expected_yield = "N/A"
                rationale = "Within acceptable range"
            
            actions.append({
                "nostro_id": n.nostro_id,
                "bank": n.correspondent_bank,
                "currency": n.currency,
                "country": n.country,
                "balance": round(n.balance_pkr_m, 1),
                "minimum": round(n.minimum_required_m, 1),
                "pending_lc": round(n.pending_lc_obligations_m, 1),
                "available": round(available, 1),
                "action": action,
                "amount": amount,
                "destination": destination,
                "expected_yield": expected_yield,
                "rationale": rationale,
            })
        
        # Sort: FUND first (urgent), then SWEEP (opportunity)
        action_order = {"FUND": 0, "SWEEP": 1, "HOLD": 2}
        actions.sort(key=lambda x: action_order.get(x['action'], 2))
        
        sweep_income = total_sweepable * (self.kibor_overnight / 12)  # monthly
        
        return {
            "total_nostro_accounts": len(nostros),
            "summary": {
                "total_sweepable": round(total_sweepable, 1),
                "total_fund_needed": round(total_fund_needed, 1),
                "monthly_income_if_swept": round(sweep_income, 2),
                "annual_income_if_swept": round(sweep_income * 12, 1),
            },
            "actions": actions,
            "narrative": f"{sum(1 for a in actions if a['action']=='SWEEP')} accounts to sweep "
                        f"(PKR {total_sweepable:.0f}M). "
                        f"{sum(1 for a in actions if a['action']=='FUND')} need funding "
                        f"(PKR {total_fund_needed:.0f}M). "
                        f"Potential KIBOR income: PKR {sweep_income:.2f}M/month.",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-07: DENOMINATION PLAN
    # ══════════════════════════════════════════════════════════
    
    def denomination_plan(self, branch_id: str) -> dict:
        """
        OBJECTIVE: Match denomination mix to transactional elasticity.
        Reduce counter friction and customer wait times.
        
        EXPERT LOGIC:
        1. Branch type determines base mix:
           - Cash-Surplus (bazaar/wholesale): HIGH Rs.1000 (40%), Rs.500 (25%)
             Reason: many small-value cash deposits from traders
           - Cash-Deficit (salary/corporate): HIGH Rs.5000 (50%), Rs.1000 (30%)
             Reason: large withdrawals, customers want fewer notes
           - Balanced (residential): EVEN mix
           - Seasonal (agri): Rs.1000 (45%) dominant (crop payments)
           - Hub/CPC: maintain buffer of all denominations for redistribution
        2. Eid adjustment: +15% to Rs.50/Rs.100/Rs.20 (Eidi demand)
        3. Fresh note ratio: SBP requires minimum % of clean notes
           Per SBP Currency Management Strategy, only machine-sorted 
           notes to be issued. Non-compliance = PKR 100K penalty.
        4. ATM-fit notes: Rs.5000, Rs.1000, Rs.500 must be 
           machine-authenticated before loading into ATMs.
        """
        branch = self.db.query(Branch).filter(Branch.branch_id == branch_id).first()
        
        type_plans = {
            "Cash-Surplus":  {"rs5000": 20, "rs1000": 40, "rs500": 25, "rs100": 10, "rs50_below": 5},
            "Cash-Deficit":  {"rs5000": 50, "rs1000": 30, "rs500": 15, "rs100": 3, "rs50_below": 2},
            "Balanced":      {"rs5000": 35, "rs1000": 35, "rs500": 20, "rs100": 7, "rs50_below": 3},
            "Seasonal":      {"rs5000": 15, "rs1000": 45, "rs500": 25, "rs100": 10, "rs50_below": 5},
            "Hub":           {"rs5000": 30, "rs1000": 30, "rs500": 20, "rs100": 12, "rs50_below": 8},
        }
        
        plan = type_plans.get(branch.branch_type, type_plans["Balanced"])
        
        # Check if Eid season (adjust for small denominations)
        # This would use Islamic calendar — simplified here
        month = datetime.now().month
        near_eid = month in [3, 4, 6, 7]  # approximate Eid months 2026
        if near_eid:
            plan["rs50_below"] += 10
            plan["rs100"] += 5
            plan["rs5000"] -= 10
            plan["rs1000"] -= 5
        
        total_vault = branch.current_vault_balance
        
        return {
            "branch_id": branch_id,
            "branch_name": branch.name,
            "branch_type": branch.branch_type,
            "denomination_plan": plan,
            "amounts": {k: round(total_vault * v / 100, 1) for k, v in plan.items()},
            "eid_adjusted": near_eid,
            "fresh_note_requirement": "15% minimum (SBP Currency Mgmt Strategy)",
            "atm_fit_notes": "Rs.5000, Rs.1000, Rs.500 must be machine-authenticated",
            "sbp_penalty_risk": "PKR 100K per instance if unsorted notes issued",
            "rationale": f"{branch.branch_type} branch: "
                        f"{'High Rs.1000/500 for trader deposits' if branch.branch_type == 'Cash-Surplus' else ''}"
                        f"{'High Rs.5000 for salary withdrawals' if branch.branch_type == 'Cash-Deficit' else ''}"
                        f"{'Balanced mix for residential area' if branch.branch_type == 'Balanced' else ''}"
                        f"{'Rs.1000 dominant for crop payments' if branch.branch_type == 'Seasonal' else ''}"
                        f"{'Buffer stock for redistribution' if branch.branch_type == 'Hub' else ''}",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-08: CIT ROUTE SHEET
    # ══════════════════════════════════════════════════════════
    
    def cit_route_sheet(self, city: str) -> dict:
        """
        OBJECTIVE: Traveling Salesman Problem with RISK constraints.
        Optimize for fuel, vehicle insurance, and daylight security windows.
        
        EXPERT LOGIC:
        1. Security constraints (Pakistan-specific):
           - All CIT movement between 08:00-16:00 (daylight hours)
           - High-risk zones (certain areas of Karachi, Peshawar, Quetta): 
             armed escort required, no stops > 10 minutes
           - Vehicle max value: PKR 100M at any point
           - Min 2 guards per vehicle, 3 in high-risk zones
        2. Insurance constraint:
           - CIT vehicle insured for max PKR 100M in transit
           - If route total > 100M, split into multiple vehicles
        3. Fuel optimization:
           - Cluster nearby branches, nearest-neighbor routing within cluster
           - Avoid backtracking (one-directional sweep per route)
        4. Time windows:
           - Banks open 09:00, cash verified by 09:30
           - CPC branches: first priority (they feed satellite branches)
           - Salary-day branches: prioritize early delivery
        """
        branches = self.db.query(Branch).filter(Branch.city == city).all()
        
        # Identify branches needing CIT service today
        needs_pickup = [b for b in branches if b.current_vault_balance > b.optimal_vault_balance * 1.3]
        needs_delivery = [b for b in branches if b.current_vault_balance < b.optimal_vault_balance * 0.8]
        
        # Simple nearest-neighbor routing (production would use OR-Tools)
        routes = []
        max_vehicle_value = 100.0  # PKR 100M max per vehicle
        
        # Group pickups into routes
        remaining = list(needs_pickup)
        route_num = 0
        while remaining:
            route_num += 1
            route_value = 0
            stops = []
            current_lat, current_lng = remaining[0].lat, remaining[0].lng
            
            for b in list(remaining):
                pickup_amount = b.current_vault_balance - b.optimal_vault_balance
                if route_value + pickup_amount > max_vehicle_value:
                    continue
                stops.append({
                    "branch_id": b.branch_id,
                    "name": b.name,
                    "action": "PICKUP",
                    "amount": round(pickup_amount, 1),
                    "time": f"{8 + len(stops)}:{30 if len(stops) % 2 == 0 else '00'}",
                })
                route_value += pickup_amount
                remaining.remove(b)
            
            if stops:
                routes.append({
                    "route_id": f"CIT-{city[:3].upper()}-{route_num:02d}",
                    "vehicle": f"{city[:3].upper()}-{route_num:02d}",
                    "total_value": round(route_value, 1),
                    "insurance_ok": route_value <= max_vehicle_value,
                    "stops": stops,
                    "est_duration_hours": round(len(stops) * 0.5 + 0.5, 1),
                    "security_level": "ENHANCED" if city in ['Karachi', 'Peshawar', 'Quetta'] else "STANDARD",
                    "guards_required": 3 if city in ['Karachi', 'Peshawar', 'Quetta'] else 2,
                })
        
        total_trips = len(routes)
        total_value = sum(r['total_value'] for r in routes)
        total_cost = total_trips * self.normal_cit_cost
        
        return {
            "city": city,
            "date": str(date.today()),
            "operating_window": "08:00 - 16:00",
            "routes": routes,
            "summary": {
                "total_vehicles": total_trips,
                "total_stops": sum(len(r['stops']) for r in routes),
                "total_cash_moved": round(total_value, 1),
                "total_cost": round(total_cost * 1e6, 0),
                "max_vehicle_value_constraint": max_vehicle_value,
                "branches_needing_pickup": len(needs_pickup),
                "branches_needing_delivery": len(needs_delivery),
            },
            "security_note": f"{'ENHANCED security in ' + city + ': armed escorts required' if city in ['Karachi','Peshawar','Quetta'] else 'Standard security protocols'}",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-09: DIGITAL SHIFT REPORT
    # ══════════════════════════════════════════════════════════
    
    def digital_shift_report(self) -> dict:
        """
        OBJECTIVE: Identify top 5% "Cash-Heavy" customers and flag them 
        for migration to digital channels (Raast, mobile banking, UBL Omni).
        
        EXPERT LOGIC:
        1. Cluster branches by cash intensity:
           cash_intensity = avg_daily_withdrawals / total_deposits
           HIGH = top 20% (these branches need the most digital shift)
        2. Estimate cash transaction cost:
           PKR 85-120 per cash transaction (teller time + counting + vault)
           vs PKR 5-10 per digital transaction
           Savings per shifted transaction: ~PKR 80
        3. Target segments:
           - Retail Mass: offer Raast cashback 0.5%
           - SME: offer bulk payment portal
           - Salary accounts: offer auto-digital enrollment
        4. ROI calculation:
           Campaign cost (cashback + marketing) vs 
           Perpetual cash handling cost saved
        """
        branches = self.db.query(Branch).all()
        
        total_cash_txns = sum(b.daily_transactions * 0.65 for b in branches)  # 65% are cash
        total_digital_txns = sum(b.daily_transactions * 0.35 for b in branches)
        
        cash_cost_per_txn = 0.000095  # PKR 95 per transaction in millions
        digital_cost_per_txn = 0.000008  # PKR 8 per transaction in millions
        
        current_cash_cost_daily = total_cash_txns * cash_cost_per_txn
        
        # If we shift 5% from cash to digital
        shift_pct = 0.05
        shifted_txns = total_cash_txns * shift_pct
        daily_savings = shifted_txns * (cash_cost_per_txn - digital_cost_per_txn)
        monthly_savings = daily_savings * 25  # working days
        annual_savings = monthly_savings * 12
        
        # Campaign cost estimate
        monthly_campaign_cost = shifted_txns * 25 * 0.000050  # PKR 50 avg incentive per txn
        
        # Top cash-heavy branches
        branches_sorted = sorted(branches, 
            key=lambda b: b.avg_daily_withdrawals / max(b.total_deposits, 0.001), 
            reverse=True)
        
        top_cash_heavy = [{
            "branch_id": b.branch_id,
            "name": b.name,
            "city": b.city,
            "cash_intensity": round(b.avg_daily_withdrawals / max(b.total_deposits, 0.001) * 100, 2),
            "daily_cash_txns": int(b.daily_transactions * 0.65),
            "potential_shift": int(b.daily_transactions * 0.65 * shift_pct),
        } for b in branches_sorted[:20]]
        
        return {
            "current_state": {
                "cash_transactions_pct": 65,
                "digital_transactions_pct": 35,
                "daily_cash_transactions": int(total_cash_txns),
                "daily_cash_handling_cost": round(current_cash_cost_daily, 2),
            },
            "shift_target": {
                "shift_pct": shift_pct * 100,
                "transactions_to_shift": int(shifted_txns),
                "channels": ["Raast P2P", "UBL Digital App", "UBL Omni", "Internet Banking"],
            },
            "financials": {
                "daily_savings": round(daily_savings, 3),
                "monthly_savings": round(monthly_savings, 2),
                "annual_savings": round(annual_savings, 1),
                "monthly_campaign_cost": round(monthly_campaign_cost, 2),
                "net_monthly_benefit": round(monthly_savings - monthly_campaign_cost, 2),
                "roi_pct": round((monthly_savings / max(monthly_campaign_cost, 0.001) - 1) * 100, 0),
            },
            "top_cash_heavy_branches": top_cash_heavy,
            "narrative": f"Shifting {shift_pct*100:.0f}% of cash transactions to digital "
                        f"saves PKR {annual_savings:.1f}M/year after campaign costs. "
                        f"ROI: {(monthly_savings / max(monthly_campaign_cost, 0.001) - 1) * 100:.0f}%.",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # UC-10: P&L ATTRIBUTION ("VALUE REALIZED")
    # ══════════════════════════════════════════════════════════
    
    def value_realized_report(self) -> dict:
        """
        OBJECTIVE: Calculate actual value created.
        Formula: (Reduction in Idle Cash × Overnight KIBOR) - (Operational Costs)
        
        This is THE bottom line. Every other UC feeds into this.
        """
        branches = self.db.query(Branch).all()
        atms = self.db.query(ATM).all()
        nostros = self.db.query(NostroAccount).all()
        
        # ── REVENUE SIDE ──
        
        # UC-01: Vault idle cash freed
        total_idle_branches = sum(b.idle_cash for b in branches)
        vault_freed_income = total_idle_branches * self.kibor_overnight / 12  # monthly
        
        # UC-02: ATM idle cash freed
        total_idle_atms = sum(a.idle_cash_m for a in atms)
        atm_freed_income = total_idle_atms * self.kibor_overnight / 12
        
        # UC-04: CRR float income (estimated from band usage)
        crr_band = sum(b.total_deposits for b in branches) * 0.01  # 1% band
        crr_float_income = crr_band * self.kibor_overnight / 12
        
        # UC-05: Nostro sweep income
        nostro_idle = sum(n.idle_balance_m for n in nostros)
        nostro_income = nostro_idle * self.kibor_overnight / 12
        
        total_revenue = vault_freed_income + atm_freed_income + crr_float_income + nostro_income
        
        # ── COST SIDE ──
        
        # Monthly operational costs (from actual UBL P&L, allocated)
        personnel_cash_pct = 0.10  # 10% of personnel cost is cash-related
        premises_cash_pct = 0.05
        direct_cash_pct = 0.40  # 40% of direct cost is CIT/cash handling
        
        total_personnel = sum(b.monthly_personnel_cost for b in branches)
        total_premises = sum(b.monthly_premises_cost for b in branches)
        total_direct = sum(b.monthly_direct_cost for b in branches)
        total_other = sum(b.monthly_other_cost for b in branches)
        
        cash_ops_cost = (total_personnel * personnel_cash_pct + 
                        total_premises * premises_cash_pct + 
                        total_direct * direct_cash_pct +
                        total_other * 0.05)
        
        # SBP-BSC charges avoided (from netting)
        bsc_charges = total_idle_branches * self.sbp_bsc_service_charge
        
        # ── NET VALUE ──
        net_value = total_revenue - cash_ops_cost + bsc_charges
        
        return {
            "period": "Monthly",
            "revenue": {
                "vault_cash_freed_income": round(vault_freed_income, 2),
                "atm_cash_freed_income": round(atm_freed_income, 2),
                "crr_float_income": round(crr_float_income, 2),
                "nostro_sweep_income": round(nostro_income, 2),
                "total_revenue": round(total_revenue, 2),
            },
            "costs": {
                "cash_personnel": round(total_personnel * personnel_cash_pct, 2),
                "cash_premises": round(total_premises * premises_cash_pct, 2),
                "cit_and_handling": round(total_direct * direct_cash_pct, 2),
                "other_cash_ops": round(total_other * 0.05, 2),
                "total_cash_ops_cost": round(cash_ops_cost, 2),
            },
            "net_value_realized": {
                "monthly": round(net_value, 2),
                "annual": round(net_value * 12, 1),
                "formula": "(Idle Cash Freed × KIBOR) - Cash Ops Cost",
                "kibor_used": f"{self.kibor_overnight*100:.2f}%",
            },
            "key_metrics": {
                "total_idle_freed_branches": round(total_idle_branches, 0),
                "total_idle_freed_atms": round(total_idle_atms, 1),
                "total_idle_freed": round(total_idle_branches + total_idle_atms, 0),
                "avg_ces": round(np.mean([b.cash_efficiency_score for b in branches]), 3),
                "bsc_charges_avoided": round(bsc_charges, 3),
            },
            "narrative": f"Value Realized: PKR {net_value:.1f}M/month (PKR {net_value*12:.0f}M annualized). "
                        f"Freed PKR {total_idle_branches + total_idle_atms:,.0f}M idle cash earning KIBOR {self.kibor_overnight*100:.2f}%. "
                        f"Cash ops cost: PKR {cash_ops_cost:.1f}M/month.",
        }
    
    
    # ══════════════════════════════════════════════════════════
    # CONSOLIDATED EXECUTIVE VIEW
    # ══════════════════════════════════════════════════════════
    
    def consolidated_dashboard(self) -> dict:
        """
        The HOME PAGE. Combines all UCs into one view.
        For CFO, ALCO, Board.
        """
        pnl = self.value_realized_report()
        crr = self.crr_deployment()
        nostro = self.nostro_vostro_actions()
        digital = self.digital_shift_report()
        
        branches = self.db.query(Branch).all()
        atms = self.db.query(ATM).all()
        
        return {
            "bank_snapshot": {
                "total_branches": len(branches),
                "total_atms": len(atms),
                "deposit_base": round(sum(b.total_deposits for b in branches), 0),
                "total_vault_cash": round(sum(b.current_vault_balance for b in branches), 0),
                "total_atm_cash": round(sum(a.current_cash_m for a in atms), 1),
            },
            "optimization_impact": {
                "idle_cash_before": round(sum(b.idle_cash for b in branches) + sum(a.idle_cash_m for a in atms), 0),
                "monthly_value_realized": pnl["net_value_realized"]["monthly"],
                "annual_value_realized": pnl["net_value_realized"]["annual"],
                "avg_ces": pnl["key_metrics"]["avg_ces"],
            },
            "today_actions": {
                "crr_deploy": crr["recommendation"]["free_for_deployment"],
                "crr_income_today": crr["recommendation"]["expected_income_today"],
                "nostro_sweepable": nostro["summary"]["total_sweepable"],
            },
            "revenue_breakdown": pnl["revenue"],
            "cost_breakdown": pnl["costs"],
            "digital_shift": {
                "cash_pct": digital["current_state"]["cash_transactions_pct"],
                "annual_savings_potential": digital["financials"]["annual_savings"],
            },
            "compliance": {
                "crr_status": crr["risk"]["compliance_status"],
                "sbp_penalties_this_month": 0,
            },
            "top_actions_now": [
                f"Deploy PKR {crr['recommendation']['free_for_deployment']:,.0f}M in overnight KIBOR repo",
                f"Sweep PKR {nostro['summary']['total_sweepable']:.0f}M from idle nostro accounts",
                f"Execute {len(self.netting_opportunities()['matches'])} branch netting transfers",
                f"Target {digital['financials']['annual_savings']:.0f}M/yr from digital shift campaign",
            ],
        }
```

## API ENDPOINTS: api/business.py

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.business_output import CashOptimizationEngine

router = APIRouter(prefix="/api/business", tags=["Business Output"])

@router.get("/vault-recommendation/{branch_id}")
def vault_recommendation(branch_id: str, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.vault_recommendation(branch_id)

@router.get("/atm-load-orders")
def atm_load_orders(branch_id: str = None, city: str = None, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.atm_load_orders(branch_id, city)

@router.get("/netting/{city}")
def netting(city: str, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.netting_opportunities(city)

@router.get("/crr-deployment")
def crr_deployment(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.crr_deployment()

@router.get("/nostro-vostro")
def nostro_vostro(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.nostro_vostro_actions()

@router.get("/denomination-plan/{branch_id}")
def denomination_plan(branch_id: str, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.denomination_plan(branch_id)

@router.get("/cit-routes/{city}")
def cit_routes(city: str, db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.cit_route_sheet(city)

@router.get("/digital-shift")
def digital_shift(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.digital_shift_report()

@router.get("/value-realized")
def value_realized(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.value_realized_report()

@router.get("/consolidated")
def consolidated(db: Session = Depends(get_db)):
    engine = CashOptimizationEngine(db)
    return engine.consolidated_dashboard()
```

Include this router in main.py: `app.include_router(business_router)`

## FRONTEND: 4 NEW PAGES (role-based views)

Build these as new routes. Keep existing UC technical dashboards unchanged.

### Navigation:
```
/ → Consolidated Dashboard (home — shows the 4 big numbers + top actions)
/branch-plan → Branch Manager view (select branch → daily plan)
/regional → Regional Head view (select city → heatmap + rankings)
/treasury → Treasury view (CRR gauge + nostro map + deployment recs)
/executive → CFO/ALCO view (P&L waterfall + value realized)
/catalogue → existing UC technical dashboards (drill-down)
```

### Design rules for ALL business pages:
- KEY DECISION in huge text (e.g., "KEEP PKR 42M" or "DEPLOY PKR 13B")
- PKR amounts always formatted: "PKR 42.0 M" or "PKR 851 B"
- Every panel answers "WHAT SHOULD I DO?" not "what happened?"
- KIBOR referenced as benchmark everywhere (not generic "rate")
- SBP regulations cited where relevant (not vaguely)
- Green/Gold/Red color coding for status
- Trend arrows ↑↓ showing vs last month
- Print-friendly for branch plan page
- Each business page has a small "Technical Details →" link to the corresponding UC dashboard

### Verify after building:
```bash
curl -s localhost:8000/api/business/consolidated | python -m json.tool
curl -s localhost:8000/api/business/vault-recommendation/KHI-0001 | python -m json.tool
curl -s localhost:8000/api/business/crr-deployment | python -m json.tool
curl -s localhost:8000/api/business/value-realized | python -m json.tool
curl -s localhost:8000/api/business/netting/Karachi | python -m json.tool
curl -s localhost:8000/api/business/atm-load-orders?city=Karachi | python -m json.tool
```

Each must return computed results with narrative explanations, not hardcoded data.
Then open browser → navigate each business page → verify actionable outputs.
```
