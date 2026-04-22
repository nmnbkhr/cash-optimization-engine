# COE — FIX CORRUPTED JSX FILES
# Backend is fine. Data is fine. Only frontend JSX files broken by regex replacement.
# Paste this into Claude Code.

```
A regex replacement corrupted several frontend JSX files. It was replacing a local 
formatPKR/fmtVal function with a shared import from utils/formatPKR.js, but the regex 
removed too much — it deleted entire function declarations, left orphaned catch blocks, 
and broke component structures.

Backend is 100% working. Do NOT touch backend.
Data is 100% working. Do NOT touch data/demo/ or data/initial/.
Only fix the frontend JSX files.

## STEP 1: Check if vite builds

cd ~/projects/cash-optimization-engine/frontend
npm run build 2>&1 | head -100

This will show the EXACT files and line numbers with errors. Note them all.

## STEP 2: For EVERY file that has an error, do this exact procedure

For each broken file:

1. Read the ENTIRE file: cat the file
2. Look for these specific corruption patterns:
   - Orphaned `catch (` or `} catch` without a matching `try {`
   - Missing function declarations (function body exists but the `const funcName = ` or `function funcName(` line was deleted)
   - Orphaned `}` or `})` brackets without matching openers
   - Import statement for `formatPKR` exists but the function is never defined or imported correctly
   - Component returns JSX but the component function declaration was deleted
   - Dangling `.then(` or callback without the preceding code

3. Fix by:
   - If the import `import { formatPKR } from '../../utils/formatPKR'` is at the top — KEEP IT
   - Delete any OLD inline formatPKR/fmtVal function definitions that are now replaced by the import
   - But if the regex DELETED the function AND didn't add the import — ADD THE IMPORT
   - Fix any orphaned brackets by reading the component structure and restoring proper nesting
   - If a component declaration was deleted, restore it based on the component name and the JSX return

4. After fixing each file, verify it parses:
   node -e "require('fs').readFileSync('PATH', 'utf8')" 
   (won't catch JSX but catches basic syntax)

## STEP 3: The shared formatter that should exist

Verify this file exists and is correct:

src/utils/formatPKR.js should contain:
```javascript
/**
 * Format PKR amounts. Input is in PKR Millions (from DB).
 * Examples:
 *   formatPKR(851038)     → "PKR 851,038 M"
 *   formatPKR(7.535)      → "PKR 7.5 M"  
 *   formatPKR(0.042)      → "PKR 0.04 M"
 *   formatPKR(851038, 'B') → "PKR 851.0 B" (convert M to B)
 */
export function formatPKR(valueInMillions, unit = 'M') {
  if (valueInMillions == null || isNaN(valueInMillions)) return 'PKR —';
  
  if (unit === 'B') {
    return `PKR ${(valueInMillions / 1000).toLocaleString(undefined, { 
      minimumFractionDigits: 1, maximumFractionDigits: 1 
    })} B`;
  }
  
  if (Math.abs(valueInMillions) >= 1000) {
    return `PKR ${Math.round(valueInMillions).toLocaleString()} M`;
  }
  
  return `PKR ${valueInMillions.toLocaleString(undefined, {
    minimumFractionDigits: 1, maximumFractionDigits: 1
  })} M`;
}

export function formatYAxis(value) {
  if (value >= 1000) return `${(value/1000).toFixed(0)}B`;
  return `${value.toFixed(0)}M`;
}

export default formatPKR;
```

If this file doesn't exist or is different, create/fix it.

## STEP 4: Fix KNOWN broken files first

These are confirmed broken:

### File 1: src/components/uc01/UC01Dashboard.jsx
- Has a remnant at line 43 (partial function body left behind)
- Fix: find the orphaned code near line 43, remove it or restore the component properly

### File 2: src/components/uc03/UC03Dashboard.jsx  
- Has orphaned `catch` at line 17 (the `try` block was deleted)
- Fix: if it was a try/catch around an API call, restore the full try/catch
- OR if the try/catch was for the old formatPKR definition, remove the orphaned catch entirely

### File 3: src/components/uc02/UC02Dashboard.jsx
- ATMAISummaryPanel was restored but verify it's complete

## STEP 5: Fix ALL remaining files systematically

Go through EVERY file in this list. For each one: read it, check for corruption, fix it.

src/components/uc01/OptimizerPanel.jsx
src/components/uc03/CityHeatmap.jsx
src/components/uc03/NettingFlowTable.jsx
src/components/uc03/NettingSavingsChart.jsx
src/components/uc03/AuctionResultsTable.jsx
src/components/uc04/UC04Dashboard.jsx
src/components/uc04/StrategyGamePanel.jsx
src/components/uc05/UC05Dashboard.jsx
src/components/uc05/FXCarryTable.jsx
src/components/uc05/NostroAccountTable.jsx
src/components/uc05/CurrencyTreemap.jsx
src/components/uc05/NashBargainingPanel.jsx
src/components/uc06/UC06Dashboard.jsx
src/components/uc06/DeploymentChart.jsx
src/components/uc06/LaRIndicators.jsx
src/components/uc06/CooperativeGamePanel.jsx
src/components/uc07/UC07Dashboard.jsx
src/components/uc08/UC08Dashboard.jsx
src/components/uc08/BeforeAfterComparison.jsx
src/components/uc09/BudgetSankey.jsx
src/components/uc09/ROICalculator.jsx
src/components/uc10/UC10Dashboard.jsx
src/components/uc10/PnLWaterfall.jsx
src/components/uc10/CostTreemap.jsx
src/components/uc10/TransferPricingDash.jsx
src/components/uc10/ALCOReport.jsx
src/components/uc10/BranchRankingTable.jsx
src/components/BranchDetail.jsx
src/components/ForecastChart.jsx
src/components/VaultChart.jsx
src/components/uc02/ATMForecastChart.jsx

For each file:
1. cat the file
2. Check if `import { formatPKR } from` or `import { formatPKR, formatYAxis } from` exists at top
3. Check for orphaned code (catch without try, } without {, dangling callbacks)
4. Check that the default export component is intact
5. Fix any issues
6. Move to next file

## STEP 6: Build and verify

After fixing all files:

```bash
cd ~/projects/cash-optimization-engine/frontend
npm run build
```

If it still fails, read the EXACT error, fix that specific file, rebuild.
Repeat until build succeeds.

Then:
```bash
make dev
# Open browser → click through ALL 10 UC cards → verify each renders
```

## RULES
- Do NOT rebuild any component from scratch — fix the existing code
- Do NOT touch backend — it's working
- Do NOT touch data — it's working  
- Do NOT change any logic — only fix syntax/structure corruption from the regex
- Every file should import formatPKR from the shared util, not define it locally
- If you're unsure whether code is orphaned or intentional, check the component's return() JSX — 
  everything between the function declaration and the return should make sense as hooks/state/logic
```
