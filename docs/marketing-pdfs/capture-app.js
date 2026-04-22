const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ── Godaitec COE — Real App Screenshot Capture ───────────────
// Clicks through every sidebar item and captures real screenshots.
// Run: cd docs/marketing-pdfs && node capture-app.js

const APP_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Label must match exactly what's in NAV_CONFIG in Layout.jsx
const PAGES = [
  // ── Executive / Overview ──
  { label: 'Executive Summary',     file: '01-executive-summary',       wait: 4000 },
  { label: 'Use Case Catalog',      file: '02-use-case-catalog',        wait: 3000 },

  // ── Daily Operations ──
  { label: 'Command Center',        file: '03-command-center',           wait: 4000 },
  { label: 'Alerts',                file: '04-alerts-exceptions',        wait: 2000 },
  { label: 'Branch Action Plan',    file: '05-branch-action-plan',       wait: 4000 },
  { label: 'CIT & Fleet',           file: '06-cit-fleet',                wait: 3000 },
  { label: 'Forecast',              file: '07-forecast-dashboard',       wait: 3000 },

  // ── Monitoring ──
  { label: 'Dashboard',             file: '08-consolidated-dashboard',   wait: 4000 },
  { label: 'Regional View',         file: '09-regional-view',            wait: 3000 },
  { label: 'Cash Pulse',            file: '10-cash-pulse',               wait: 3000 },
  { label: 'Vault Heatmap',         file: '11-vault-heatmap',            wait: 3000 },
  { label: 'Branch Network',        file: '12-branch-network-map',       wait: 3000 },

  // ── Treasury ──
  { label: 'Treasury Desk',         file: '13-treasury-desk',            wait: 4000 },
  { label: 'IEC Swap Hub',          file: '14-iec-swap-hub',             wait: 3000 },
  { label: 'SBP Rates',             file: '15-sbp-rates',                wait: 2000 },

  // ── Planning & Analysis ──
  { label: 'What-If Simulator',     file: '16-what-if-simulator',        wait: 3000 },
  { label: 'Seasonal Prep',         file: '17-seasonal-prep',            wait: 3000 },
  { label: 'Digital Shift',         file: '18-digital-shift',            wait: 3000 },
  { label: 'CDM Deployment',        file: '19-cdm-deployment',           wait: 3000 },
  { label: 'P&L Value Realized',    file: '20-pnl-waterfall',            wait: 3000 },

  // ── Compliance ──
  { label: 'Compliance Monitor',    file: '21-compliance-monitor',       wait: 3000 },
  { label: 'Data Reconciliation',   file: '22-data-reconciliation',      wait: 3000 },

  // ── Technical UC Dashboards ──
  { label: 'UC-01 Vault Forecast',  file: '23-uc01-vault-forecast',      wait: 3000 },
  { label: 'UC-02 ATM Replenish',   file: '24-uc02-atm-replenishment',   wait: 3000 },
  { label: 'UC-03 Netting',         file: '25-uc03-netting',             wait: 3000 },
  { label: 'UC-04 CRR Float',       file: '26-uc04-crr-float',           wait: 3000 },
  { label: 'UC-05 Nostro',          file: '27-uc05-nostro',              wait: 3000 },
  { label: 'UC-06 Vostro',          file: '28-uc06-vostro',              wait: 3000 },
  { label: 'UC-07 Denomination',    file: '29-uc07-denomination',        wait: 3000 },
  { label: 'UC-08 CIT Routing',     file: '30-uc08-cit-routing',         wait: 3000 },
  { label: 'UC-09 Digital',         file: '31-uc09-digital-incentives',  wait: 3000 },
  { label: 'UC-10 P&L',             file: '32-uc10-pnl',                 wait: 3000 },
];

async function expandAllSidebarGroups(page) {
  // The sidebar has collapsible groups. Each group header is a button
  // with a chevron. We click all collapsed ones to expand them.
  await page.evaluate(() => {
    // Find all elements that look like group toggle buttons
    // They contain group label text and a chevron icon
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
      const text = btn.textContent.trim();
      // Group labels: Daily Operations, Monitoring, Treasury, Planning & Analysis, Compliance & Data, Technical
      const groupLabels = ['Daily Operations', 'Monitoring', 'Treasury', 'Planning', 'Compliance', 'Technical'];
      if (groupLabels.some(g => text.includes(g))) {
        // Click to toggle — we'll click twice if already expanded to ensure open
        btn.click();
      }
    });
  });
  await new Promise(r => setTimeout(r, 500));

  // Click again to make sure they're all expanded (in case some were open)
  // Check: if items under a group are visible, it's expanded
  await page.evaluate(() => {
    const allButtons = document.querySelectorAll('button');
    const groupLabels = ['Daily Operations', 'Monitoring', 'Treasury', 'Planning', 'Compliance', 'Technical'];
    allButtons.forEach(btn => {
      const text = btn.textContent.trim();
      if (groupLabels.some(g => text.includes(g))) {
        // Check if the next sibling items are hidden (collapsed)
        const parent = btn.parentElement;
        const items = parent ? parent.querySelectorAll('[class*="cursor-pointer"]') : [];
        // If only the button itself is a cursor-pointer child, group is collapsed
        if (items.length <= 1) {
          btn.click(); // expand it
        }
      }
    });
  });
  await new Promise(r => setTimeout(r, 500));
}

