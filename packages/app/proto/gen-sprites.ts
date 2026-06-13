// Generates a self-contained packages/app/sprites.html from the roster — a viewer
// with a grouped dropdown, team-color swatches, rotation + turret sliders, an air
// elevation toggle, and a full thumbnail grid of every unit/building. No build step:
// each sprite's SVG is rasterized in-browser; TEAMFILL is swapped for the chosen color.
import { writeFileSync } from 'node:fs';
import { ROSTER } from '../src/art/roster.ts';

const data = ROSTER.map((s) => ({
  race: s.race, cat: s.cat, name: s.name, label: s.label,
  scale: s.scale ?? 1, air: !!s.air, svg: s.svg, turret: s.turret ?? null,
}));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>RTS Sprites — all units & buildings</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0f15; color: #dfe6ef; font: 14px/1.4 system-ui, sans-serif; }
  header { padding: 14px 18px; border-bottom: 1px solid #1c2530; }
  h1 { margin: 0; font-size: 17px; }
  header p { margin: 4px 0 0; color: #8a97a8; font-size: 12px; }
  .wrap { display: flex; gap: 22px; padding: 18px; flex-wrap: wrap; }
  .panel { display: flex; flex-direction: column; gap: 12px; min-width: 260px; }
  select, .row { font: inherit; }
  select { background: #141b24; color: #e7edf5; border: 1px solid #283341; border-radius: 8px; padding: 8px; width: 280px; }
  .stage { width: 280px; height: 280px; border-radius: 12px; background:
      radial-gradient(circle at 50% 42%, #1d2c22 0%, #16221c 55%, #11181f 100%); display: grid; place-items: center; }
  label.lbl { color: #9fb0c2; font-size: 12px; display: block; margin-bottom: 4px; }
  .swatches { display: flex; gap: 6px; }
  .sw { width: 26px; height: 26px; border-radius: 6px; border: 2px solid #0b0f15; cursor: pointer; }
  .sw.active { border-color: #e7edf5; }
  input[type=range] { width: 280px; }
  .meta { color: #8a97a8; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, 92px); gap: 10px; padding: 4px 18px 40px; }
  .cellh { grid-column: 1 / -1; margin: 14px 0 2px; color: #cdd7e2; font-weight: 700; font-size: 13px; border-bottom: 1px solid #1c2530; padding-bottom: 4px; }
  .cell { width: 92px; cursor: pointer; text-align: center; }
  .cell canvas { width: 84px; height: 84px; border-radius: 8px; background:
      radial-gradient(circle at 50% 42%, #1d2c22 0%, #16221c 60%, #11181f 100%); }
  .cell.active canvas { outline: 2px solid #ffe14e; }
  .cell span { display: block; font-size: 10px; color: #9fb0c2; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style></head>
<body>
<header>
  <h1>RTS Sprites — every unit &amp; building, all three races</h1>
  <p>Flat top-down "signature distillation". Pick from the dropdown, recolor by team, spin to test facing. Tank shows the independent turret.</p>
</header>
<div class="wrap">
  <div class="panel">
    <div><label class="lbl">Sprite</label><select id="pick"></select></div>
    <div><label class="lbl">Team color</label><div class="swatches" id="sw"></div></div>
    <div><label class="lbl">Facing (hull)</label><input id="rot" type="range" min="0" max="360" value="0"/></div>
    <div id="turretWrap" style="display:none"><label class="lbl">Turret aim</label><input id="trot" type="range" min="0" max="360" value="0"/></div>
    <div class="meta" id="meta"></div>
  </div>
  <div class="stage"><canvas id="big" width="512" height="512" style="width:280px;height:280px"></canvas></div>
</div>
<div class="grid" id="grid"></div>

<script>
const ROSTER = ${JSON.stringify(data)};
const TEAMS = ['#4ea1ff','#ff5a5a','#ffd24e','#9b7bff','#5affa0','#ff9b4e'];
let team = TEAMS[0];
const cache = new Map();
function shade(hex, f, w) { // f = multiply (darken); w = lighten toward white
  const n = parseInt(hex.slice(1), 16), ch = [(n>>16)&255, (n>>8)&255, n&255];
  const mix = (v) => Math.max(0, Math.min(255, Math.round(w ? v + (255-v)*w : v*f)));
  return '#' + ch.map(v => mix(v).toString(16).padStart(2,'0')).join('');
}
function imgFor(svg, color) {
  const key = color + '|' + svg;
  if (cache.has(key)) return cache.get(key);
  const img = new Image();
  const tinted = svg
    .replaceAll('TEAMLITE', shade(color, 1, 0.5))
    .replaceAll('TEAMDARK', shade(color, 0.62, 0))
    .replaceAll('TEAMFILL', color);
  const doc = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' + tinted + '</svg>';
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(doc);
  const p = new Promise(res => { if (img.complete) res(img); else img.onload = () => res(img); });
  cache.set(key, p); return p;
}
async function draw(ctx, sp, cssSize, color, rotDeg, trotDeg) {
  const dpr = ctx.canvas.width / cssSize;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssSize, cssSize);
  const c = cssSize / 2, size = cssSize * 0.72 * (sp.scale || 1);
  // air units: a detached, larger shadow below to read as "lifted".
  ctx.save(); ctx.globalAlpha = sp.air ? 0.34 : 0.26; ctx.fillStyle = '#000';
  const off = sp.air ? cssSize * 0.10 : cssSize * 0.04;
  ctx.beginPath(); ctx.ellipse(c + off*0.6, c + off, size*0.34, size*0.22, 0, 0, 7); ctx.fill(); ctx.restore();
  const body = await imgFor(sp.svg, color);
  ctx.save(); ctx.translate(c, c); ctx.rotate(rotDeg * Math.PI / 180);
  ctx.drawImage(body, -size/2, -size/2, size, size); ctx.restore();
  if (sp.turret) {
    const tur = await imgFor(sp.turret, color);
    ctx.save(); ctx.translate(c, c); ctx.rotate(trotDeg * Math.PI / 180);
    ctx.drawImage(tur, -size/2, -size/2, size, size); ctx.restore();
  }
}

// dropdown (grouped) + grid
const pick = document.getElementById('pick'), grid = document.getElementById('grid');
const groups = {};
ROSTER.forEach((sp, i) => { const k = sp.race + ' · ' + sp.cat; (groups[k] ||= []).push(i); });
for (const [k, idxs] of Object.entries(groups)) {
  const og = document.createElement('optgroup'); og.label = k.replace('terran','Terran').replace('protoss','Protoss').replace('zerg','Zerg').replace('unit','units').replace('building','buildings');
  idxs.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = ROSTER[i].label; og.appendChild(o); });
  pick.appendChild(og);
  const h = document.createElement('div'); h.className = 'cellh'; h.textContent = og.label; grid.appendChild(h);
  idxs.forEach(i => {
    const sp = ROSTER[i];
    const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.i = i;
    const cv = document.createElement('canvas'); cv.width = 168; cv.height = 168;
    const span = document.createElement('span'); span.textContent = sp.label;
    cell.appendChild(cv); cell.appendChild(span); grid.appendChild(cell);
    cell.onclick = () => { pick.value = i; select(i); };
    cell._cv = cv;
  });
}

// team swatches
const sw = document.getElementById('sw');
TEAMS.forEach((c, i) => { const d = document.createElement('div'); d.className = 'sw' + (i===0?' active':''); d.style.background = c;
  d.onclick = () => { team = c; [...sw.children].forEach(x=>x.classList.remove('active')); d.classList.add('active'); refresh(); }; sw.appendChild(d); });

const big = document.getElementById('big').getContext('2d');
const rot = document.getElementById('rot'), trot = document.getElementById('trot');
const turretWrap = document.getElementById('turretWrap'), meta = document.getElementById('meta');
let cur = 0;
function select(i) { cur = +i; const sp = ROSTER[i];
  turretWrap.style.display = sp.turret ? 'block' : 'none';
  meta.textContent = sp.label + '  ·  ' + sp.race + '  ·  ' + sp.cat + (sp.air ? '  ·  air' : '') + (sp.turret ? '  ·  turret' : '') + '  ·  scale ' + (sp.scale||1);
  [...grid.querySelectorAll('.cell')].forEach(c => c.classList.toggle('active', +c.dataset.i === cur));
  drawBig();
}
function drawBig() { draw(big, ROSTER[cur], 280, team, +rot.value, +trot.value); }
async function refresh() { drawBig();
  for (const cell of grid.querySelectorAll('.cell')) { const sp = ROSTER[+cell.dataset.i];
    await draw(cell._cv.getContext('2d'), sp, 84, team, 0, 0); } }
pick.onchange = () => select(pick.value);
rot.oninput = drawBig; trot.oninput = drawBig;
select(0); refresh();
</script>
</body></html>`;

writeFileSync(new URL('../sprites.html', import.meta.url), html);
console.log('wrote packages/app/sprites.html  (' + data.length + ' sprites)');
