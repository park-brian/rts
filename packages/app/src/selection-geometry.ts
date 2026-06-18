import {
  Kind, ONE, Role, TILE, Units, bodyBounds, structureFootprint,
} from './sim.ts';

export type SelectableBounds = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };

const usesFootprintBounds = (kind: number): boolean => {
  const def = Units[kind]!;
  return (def.roles & (Role.Structure | Role.Resource)) !== 0 || kind === Kind.Geyser;
};

export const selectableBounds = (kind: number, x: number, y: number): SelectableBounds => {
  if (usesFootprintBounds(kind)) {
    const fp = structureFootprint(kind, x, y);
    const x0 = fp.x0 * TILE;
    const y0 = fp.y0 * TILE;
    const x1 = (fp.x1 + 1) * TILE;
    const y1 = (fp.y1 + 1) * TILE;
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  const b = bodyBounds(kind);
  const cx = x / ONE;
  const cy = y / ONE;
  return {
    x0: cx - b.left / ONE,
    y0: cy - b.up / ONE,
    x1: cx + b.right / ONE,
    y1: cy + b.down / ONE,
    cx,
    cy,
  };
};

export const pointInBounds = (x: number, y: number, b: SelectableBounds): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

export const boundsIntersectsRect = (b: SelectableBounds, x0: number, y0: number, x1: number, y1: number): boolean =>
  b.x0 <= x1 && b.x1 >= x0 && b.y0 <= y1 && b.y1 >= y0;
