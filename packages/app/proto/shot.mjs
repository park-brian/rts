import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = process.env.URL || 'http://127.0.0.1:8099/';
const TAG = process.env.TAG || 'cur';
mkdirSync('proto/shots', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'],
});
const ctx = await browser.newContext({ ...devices['iPhone 12'] });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('!!window.__game');
await page.waitForTimeout(400);
// Select base units (shows Marine/SCV/CC up close) + zoom in a touch.
await page.mouse.move(40, 300); await page.mouse.down();
await page.mouse.move(360, 760, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(200);
await page.screenshot({ path: `proto/shots/${TAG}-base.png` });
// A live battle so we can see unit facing/motion.
await page.getByRole('button', { name: /Play|Watch/ }).click();
await page.waitForTimeout(100);
await page.evaluate('window.__game.fastForward(3000)');
await page.waitForTimeout(300);
await page.screenshot({ path: `proto/shots/${TAG}-battle.png` });
await browser.close();
console.log('shots ->', TAG);
