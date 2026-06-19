import { Role, TILE } from '../data/index.ts';
import { ONE } from '../fixed.ts';
import { inBounds } from '../map/core.ts';
import type { State } from '../entity/world.ts';

export const tileCoord = (fixedPx: number): number => Math.trunc(fixedPx / (ONE * TILE));

export const elevationAtTile = (s: State, tx: number, ty: number): number =>
  inBounds(s.map, tx, ty) ? s.map.elev[ty * s.map.w + tx]! : 0;

export const elevationAt = (s: State, x: number, y: number): number =>
  elevationAtTile(s, tileCoord(x), tileCoord(y));

export const slotElevation = (s: State, slot: number): number =>
  elevationAt(s, s.e.x[slot]!, s.e.y[slot]!);

export const ignoresElevation = (s: State, slot: number): boolean =>
  (s.e.flags[slot]! & Role.Air) !== 0;

export const canSeeElevation = (s: State, source: number, targetElevation: number): boolean =>
  ignoresElevation(s, source) || slotElevation(s, source) >= targetElevation;

export const isLowGroundAttackingHigh = (s: State, attacker: number, target: number): boolean =>
  !ignoresElevation(s, attacker) &&
  (s.e.flags[target]! & Role.Air) === 0 &&
  slotElevation(s, attacker) < slotElevation(s, target);
