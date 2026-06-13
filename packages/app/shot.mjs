// Capture mobile-resolution screenshots of the built app via Playwright.
// Usage: node shot.mjs   (expects a static server serving ./dist on $URL or :8099)
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:8099/';
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 12'] }); // 390x844 portrait
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('!!window.__game');
await page.waitForTimeout(400);

// 1) Opening view (play mode, fog around the base).
await page.screenshot({ path: 'shots/play-open.png' });

// 2) Select all units (box-select most of the base) to show the command hotbar.
await page.mouse.move(40, 300);
await page.mouse.down();
await page.mouse.move(360, 760, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/play-selected.png' });

// 3) Spectate a fast-forwarded battle (both AIs).
await page.getByRole('button', { name: /Play|Watch/ }).click();
await page.waitForTimeout(100);
await page.evaluate('window.__game.fastForward(4500)');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/spectate-battle.png' });

// 4) A 2v2 (twice as wide), fast-forwarded.
await page.evaluate('window.__game.restart("spectate", 12345, 2)');
await page.waitForTimeout(100);
await page.evaluate('window.__game.fastForward(5000)');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/spectate-2v2.png' });

await browser.close();
console.log('screenshots -> packages/app/shots/');
