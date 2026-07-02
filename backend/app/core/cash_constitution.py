"""
Cash Constitution (Phase 4 — oversight layer)
=============================================
A DECLARATIVE set of constraints that every UC-01 / UC-02 recommendation must pass
through before it is surfaced. This is the "constitution" of the oversight wrapper:
no optimizer output reaches a human as auto-approved until critique() has cleared it.

HARD constraints are regulatory / insurance / safety limits — a breach BLOCKS the
recommendation and auto-flags it to the Exceptions queue. SOFT preferences are
efficiency goals — a breach ANNOTATES the recommendation but does not block it.

All limits are sourced from the existing regulatory_constants.py / constants.py — this
module invents NO new numbers. Amounts in PKR Millions.

A "plan" is a plain dict describing one recommendation. critique() inspects only the
keys that are present, so it works for vault plans, ATM plans, CIT plans alike:

    {
      # CRR (reserves held at SBP vs requirement)
      "crr_held_m": float, "deposit_base_m": float,
      # Vault
      "vault_balance_m": float, "vault_capacity_m": float, "vault_min_m": float,
      # ATM
      "atm_projected_balance_m": float, "in_banking_hours": bool,
      # CIT
      "cit_value_m": float, "cit_stops": int,
      # soft signals
      "cit_trips": int, "cit_trips_baseline": int,
      "is_high_traffic": bool, "days_of_cash": float,
    }
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from app.core import regulatory_constants as reg
from app.core import constants as const

# ── Derived limits (no new numbers; just unit conversions / aliases) ──
CRR_DAILY_MIN = reg.CRR_DAILY_MIN                       # 0.03 of deposit base, daily floor
# Insured limit = 85% of vault capacity — the SAME bound business_output.vault_recommendation
# and CLAUDE.md use ("insurance limit = 85% vault capacity"). Keep these consistent.
VAULT_INSURED_FRACTION = 0.85
CIT_VEHICLE_MAX_M = reg.CIT_VEHICLE_MAX                 # PKR 100 M per vehicle
CIT_MAX_STOPS = const.CIT_MAX_STOPS                     # 12 stops
ATM_TARGET_DOC = reg.ATM_TARGET_DOC                     # 2.2 days of cash (soft buffer target)


@dataclass
class Violation:
    rule: str
    severity: str                       # "hard" | "soft"
    message: str
    limit: float | None = None
    actual: float | None = None
    breach_magnitude_m: float | None = None   # PKR M by how much the limit is breached

    def as_dict(self) -> dict:
        return {
            "rule": self.rule, "severity": self.severity, "message": self.message,
            "limit": self.limit, "actual": self.actual,
            "breach_magnitude_m": (round(self.breach_magnitude_m, 3)
                                   if self.breach_magnitude_m is not None else None),
        }


# ── HARD rules ──────────────────────────────────────────────────────────────
def _r_crr_floor(p: dict) -> Optional[Violation]:
    if "crr_held_m" in p and "deposit_base_m" in p:
        required = CRR_DAILY_MIN * float(p["deposit_base_m"])
        held = float(p["crr_held_m"])
        if held < required - 1e-9:
            return Violation(
                "CRR daily floor", "hard",
                f"Reserves {held:.1f} M below SBP daily minimum {required:.1f} M "
                f"({CRR_DAILY_MIN:.0%} of {p['deposit_base_m']:.0f} M base, "
                f"{reg.CRR_CIRCULAR})",
                limit=round(required, 3), actual=round(held, 3),
                breach_magnitude_m=required - held)
    return None


def _r_vault_insured_max(p: dict) -> Optional[Violation]:
    if "vault_balance_m" in p and "vault_capacity_m" in p:
        cap = VAULT_INSURED_FRACTION * float(p["vault_capacity_m"])
        bal = float(p["vault_balance_m"])
        if bal > cap + 1e-9:
            return Violation(
                "Vault insured maximum", "hard",
                f"Vault {bal:.1f} M exceeds insured limit {cap:.1f} M "
                f"({VAULT_INSURED_FRACTION:.0%} of {p['vault_capacity_m']:.0f} M capacity)",
                limit=round(cap, 3), actual=round(bal, 3),
                breach_magnitude_m=bal - cap)
    return None


def _r_vault_min(p: dict) -> Optional[Violation]:
    if "vault_balance_m" in p and "vault_min_m" in p:
        floor = float(p["vault_min_m"])
        bal = float(p["vault_balance_m"])
        if bal < floor - 1e-9:
            return Violation(
                "Vault operational minimum", "hard",
                f"Vault {bal:.1f} M below operational minimum {floor:.1f} M",
                limit=round(floor, 3), actual=round(bal, 3),
                breach_magnitude_m=floor - bal)
    return None


def _r_atm_never_zero(p: dict) -> Optional[Violation]:
    if p.get("in_banking_hours") and "atm_projected_balance_m" in p:
        bal = float(p["atm_projected_balance_m"])
        if bal <= 1e-9:
            return Violation(
                "ATM never-zero in banking hours", "hard",
                f"ATM projected balance {bal:.2f} M would hit zero during banking hours",
                limit=0.0, actual=round(bal, 3), breach_magnitude_m=-bal)
    return None


def _r_cit_max_value(p: dict) -> Optional[Violation]:
    if "cit_value_m" in p:
        val = float(p["cit_value_m"])
        if val > CIT_VEHICLE_MAX_M + 1e-9:
            return Violation(
                "CIT vehicle max value", "hard",
                f"CIT load {val:.1f} M exceeds insurance cap {CIT_VEHICLE_MAX_M:.0f} M/vehicle",
                limit=CIT_VEHICLE_MAX_M, actual=round(val, 3),
                breach_magnitude_m=val - CIT_VEHICLE_MAX_M)
    return None


def _r_cit_max_stops(p: dict) -> Optional[Violation]:
    if "cit_stops" in p:
        stops = int(p["cit_stops"])
        if stops > CIT_MAX_STOPS:
            return Violation(
                "CIT max stops", "hard",
                f"Route has {stops} stops, exceeds max {CIT_MAX_STOPS}",
                limit=CIT_MAX_STOPS, actual=stops, breach_magnitude_m=stops - CIT_MAX_STOPS)
    return None


# ── SOFT rules ──────────────────────────────────────────────────────────────
def _r_fewer_cit_trips(p: dict) -> Optional[Violation]:
    if "cit_trips" in p and "cit_trips_baseline" in p:
        trips, base = int(p["cit_trips"]), int(p["cit_trips_baseline"])
        if trips > base:
            return Violation(
                "Prefer fewer CIT trips", "soft",
                f"Plan uses {trips} CIT trips vs {base} baseline (+{trips - base})",
                limit=base, actual=trips, breach_magnitude_m=float(trips - base))
    return None


def _r_buffer_high_traffic(p: dict) -> Optional[Violation]:
    if p.get("is_high_traffic") and "days_of_cash" in p:
        doc = float(p["days_of_cash"])
        if doc < ATM_TARGET_DOC:
            return Violation(
                "Buffer high-traffic nodes", "soft",
                f"High-traffic node at {doc:.1f} days-of-cash, below target {ATM_TARGET_DOC} days",
                limit=ATM_TARGET_DOC, actual=round(doc, 2),
                breach_magnitude_m=ATM_TARGET_DOC - doc)
    return None


@dataclass
class CashConstitution:
    hard_rules: list[Callable[[dict], Optional[Violation]]] = field(default_factory=lambda: [
        _r_crr_floor, _r_vault_insured_max, _r_vault_min,
        _r_atm_never_zero, _r_cit_max_value, _r_cit_max_stops,
    ])
    soft_rules: list[Callable[[dict], Optional[Violation]]] = field(default_factory=lambda: [
        _r_fewer_cit_trips, _r_buffer_high_traffic,
    ])

    def critique(self, plan: dict) -> list[dict]:
        """Return every violation (hard first), each naming rule, magnitude, severity."""
        out: list[Violation] = []
        for rule in self.hard_rules:
            v = rule(plan)
            if v is not None:
                out.append(v)
        for rule in self.soft_rules:
            v = rule(plan)
            if v is not None:
                out.append(v)
        return [v.as_dict() for v in out]

    def enforce(self, plan: dict, recommendation: dict | None = None) -> dict:
        """Gate a recommendation: HARD violations BLOCK + flag, SOFT violations annotate.

        Returns the recommendation enriched with constitution_status / violations so the
        Exceptions queue and the copilot can ground on it without re-running critique."""
        rec = dict(recommendation or {})
        violations = self.critique(plan)
        hard = [v for v in violations if v["severity"] == "hard"]
        soft = [v for v in violations if v["severity"] == "soft"]
        rec["constitution_violations"] = violations
        if hard:
            rec["constitution_status"] = "BLOCKED"
            rec["auto_flag"] = True
            rec["block_reason"] = "; ".join(v["rule"] for v in hard)
        elif soft:
            rec["constitution_status"] = "ANNOTATED"
            rec["auto_flag"] = False
        else:
            rec["constitution_status"] = "CLEAR"
            rec["auto_flag"] = False
        return rec


# module-level singleton for convenience
CONSTITUTION = CashConstitution()


def critique(plan: dict) -> list[dict]:
    return CONSTITUTION.critique(plan)


def enforce(plan: dict, recommendation: dict | None = None) -> dict:
    return CONSTITUTION.enforce(plan, recommendation)
