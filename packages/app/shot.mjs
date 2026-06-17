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
const ONE = 4096;
const CAP = 4096;
const KIND = { CommandCenter: 2, Nexus: 66, Pylon: 67, Drone: 102, Hatchery: 116, CreepColony: 119, NuclearSilo: 36 };
const ROLE = { Structure: 2, Producer: 32 };

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

  // 4) Disabled command-card reasons.
  await page.evaluate(({ ONE, CAP, KIND }) => {
    const g = window.__game;
    g.restart('play', 24066, 1, ['terran', 'protoss']);
    const s = g.sim.fullState();
    const e = s.e;
    let cc = 0;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === g.human && e.kind[i] === KIND.CommandCenter) cc = i;
    s.players.minerals[g.human] = 0;
    g.selection.clear();
    g.selection.add(cc + e.gen[cc] * CAP);
    g.zoom = 3.2;
    g.camX = e.x[cc] / ONE - g.viewW / g.zoom / 2;
    g.camY = e.y[cc] / ONE - g.viewH / g.zoom / 2;
    g.clampCamera();
    g.fastForward(0);
  }, { ONE, CAP, KIND });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/command-disabled.png' });

  // 5) Nuclear Silo missile state: ready internal ammo shown as a command-card status.
  await page.evaluate(({ CAP, KIND, ROLE }) => {
    const g = window.__game;
    g.restart('play', 24070, 1, ['terran', 'protoss']);
    const s = g.sim.fullState();
    const e = s.e;
    let silo = 0;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === g.human && e.kind[i] === KIND.CommandCenter) silo = i;
    e.kind[silo] = KIND.NuclearSilo;
    e.flags[silo] = ROLE.Structure | ROLE.Producer;
    e.specialAmmo[silo] = 1;
    s.players.supplyMax[g.human] = 10;
    g.selection.clear();
    g.selection.add(silo + e.gen[silo] * CAP);
    g.fastForward(0);
  }, { CAP, KIND, ROLE });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/nuclear-silo-ready.png' });

  // 6) Crowded command-card grouping: Zerg worker build palette with gated tech entries.
  await page.evaluate(({ CAP, KIND }) => {
    const g = window.__game;
    g.restart('play', 24068, 1, ['zerg', 'terran']);
    const s = g.sim.fullState();
    const e = s.e;
    let drone = 0;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === g.human && e.kind[i] === KIND.Drone) drone = i;
    s.players.minerals[g.human] = 1000;
    s.players.gas[g.human] = 1000;
    g.selection.clear();
    g.selection.add(drone + e.gen[drone] * CAP);
    g.fastForward(0);
  }, { CAP, KIND });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/command-groups.png' });

  // 7) Placement field overlays: candidate Pylon power and Zerg creep.
  await page.evaluate(({ ONE, KIND }) => {
    const g = window.__game;
    g.restart('play', 24067, 1, ['protoss', 'terran']);
    const e = g.sim.fullState().e;
    let nexus = 0;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === g.human && e.kind[i] === KIND.Nexus) nexus = i;
    g.zoom = 2.2;
    g.placementGhost = { kind: KIND.Pylon, x: e.x[nexus] - ONE * 160, y: e.y[nexus], ok: true };
    g.camX = g.placementGhost.x / ONE - g.viewW / g.zoom / 2;
    g.camY = g.placementGhost.y / ONE - g.viewH / g.zoom / 2;
    g.clampCamera();
  }, { ONE, KIND });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/placement-power-overlay.png' });
  await page.evaluate(({ ONE, KIND }) => {
    const g = window.__game;
    g.restart('play', 24068, 1, ['zerg', 'terran']);
    const e = g.sim.fullState().e;
    let hatchery = 0;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === g.human && e.kind[i] === KIND.Hatchery) hatchery = i;
    g.zoom = 2.2;
    g.placementGhost = { kind: KIND.CreepColony, x: e.x[hatchery] + ONE * 96, y: e.y[hatchery], ok: true };
    g.camX = g.placementGhost.x / ONE - g.viewW / g.zoom / 2;
    g.camY = g.placementGhost.y / ONE - g.viewH / g.zoom / 2;
    g.clampCamera();
  }, { ONE, KIND });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/placement-creep-overlay.png' });

  // 8) Spectate a fast-forwarded battle (both AIs).
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.waitForTimeout(100);
  await page.evaluate('window.__game.fastForward(4500)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/spectate-battle.png' });

  // 9) A 2v2 (twice as wide), fast-forwarded.
  await page.evaluate('window.__game.restart("spectate", 12345, 2)');
  await page.waitForTimeout(100);
  await page.evaluate('window.__game.fastForward(5000)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/spectate-2v2.png' });

  // 10) Desktop command console layout: minimap, selection panel, grouped command grid.
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await desktopCtx.addInitScript(() => {
    localStorage.setItem('rts.controlScheme', 'desktop');
  });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto(targetUrl, { waitUntil: 'load' });
  await desktopPage.waitForFunction('!!window.__game');
  const desktopStart = desktopPage.getByRole('button', { name: 'Start Match' });
  if (await desktopStart.count()) await desktopStart.click();
  await desktopPage.waitForTimeout(200);
  await desktopPage.evaluate(({ CAP, KIND }) => {
    const g = window.__game;
    g.restart('play', 24069, 1, ['terran', 'protoss']);
    const s = g.sim.fullState();
    const e = s.e;
    let cc = 0;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === g.human && e.kind[i] === KIND.CommandCenter) cc = i;
    s.players.minerals[g.human] = 0;
    g.selection.clear();
    g.selection.add(cc + e.gen[cc] * CAP);
    g.fastForward(0);
  }, { CAP, KIND });
  await desktopPage.waitForTimeout(100);
  await desktopPage.screenshot({ path: 'shots/desktop-command-groups.png' });
  await desktopCtx.close();

  console.log('screenshots -> packages/app/shots/');
} finally {
  await browser.close();
  await new Promise(resolveClose => server ? server.close(resolveClose) : resolveClose());
}
