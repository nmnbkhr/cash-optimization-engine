"""SBP regulatory constants and UBL operational parameters."""

# SBP Policy Rate
POLICY_RATE = 0.105  # 10.5% (SBP 2025)

# CRR Requirements
CRR_WEEKLY_AVG = 0.06  # 6% weekly average
CRR_DAILY_MIN = 0.04   # 4% daily minimum

# CDM Mandate
CDM_TARGET_PCT = 0.25   # 25% by CY2028
CDM_DEADLINE_YEAR = 2028

# Penalty Structure
PENALTY_UNPROCESSED_NOTES = 100_000  # PKR per violation
PENALTY_CRR_SHORTFALL_RATE = 0.03   # 3% above policy rate on shortfall

# Denomination Specs (Pakistani Rupee)
DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10]
DENOMINATION_NAMES = {
    5000: "Rs.5,000", 1000: "Rs.1,000", 500: "Rs.500",
    100: "Rs.100", 50: "Rs.50", 20: "Rs.20", 10: "Rs.10"
}

# CIT Operations
CIT_COST_PER_TRIP = 15_000  # PKR base cost
CIT_COST_PER_KM = 2         # PKR per km
CIT_EMERGENCY_COST = 45_000  # PKR emergency trip
CIT_MAX_VALUE_PER_TRIP = 100_000_000  # PKR 100M
CIT_MAX_STOPS = 12
CIT_FLEET_SIZE = 150

# Vault Insurance
VAULT_INSURANCE_RATE = 0.00015  # 0.015% of vault value

# ATM Parameters
ATM_STOCKOUT_PENALTY = 50_000   # PKR per event
ATM_PARTIAL_STOCKOUT = 10_000   # Wrong denomination penalty
ATM_CASSETTES = 4               # Standard cassette count

# UBL Network
UBL_TOTAL_BRANCHES = 1547
UBL_TOTAL_ATMS = 2180
UBL_DEPOSIT_BASE_TRILLIONS = 2.54

# Overnight Repo Rate
OVERNIGHT_REPO_RATE = 0.105  # 10.5%

# Digital Incentivization
DIGITAL_INCENTIVE_BUDGET = 500_000_000  # PKR 500M/year

# Branch Types
BRANCH_TYPES = ["Cash-Surplus", "Deficit", "Balanced", "Seasonal", "Hub"]
BRANCH_TYPE_DISTRIBUTION = {
    "Cash-Surplus": 0.35, "Deficit": 0.25, "Balanced": 0.20,
    "Seasonal": 0.15, "Hub": 0.05
}

# City Distribution for UBL branches
CITY_DISTRIBUTION = {
    "Karachi": 380, "Lahore": 280, "Islamabad": 120, "Rawalpindi": 90,
    "Faisalabad": 85, "Multan": 65, "Peshawar": 60, "Hyderabad": 55,
    "Quetta": 35, "Sialkot": 30, "Gujranwala": 28, "Bahawalpur": 25,
    "Sukkur": 22, "Abbottabad": 18,
    "Mardan": 15, "Sahiwal": 14, "Larkana": 13, "Sheikhupura": 12,
    "Jhang": 11, "Rahim Yar Khan": 10, "Gujrat": 10, "Kasur": 9,
    "Sargodha": 9, "Okara": 8, "Mingora": 8, "Dera Ghazi Khan": 7,
    "Nawabshah": 7, "Mirpur Khas": 6, "Chiniot": 6, "Kamoke": 5,
    "Sadiqabad": 5, "Burewala": 5, "Jacobabad": 5, "Muzaffargarh": 5,
    "Muridke": 4, "Jhelum": 4, "Khanewal": 4, "Hafizabad": 4,
    "Kohat": 4, "Khairpur": 3, "Daska": 3, "Hub": 3,
    "Chaman": 3, "Nowshera": 3, "Taxila": 3, "Swabi": 3,
    "Bannu": 2, "Dera Ismail Khan": 2, "Chakwal": 2, "Toba Tek Singh": 2,
    "Vehari": 2, "Attock": 2, "Bhakkar": 2, "Layyah": 2,
    "Lodhran": 2, "Mandi Bahauddin": 2, "Narowal": 2, "Pakpattan": 2,
    "Rajanpur": 1, "Hangu": 1, "Tank": 1, "Zhob": 1,
}

# Region mapping
CITY_REGIONS = {
    "Karachi": "Sindh", "Hyderabad": "Sindh", "Sukkur": "Sindh",
    "Larkana": "Sindh", "Nawabshah": "Sindh", "Mirpur Khas": "Sindh",
    "Jacobabad": "Sindh", "Khairpur": "Sindh",
    "Lahore": "Punjab", "Rawalpindi": "Punjab", "Faisalabad": "Punjab",
    "Multan": "Punjab", "Sialkot": "Punjab", "Gujranwala": "Punjab",
    "Bahawalpur": "Punjab", "Sahiwal": "Punjab", "Sargodha": "Punjab",
    "Sheikhupura": "Punjab", "Jhang": "Punjab", "Rahim Yar Khan": "Punjab",
    "Gujrat": "Punjab", "Kasur": "Punjab", "Okara": "Punjab",
    "Dera Ghazi Khan": "Punjab", "Chiniot": "Punjab", "Kamoke": "Punjab",
    "Sadiqabad": "Punjab", "Burewala": "Punjab", "Muzaffargarh": "Punjab",
    "Muridke": "Punjab", "Jhelum": "Punjab", "Khanewal": "Punjab",
    "Hafizabad": "Punjab", "Daska": "Punjab", "Chakwal": "Punjab",
    "Toba Tek Singh": "Punjab", "Vehari": "Punjab", "Attock": "Punjab",
    "Bhakkar": "Punjab", "Layyah": "Punjab", "Lodhran": "Punjab",
    "Mandi Bahauddin": "Punjab", "Narowal": "Punjab", "Pakpattan": "Punjab",
    "Rajanpur": "Punjab",
    "Islamabad": "Federal", "Taxila": "Federal",
    "Peshawar": "KPK", "Abbottabad": "KPK", "Mardan": "KPK",
    "Mingora": "KPK", "Kohat": "KPK", "Nowshera": "KPK", "Swabi": "KPK",
    "Bannu": "KPK", "Dera Ismail Khan": "KPK", "Hangu": "KPK", "Tank": "KPK",
    "Quetta": "Balochistan", "Hub": "Balochistan", "Chaman": "Balochistan", "Zhob": "Balochistan",
}
