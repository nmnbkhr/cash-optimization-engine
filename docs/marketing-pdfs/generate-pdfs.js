const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ── Godaitec COE Marketing Suite — PDF Generator ──────────────
// Proper asset naming: godaitec-coe-{descriptor}.pdf
// All assets are CONFIDENTIAL and proprietary to Godaitec Pvt Ltd.

const slides = [
  { id: 'hero',    name: 'godaitec-coe-overview' },
  { id: 'branch',  name: 'godaitec-coe-branch-vault-plan' },
  { id: 'engines', name: 'godaitec-coe-ten-engines' },
  { id: 'impact',  name: 'godaitec-coe-impact-at-scale' },
  { id: 'roles',   name: 'godaitec-coe-role-dashboards' },
  { id: 'demo',    name: 'godaitec-coe-product-walkthrough' },
  { id: 'baiw',    name: 'godaitec-coe-baiw-framework' },
  { id: 'rapid',   name: 'godaitec-coe-engagement-model' },
  { id: 'legal',   name: 'godaitec-coe-disclaimer' },
];

const outputDir = path.join(__dirname, 'output');

async function generatePDFs() {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const htmlPath = path.join(__dirname, 'source.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('source.html not found!');
    process.exit(1);
  }

  console.log('Godaitec COE Marketing Suite — PDF Generator');
  console.log('=============================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });

  const fileUrl = 'file://' + htmlPath;
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for fonts to load
  await new Promise(r => setTimeout(r, 3000));

  // ── Generate individual slide PDFs ──
  // The print CSS shows all slides, so we must use inline !important styles
  // to force only one slide visible at a time during PDF generation.
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    console.log(`[${i + 1}/${slides.length}] ${slide.name}.pdf`);

    // Hide nav bar, show ONLY the target slide
    await page.evaluate((targetId) => {
      // Hide nav
      const nav = document.querySelector('.nv');
      if (nav) nav.style.setProperty('display', 'none', 'important');

      // Hide all slides, then show only target
      const allSlides = document.querySelectorAll('.sl');
      allSlides.forEach(s => {
        s.style.setProperty('display', 'none', 'important');
      });
      const target = document.getElementById(targetId);
      if (target) {
        target.style.setProperty('display', 'block', 'important');
      }
    }, slide.id);

    await new Promise(r => setTimeout(r, 300));

    // Get the bounding box of the .vp container
    const vpElement = await page.$('.vp');
    const box = await vpElement.boundingBox();

    await page.pdf({
      path: path.join(outputDir, `${slide.name}.pdf`),
      width: `${Math.ceil(box.width + 40)}px`,
      height: `${Math.ceil(box.height + 40)}px`,
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      pageRanges: '1',
    });

    console.log(`         -> saved`);
  }

  // ── Generate combined suite PDF ──
  console.log(`\n[COMBINED] godaitec-coe-marketing-suite.pdf`);

  // Show all slides stacked for combined PDF
  await page.evaluate(() => {
    const nav = document.querySelector('.nv');
    if (nav) nav.style.setProperty('display', 'none', 'important');

    const allSlides = document.querySelectorAll('.sl');
    allSlides.forEach(s => {
      s.style.setProperty('display', 'block', 'important');
      s.style.pageBreakAfter = 'always';
      s.style.marginBottom = '0';
    });
  });

  await new Promise(r => setTimeout(r, 500));

  await page.pdf({
    path: path.join(outputDir, 'godaitec-coe-marketing-suite.pdf'),
    width: '1140px',
    printBackground: true,
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
  });

  console.log('         -> saved');

  await browser.close();

  // ── Summary ──
  console.log('\n=============================================');
  console.log('OUTPUT DIRECTORY:', outputDir);
  console.log('\nGenerated files:');
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf')).sort();
  files.forEach(f => {
    const stats = fs.statSync(path.join(outputDir, f));
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`  ${f} (${sizeKB} KB)`);
  });
  console.log(`\nTotal: ${files.length} PDFs`);
  console.log('(c) 2026 Godaitec Private Limited — All Rights Reserved');
}

generatePDFs().catch(console.error);
