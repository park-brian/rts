// Runtime texture atlas (docs/specs/assets.md §3). At startup we rasterize every
// SVG sprite to an offscreen canvas and pack them into two textures that share one
// UV layout:
//   • color — the full-color art (RGBA).
//   • mask  — single-region team mask (white = recolor, black = keep).
// The shader samples both at the same UV and tints the masked pixels by the player
// color. Two procedural cells round it out: `white` (a solid texel for HP bars /
// rally lines / fills) and `ring` (a stroked circle for selection halos).
//
// Baking is async (SVG → Image decode) and happens once; until it resolves the app
// falls back to the Canvas2D renderer. A small gutter around each cell prevents
// neighbor bleed under linear filtering.

import { SPRITES, svgDoc } from '../art/sprites.ts';

export type UV = readonly [u0: number, v0: number, u1: number, v1: number];

export type Atlas = {
  color: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  uv: Record<string, UV>; // sprite name → atlas UV rect
  size: number; // square atlas dimension (px)
};

const CELL = 128; // rasterization resolution per sprite (crisp to ~zoom 4 × dpr 2)
const PAD = 6; // gutter px between cells

const rasterize = (svg: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });

/** Build the color + mask atlas. Resolves once all SVGs have rasterized. */
export const buildAtlas = async (): Promise<Atlas> => {
  const names = Object.keys(SPRITES);
  const cells = [...names, 'white', 'ring'];
  const cols = Math.ceil(Math.sqrt(cells.length));
  const rows = Math.ceil(cells.length / cols);
  const W = cols * CELL;
  const H = rows * CELL;
  const size = Math.max(W, H);

  const color = makeCanvas(size);
  const mask = makeCanvas(size);
  const cg = color.getContext('2d')!;
  const mg = mask.getContext('2d')!;

  const uv: Record<string, UV> = {};
  const inner = CELL - 2 * PAD;

  // Rasterize all sprite SVGs up front (color + mask), then draw into the grid.
  const imgs = await Promise.all(
    names.map(async (n) => ({
      n,
      body: await rasterize(svgDoc(SPRITES[n]!.body)),
      mask: SPRITES[n]!.mask ? await rasterize(svgDoc(SPRITES[n]!.mask!)) : null,
    })),
  );

  const place = (i: number): { x: number; y: number } => ({
    x: (i % cols) * CELL + PAD,
    y: Math.floor(i / cols) * CELL + PAD,
  });
  const rect = (x: number, y: number): UV => [x / size, y / size, (x + inner) / size, (y + inner) / size];

  let i = 0;
  for (const im of imgs) {
    const { x, y } = place(i++);
    cg.drawImage(im.body, x, y, inner, inner);
    if (im.mask) mg.drawImage(im.mask, x, y, inner, inner);
    uv[im.n] = rect(x, y);
  }

  // Procedural: solid white texel (filled cell — sample anywhere inside).
  {
    const { x, y } = place(i++);
    cg.fillStyle = '#fff';
    cg.fillRect(x, y, inner, inner);
    uv.white = rect(x, y);
  }
  // Procedural: selection ring (white stroked circle on transparent).
  {
    const { x, y } = place(i++);
    cg.save();
    cg.strokeStyle = '#fff';
    cg.lineWidth = inner * 0.09;
    cg.beginPath();
    cg.arc(x + inner / 2, y + inner / 2, inner / 2 - cg.lineWidth, 0, Math.PI * 2);
    cg.stroke();
    cg.restore();
    uv.ring = rect(x, y);
  }
  // Procedural: soft radial glow (white center → transparent). Tinted at draw
  // time for ground shadows, lights, muzzle flashes, and explosion particles.
  {
    const { x, y } = place(i++);
    const cx = x + inner / 2;
    const cy = y + inner / 2;
    const g = cg.createRadialGradient(cx, cy, 0, cx, cy, inner / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = g;
    cg.fillRect(x, y, inner, inner);
    uv.glow = rect(x, y);
  }

  return { color, mask, uv, size };
};

const makeCanvas = (size: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
};
