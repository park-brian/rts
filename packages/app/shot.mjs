// Capture mobile-resolution screenshots of the built app via Playwright.
// Usage: node shot.mjs   (serves ./dist unless URL is provided)
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const distDir = resolve('dist');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
]);

let server;
let targetUrl = process.env.URL;
if (!targetUrl) {
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = resolve(distDir, requested);
    const rel = relative(distDir, file);
    if (rel.startsWith('..') || rel === '' || existsSync(file) === false || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime.get(extname(file)) ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(resolveListen => server.listen(8099, '127.0.0.1', resolveListen));
  targetUrl = 'http://127.0.0.1:8099/';
}
mkdirSync('shots', { recursive: true });

// SwiftShader gives headless Chromium a working WebGL2 stack so screenshots
// capture the real GL renderer (gl/renderer.ts), not the Canvas2D fallback.
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const ctx = await browser.newContext({ ...devices['iPhone 12'] }); // 390x844 portrait
  const page = await ctx.newPage();
  await page.goto(targetUrl, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__game');
  const startMatch = page.getByRole('button', { name: 'Start Match' });
  if (await startMatch.count()) await startMatch.click();
  await page.waitForTimeout(400);

  // 1) Opening view (play mode, fog around the base).
  await page.screenshot({ path: 'shots/play-open.png' });

  // 2) Zoomed opening base, used to inspect building atlas quality and footprint fit.
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.sim.fullState().e;
    let cx = g.camX + g.viewW / g.zoom / 2;
    let cy = g.camY + g.viewH / g.zoom / 2;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && e.owner[i] === g.human && (e.flags[i] & 2) !== 0) {
        cx = e.x[i] / 4096;
        cy = e.y[i] / 4096;
        break;
      }
    }
    g.zoom = 3.2;
    g.camX = cx - g.viewW / g.zoom / 2;
    g.camY = cy - g.viewH / g.zoom / 2;
    g.clampCamera();
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/play-zoom.png' });

  // 3) Select all units (box-select most of the base) to show the command hotbar.
  await page.evaluate(() => window.__game.frame());
  await page.waitForTimeout(100);
  await page.mouse.move(40, 300);
  await page.mouse.down();
  await page.mouse.move(360, 760, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots/play-selected.png' });

  // 4) Spectate a fast-forwarded battle (both AIs).
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.waitForTimeout(100);
  await page.evaluate('window.__game.fastForward(4500)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/spectate-battle.png' });

  // 5) A 2v2 (twice as wide), fast-forwarded.
  await page.evaluate('window.__game.restart("spectate", 12345, 2)');
  await page.waitForTimeout(100);
  await page.evaluate('window.__game.fastForward(5000)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/spectate-2v2.png' });

  console.log('screenshots -> packages/app/shots/');
} finally {
  await browser.close();
  await new Promise(resolveClose => server ? server.close(resolveClose) : resolveClose());
}
