import { Kind, Role, Tech, Units, tiles } from './data.ts';
import { tileX, tileY } from './pathing.ts';
import { getTechLevel } from './tech.ts';
import { eid, isAlive, NONE, type State } from './world.ts';
import { navPassable } from './flow.ts';

export const LOAD_RANGE = tiles(2);
export const UNLOAD_RANGE = tiles(3);

const BUNKER_LOADABLE = new Set<number>([Kind.Marine, Kind.Firebat, Kind.Medic, Kind.Ghost]);

export const sameTeam = (s: State, a: number, b: number): boolean =>
  a >= 0 && b >= 0 && a < s.teams.length && b < s.teams.length && s.teams[a] === s.teams[b];

export const isContained = (s: State, slot: number): boolean =>
  s.e.container[slot] !== NONE && isAlive(s.e, s.e.container[slot]!);

export const transportCapacity = (s: State, slot: number): number => {
  const kind = s.e.kind[slot]!;
  if (kind === Kind.NydusCanal && defaultNydusExit(s, slot) === NONE) return 0;
  if (kind === Kind.Overlord && getTechLevel(s, s.e.owner[slot]!, Tech.VentralSacs) <= 0) return 0;
  return Units[kind]?.cargoCapacity ?? 0;
};

const isNydusEndpoint = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.alive[slot] === 1 && e.kind[slot] === Kind.NydusCanal && e.built[slot] === 1;
};

export const nydusExitNear = (s: State, entrance: number, x: number, y: number): number => {
  if (!isNydusEndpoint(s, entrance)) return NONE;
  const e = s.e;
  let best = NONE;
  let bestD = Infinity;
  for (let i = 0; i < e.hi; i++) {
    if (i === entrance || !isNydusEndpoint(s, i) || !sameTeam(s, e.owner[entrance]!, e.owner[i]!)) continue;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d > UNLOAD_RANGE * UNLOAD_RANGE || d >= bestD) continue;
    best = i;
    bestD = d;
  }
  return best;
};

export const defaultNydusExit = (s: State, entrance: number): number => {
  if (!isNydusEndpoint(s, entrance)) return NONE;
  const e = s.e;
  let best = NONE;
  let bestD = -1;
  for (let i = 0; i < e.hi; i++) {
    if (i === entrance || !isNydusEndpoint(s, i) || !sameTeam(s, e.owner[entrance]!, e.owner[i]!)) continue;
    const dx = e.x[i]! - e.x[entrance]!;
    const dy = e.y[i]! - e.y[entrance]!;
    const d = dx * dx + dy * dy;
    if (d <= bestD) continue;
    best = i;
    bestD = d;
  }
  return best;
};

export const unloadAnchorSlot = (s: State, transport: number, x?: number, y?: number): number => {
  if (s.e.kind[transport] !== Kind.NydusCanal) return transport;
  return x === undefined || y === undefined ? defaultNydusExit(s, transport) : nydusExitNear(s, transport, x, y);
};

export const cargoUsed = (s: State, transport: number): number => {
  const e = s.e;
  const id = eid(e, transport);
  let used = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.container[i] === id) used += Units[e.kind[i]!]?.cargoSize ?? 0;
  }
  return used;
};

export const canLoadUnit = (s: State, unit: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[unit]!];
  if (!def || def.cargoSize <= 0 || e.built[unit] !== 1 || e.burrowed[unit] === 1 || isContained(s, unit)) return false;
  return (e.flags[unit]! & Role.Mobile) !== 0 && (e.flags[unit]! & (Role.Air | Role.Structure | Role.Resource)) === 0;
};

export const canLoadInto = (s: State, transport: number, unit: number): boolean => {
  if (!canLoadUnit(s, unit)) return false;
  if (s.e.kind[transport] === Kind.Bunker) return BUNKER_LOADABLE.has(s.e.kind[unit]!);
  return true;
};

export const containedBy = (s: State, unit: number, transport: number): boolean =>
  s.e.container[unit] === eid(s.e, transport);

export const unloadPassable = (s: State, x: number, y: number): boolean =>
  navPassable(s, tileX(x), tileY(y));
