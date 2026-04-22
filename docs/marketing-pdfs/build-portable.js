const fs = require('fs');
const path = require('path');

// ── Godaitec COE — Portable Walkthrough Builder ──────────────
// Inlines all screenshot PNGs as base64 data URIs into a single
// self-contained HTML file. Open anywhere — no dependencies.
//
// Run: node build-portable.js

const SOURCE = path.join(__dirname, 'godaitec-coe-walkthrough.html');
const OUTPUT = path.join(__dirname, 'output', 'godaitec-coe-walkthrough-portable.html');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

console.log('Godaitec COE — Portable Walkthrough Builder');
console.log('============================================\n');

let html = fs.readFileSync(SOURCE, 'utf-8');

// Find all img src references to screenshots/ and inline them
const imgRegex = /src="screenshots\/([^"]+)"/g;
let match;
let count = 0;
let totalSize = 0;

while ((match = imgRegex.exec(html)) !== null) {
  const filename = match[1];
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  if (fs.existsSync(filepath)) {
    const imgBuffer = fs.readFileSync(filepath);
    const base64 = imgBuffer.toString('base64');
    const ext = path.extname(filename).slice(1);
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const dataUri = `data:${mime};base64,${base64}`;

    html = html.replace(`src="screenshots/${filename}"`, `src="${dataUri}"`);
    totalSize += imgBuffer.length;
    count++;
    console.log(`  [${String(count).padStart(2)}] ${filename} (${(imgBuffer.length / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`  [!!] ${filename} — NOT FOUND, skipping`);
  }
}

// Inline Google Fonts as fallback (the file will still try to load them,
// but we add system font fallbacks so it works fully offline)
html = html.replace(
  `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">`,
  `<!-- Fonts: loads Google Fonts online, falls back to system fonts offline -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* Offline font fallbacks */
@font-face { font-family: 'Space Grotesk'; src: local('Space Grotesk'), local('SF Pro Display'), local('Segoe UI'), local('Arial'); }
@font-face { font-family: 'JetBrains Mono'; src: local('JetBrains Mono'), local('SF Mono'), local('Cascadia Code'), local('Consolas'), local('monospace'); }
</style>`
);

// Write output
const outputDir = path.dirname(OUTPUT);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(OUTPUT, html, 'utf-8');

const outputSize = fs.statSync(OUTPUT).size;

console.log('\n============================================');
console.log(`Images inlined: ${count}`);
console.log(`Image data:     ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`Output file:    ${(outputSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`Output:         ${OUTPUT}`);
console.log('\nThis file is fully portable — open in any browser.');
console.log('(c) 2026 Godaitec Private Limited');
