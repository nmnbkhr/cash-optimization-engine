# COE — NAVIGATION AUDIT & REORGANIZATION
# ══════════════════════════════════════════════════════════════
# Step 1: Claude Code audits what exists (reads all route/nav files)
# Step 2: Outputs a structured report of every page with purpose
# Step 3: YOU review the report and decide the grouping
# Step 4: Then we paste a second prompt to implement the new nav
# ══════════════════════════════════════════════════════════════

## Paste this into Claude Code:

```
AUDIT ONLY — do NOT change any files yet. Just read and report.

I have 34+ pages in my sidebar navigation. It's too many flat links.
Before reorganizing, I need you to audit exactly what exists.

## STEP 1: Find all routes

Read these files and list EVERY route defined:
- src/App.jsx (or wherever the React Router routes are defined)
- Any file that has <Route path= or similar routing
- The sidebar/nav component (find it — likely in src/components/Sidebar.jsx 
  or Layout.jsx or similar)

For each route found, output:
  PATH | COMPONENT | FILE LOCATION | LINE COUNT

## STEP 2: Find all nav links

Read the sidebar/navigation component. For each link:
  LABEL | PATH | ICON | SECTION/GROUP (if any)

## STEP 3: Classify each page

For each page, read the component file (at least the first 50 lines 
and the return/render section) and determine:

1. WHO uses this page? (Branch Manager / Regional Head / Treasury / CFO / IT/Dev / Everyone)
2. HOW OFTEN? (Daily / Weekly / Monthly / Setup-only / Drill-down)
3. WHAT ACTION does it drive? (Decision / Monitoring / Analysis / Configuration / Reference)
4. DOES IT DUPLICATE another page? (If two pages show similar data, note it)
5. IS IT A DRILL-DOWN? (Should it be accessed via another page, not the nav?)
6. REGULATORY REQUIREMENT? (SBP compliance, CMS, CRR/SLR, CDM mandate)

## STEP 4: Output the audit report

Format the output EXACTLY like this (I will review it before any changes):

```
═══════════════════════════════════════════════════════════════
NAVIGATION AUDIT REPORT
═══════════════════════════════════════════════════════════════

CURRENT NAV STRUCTURE:
  [Section Name]
    1. Page Label → /path (ComponentName.jsx, 450 lines)
    2. Page Label → /path (ComponentName.jsx, 680 lines)
  [Section Name]
    3. ...

TOTAL: X pages in sidebar

───────────────────────────────────────────────────────────────
PAGE-BY-PAGE CLASSIFICATION:
───────────────────────────────────────────────────────────────

1. PAGE: [name]
   Path: /path
   Component: ComponentName.jsx (XXX lines)
   Primary user: [role]
   Frequency: [daily/weekly/monthly/drill-down]
   Action type: [decision/monitoring/analysis/config/reference]
   Duplicates: [none / partially overlaps with X]
   Drill-down: [standalone / should be child of X]
   Regulatory: [none / CRR / CMS / CDM / SBP reporting]
   KEY DATA SHOWN: [2-3 bullet points of what the page actually displays]

2. PAGE: [name]
   ...

───────────────────────────────────────────────────────────────
DUPLICATION ANALYSIS:
───────────────────────────────────────────────────────────────

Pages that show SIMILAR data (candidates for merging or nesting):
  - [Page A] and [Page B]: both show branch idle cash
  - [Page C] and [Page D]: both show netting opportunities
  - ...

───────────────────────────────────────────────────────────────
RECOMMENDED GROUPING (for your review — I will NOT implement yet):
───────────────────────────────────────────────────────────────

Based on the audit, here is my suggested navigation hierarchy.
Pages marked [HIDE] should be accessible via drill-down links 
from parent pages, not from the sidebar.

GROUP 1: "Daily Operations" (used every morning)
  - ...
  
GROUP 2: "Treasury & Compliance" (used by treasury team)
  - ...

GROUP 3: "Analytics & Planning" (used weekly/monthly)
  - ...

GROUP 4: "Technical / UC Detail" (developer/analyst drill-down)
  - ... [collapsed by default]

GROUP 5: "System" (admin/setup)
  - ...

PAGES TO HIDE FROM NAV (accessible only via links from other pages):
  - ...

───────────────────────────────────────────────────────────────
RECOMMENDATION SUMMARY:
───────────────────────────────────────────────────────────────

Current: X pages in flat sidebar
Proposed: Y visible links in Z groups (with N hidden as drill-downs)

Pages merged: [list]
Pages hidden: [list]  
Pages unchanged: [list]
New groupings: [list]
```

## IMPORTANT RULES FOR THE AUDIT:

1. Do NOT change any files. Read only.
2. Do NOT skip any page — audit ALL of them including UC dashboards.
3. For each page, actually READ the component to understand what it shows.
   Don't guess from the filename alone.
4. Be honest about duplication. If two pages show the same KPIs, say so.
5. Consider that a Branch Manager in a small town needs a SIMPLE nav.
   They should see 5-6 links maximum, not 34.
6. UC-01 through UC-10 dashboards are TECHNICAL drill-downs.
   They should NOT be top-level nav items. They should be accessible
   via "View Technical Details →" links from business pages.
7. The Command Center is the PRIMARY demo page — it should be prominent.
8. Some pages are "reference" pages (Rates, Reconciliation) that don't
   need daily visibility — they can be nested under a "System" group.

## OUTPUT FORMAT

Print the complete audit report to the terminal. Do not create any files.
I will review it and then give you the approved grouping to implement.
```
