import { chromium } from 'playwright';
import { ROSTER } from '../src/art/roster.ts';
const want = ['marine','scv','commandCenter','dragoon','drone','hydralisk','zergling','hatchery'];
const items = want.map(n => { const s = ROSTER.find(r => r.name === n)!; return { label: s.label, scale: s.scale ?? 1, svg: s.svg }; });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2 });
const W = 760, H = 430; await page.setViewportSize({ width: W, height: H });
await page.setContent('<body style="margin:0;background:#0b0f15"></body>');
await page.evaluate(async ({ items, W, H }) => {
  const cv = document.createElement('canvas'); cv.width = W*2; cv.height = H*2; cv.style.width=W+'px'; cv.style.height=H+'px';
  document.body.appendChild(cv); const ctx = cv.getContext('2d'); ctx.scale(2,2);
  const load = (svg, color) => new Promise(res => { const img = new Image();
    img.onload = () => res(img);
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' + svg.replaceAll('TEAMFILL', color) + '</svg>'); });
  ctx.fillStyle = '#0b0f15'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#e7edf5'; ctx.font = '700 18px system-ui'; ctx.fillText('Revised designs — blue + red recolor', 18, 28);
  const cols = 4, cell = 176, sz = 130, x0 = 22, y0 = 56;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const cx = x0 + (i % cols)*cell + cell/2 - 10; const cy = y0 + Math.floor(i/cols)*cell + cell/2;
    for (const [k, col] of [['b','#4ea1ff'],['r','#ff5a5a']]) {
      const ox = k==='b' ? -34 : 34;
      ctx.save(); ctx.globalAlpha=0.26; ctx.fillStyle='#000'; ctx.beginPath();
      ctx.ellipse(cx+ox+2, cy+5, sz*0.3*(it.scale), sz*0.2*(it.scale), 0,0,7); ctx.fill(); ctx.restore();
      const img = await load(it.svg, col); const s = sz*it.scale;
      ctx.drawImage(img, cx+ox - s/2, cy - s/2, s, s);
    }
    ctx.fillStyle='#9fb0c2'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText(it.label, cx, cy + cell/2 - 10); ctx.textAlign='left';
  }
  window.__done = true;
}, { items, W, H });
await page.waitForFunction('window.__done===true');
await page.locator('canvas').screenshot({ path: 'proto/shots/revised.png' });
await browser.close(); console.log('ok');
