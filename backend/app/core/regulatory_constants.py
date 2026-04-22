"""
SBP Regulatory Constants — 2026 Values
═══════════════════════════════════════
Hardcoded with effective dates and circular references.
These change infrequently (1-2x per year). When SBP issues a new circular,
update here and all calculations across the app will pick up the new values.
"""

# ── CRR (Cash Reserve Requirement) ──
# Per DMMD Circular No. 01 of 2026 (effective January 30, 2026):
CRR_WEEKLY_AVG = 0.05
CRR_DAILY_MIN = 0.03
CRR_EFFECTIVE_DATE = "2026-01-30"
CRR_CIRCULAR = "DMMD Circular No. 01 of 2026"
CRR_VAULT_COUNTS = False

# ── SLR (Statutory Liquidity Requirement) ──
SLR_RATE = 0.19
SLR_VAULT_COUNTS = True

# ── SBP Policy Rate ──
SBP_POLICY_RATE = 0.1050
SBP_POLICY_EFFECTIVE = "2025-12-16"

# ── KIBOR Benchmark ──
KIBOR_OVERNIGHT = 0.1054
KIBOR_REFERENCE = "Overnight weighted average repo rate"

# ── CDM Mandate ──
# Per PSP&OD Circular Letter No. 01 of 2025:
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
CMS_PENALTY_PER_VIOLATION = 0.1  # PKR 100K = 0.1 PKR M
CMS_VIOLATIONS = [
    "Unauthenticated notes issued to public",
    "Soiled/unfit notes not segregated",
    "Improper note packing/banding",
    "CCTV non-functional or < 60-day retention",
    "IEC swap not reported to SBP Finance Department",
]

# ── SBP-BSC Service Charge ──
SBP_BSC_CHARGE = 0.0012

# ── CIT Costs ──
CIT_NORMAL_COST = 0.015
CIT_EMERGENCY_COST = 0.045
CIT_VEHICLE_MAX = 100.0

# ── ATM ──
ATM_TARGET_DOC = 2.2
ATM_MIN_UPTIME = 0.985

# ── Vault ──
VAULT_INSURANCE_RATE = 0.00015
VAULT_SECURITY_WINDOW = ("08:00", "16:00")

# ── Digital Transaction Costs ──
CASH_TXN_COST = 0.000095
DIGITAL_TXN_COST = 0.000008
