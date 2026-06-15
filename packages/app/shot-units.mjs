// Capture the unit codex (units.html) to images for review.
// Usage: node shot-units.mjs   (renders the static file directly via file://)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

mkdirSync('shots', { recursive: true });
const url = pathToFileURL(resolve('units.html')).href;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1400 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);

// 1) Full codex (all races + neutral + recolor strip).
await page.screenshot({ path: 'shots/units-codex.png', fullPage: true });

// 2) Per-race crops, for legible close-ups.
for (const key of ['vanguard', 'seraph', 'swarm']) {
  const sec = page.locator(`section.race`).filter({ has: page.locator(`[style*="--${key}"]`) });
}
const sections = await page.locator('section.race').all();
const labels = ['vanguard', 'seraph', 'swarm', 'neutral'];
for (let i = 0; i < sections.length && i < labels.length; i++) {
  await sections[i].screenshot({ path: `shots/units-${labels[i]}.png` });
}

await browser.close();
console.log('codex screenshots -> packages/app/shots/');
