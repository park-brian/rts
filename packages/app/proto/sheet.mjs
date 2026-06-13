import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { FLAGSHIPS } from './flagships.mjs';

mkdirSync('proto/shots', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'],
});
const page = await browser.newPage({ deviceScaleFactor: 2 });
const W = 640, H = 980;
await page.setViewportSize({ width: W, height: H });
await page.setContent('<body style="margin:0;background:#0b0f15"></body>');

await page.evaluate(async ({ data, W, H }) => {
  const TEAMS = { blue: '#4ea1ff', red: '#ff5a5a' };
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(2, 2);

  const load = (s, color) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = rej;
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(s.replaceAll('TEAMFILL', color));
  });
  const blit = (img, cx, cy, size, ang) => {
    // soft contact shadow (matches the game's down-right offset)
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx + size*0.06, cy + size*0.10, size*0.34, size*0.24, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.drawImage(img, -size/2, -size/2, size, size); ctx.restore();
  };

  ctx.fillStyle = '#0b0f15'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e7edf5'; ctx.font = '700 19px system-ui,sans-serif';
  ctx.fillText('Top-Down Signature Distillation — flagship prototype', 20, 30);
  ctx.fillStyle = '#8a97a8'; ctx.font = '12px system-ui,sans-serif';
  ctx.fillText('flat overhead read · strong forward nose · team-recolor · independent tank turret', 20, 50);

  const labelW = 168, cell = 96, sprite = 80, bsprite = 88;
  const gx = labelW, top = 74;
  const cols = ['0°', '45°', '135°', '225°', 'recolor'];
  const facings = [0, Math.PI/4, Math.PI*0.75, Math.PI*1.25];

  // column headers
  ctx.fillStyle = '#6f7d8f'; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center';
  cols.forEach((c, i) => ctx.fillText(c, gx + i*cell + cell/2, top - 8));
  ctx.textAlign = 'left';

  const unitRows = ['marine','scv','drone','hydralisk','dragoon','zealot'];
  const drawCellBg = (cx, cy) => {
    ctx.fillStyle = '#16221c'; // faint terrain-green tile to test contrast
    ctx.beginPath(); ctx.roundRect(cx - cell/2 + 4, cy - cell/2 + 4, cell - 8, cell - 8, 8); ctx.fill();
  };

  let y = top + cell/2;
  for (const name of unitRows) {
    const u = data[name];
    ctx.fillStyle = '#cfd8e3'; ctx.font = '600 13px system-ui,sans-serif';
    ctx.fillText(u.label, 18, y);
    const blue = await load(u.layers[0], TEAMS.blue);
    const red = await load(u.layers[0], TEAMS.red);
    facings.forEach((a, i) => { const cx = gx + i*cell + cell/2; drawCellBg(cx, y); blit(blue, cx, y, sprite, a); });
    const cx = gx + 4*cell + cell/2; drawCellBg(cx, y); blit(red, cx, y, sprite, Math.PI/6);
    y += cell;
  }

  // Tank row: hull faces each facing; turret always aims "up" (independent).
  {
    const u = data.tankHull;
    ctx.fillStyle = '#cfd8e3'; ctx.font = '600 13px system-ui,sans-serif'; ctx.fillText(u.label, 18, y);
    ctx.fillStyle = '#6f7d8f'; ctx.font = '10px system-ui,sans-serif'; ctx.fillText('hull turns · barrel tracks ▲', 18, y + 16);
    const hullB = await load(u.layers[0], TEAMS.blue), turB = await load(u.turret, TEAMS.blue);
    const hullR = await load(u.layers[0], TEAMS.red), turR = await load(u.turret, TEAMS.red);
    facings.forEach((a, i) => { const cx = gx + i*cell + cell/2; drawCellBg(cx, y); blit(hullB, cx, y, sprite, a); blit(turB, cx, y, sprite, 0); });
    const cx = gx + 4*cell + cell/2; drawCellBg(cx, y); blit(hullR, cx, y, sprite, Math.PI/6); blit(turR, cx, y, sprite, 0);
    y += cell;
  }

  // Buildings section
  y += 14;
  ctx.fillStyle = '#e7edf5'; ctx.font = '700 14px system-ui,sans-serif'; ctx.fillText('Buildings — roof signature, race-coded, no facing', 18, y);
  y += 22 + cell/2;
  const builds = ['commandCenter','nexus','hatchery'];
  for (let i = 0; i < builds.length; i++) {
    const u = data[builds[i]]; const cx = gx + i*cell + cell/2 - cell*0.0;
    drawCellBg(cx, y); blit(await load(u.layers[0], TEAMS.blue), cx, y, bsprite, 0);
    ctx.fillStyle = '#9fb0c2'; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(u.label.split(' · ')[0], cx, y + cell/2 - 2); ctx.textAlign = 'left';
  }

  window.__done = true;
}, { data: FLAGSHIPS, W, H });

await page.waitForFunction('window.__done === true');
await page.locator('canvas').screenshot({ path: 'proto/shots/flagships.png' });
await browser.close();
console.log('contact sheet -> proto/shots/flagships.png');
