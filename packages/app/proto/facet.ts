import { chromium } from 'playwright';
import { ROSTER } from '../src/art/roster.ts';
const want = ['marine','scv','zealot','dragoon','hydralisk','zergling','mutalisk'];
const items = want.map(n => { const s = ROSTER.find(r => r.name === n)!; return { label: s.label, scale: s.scale ?? 1, svg: s.svg }; });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await b.newPage({ deviceScaleFactor: 2 });
const W = 720, H = 280; await page.setViewportSize({ width: W, height: H });
await page.setContent('<body style="margin:0;background:#1b2a22"></body>');
await page.evaluate(async ({ items, W, H }) => {
  const cv = document.createElement('canvas'); cv.width=W*2; cv.height=H*2; cv.style.width=W+'px'; cv.style.height=H+'px';
  document.body.appendChild(cv); const ctx = cv.getContext('2d'); ctx.scale(2,2);
  const load = (svg,c) => new Promise(r => { const i=new Image(); i.onload=()=>r(i);
    i.src='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'+svg.replaceAll('TEAMFILL',c)+'</svg>'); });
  ctx.fillStyle='#1b2a22'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#e7edf5'; ctx.font='600 13px system-ui';
  const cell=98, sz=86, y1=92, y2=200;
  for (let i=0;i<items.length;i++){ const it=items[i]; const cx=cell/2+i*cell+8;
    for (const [row,col] of [[y1,'#4ea1ff'],[y2,'#ff5a5a']]){
      ctx.save(); ctx.globalAlpha=0.26; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(cx+2,row+sz*0.30,sz*0.30*it.scale,sz*0.2*it.scale,0,0,7); ctx.fill(); ctx.restore();
      const img=await load(it.svg,col); const s=sz*it.scale; ctx.drawImage(img,cx-s/2,row-s/2,s,s);
    }
    ctx.fillStyle='#cfe'; ctx.textAlign='center'; ctx.fillText(it.label,cx,H-10); ctx.textAlign='left';
  }
  window.__done=true;
}, { items, W, H });
await page.waitForFunction('window.__done===true');
await page.locator('canvas').screenshot({ path:'proto/shots/facet.png' });
await b.close(); console.log('ok');
