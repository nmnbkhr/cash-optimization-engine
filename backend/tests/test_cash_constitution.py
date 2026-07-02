"""
Unit tests for the Cash Constitution (Phase 4 oversight layer).

Key assertion (acceptance a): a plan that breaches the SBP CRR floor is BLOCKED.
Run:  cd backend && python -m pytest tests/test_cash_constitution.py -v
"""
from app.core import regulatory_constants as reg
from app.core.cash_constitution import CashConstitution, critique, enforce


def test_crr_floor_breach_is_blocked():
    """Reserves below CRR_DAILY_MIN * deposit base -> a HARD violation that BLOCKS."""
    deposit_base = 1000.0                       # PKR M
    required = reg.CRR_DAILY_MIN * deposit_base  # e.g. 0.03 * 1000 = 30 M
    plan = {"crr_held_m": required - 5.0, "deposit_base_m": deposit_base}  # 5 M short

    violations = critique(plan)
    crr = [v for v in violations if v["rule"] == "CRR daily floor"]
    assert crr, "CRR floor breach should be detected"
    assert crr[0]["severity"] == "hard"
    assert abs(crr[0]["breach_magnitude_m"] - 5.0) < 1e-6

    rec = enforce(plan, {"action": "RELEASE", "amount_m": 50.0})
    assert rec["constitution_status"] == "BLOCKED"
    assert rec["auto_flag"] is True
    assert "CRR daily floor" in rec["block_reason"]


def test_crr_compliant_plan_is_clear():
    deposit_base = 1000.0
    plan = {"crr_held_m": reg.CRR_DAILY_MIN * deposit_base + 1.0, "deposit_base_m": deposit_base}
    rec = enforce(plan, {"action": "HOLD"})
    assert rec["constitution_status"] == "CLEAR"
    assert rec["auto_flag"] is False
    assert rec["constitution_violations"] == []


def test_vault_insured_max_is_hard():
    plan = {"vault_balance_m": 100.0, "vault_capacity_m": 100.0}  # >95% insured cap
    v = critique(plan)
    assert any(x["rule"] == "Vault insured maximum" and x["severity"] == "hard" for x in v)


def test_atm_never_zero_in_banking_hours():
    plan = {"atm_projected_balance_m": 0.0, "in_banking_hours": True}
    v = critique(plan)
    assert any(x["rule"] == "ATM never-zero in banking hours" and x["severity"] == "hard"
               for x in v)
    # Outside banking hours the same balance is NOT a hard breach
    plan_off = {"atm_projected_balance_m": 0.0, "in_banking_hours": False}
    assert critique(plan_off) == []


def test_cit_value_cap_is_hard():
    plan = {"cit_value_m": reg.CIT_VEHICLE_MAX + 25.0}
    v = critique(plan)
    hit = [x for x in v if x["rule"] == "CIT vehicle max value"]
    assert hit and hit[0]["severity"] == "hard"
    assert abs(hit[0]["breach_magnitude_m"] - 25.0) < 1e-6


def test_soft_violation_annotates_not_blocks():
    plan = {"cit_trips": 5, "cit_trips_baseline": 3, "is_high_traffic": True, "days_of_cash": 1.0}
    rec = enforce(plan, {"action": "SCHEDULE_LOAD"})
    assert rec["constitution_status"] == "ANNOTATED"
    assert rec["auto_flag"] is False
    assert all(v["severity"] == "soft" for v in rec["constitution_violations"])
    assert len(rec["constitution_violations"]) == 2


def test_hard_overrides_soft():
    plan = {"crr_held_m": 0.0, "deposit_base_m": 1000.0,   # hard breach
            "cit_trips": 9, "cit_trips_baseline": 2}        # soft breach too
    rec = enforce(plan, {})
    assert rec["constitution_status"] == "BLOCKED"
    assert any(v["severity"] == "hard" for v in rec["constitution_violations"])
    assert any(v["severity"] == "soft" for v in rec["constitution_violations"])
