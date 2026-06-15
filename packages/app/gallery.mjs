// Full-roster sprite gallery (docs/specs/assets.md §6). Renders every emblem in
// SPRITES with the SAME tint the in-game shader uses (renderer.ts):
// out.rgb = base.rgb * mix(1, team, maskR), on a dark map tone so the neon reads.
// Grouped by race; each unit shown in one team color. Output:
// docs/screenshots/unit-art-roster.png
import { chromium } from 'playwright';
import { SPRITES, ROSTER_GROUPS, svgDoc } from './src/art/sprites.ts';

const TEAM = '#27d3ff'; // cyan
const data = ROSTER_GROUPS.map((g) => ({
  race: g.race,
  units: g.keys.map((k) => ({ key: k, body: svgDoc(SPRITES[k].body), mask: SPRITES[k].mask ? svgDoc(SPRITES[k].mask) : null })),
}));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
await page.setContent('<body style="margin:0"></body>');
const dataUrl = await page.evaluate(
  async ({ data, TEAM }) => {
    const CELL = 96;
    const COLS = 8;
    const decode = (svg) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      });
    const tint = (bodyImg, maskImg, hex) => {
      const c = document.createElement('canvas');
      c.width = c.height = CELL;
      const g = c.getContext('2d');
      g.drawImage(bodyImg, 0, 0, CELL, CELL);
      const base = g.getImageData(0, 0, CELL, CELL);
      let mr = null;
      if (maskImg) {
        const mc = document.createElement('canvas');
        mc.width = mc.height = CELL;
        const mg = mc.getContext('2d');
        mg.drawImage(maskImg, 0, 0, CELL, CELL);
        mr = mg.getImageData(0, 0, CELL, CELL).data;
      }
      const team = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const d = base.data;
      for (let i = 0; i < d.length; i += 4) {
        const m = mr ? mr[i] / 255 : 0;
        d[i] = (d[i] * ((1 - m) * 255 + m * team[0])) / 255;
        d[i + 1] = (d[i + 1] * ((1 - m) * 255 + m * team[1])) / 255;
        d[i + 2] = (d[i + 2] * ((1 - m) * 255 + m * team[2])) / 255;
      }
      g.putImageData(base, 0, 0);
      return c;
    };

    const groups = [];
    for (const grp of data) {
      const units = [];
      for (const u of grp.units) units.push({ key: u.key, img: await decode(u.body), mask: u.mask ? await decode(u.mask) : null });
      groups.push({ race: grp.race, units });
    }

    const PAD = 16;
    const HEADER = 50;
    const W = COLS * CELL + 2 * PAD;
    let H = HEADER + PAD;
    for (const g of groups) H += 30 + Math.ceil(g.units.length / COLS) * (CELL + 16) + 14;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dfe6ef';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('Unit Art — full roster (Tron neon, math-generated)', PAD, 34);

    let y = HEADER + PAD;
    const tones = { Terran: '#cfe0ff', Protoss: '#ffe9a8', Zerg: '#ffc59a', Neutral: '#9fe9df' };
    for (const g of groups) {
      ctx.fillStyle = tones[g.race] || '#fff';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(g.race.toUpperCase(), PAD, y + 20);
      y += 30;
      g.units.forEach((u, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = PAD + col * CELL;
        const cy = y + row * (CELL + 16);
        ctx.fillStyle = '#0d1320';
        ctx.fillRect(x + 3, cy + 3, CELL - 6, CELL - 6);
        const cell = u.mask ? tint(u.img, u.mask, TEAM) : null;
        if (cell) ctx.drawImage(cell, x, cy);
        else ctx.drawImage(u.img, x, cy);
        ctx.fillStyle = '#8b97a6';
        ctx.font = '500 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(u.key, x + CELL / 2, cy + CELL - 1);
        ctx.textAlign = 'left';
      });
      y += Math.ceil(g.units.length / COLS) * (CELL + 16) + 14;
    }
    return cv.toDataURL('image/png');
  },
  { data, TEAM },
);
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('../../docs/screenshots/unit-art-roster.png', import.meta.url), buf);
await browser.close();
console.log('roster -> docs/screenshots/unit-art-roster.png');
