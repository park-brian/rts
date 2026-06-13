import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = 'http://127.0.0.1:8099/';
const TAG = process.env.TAG || 'new';
mkdirSync('proto/shots', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'],
});
const ctx = await browser.newContext({ ...devices['iPhone 12'] });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('!!window.__game');
await page.evaluate('window.__game.restart("spectate", 777, 1)');
await page.waitForTimeout(150);
await page.evaluate('window.__game.fastForward(7000)');
await page.waitForTimeout(200);
// Center on the densest cluster of mobile units (marines/scvs) and zoom in.
await page.evaluate(() => {
  const ONE = 4096; const g = window.__game; const e = g.sim.fullState().e;
  const pts = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const k = e.kind[i];
    if (k !== 3 && k !== 6) continue; // SCV or Marine
    pts.push([e.x[i] / ONE, e.y[i] / ONE]);
  }
  if (!pts.length) return;
  // densest 96px cell
  const cell = 96; const m = new Map();
  for (const [x, y] of pts) { const key = ((x/cell)|0)+','+((y/cell)|0); const a = m.get(key)||[0,0,0]; a[0]+=x; a[1]+=y; a[2]++; m.set(key,a); }
  let best=null; for (const a of m.values()) if (!best || a[2]>best[2]) best=a;
  g.zoom = 1.6;
  g.centerOn(best[0]/best[2], best[1]/best[2]);
});
await page.waitForTimeout(500); // let rAF run so facing eases in and units move
await page.screenshot({ path: `proto/shots/${TAG}-action.png` });
await browser.close();
console.log('action shot ->', TAG);
