// Capture the Terran primitive sprite sheet for visual review.
// Usage: node docs/design/shot-terran-sprite-sheet.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'screenshots');
mkdirSync(outDir, { recursive: true });

const url = pathToFileURL(resolve(here, 'terran-sprite-sheet.html')).href;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1120 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(300);

await page.screenshot({ path: resolve(outDir, 'terran-sprite-sheet.png'), fullPage: true });
await page.locator('.sheet').screenshot({ path: resolve(outDir, 'terran-sprite-grid.png') });

const cards = await page.locator('.card').all();
for (const card of cards) {
  const name = await card.locator('.name').textContent();
  const slug = (name ?? 'unit').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await card.screenshot({ path: resolve(outDir, `terran-${slug}.png`) });
}

await browser.close();
console.log('screenshots -> docs/design/screenshots/');
