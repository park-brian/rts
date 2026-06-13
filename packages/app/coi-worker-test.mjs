// End-to-end proof: run the real sim in a Worker, publish ticks into a
// SharedArrayBuffer, and read consistent snapshots on the main thread — under
// the exact conditions of GitHub Pages (NO COOP/COEP headers; isolation comes
// only from coi-serviceworker). Verifies (a) cross-origin isolation actually
// engages, (b) the worker's authoritative hash matches what the main thread
// reads out of shared memory bit-for-bit, and (c) the sim advances concurrently
// off the main thread (multiple intermediate ticks observed).
import * as esbuild from 'esbuild';
import http from 'node:http';
import { readFile, mkdtemp, writeFile, cp, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const APP = new URL('.', import.meta.url).pathname; // packages/app/
// Temp dir INSIDE the app tree so Node resolves the @rts/sim workspace symlink.
const out = await mkdtemp(join(APP, '.coi-wt-'));

// --- main-thread harness: drives the worker and validates shared-memory reads ---
const harness = `
import { SharedSnapshot, readInto, allocSnapshot, makeState, hashState, generateMap, sharedAvailable } from '@rts/sim';

const log = (...a) => { console.log('[harness]', ...a); };
window.__result = { done: false };

async function run() {
  // On the cold visit coi-serviceworker isn't controlling yet and will reload the
  // page. Don't report anything — just bail so the (isolated) reload runs this
  // again. Leaving __result.done=false keeps the test driver polling.
  if (!self.crossOriginIsolated) { log('not isolated yet; awaiting coi-serviceworker reload'); return; }
  if (!sharedAvailable()) { window.__result = { done: true, error: 'sharedAvailable() false' }; return; }

  const perTeam = 1, seed = 777, ticks = 400, players = perTeam * 2;
  const sab = allocSnapshot(players);
  if (!(sab instanceof SharedArrayBuffer)) { window.__result = { done: true, error: 'allocSnapshot not shared' }; return; }

  const snap = new SharedSnapshot(sab, players);
  const dst = makeState(generateMap(perTeam, seed), players, 0); // reader-owned state

  const worker = new Worker('./worker.js', { type: 'module' });
  const seen = new Set();
  let readFailures = 0, lastTick = -1, monotonic = true;

  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'ready') { log('worker ready at tick', m.tick); }
    else if (m.type === 'done') {
      // Final consistency check: read shared memory and compare to the worker's
      // authoritative hash for the same tick.
      const seq = readInto(snap, dst);
      const readHash = hashState(dst);
      window.__result = {
        done: true,
        crossOriginIsolated: self.crossOriginIsolated,
        shared: sab instanceof SharedArrayBuffer,
        workerTick: m.tick, workerHash: m.hash >>> 0,
        readTick: dst.tick, readHash: readHash >>> 0,
        hashMatch: (readHash >>> 0) === (m.hash >>> 0),
        tickMatch: dst.tick === m.tick,
        stableRead: seq !== -1,
        distinctTicksObserved: seen.size,
        readFailures, monotonic,
        grew: dst.e.hi > 4,
      };
      log('result', JSON.stringify(window.__result));
    }
  };

  // Poll shared memory on the main thread while the worker ticks concurrently.
  const poll = () => {
    if (window.__result.done) return;
    const seq = readInto(snap, dst);
    if (seq === -1) readFailures++;
    else {
      if (dst.tick < lastTick) monotonic = false;
      lastTick = dst.tick;
      seen.add(dst.tick);
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);

  worker.postMessage({ type: 'init', sab, perTeam, seed, ticks });
}
run();
`;

await writeFile(join(out, 'harness.ts'), harness);
await cp(join(APP, 'coi-serviceworker.js'), join(out, 'coi-serviceworker.js'));
await writeFile(join(out, 'index.html'),
  `<!doctype html><meta charset=utf-8><title>coi worker test</title>` +
  `<script src="./coi-serviceworker.js"></script>` +
  `<script type="module" src="./harness.js"></script>`);

await esbuild.build({
  entryPoints: { harness: join(out, 'harness.ts'), worker: join(APP, 'src/sim.worker.ts') },
  bundle: true, format: 'esm', outdir: out, target: 'es2022',
  loader: { '.ts': 'ts' }, logLevel: 'warning',
  absWorkingDir: APP, // resolve @rts/sim via the app's node_modules
});

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const body = await readFile(join(out, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); // NO COOP/COEP
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
console.log('serving (no COOP/COEP) at', url);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => console.log('  ', m.text()));
await page.goto(url, { waitUntil: 'load' });

let result = null;
for (let i = 0; i < 60; i++) {
  result = await page.evaluate(() => window.__result);
  if (result && result.done) break;
  await page.waitForTimeout(250);
}
await browser.close();
server.close();
await rm(out, { recursive: true, force: true });

console.log('\n=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
// readFailures > 0 is benign: a -1 means "writer mid-publish, reuse last frame".
// What must hold is that every *successful* read was consistent (monotonic ticks,
// and the final read matches the worker's authoritative hash bit-for-bit).
const ok = result && result.done && !result.error &&
  result.crossOriginIsolated && result.shared && result.hashMatch && result.tickMatch &&
  result.stableRead && result.monotonic &&
  result.readFailures < result.distinctTicksObserved && // skips are rare vs. good frames
  result.distinctTicksObserved > 5 && result.grew;
console.log('\nVERDICT:', ok ? 'PASS — sim ran off-thread, shared memory bit-exact, no torn reads' : 'FAIL');
if (ok) console.log(`(benign skipped frames: ${result.readFailures}; good frames observed: ${result.distinctTicksObserved})`);
process.exit(ok ? 0 : 1);
