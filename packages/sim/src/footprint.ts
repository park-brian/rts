// Discrete build-tile footprints. These are placement/pathing concepts, separate
// from radius (interaction/rendering).

import { TILE, Units } from './data.ts';
import { ONE } from './fixed.ts';

const TILE_FX = TILE * ONE;

export type Footprint = { x0: number; y0: number; x1: number; y1: number };

const tileX = (xfx: number): number => Math.floor(xfx / TILE_FX);
const tileY = (yfx: number): number => Math.floor(yfx / TILE_FX);

export const snapBuildAnchor = (x: number, y: number): { x: number; y: number } => ({
  x: tileX(x) * TILE_FX + TILE_FX / 2,
  y: tileY(y) * TILE_FX + TILE_FX / 2,
});

export const structureFootprint = (kind: number, x: number, y: number): Footprint => {
  const def = Units[kind]!;
  const tx = tileX(x);
  const ty = tileY(y);
  const x0 = tx - Math.floor(def.footprintW / 2);
  const y0 = ty - Math.floor(def.footprintH / 2);
  return { x0, y0, x1: x0 + def.footprintW - 1, y1: y0 + def.footprintH - 1 };
};

export const footprintsOverlap = (a: Footprint, b: Footprint): boolean =>
  a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
