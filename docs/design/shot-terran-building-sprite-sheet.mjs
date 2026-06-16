import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'screenshots');
const svgOutDir = resolve(here, 'svgs', 'terran', 'buildings');
mkdirSync(outDir, { recursive: true });
mkdirSync(svgOutDir, { recursive: true });

const url = pathToFileURL(resolve(here, 'terran-building-sprite-sheet.html')).href;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1280 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(300);

await page.screenshot({ path: resolve(outDir, 'terran-building-sprite-sheet.png'), fullPage: true });
await page.locator('.sheet').screenshot({ path: resolve(outDir, 'terran-building-grid.png') });

const cards = await page.locator('.card').all();
for (const card of cards) {
  const name = await card.locator('.name').textContent();
  const slug = (name ?? 'building').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const svg = await card.locator('svg.sprite').evaluate((node) => {
    const clone = node.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '256');
    clone.setAttribute('height', '256');
    clone.setAttribute('color', '#56d8ff');
    clone.style.filter = 'none';

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      .panel { fill: #0d1119; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
      .line { fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
      .core { fill: currentColor; stroke: none; }
      .light { fill: #eef8ff; stroke: none; }
      .cut { fill: #06080d; stroke: none; }
    `;
    clone.insertBefore(style, clone.firstChild);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}\n`;
  });
  writeFileSync(resolve(svgOutDir, `${slug}.svg`), svg);
  await card.screenshot({ path: resolve(outDir, `terran-building-${slug}.png`) });
}

await browser.close();
console.log('screenshots -> docs/design/screenshots/');
console.log('svgs -> docs/design/svgs/terran/buildings/');
