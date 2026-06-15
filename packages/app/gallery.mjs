// Sprite-art gallery (docs/specs/assets.md §6 — "prototype via Playwright
// screenshots"). Renders the Geometric-Grammar vertical stripe — worker /
// ground / air / hub for Terran, Protoss, Zerg — applying the SAME tint the
// in-game shader uses (renderer.ts): out.rgb = base.rgb * mix(1, team, maskR).
// Columns: pure silhouette (mask), then two team colors. Proves racial contrast
// and 8-player legibility from one sprite. Output: docs/screenshots/unit-art-stripe.png
import { chromium } from 'playwright';
import { SPRITES, svgDoc } from './src/art/sprites.ts';

// Mirrors renderer.ts OWN_HEX (team palette).
const TEAMS = { Blue: '#4ea1ff', Red: '#ff5a5a' };

const ROWS = [
  ['Terran', [['SCV', 'scv'], ['Marine', 'marine'], ['Wraith', 'wraith'], ['Command Center', 'commandCenter']]],
  ['Protoss', [['Probe', 'probe'], ['Zealot', 'zealot'], ['Scout', 'scout'], ['Nexus', 'nexus']]],
  ['Zerg', [['Drone', 'drone'], ['Zergling', 'zergling'], ['Mutalisk', 'mutalisk'], ['Hatchery', 'hatchery']]],
];

// Serialize the sprite source we need into the page.
const data = ROWS.flatMap(([, units]) =>
  units.map(([label, key]) => ({
    label,
    key,
    body: svgDoc(SPRITES[key].body),
    mask: SPRITES[key].mask ? svgDoc(SPRITES[key].mask) : null,
  })),
);
const groups = ROWS.map(([race, units]) => ({ race, keys: units.map(([, k]) => k) }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 1340 }, deviceScaleFactor: 2 });

await page.setContent('<body style="margin:0"></body>');
const dataUrl = await page.evaluate(
  async ({ data, groups, TEAMS }) => {
    const CELL = 132; // sprite draw size
    const decode = (svg) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      });

    // Faithful shader tint: rgb = base * mix(1, team, maskR); a = base.a.
    const tint = (bodyImg, maskImg, hex) => {
      const c = document.createElement('canvas');
      c.width = c.height = CELL;
      const g = c.getContext('2d');
      g.drawImage(bodyImg, 0, 0, CELL, CELL);
      const base = g.getImageData(0, 0, CELL, CELL);
      let mr = null;
      if (maskImg && hex !== null) {
        const mc = document.createElement('canvas');
        mc.width = mc.height = CELL;
        const mg = mc.getContext('2d');
        mg.drawImage(maskImg, 0, 0, CELL, CELL);
        mr = mg.getImageData(0, 0, CELL, CELL).data;
      }
      const team = hex
        ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
        : null;
      const d = base.data;
      for (let i = 0; i < d.length; i += 4) {
        if (hex === null) {
          // silhouette: white where mask is white, faint where body opaque.
          const m = mr ? mr[i] / 255 : 0;
          const a = d[i + 3];
          const v = m > 0.5 ? 235 : a > 20 ? 70 : 0;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = a > 20 || m > 0.5 ? 255 : 0;
          continue;
        }
        const m = mr ? mr[i] / 255 : 0;
        d[i] = (d[i] * ((1 - m) * 255 + m * team[0])) / 255;
        d[i + 1] = (d[i + 1] * ((1 - m) * 255 + m * team[1])) / 255;
        d[i + 2] = (d[i + 2] * ((1 - m) * 255 + m * team[2])) / 255;
      }
      g.putImageData(base, 0, 0);
      return c;
    };

    const imgs = {};
    for (const u of data) {
      imgs[u.key] = { body: await decode(u.body), mask: u.mask ? await decode(u.mask) : null };
      imgs[u.key].label = u.label;
    }

    const cols = ['Silhouette', 'Blue', 'Red'];
    const colHex = [null, TEAMS.Blue, TEAMS.Red];
    const LABELW = 150;
    const HEADER = 60;
    const ROWH = CELL + 30;
    const W = LABELW + cols.length * CELL + 40;
    const rowsTotal = groups.reduce((n, g) => n + g.keys.length, 0);
    const H = HEADER + groups.length * 36 + rowsTotal * ROWH + 40;

    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, W, H);

    // Title + column headers.
    ctx.fillStyle = '#dfe6ef';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('Unit Art — Geometric Grammar (worker · ground · air · hub)', 20, 36);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    cols.forEach((c, i) => ctx.fillText(c, LABELW + i * CELL + CELL / 2, HEADER + 8));

    let y = HEADER + 24;
    const tones = { Terran: '#cfe0ff', Protoss: '#ffe9a8', Zerg: '#ffc59a' };
    for (const grp of groups) {
      ctx.textAlign = 'left';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillStyle = tones[grp.race] || '#fff';
      ctx.fillText(grp.race.toUpperCase(), 20, y + 22);
      y += 34;
      for (const key of grp.keys) {
        const u = imgs[key];
        ctx.textAlign = 'left';
        ctx.fillStyle = '#aeb8c6';
        ctx.font = '600 15px system-ui, sans-serif';
        ctx.fillText(u.label, 20, y + CELL / 2);
        for (let ci = 0; ci < cols.length; ci++) {
          const x = LABELW + ci * CELL;
          ctx.fillStyle = ci === 0 ? '#05070b' : '#1c2738';
          ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
          const sprite = tint(u.body, u.mask, colHex[ci]);
          ctx.drawImage(sprite, x, y);
        }
        y += ROWH;
      }
      y += 6;
    }
    return cv.toDataURL('image/png');
  },
  { data, groups, TEAMS },
);

const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
const { writeFileSync } = await import('node:fs');
const out = new URL('../../docs/screenshots/unit-art-stripe.png', import.meta.url);
writeFileSync(out, buf);
await browser.close();
console.log('gallery -> docs/screenshots/unit-art-stripe.png');
