import { entityRenderHull } from './sim.ts';

export type SelectableBounds = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };

export const selectableBounds = (kind: number, x: number, y: number): SelectableBounds =>
  entityRenderHull(kind, x, y);

export const pointInBounds = (x: number, y: number, b: SelectableBounds): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

export const boundsIntersectsRect = (b: SelectableBounds, x0: number, y0: number, x1: number, y1: number): boolean =>
  b.x0 <= x1 && b.x1 >= x0 && b.y0 <= y1 && b.y1 >= y0;