async function clickSidebarItem(page, label) {
  // Find a span inside the sidebar that exactly matches the label text
  const clicked = await page.evaluate((targetLabel) => {
    // Get all spans in the sidebar area (left panel)
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
      if (span.textContent.trim() === targetLabel) {
        // Click the parent div (the nav item container)
        const navItem = span.closest('[class*="cursor-pointer"]') || span.closest('div[class*="flex"]') || span.parentElement;
        if (navItem) {
          navItem.click();
          return { ok: true, text: span.textContent.trim() };
        }
      }
    }
    return { ok: false, text: targetLabel };
  }, label);

  return clicked;
}

async function captureApp() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('Godaitec COE — App Screenshot Capture');
  console.log('======================================');
  console.log(`Target: ${APP_URL}`);
  console.log(`Output: ${SCREENSHOT_DIR}/`);
  console.log(`Pages:  ${PAGES.length}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  console.log('Loading app...');
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Set SUPERUSER role
  const roleSet = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    for (const sel of selects) {
      const opts = [...sel.options];
      const superOpt = opts.find(o =>
        o.value === 'SUPERUSER' || o.value.toUpperCase().includes('SUPER') ||
        o.textContent.toUpperCase().includes('SUPER')
      );
      if (superOpt) {
        sel.value = superOpt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  });
  if (roleSet) {
    console.log('Role: SUPERUSER');
    await new Promise(r => setTimeout(r, 1500));
  }

  // Expand all sidebar groups
  console.log('Expanding sidebar groups...');
  await expandAllSidebarGroups(page);
  await new Promise(r => setTimeout(r, 1000));

  let successCount = 0;

  for (let i = 0; i < PAGES.length; i++) {
    const pg = PAGES[i];
    const num = String(i + 1).padStart(2, '0');

    try {
      // Make sure groups are expanded (they may auto-collapse)
      if (i % 8 === 0 && i > 0) {
        await expandAllSidebarGroups(page);
      }

      // Click the sidebar item
      const result = await clickSidebarItem(page, pg.label);

      if (!result.ok) {
        console.log(`[${num}/${PAGES.length}] ${pg.label.padEnd(25)} -> SKIP (not found in sidebar)`);
        continue;
      }

      // Wait for data load
      await new Promise(r => setTimeout(r, pg.wait));

      // Scroll content area to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        // Find the main content scrollable area (right of sidebar)
        const contentArea = document.querySelector('[style*="overflow-y: auto"]') ||
                           document.querySelector('[style*="overflow-y:auto"]') ||
                           document.querySelector('main') ||
                           document.querySelector('[class*="flex-1"]');
        if (contentArea) contentArea.scrollTop = 0;
      });
      await new Promise(r => setTimeout(r, 300));

      // Screenshot
      const filepath = path.join(SCREENSHOT_DIR, `${pg.file}.png`);
      await page.screenshot({ path: filepath, fullPage: false, type: 'png' });

      const sizeKB = (fs.statSync(filepath).size / 1024).toFixed(0);
      console.log(`[${num}/${PAGES.length}] ${pg.label.padEnd(25)} -> ${pg.file}.png (${sizeKB} KB)`);
      successCount++;

    } catch (err) {
      console.log(`[${num}/${PAGES.length}] ${pg.label.padEnd(25)} -> ERROR: ${err.message.slice(0, 50)}`);
    }
  }

  // Full-page executive summary bonus
  console.log('\n[BONUS] Full-page Executive Summary...');
  await clickSidebarItem(page, 'Executive Summary');
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, '00-executive-fullpage.png'),
    fullPage: true,
    type: 'png',
  });
  console.log('         -> 00-executive-fullpage.png');

  await browser.close();

  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).sort();
  const totalSize = files.reduce((sum, f) => sum + fs.statSync(path.join(SCREENSHOT_DIR, f)).size, 0);

  console.log('\n======================================');
  console.log(`Captured: ${successCount}/${PAGES.length} pages`);
  console.log(`Files:    ${files.length} screenshots`);
  console.log(`Size:     ${(totalSize / 1024 / 1024).toFixed(1)} MB total`);
  console.log('(c) 2026 Godaitec Private Limited');
}

captureApp().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
