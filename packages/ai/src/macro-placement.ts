import {
  Kind,
  ONE,
  TILE,
  canPlaceStructure,
  requiresPower,
  tileX,
  tileY,
  type State,
} from '@rts/sim';

const px = (tile: number): number => tile * TILE * ONE + ((TILE * ONE) >> 1);

/** Find a buildable, reasonably clear tile near (bx, by) for a structure. */
export const findSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  bx: number,
  by: number,
): { x: number; y: number } | null => {
  const btx = tileX(bx);
  const bty = tileY(by);
  for (let r = 3; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const placement = canPlaceStructure(s, player, worker, kind, px(btx + dx), px(bty + dy));
        if (placement.ok) return { x: placement.x, y: placement.y };
      }
    }
  }
  return null;
};

export const findExactSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  x: number,
  y: number,
): { x: number; y: number } | null => {
  const placement = canPlaceStructure(s, player, worker, kind, x, y);
  return placement.ok ? { x: placement.x, y: placement.y } : null;
};

export const findMacroSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  fallback: number,
): { x: number; y: number } | null => {
  const e = s.e;
  if (!requiresPower(kind)) return findSpot(s, player, worker, kind, e.x[fallback]!, e.y[fallback]!);

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || e.kind[i] !== Kind.Pylon) continue;
    const spot = findSpot(s, player, worker, kind, e.x[i]!, e.y[i]!);
    if (spot) return spot;
  }

  return findSpot(s, player, worker, kind, e.x[fallback]!, e.y[fallback]!);
};
