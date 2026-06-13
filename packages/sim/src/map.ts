// Map definition (static data consumed by the sim). Tile-grid based; coordinates
// are in build tiles. Terrain is three parallel grids of size w*h indexed y*w+x.
// See docs/specs/maps.md.

import { PATCH_AMOUNT } from './data.ts';

export type ResourceSpawn = { x: number; y: number; amount: number; gas: boolean };
export type StartLoc = { x: number; y: number };

export type MapDef = {
  name: string;
  w: number; // width in build tiles
  h: number; // height in build tiles
  walk: Uint8Array; // 1 = walkable ground, 0 = blocked (cliff/obstacle)
  build: Uint8Array; // 1 = buildable
  elev: Uint8Array; // elevation level (0 low, 1 high, ...)
  starts: StartLoc[];
  resources: ResourceSpawn[];
  teams: number[]; // team id per start index
};

export const tileIndex = (m: MapDef, tx: number, ty: number): number => ty * m.w + tx;
export const inBounds = (m: MapDef, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h;
export const walkable = (m: MapDef, tx: number, ty: number): boolean =>
  inBounds(m, tx, ty) && m.walk[ty * m.w + tx] === 1;
export const buildable = (m: MapDef, tx: number, ty: number): boolean =>
  inBounds(m, tx, ty) && m.build[ty * m.w + tx] === 1;

/** A small, symmetric, open vertical-major 1v1 slice map (no obstacles). */
export const sliceMap = (): MapDef => {
  const w = 64;
  const h = 96;
  const n = w * h;
  const walk = new Uint8Array(n).fill(1);
  const build = new Uint8Array(n).fill(1);
  const elev = new Uint8Array(n);
  const starts: StartLoc[] = [
    { x: w >> 1, y: h - 12 }, // south (player 0)
    { x: w >> 1, y: 12 }, // north (player 1)
  ];
  const resources: ResourceSpawn[] = [];
  for (const s of starts) {
    const dir = s.y > h >> 1 ? -1 : 1;
    for (let i = 0; i < 8; i++) {
      resources.push({ x: s.x - 4 + i, y: s.y + dir * 4, amount: PATCH_AMOUNT, gas: false });
    }
  }
  return { name: 'Slice (1v1, S vs N)', w, h, walk, build, elev, starts, resources, teams: [0, 1] };
};
