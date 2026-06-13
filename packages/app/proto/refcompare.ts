import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { ROSTER } from '../src/art/roster.ts';

// Clean the reference: drop the orange background rect + the recraft metadata,
// keep the creature paths (dark silhouette + grey facets) on transparent.
let muta = readFileSync('muta.svg', 'utf8');
muta = muta.replace(/<path d="M 0 0 L 2048[^>]*><\/path>/, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
const mutaInner = muta.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const mine = ROSTER.find((r) => r.name === 'mutalisk')!.svg;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 720, height: 380 } });
await page.setContent('<body style="margin:0;background:#0b0f15"></body>');
await page.evaluate(async ({ mutaInner, mine }) => {
  const cv = document.createElement('canvas'); cv.width = 1440; cv.height = 760; cv.style.width='720px'; cv.style.height='380px';
  document.body.appendChild(cv); const ctx = cv.getContext('2d'); ctx.scale(2,2);
  ctx.fillStyle = '#0b0f15'; ctx.fillRect(0,0,720,380);
  ctx.fillStyle = '#e7edf5'; ctx.font = '700 16px system-ui'; ctx.fillText('Your reference (team = card)', 40, 28); ctx.fillText('My current', 470, 28);
  const load = (svg) => new Promise(r => { const i = new Image(); i.onload=()=>r(i); i.src = 'data:image/svg+xml;utf8,'+encodeURIComponent(svg); });
  const refDoc = (c) => '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048">'+mutaInner.replace(/rgb\(1,0,0\)/g,'#16121a')+'</svg>';
  const mineDoc = (c) => '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'+mine.replaceAll('TEAMFILL', c)+'</svg>';
  const card = (cx, cy, s, col) => { ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(cx-s/2, cy-s/2, s, s, s*0.18); ctx.fill(); ctx.restore(); };
  // reference in two teams, on team-colored cards
  const refImg = await load(refDoc());
  for (const [i,col] of [[0,'#4ea1ff'],[1,'#ff5a5a']].entries()) {
    const cx = 120 + i*200, cy = 200, s = 150;
    card(cx, cy, s, col); ctx.drawImage(refImg, cx-s/2, cy-s/2, s, s);
  }
  // mine in two teams (no card, current model)
  for (const [i,col] of [[0,'#4ea1ff'],[1,'#ff5a5a']].entries()) {
    const cx = 540 + i*120, cy = 200, s = 110;
    const img = await load(mineDoc(col)); ctx.drawImage(img, cx-s/2, cy-s/2, s, s);
  }
  window.__done = true;
}, { mutaInner, mine });
await page.waitForFunction('window.__done===true');
await page.locator('canvas').screenshot({ path: 'shots/refcompare.png' });
await browser.close(); console.log('ok');
