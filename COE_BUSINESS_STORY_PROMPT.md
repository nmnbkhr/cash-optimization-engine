# COE — BUSINESS STORY DOCUMENTATION
# ══════════════════════════════════════════════════════════════
# Reads every page component + its API endpoint + the backend 
# service method. Writes a complete business narrative per page.
# Output: A single markdown document telling the BUSINESS STORY
# of the entire app, page by page.
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
Read every page in the app — the JSX component, the API endpoint it 
calls, and the backend service method that computes the data.
Then write a single document that tells the BUSINESS STORY of each page.

This document is for: bank executives, SBP auditors, board members,
potential clients. NOT for developers. No code. No technical jargon.
Write it in the language a Head of Treasury at UBL would understand.

## HOW TO BUILD THIS DOCUMENT

For each of the 35 pages, do this:

1. READ the frontend component (the .jsx file) — understand what 
   data it displays, what charts it shows, what buttons it has
2. READ the API endpoint it calls — trace the route to the service
3. READ the service method — understand the BUSINESS LOGIC and math
4. WRITE the business story using the template below

## THE TEMPLATE (use for EVERY page)

For each page, write exactly these sections:

### PAGE NAME
**Route:** [the currentUC value]
**Who uses this:** [specific banking role — not "users"]
**When:** [daily at 8AM / weekly on Monday / monthly for ALCO / on-demand for events]

#### THE BUSINESS QUESTION IT ANSWERS
Write ONE sentence. The question a banker would ask that this page answers.
Examples:
  - "How much cash is sitting idle across my 1,532 branches right now?"
  - "Which branches should exchange cash with each other instead of going through SBP-BSC?"
  - "Are we compliant with SBP's CMS note-sorting requirements?"

#### WHAT YOU SEE
Describe what appears on screen in PLAIN ENGLISH. No component names.
No technical terms. Describe it as if explaining to someone on the phone.
Examples:
  - "A large number at the top shows total idle cash: ₨50,370 Million"
  - "A colored map of Pakistan with dots for each branch — green means healthy, red means too much idle cash"
  - "A table of 20 recommended cash transfers between nearby branches"

#### THE LOGIC BEHIND IT (How the numbers are computed)
Explain the BUSINESS LOGIC, not the code. Use PKR examples.
Reference SBP regulations where applicable.
Examples:
  - "For each branch, the system compares the vault balance against the 
    optimal level. The optimal level is the amount needed to serve tomorrow's 
    expected withdrawals plus a 10% safety buffer. Anything above that is 
    'idle' — cash earning 0% while KIBOR is 10.50%."
  - "The CRR gauge tracks the bank's position against SBP's requirement of 
    5% weekly average (per DMMD Circular No. 01 of 2026). The bank must also 
    maintain at least 3% on any single day. CRR deposits at SBP earn 0%, 
    so every rupee held above the minimum is an opportunity cost."

#### WHY IT MATTERS (Business Value)
Quantify the impact in PKR. Be specific.
Examples:
  - "₨50 Billion of idle cash at KIBOR 10.50% = ₨5.25 Billion per year 
    in lost revenue. If the system frees even 20% of that, the bank earns 
    an additional ₨1.05 Billion annually."
  - "Each SBP CMS violation carries a ₨100,000 penalty. With 1,532 branches, 
    even 5% non-compliance = ₨7.66 Million in avoidable fines per year."

#### ACTIONS YOU CAN TAKE
List the specific decisions or actions the user can make FROM this page.
Examples:
  - "Click 'Execute Transfer' to move ₨15 Million from Saddar branch to 
    Clifton branch. The system updates vault balances instantly and shows 
    the BSC charge avoided (₨18,000) and CIT trip saved (₨15,000)."
  - "Select a branch from the dropdown to see its 7-day forecast. The 
    system recommends 'RELEASE ₨53 Million' because predicted demand 
    for the next 7 days is below current vault level."
  - "Print the Daily Action Sheet — one page showing every decision 
    the Branch Manager needs to make today."

#### REGULATORY CONTEXT
Which SBP regulation, circular, or policy does this page relate to?
Be specific with circular numbers where known.
Examples:
  - "CRR: Per DMMD Circular No. 01 of 2026, banks must maintain 5% 
    weekly average and 3% daily minimum of demand + time liabilities."
  - "CDM: Per PSP&OD Circular Letter No. 01 of 2025, 25% of branches 
    must have CDMs by CY2028 with instant credit and biometric verification."
  - "CMS: Machine-sorted/authenticated notes mandatory for ATM loading. 
    Penalty: ₨100,000 per violation."
  If no specific regulation applies, write "Operational efficiency — 
  no specific SBP circular, but supports prudent cash management practices."

