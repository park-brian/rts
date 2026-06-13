// Map definition (static data consumed by the sim). Coordinates are in build tiles.
// See docs/specs/maps.md — vertical-major, 180°-symmetric, south start first.

import { PATCH_AMOUNT } from './data.ts';

export type ResourceSpawn = { x: number; y: number; amount: number; gas: boolean };
export type StartLoc = { x: number; y: number };

export type MapDef = {
  name: string;
  w: number; // width in build tiles
  h: number; // height in build tiles (>= w for portrait/vertical-major)
  starts: StartLoc[]; // index 0 = south
  resources: ResourceSpawn[];
};

/** A small, symmetric, vertical-major 1v1 slice map: south start vs north start. */
export const sliceMap = (): MapDef => {
  const w = 64;
  const h = 96;
  const starts: StartLoc[] = [
    { x: w >> 1, y: h - 12 }, // south (player)
    { x: w >> 1, y: 12 }, // north (enemy)
  ];
  const resources: ResourceSpawn[] = [];
  // A line of 8 mineral patches beside each main, offset toward the map center.
  for (const s of starts) {
    const dir = s.y > h >> 1 ? -1 : 1; // patches sit on the center-facing side
    for (let i = 0; i < 8; i++) {
      resources.push({ x: s.x - 4 + i, y: s.y + dir * 4, amount: PATCH_AMOUNT, gas: false });
    }
  }
  return { name: 'Slice (1v1, S vs N)', w, h, starts, resources };
};
