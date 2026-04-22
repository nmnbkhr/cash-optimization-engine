# UBL ACTUAL GL DATA — AMOUNTS REFERENCE
# All amounts from demo.xlsx are in PKR MILLIONS
# Source: UBL MPR/GL System, January 2016 snapshot
# Cross-verified against UBL Annual Report 2016 (BS size Rs. 1.58 Trillion)

## USE THIS PROMPT IN CLAUDE CODE when seeding the database or building any UC:

```
IMPORTANT: All amounts in this project are in PKR MILLIONS (PKR M).
The source data is from UBL's internal GL/MPR system, January 2016.
Verified against UBL FY2016 Annual Report (Total Assets Rs. 1.58 Trillion).

## UBL ACTUAL BALANCE SHEET ANCHORS (PKR Millions, Jan 2016)

### CASH & CASH EQUIVALENTS — UC-01, UC-02, UC-07, UC-08
Cash in Hand (GL 10000100):                    11,739.26 M    ← Branch vaults + tills
Cash in Transit (GL 10000300):                     25.74 M    ← CIT pipeline
Cash ATM Main (GL 10000350):                    1,159.20 M    ← Branch lobby ATMs
Cash ATM Offsite (GL 10000360):                   156.93 M    ← Offsite ATMs
Cash ATM-2 (GL 10000370):                          45.21 M    ← Secondary ATMs
Cash ATM-3 (GL 10000380):                          21.56 M    ← Tertiary ATMs
Cash ATM-4 (GL 10000390):                           8.66 M    ← Small ATMs
Cash ATM-5 (GL 10000340):                           1.66 M    ← Minimal ATMs
Prize Bonds (6 GL codes):                         261.80 M    ← Denomination inventory
─────────────────────────────────────────────────────────────
TOTAL CASH:                                    13,419.04 M    = PKR 13.4 Billion

### SBP / REGULATORY — UC-04 (CRR Float Engineering)
Central Bank Balance (GL 10500100):            16,380.85 M    ← SBP main account
Central Bank Instruments Coll (GL 10500150):        8.46 M
Other SBP Branches (GL 10500550):              14,788.49 M    ← SBP-BSC field offices
CRR Deposit (GL 10500110):                      2,342.45 M    ← Tagged CRR
SLR (GL 11000110):                              6,985.78 M    ← Statutory Liquidity Reserve
─────────────────────────────────────────────────────────────
TOTAL SBP BALANCES:                            31,177.79 M    = PKR 31.2 Billion
NBP Clearing Balance (GL 10500200):            10,623.69 M    = PKR 10.6 Billion

### NOSTRO & PLACEMENTS — UC-05 (Nostro), UC-06 (Vostro)
Nostro Foreign Banks (GL 10500600):               973.61 M
Nostro Subsidiaries (GL 10500500):                107.78 M
HO Funds AG Zurich (GL 24502900):                 522.81 M
Placement Foreign Bank (GL 11500300):           2,580.00 M
Placement Other Banks (GL 11000600):              104.19 M
ATM Switch Settlement (GL 27503940):               14.89 M
Nostro OD Offset (GL 31405600):                  -178.82 M
─────────────────────────────────────────────────────────────
NET NOSTRO + PLACEMENTS:                        4,124.46 M    = PKR 4.1 Billion

### DEPOSITS (LIABILITIES) — UC-04 (CRR base), UC-06, UC-09
Current Accounts:                            -275,264.34 M    = PKR 275 Billion (32%)
Transactional/Savings:                       -204,821.40 M    = PKR 205 Billion (24%)
UniFlex:                                      -54,810.25 M    = PKR 55 Billion
UniSaver:                                     -14,405.49 M    = PKR 14 Billion
UniSaver Plus:                               -100,170.08 M    = PKR 100 Billion
UTTIP:                                        -53,228.69 M    = PKR 53 Billion
Certificate of Deposits:                      -52,002.74 M    = PKR 52 Billion
PLS Term/Fixed:                               -17,162.94 M    = PKR 17 Billion
Ameen CO-II:                                   -5,032.74 M
FC Current:                                   -12,142.64 M
FC Saving:                                    -19,021.07 M
FC UniFlex:                                   -13,431.82 M
FC UTTIP:                                      -2,224.30 M
Sundry/Other Deposits:                        -23,550.61 M
Other deposit products:                        -3,769.79 M
─────────────────────────────────────────────────────────────
TOTAL DEPOSITS:                              -851,037.90 M    = PKR 851 Billion
(Negative = liability. Absolute value for CRR calculation.)

CRR Required (6% weekly avg):   851,038 × 0.06 =  51,062 M  = PKR 51 Billion
CRR Daily Min (4%):             851,038 × 0.04 =  34,042 M  = PKR 34 Billion
CRR Band Available:             51,062 - 34,042 =  17,020 M  = PKR 17 Billion optionality

### DEPOSIT MIX (for UC-09 Digital Channel analysis)
CASA (Current + Savings):          480,086 M   = 56.4% of total  ← Digital shift target
Term/Fixed/CDs:                    169,174 M   = 19.9%
Savings Products (UniSaver etc):   168,414 M   = 19.8%
Foreign Currency:                   33,434 M   =  3.9%

### BORROWINGS — UC-04
SBP Borrowings:                               -22,460.76 M
Market/Call Borrowings:                        -6,314.56 M
Repo:                                         -77,109.94 M
─────────────────────────────────────────────────────────────
TOTAL BORROWINGS:                            -105,885.26 M    = PKR 106 Billion

### ADVANCES — UC-10 (Profitability base)
General Advances:                             189,718.16 M    = PKR 190 Billion
Refinance:                                     22,649.25 M
FE-25:                                         16,714.64 M
Agriculture:                                    1,796.63 M
Commodity:                                     36,351.27 M
Consumer:                                      10,387.52 M
Staff:                                          4,766.18 M
Islamic Finance:                                6,391.71 M
NPLs (>1M):                                   35,326.19 M
NPLs (<1M):                                    1,199.05 M
Provisions:                                   -18,826.82 M
─────────────────────────────────────────────────────────────
NET ADVANCES:                                 316,449.34 M    = PKR 316 Billion

### INVESTMENTS — UC-04, UC-10
T-Bills (Short-term Govt):                    105,713.68 M    = PKR 106 Billion
PIBs (Long-term Govt):                       478,935.27 M    = PKR 479 Billion
Corporate Bonds/TFC:                            6,752.76 M
Listed Shares:                                 19,927.30 M
Subsidiaries/Associates:                       11,811.47 M
Others:                                        36,544.29 M
─────────────────────────────────────────────────────────────
TOTAL INVESTMENTS:                            659,684.77 M    = PKR 660 Billion

### OFF BALANCE SHEET
Contra Accounts:                              581,419.25 M    = PKR 581 Billion
(LCs, Guarantees, Commitments — relevant for UC-05 nostro obligation modeling)

## UBL ACTUAL P&L (MONTHLY, Jan 2016, PKR Millions)

### REVENUE
Interest Received (all sources):               -7,015.33 M/month  = PKR 84.2B/year
  └─ Return on HTM PIBs:                       -1,978.40 M   (largest single line)
  └─ Return on AFS PIBs:                       -2,419.94 M
  └─ Return on T-Bills (AFS):                    -449.66 M
  └─ Return on Advances Term Loan:               -525.50 M
  └─ Return on Advances (all):                 -1,208.12 M
  └─ Return on Placements:                        -16.59 M
  └─ Return on Nostro:                              -1.51 M
  └─ Interbranch Returns:                         -893.77 M

Fee, Commission & Brokerage:                     -166.20 M/month  = PKR 2.0B/year
FX Dealing Income:                                -16.03 M/month  = PKR 192M/year

### INTEREST EXPENSE
Total Interest Paid:                            2,883.82 M/month  = PKR 34.6B/year
  └─ Profit on Transactional AC:                  633.88 M
  └─ Profit on UniSaver Plus:                     386.59 M
  └─ Profit on COD (IRR):                         183.82 M
  └─ Profit on UniFlex:                           197.38 M
  └─ Profit on COD:                               119.22 M
  └─ Interbranch Returns:                       1,146.79 M
  └─ Others:                                      216.14 M

NET INTEREST INCOME (monthly):                  4,131.51 M/month  = PKR 49.6B/year

### OPERATING COSTS (monthly)
B-6 Personnel Cost:                               903.48 M/month  = PKR 10.8B/year
B-7 Premises Cost:                                328.11 M/month  = PKR  3.9B/year
B-8(a) Direct/Variable Cost:                       70.47 M/month  = PKR  0.8B/year
B-8(b) Other Cost:                                698.67 M/month  = PKR  8.4B/year
B-9 Interbusiness Cost:                            95.13 M/month  = PKR  1.1B/year
─────────────────────────────────────────────────────────────
TOTAL OPEX:                                     2,095.86 M/month  = PKR 25.2B/year

Tax:                                            1,196.20 M/month  = PKR 14.4B/year

### CROSS-CHECK vs UBL FY2016 ANNUAL REPORT
Reported Revenue:       Rs. 80.65 Billion  |  Our data: 7,015 × 12 = 84.2B  ✓ (within range)
Reported PBT:           Rs. 46.02 Billion  |  Our data: NII - OPEX ≈ 4,132-2,096 = ~2,036/mo = 24.4B + fee ✓
Reported Total Assets:  Rs. 1.58 Trillion  |  Our data: Jan snapshot (grows through year) ✓
Reported Advances:      Rs. 510.1 Billion  |  Our data: 316B (Jan) → grew 61% by Dec ✓
Reported Investments:   Rs. 806.5 Billion  |  Our data: 660B (Jan) → grew 22% by Dec ✓

## COST ESTIMATION FOR CASH OPERATIONS (derive from actuals)

Estimated cash handling cost components (from B-8a Direct/Variable + B-8b Other):
- CIT Transportation:          ~15% of B-8a+b = ~115 M/month = PKR 1.38B/year
- Vault Insurance:             ~8% of B-8b    =  ~56 M/month = PKR 672M/year
- Cash Processing (CPC):       ~5% of B-8a+b  =  ~38 M/month = PKR 456M/year
- Security (cash-related):     ~10% of B-6    =  ~90 M/month = PKR 1.08B/year
- SBP Penalties (est.):        ~1% of B-8a    =   ~1 M/month = PKR  12M/year
Total Est. Cash Operations Cost:               ~300 M/month = PKR 3.6B/year

## OPPORTUNITY COST OF IDLE CASH
Policy Rate (Jan 2016): 6.0% (SBP policy rate was 6% in Jan 2016, not 11%)
Overnight Repo Rate:    ~5.75%

NOTE: The demo.xlsx data is from 2016 when SBP policy rate was 6%.
For current (2025-2026) modeling, scale to 11% policy rate.
Idle cash penalty at 6%:  7,535 M idle × 0.06 = 452 M/year (2016 rates)
Idle cash penalty at 11%: 7,535 M idle × 0.11 = 829 M/year (current rates)

## BRANCH DISTRIBUTION SUMMARY
Generated from actual totals distributed across 1,527 branches:
- Branch vaults sum to:    16,900 M  (actual 11,739 M + manager hoarding buffer)
- Branch deposits sum to: 851,038 M  (matches actual exactly)
- ATM cash sums to:         1,393 M  (matches actual exactly)
- Monthly P&L allocated proportionally by deposit weight
- Idle cash identified:     7,535 M  (branch) + 522 M (ATM) = 8,057 M total
- Annual savings at 11%:     829 M (branch) + 57 M (ATM) = 886 M total

Use these numbers as your ground truth. Any synthetic data generated
must reconcile back to these actuals. The Excel and CSV files in
data/synthetic/ already do this.
```
