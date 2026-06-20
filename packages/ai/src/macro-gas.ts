import {
  Kind,
  NONE,
  ONE,
  ResourceType,
  Role,
  TILE,
  Units,
  withinRangeSq,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import {
  queueStructureAtSpot,
  type ResourceBudget,
  type StructureBlock,
} from './macro-build.ts';

const BASE_GEYSER_TILES = 16;
const GEYSER_OCCUPIED_RANGE = TILE * ONE;

export const gasStructureKind = (faction: Faction): number => {
  if (faction.name === 'Protoss') return Kind.Assimilator;
  if (faction.name === 'Zerg') return Kind.Extractor;
  return Kind.Refinery;
};

const gasStructureAt = (s: State, x: number, y: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const def = Units[e.kind[i]!];
    if (!def || def.resourceType !== ResourceType.Gas || (def.roles & Role.Structure) === 0) continue;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    if (dx * dx + dy * dy <= GEYSER_OCCUPIED_RANGE * GEYSER_OCCUPIED_RANGE) return true;
  }
  return false;
};

const nearestOpenGeyser = (s: State, depot: number): number => {
  const e = s.e;
  let best = NONE;
  let bestDist = Number.POSITIVE_INFINITY;
  let fallback = NONE;
  let fallbackDist = Number.POSITIVE_INFINITY;
  const bx = e.x[depot]!;
  const by = e.y[depot]!;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.Geyser || gasStructureAt(s, e.x[i]!, e.y[i]!)) continue;
    const dx = e.x[i]! - bx;
    const dy = e.y[i]! - by;
    const dist = dx * dx + dy * dy;
    if (dist < fallbackDist) {
      fallback = i;
      fallbackDist = dist;
    }
    if (!withinRangeSq(e.x[i]!, e.y[i]!, bx, by, BASE_GEYSER_TILES * TILE * ONE)) continue;
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }

  return best === NONE ? fallback : best;
};

export const queueGasStructure = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  depot: number,
): { queued: boolean; block?: StructureBlock } => {
  const kind = gasStructureKind(faction);
  const geyser = depot === NONE ? NONE : nearestOpenGeyser(s, depot);
  if (geyser === NONE) return { queued: false, block: { kind, reason: 'placement-unavailable' } };
  return queueStructureAtSpot(s, player, cmds, budget, worker, kind, { x: s.e.x[geyser]!, y: s.e.y[geyser]! });
};
