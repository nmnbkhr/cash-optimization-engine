# COE — AI-Centric Upgrade (Claude Code Build Prompt)

> Paste this into Claude Code at the repo root (`~/projects/cash-optimization-engine`).
> It is written against the **actual** codebase: `ensemble_forecast.py` (XGBoost +
> MAPIE conformal), `uc01_vault_forecast.py` (legacy LSTM with hardcoded Eid dates),
> `data_generator.py` / `reconciling_generator.py`, the SQLite `dim_market` table,
> and the GPT-4.1 client in `app/core/ai_client.py`.
>
> **North-star metric (non-negotiable):** 7-day forward **closing-balance** forecast
> must land within **±12.5%** of actual. Every phase below is judged against that.

You are upgrading the Cash Optimization Engine to be reliable first and AI-centric
second. Do **not** replace OR/decision modules (UC03 netting, UC07 denomination,
UC08 CIT routing) with ML — keep them deterministic and auditable. Add AI where it
earns its place: **prediction + uncertainty**, plus an **intelligence/oversight layer**
on top.

Work phase by phase. After each phase, run it, show me the acceptance check, and stop
for review before continuing.

---

## Phase 0 — Ground truth & guardrails
1. Add `app/core/pk_calendar.py` (provided separately) to the repo. It is the single
   source of truth for Pakistan bank holidays, Eid/Ramadan/Muharram windows, and
   salary/pension days (2024–2027, 2026 verified vs SBP notifications).
2. **Delete** the hardcoded `_EID_DATES`, `_RAMADAN_STARTS`, `_MUHARRAM_STARTS` blocks
   in `uc01_vault_forecast.py` and re-point all callers to `pk_calendar`.
3. Create a `dim_calendar` table (Alembic migration) populated from
   `pk_calendar.build_calendar_dataframe("2024-01-01","2027-12-31")`. Keep
   `dim_market` but **left-join** `dim_calendar` on `date` wherever market features
   are loaded.
   - **Acceptance:** `grep -r "_EID_DATES\|_RAMADAN_STARTS" backend/` returns nothing;
     `dim_calendar` has ≥1460 rows and `SELECT * WHERE date='2026-03-20'` shows
     `is_bank_holiday=1, holiday_name='Eid-ul-Fitr'`.

## Phase 1 — Make the synthetic data actually contain the spikes
The current generator smooths demand, so the model can't learn the events that break
the ±12.5% band. Fix the data, not just the model.
1. In `data_generator.py` and `reconciling_generator.py`, multiply baseline daily
   withdrawal/deposit flows by `pk_calendar.withdrawal_demand_multiplier(d)` and
   `deposit_demand_multiplier(d)`. Apply branch-type sensitivity (Hub & Cash-Surplus
   react harder to salary/Eid; Seasonal reacts to harvest months).
2. Inject the **Zakat-day** one-off debit (1 Ramadan) on savings balances.
3. Regenerate the DB and plot one Hub branch's 365-day closing balance.
   - **Acceptance:** the plot shows a visible pre-Eid-ul-Fitr spike (~2–4×), a
     month-start salary pulse, and a bridge-day dip. No spike → data is still wrong.

## Phase 2 — Target the right variable & reframe the band
The business metric is **closing balance**, but `ensemble_forecast.py` predicts
deposit/withdrawal *flows*. Reconcile this explicitly.
1. Add a `closing_balance` forecast that composes opening balance + Σ(predicted
   net flow) over the 7-day horizon, propagating the conformal interval through the
   sum (flows are correlated — use the calibrated residuals of the *closing balance*
   directly, not the per-day flow intervals).
2. Express the interval as a **% band** and compute, per branch, whether the realized
   closing balance fell inside ±12.5%.
   - **Acceptance:** new `/api/uc01/closing-balance-forecast` returns
     `{predicted, lower, upper, band_pct, within_band}` per branch.

