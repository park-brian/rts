import { Role, TILE, Units } from '../data.ts';
import { ONE } from '../fixed.ts';
import {
  topDownDockingPoint,
  topDownDockingRect,
  topDownInteractionRect,
  type InteractionPoint,
  type InteractionRect,
} from '../spatial.ts';
import { isAlive, type State } from '../world.ts';

const SIDE_LEFT = 0;
const SIDE_RIGHT = 1;
const SIDE_TOP = 2;
const SIDE_BOTTOM = 3;
const SEARCH_RINGS = 8;
const SEARCH_OUTSET = TILE * ONE * 4;

const rectsOverlap = (a: InteractionRect, b: InteractionRect): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const canUseApproachPoint = (s: State, mover: number, target: number, p: InteractionPoint): boolean => {
  const e = s.e;
  const flags = e.flags[mover]!;
  if ((flags & Role.Air) !== 0) return true;

  const body = topDownInteractionRect(e.kind[mover]!, p.x, p.y, flags);
  for (let i = 0; i < e.hi; i++) {
    if (i === mover || i === target || e.alive[i] !== 1 || isAlive(e, e.container[i]!) || e.burrowed[i] === 1) continue;
    if ((e.flags[i]! & (Role.Mobile | Role.Air)) !== Role.Mobile) continue;
    if (rectsOverlap(body, topDownInteractionRect(e.kind[i]!, e.x[i]!, e.y[i]!, e.flags[i]!))) return false;
  }
  return true;
};

const dockingSide = (p: InteractionPoint, r: InteractionRect): number => {
  if (p.x === r.x0) return SIDE_LEFT;
  if (p.x === r.x1) return SIDE_RIGHT;
  if (p.y === r.y0) return SIDE_TOP;
  return SIDE_BOTTOM;
};

const sideAt = (
  s: State,
  mover: number,
  target: number,
  side: number,
  anchor: number,
): InteractionPoint => {
  const e = s.e;
  const r = topDownDockingRect(e.kind[mover]!, e.kind[target]!, e.x[target]!, e.y[target]!, e.flags[target]!);
  const ax = side === SIDE_LEFT ? r.x0 - SEARCH_OUTSET : side === SIDE_RIGHT ? r.x1 + SEARCH_OUTSET : anchor;
  const ay = side === SIDE_TOP ? r.y0 - SEARCH_OUTSET : side === SIDE_BOTTOM ? r.y1 + SEARCH_OUTSET : anchor;
  return topDownDockingPoint(
    e.kind[mover]!,
    e.kind[target]!,
    e.x[target]!,
    e.y[target]!,
    e.flags[target]!,
    side === SIDE_LEFT || side === SIDE_RIGHT ? ax : clamp(ax, r.x0, r.x1),
    side === SIDE_TOP || side === SIDE_BOTTOM ? ay : clamp(ay, r.y0, r.y1),
  );
};

const nextSide = (primary: number, index: number): number => {
  if (index === 0) return primary;
  if (primary === SIDE_LEFT || primary === SIDE_RIGHT) {
    if (index === 1) return SIDE_TOP;
    if (index === 2) return SIDE_BOTTOM;
    return primary === SIDE_LEFT ? SIDE_RIGHT : SIDE_LEFT;
  }
  if (index === 1) return SIDE_LEFT;
  if (index === 2) return SIDE_RIGHT;
  return primary === SIDE_TOP ? SIDE_BOTTOM : SIDE_TOP;
};

const sideAnchor = (base: InteractionPoint, side: number): number =>
  side === SIDE_LEFT || side === SIDE_RIGHT ? base.y : base.x;

const sideSpacing = (s: State, mover: number): number => {
  const def = Units[s.e.kind[mover]!];
  return Math.max(TILE * ONE >> 1, def?.radius ?? (TILE * ONE >> 1));
};

export const entityApproachPoint = (
  s: State,
  mover: number,
  target: number,
  approachX = s.e.x[mover]!,
  approachY = s.e.y[mover]!,
  rank = 0,
  spacing = sideSpacing(s, mover),
): InteractionPoint => {
  const e = s.e;
  const base = topDownDockingPoint(
    e.kind[mover]!,
    e.kind[target]!,
    e.x[target]!,
    e.y[target]!,
    e.flags[target]!,
    approachX,
    approachY,
  );
  const r = topDownDockingRect(e.kind[mover]!, e.kind[target]!, e.x[target]!, e.y[target]!, e.flags[target]!);
  const primary = dockingSide(base, r);

  if (rank > 0) {
    const slotsPerSide = SEARCH_RINGS * 2;
    const sideRank = (rank - 1) % slotsPerSide;
    const side = nextSide(primary, Math.trunc((rank - 1) / slotsPerSide));
    const anchor = sideAnchor(base, side);
    const ring = Math.trunc(sideRank / 2) + 1;
    const direction = (sideRank & 1) === 0 ? 1 : -1;
    const p = sideAt(s, mover, target, side, anchor + direction * ring * spacing);
    if (canUseApproachPoint(s, mover, target, p)) return p;
  }

  if (canUseApproachPoint(s, mover, target, base)) return base;

  for (let sideIndex = 0; sideIndex < 4; sideIndex++) {
    const side = nextSide(primary, sideIndex);
    const anchor = sideAnchor(base, side);
    for (let ring = sideIndex === 0 ? 1 : 0; ring <= SEARCH_RINGS; ring++) {
      const p = sideAt(s, mover, target, side, anchor + ring * spacing);
      if (canUseApproachPoint(s, mover, target, p)) return p;
      if (ring === 0) continue;
      const q = sideAt(s, mover, target, side, anchor - ring * spacing);
      if (canUseApproachPoint(s, mover, target, q)) return q;
    }
  }
  return base;
};