#### BUSINESS OUTCOME
What improves when this page is used daily? One paragraph.
Example:
  - "When Treasury uses this page every morning, they deploy freed CRR 
    funds into overnight KIBOR repo, earning ₨3-5 Million per day. Over 
    a year, this adds ₨900 Million to ₨1.5 Billion in incremental income 
    with zero additional risk — the funds return the next morning."

---

## DOCUMENT STRUCTURE

Write the output as a single markdown file with this structure:

```markdown
# Cash Optimization Engine — Business Story
## UBL Treasury Operations Platform

### How to Read This Document
[2 sentences explaining this is a page-by-page guide for banking executives]

### The 10-Second Summary
[What the entire system does in plain English — 3 sentences max]
[Total annual impact: ₨44.6 Billion across 10 optimization use cases]

---

## I. DAILY OPERATIONS

### 1. Command Center
[full template as above]

### 2. Branch Action Plan
[full template]

### 3. CIT & Fleet
[full template]

### 4. Forecast Dashboard
[full template]

### 5. Alerts & Exceptions
[full template]

---

## II. MONITORING & VISIBILITY

### 6. Consolidated Dashboard
[full template]

### 7. Regional View
[full template]

### 8. Cash Pulse
[full template]

### 9. Vault Heatmap
[full template]

### 10. Branch Network Map
[full template]

---

## III. TREASURY & MARKETS

### 11. Treasury Desk
[full template]

### 12. CRR Gauge
[full template]

### 13. Nostro World Map
[full template]

### 14. IEC Swap Hub
[full template]

### 15. SBP Rates Dashboard
[full template]

---

## IV. PLANNING & ANALYSIS

### 16. What-If Simulator
[full template]

### 17. Seasonal Preparation
[full template]

### 18. Digital Shift Report
[full template]

### 19. CDM Deployment Plan
[full template]

### 20. P&L Value Realized
[full template]

### 21. Executive Summary
[full template]

### 22. Branch Scorecard
[full template]

---

## V. COMPLIANCE & GOVERNANCE

### 23. Compliance Monitor
[full template]

### 24. Data Reconciliation
[full template]

---

## VI. TECHNICAL USE CASES (For Quantitative Analysts)

### 25-34. UC-01 through UC-10
[For each UC, write a SHORTER version — just:
  - Business question
  - Algorithm used (one line, e.g., "LSTM neural network for demand forecasting")
  - Annual PKR impact
  - Which business page consumes its output
  Example: "UC-01 trains an LSTM model on 559,180 vault history records 
  to predict tomorrow's cash demand per branch. Its output feeds the 
  Branch Action Plan page. Impact: ₨5.3 Billion/year in idle cash reduction."]

### 35. Use Case Catalog
[One paragraph — navigation page listing all 10 UCs]

---

## VII. THE COMPLETE VALUE STORY

### Total Annual Impact
[Table: each UC + PKR impact + which page shows it]

### Value Formula
Value = (Idle Cash Freed × KIBOR) + (CIT Savings) + (BSC Avoided) 
      + (Penalties Avoided) + (Digital Shift Savings) - (Ops Cost)

### How Value Compounds
[2 paragraphs: explain that as branches adopt recommendations, 
the system learns from better data, forecasts improve, and the 
feedback loop accelerates savings quarter over quarter]

### Regulatory Alignment
[List every SBP circular referenced in the app with one-line description]
```

## INSTRUCTIONS FOR CLAUDE CODE

1. Actually READ each .jsx file to understand what it displays.
   Don't guess from filenames.

2. Actually READ the API endpoint and service method to understand
   the math. Trace the data flow: component → API → service → DB.

3. Use REAL numbers from the app where possible:
   - Total branches: 1,532
   - Total ATMs: 2,180  
   - Total deposits: ₨851,038 Million
   - KIBOR: 10.50-11.64%
   - Total idle cash: ~₨50,370 Million (from Command Center snapshot)
   - Annual impact: ₨44.6 Billion (from Executive Summary)

4. Write for a BANKER, not a developer. No code snippets. No 
   component names. No "useState" or "Zustand" or "Recharts."
   Write as if this is a consulting deliverable from McKinsey.

5. Save the output as: docs/COE_BUSINESS_STORY.md

6. Also save a shorter executive version (2 pages max) as:
   docs/COE_EXECUTIVE_BRIEF.md
   This one is for the CEO/Board — just the value story, top 5 
   pages, total PKR impact, and regulatory compliance summary.

## OUTPUT

Save both files:
  docs/COE_BUSINESS_STORY.md    (full, ~40-50 pages)
  docs/COE_EXECUTIVE_BRIEF.md   (2-page summary for board)

Print a summary of what was written to the terminal.
```