## Phase 3 — Reliability spine (this is what wins the showcase)
1. Add `app/services/conformal_calibration.py`: **segment-wise** conformal calibration
   (group by `branch_type` × `is_salary_window` × `is_eid_window`) so the band widens
   on volatile day-types instead of using one global width. Keep MAPIE but stratify.
2. Add `app/services/backtest.py`: rolling-origin backtest over the last 90 days that
   reports, per segment: **coverage** (fraction within ±12.5%), median band width,
   and MAPE. Persist to a `backtest_runs` table.
3. Frontend: add a **Coverage Monitor** panel (reuse the ComplianceMonitor pattern)
   showing coverage vs the 95% target and flagging segments below target.
   - **Acceptance:** backtest prints a coverage table; overall coverage and per-segment
     coverage are visible in the UI. Target: ≥90% of branches within ±12.5% on the
     backtest before we tune further.

## Phase 4 — AI intelligence layer (the "AI-centric" part)
Apply the alignment-wrapper concept: learned objective + explicit constitution +
attribution + adversarial validation + copilot + human-in-loop.
1. **Cash constitution** — `app/core/cash_constitution.py`: a declarative config of
   hard constraints (SBP CRR floor, vault min/max, never ATM-zero in banking hours,
   CIT max value/route) and soft preferences (fewer CIT trips, buffer high-traffic
   nodes). Add a `critique(plan) -> violations[]` function. Every UC01/UC02
   recommendation must pass `critique` before it is surfaced; violations are auto-
   revised or flagged.
2. **Attribution** — for each closing-balance forecast and each recommendation,
   compute SHAP values over the feature set and return the top-3 drivers
   (e.g. `"+Rs 4M: 60% salary-window, 25% withdrawal-trend, 15% pre-Eid"`).
   Store with the forecast; surface in `BranchDetail`.
3. **Red-team harness** — `app/services/red_team.py`: a battery of adversarial
   scenarios (stale/corrupted feed, CIT-vendor outage, coordinated withdrawal run,
   back-to-back Eid+salary collision, a branch with <30 days history). Assert the
   engine degrades safely (widens band / flags low confidence) rather than emitting a
   confident wrong number. Wire into CI.
4. **Copilot grounding** — rewrite `ai_client.py` prompts so GPT-4.1 explains each
   recommendation **only** from the stored attributions + constitution result (no free
   invention). If no API key, fall back to a template built from the same fields.
5. **Human-in-loop** — branches whose backtest coverage or forecast confidence is
   below threshold are routed to an **Exceptions queue** instead of auto-approved
   (scalable oversight across 3,727 nodes).
   - **Acceptance:** a recommendation that breaches the CRR floor is blocked by
     `critique`; every recommendation card shows its top-3 SHAP drivers; `red_team.py`
     passes; the Exceptions queue lists low-confidence branches.

## Phase 5 — Wire real public data (replace synthetic where possible)
Connect the public Pakistan series so at least the macro layer is real:
- **SBP EasyData** (`easydata.sbp.org.pk`, has a dataset API): policy rate, KIBOR
  (overnight/1W/1M), CRR/SLR, weekly **Currency in Circulation**, M2.
- **KIBOR** daily (FMA Pakistan / SBP) → already a feature; pull live instead of
  constant `0.105`.
- Keep per-branch/ATM cash series synthetic until UBL provides the real (non-
  transactional) extract — but make the loader pluggable so a real CSV drops in.
  - **Acceptance:** `app/core/sbp_data.py` fetches and caches at least KIBOR + CIC from
    EasyData; constants like `POLICY_RATE` read from the cache with a fallback.

---

### Build order & review gates
Phases must land in order (0→5). Reliability (1–3) before intelligence (4) before live
data (5). After each phase: run it, show the acceptance check, **pause for my review.**
Do not refactor the OR/decision modules into ML. Keep all amounts in PKR Millions and
preserve the existing dark/gold theme.
