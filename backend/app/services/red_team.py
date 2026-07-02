"""
Red-Team Harness (Phase 4 — adversarial safe-degradation tests)
===============================================================
Each scenario is an adversarial / abnormal condition. The harness asserts the oversight
wrapper DEGRADES SAFELY: the recommendation is caught by the Cash Constitution (HARD
block) OR routed to the Exceptions queue (wide conformal band) — it must NEVER be
silently auto-approved as a confident, inside-the-band number.

PASS for an adversarial scenario  = caught (blocked OR flagged).
PASS for the control scenario     = NOT caught (a clean, calm, narrow-band forecast is
                                     correctly auto-approved — proves the guardrails
                                     discriminate and don't just flag everything).

The catch thresholds are reused from the live system (constitution rules +
exceptions_queue.BAND_PCT_THRESHOLD) — the harness invents no new limits.

Run:  cd backend && python -m app.services.red_team      (exit code 0 = all safe)
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core import regulatory_constants as reg
from app.core.cash_constitution import CONSTITUTION
from app.services.exceptions_queue import BAND_PCT_THRESHOLD


@dataclass
class Scenario:
    name: str
    description: str
    plan: dict                 # passed through the constitution
    band_pct: float            # the conformal uncertainty this scenario produces
    adversarial: bool = True   # adversarial -> must be caught; control -> must NOT be


# Catch thresholds drawn from the live system (no new numbers).
SCENARIOS = [
    Scenario(
        "stale/corrupted feed",
        "Corrupted origin feature makes the model emit an absurd level (5x insured cap).",
        plan={"vault_balance_m": 5 * 150.0, "vault_capacity_m": 150.0, "vault_min_m": 5.0},
        band_pct=40.0),
    Scenario(
        "CIT-vendor outage",
        "Emergency reroute crams the whole city's cash onto one surviving vehicle.",
        plan={"cit_value_m": reg.CIT_VEHICLE_MAX + 150.0, "cit_stops": 20},
        band_pct=30.0),
    Scenario(
        "coordinated withdrawal run",
        "Bank-run withdrawals drain the vault below the operational floor and an ATM to zero "
        "during banking hours.",
        plan={"vault_balance_m": 2.0, "vault_min_m": 20.0,
              "atm_projected_balance_m": 0.0, "in_banking_hours": True},
        band_pct=55.0),
    Scenario(
        "Eid + salary collision",
        "Pre-Eid surge coincides with the salary window — no rule breach, but the conformal "
        "band blows out, so it must escalate to a human.",
        plan={"vault_balance_m": 60.0, "vault_capacity_m": 150.0, "vault_min_m": 5.0},
        band_pct=92.0),
    Scenario(
        "branch < 30 days history",
        "A newly-onboarded branch has too little history; the forecast is unreliable so the "
        "band stays wide and it routes to review rather than auto-approving.",
        plan={"vault_balance_m": 30.0, "vault_capacity_m": 150.0, "vault_min_m": 5.0},
        band_pct=70.0),
    Scenario(
        "control: calm, clean branch",
        "Normal calm day, clean feed, narrow band, all limits respected — should auto-approve.",
        plan={"vault_balance_m": 60.0, "vault_capacity_m": 150.0, "vault_min_m": 5.0},
        band_pct=22.0,
        adversarial=False),
]


def evaluate(sc: Scenario) -> dict:
    violations = CONSTITUTION.critique(sc.plan)
    hard = [v for v in violations if v["severity"] == "hard"]
    blocked = bool(hard)
    flagged = sc.band_pct > BAND_PCT_THRESHOLD
    caught = blocked or flagged
    if blocked and flagged:
        mechanism = "BLOCK+FLAG"
    elif blocked:
        mechanism = "constitution BLOCK"
    elif flagged:
        mechanism = "exceptions FLAG"
    else:
        mechanism = "auto-approve"
    # safe degradation: adversarial must be caught; control must be auto-approved
    safe = caught if sc.adversarial else (not caught)
    return {
        "name": sc.name, "adversarial": sc.adversarial, "band_pct": sc.band_pct,
        "blocked": blocked, "flagged": flagged, "mechanism": mechanism,
        "hard_rules": [v["rule"] for v in hard], "safe": safe,
    }


def run() -> dict:
    results = [evaluate(s) for s in SCENARIOS]
    all_safe = all(r["safe"] for r in results)
    return {"all_safe": all_safe, "n": len(results), "results": results}


def main() -> int:
    rep = run()
    print("=" * 92)
    print("RED-TEAM SAFE-DEGRADATION HARNESS  "
          f"(exceptions band threshold = ±{BAND_PCT_THRESHOLD:.0f}%)")
    print("=" * 92)
    print(f"  {'scenario':<30}{'kind':<8}{'band':>7}  {'mechanism':<20}{'result':>8}")
    print("  " + "-" * 88)
    for r in rep["results"]:
        kind = "ADV" if r["adversarial"] else "CTRL"
        print(f"  {r['name']:<30}{kind:<8}{r['band_pct']:>6.0f}%  "
              f"{r['mechanism']:<20}{'PASS' if r['safe'] else 'FAIL':>8}")
        if r["hard_rules"]:
            print(f"       └─ blocked by: {', '.join(r['hard_rules'])}")
    print("  " + "-" * 88)
    verdict = "ALL SCENARIOS DEGRADE SAFELY" if rep["all_safe"] else "UNSAFE SCENARIO DETECTED"
    print(f"  {verdict}  ({sum(r['safe'] for r in rep['results'])}/{rep['n']} pass)")
    print("=" * 92)
    return 0 if rep["all_safe"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
