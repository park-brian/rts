import { GAS_MINE_TICKS, MAX_PER_PATCH, MINE_TICKS, Order, ResourceType, Role, Units } from '../data/index.ts';
import { entityApproachPoint } from '../entity/approach.ts';
import { isContained, sameTeam } from './cargo.ts';
import { isAlive, nearest, slotOf, NONE, type State } from '../entity/world.ts';
import { isqrt } from '../fixed.ts';
import type { InteractionPoint } from '../spatial/geometry.ts';

export const isGatherTargetSlot = (s: State, slot: number): boolean => {
  const e = s.e;
  if (slot === NONE || slot < 0 || slot >= e.hi || e.alive[slot] !== 1 || isContained(s, slot)) return false;
  if ((e.flags[slot]! & Role.Resource) === 0) return false;
  const def = Units[e.kind[slot]!];
  if (!def || (def.resourceType !== ResourceType.Minerals && def.resourceType !== ResourceType.Gas)) return false;
  return def.resourceType !== ResourceType.Gas || e.built[slot] === 1;
};

export const isGatherTarget = (s: State, id: number): boolean =>
  id !== NONE && isAlive(s.e, id) && isGatherTargetSlot(s, slotOf(id));

export const canPlayerGatherTargetSlot = (s: State, player: number, slot: number): boolean => {
  if (!isGatherTargetSlot(s, slot)) return false;
  const def = Units[s.e.kind[slot]!];
  return def?.resourceType === ResourceType.Minerals || sameTeam(s, player, s.e.owner[slot]!);
};

export const canPlayerGatherTarget = (s: State, player: number, id: number): boolean =>
  id !== NONE && isAlive(s.e, id) && canPlayerGatherTargetSlot(s, player, slotOf(id));

export const resourceDockingPoint = (
  s: State,
  worker: number,
  target: number,
  approachX: number,
  approachY: number,
): InteractionPoint =>
  entityApproachPoint(s, worker, target, approachX, approachY);

export const mineTicksFor = (s: State, node: number): number =>
  Units[s.e.kind[node]!]!.resourceType === ResourceType.Gas ? GAS_MINE_TICKS : MINE_TICKS;

const dockDistance = (a: InteractionPoint, b: InteractionPoint): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return isqrt(dx * dx + dy * dy);
};

/** Workers (excluding `except`) currently assigned to harvest node slot `node`. */
const minersOn = (s: State, node: number, owner: number, except: number): number => {
  const e = s.e;
  let n = 0;
  for (let i = 0; i < e.hi; i++) {
    if (i === except || e.alive[i] !== 1 || isContained(s, i) || e.owner[i] !== owner) continue;
    if ((e.flags[i]! & Role.Worker) === 0 || e.order[i] !== Order.Harvest) continue;
    if (isGatherTarget(s, e.target[i]!) && slotOf(e.target[i]!) === node) n++;
  }
  return n;
};

/** Saturation cap of a patch, derived from its round-trip-to-depot vs mine time. */
const patchCap = (s: State, worker: number, node: number, owner: number, speed: number): number => {
  const e = s.e;
  const depot = nearest(s, e.x[node]!, e.y[node]!, (sl) => (e.flags[sl]! & Role.ResourceDepot) !== 0 && e.owner[sl] === owner);
  if (depot === NONE || speed <= 0) return MAX_PER_PATCH;
  const mineDock = resourceDockingPoint(s, worker, node, e.x[depot]!, e.y[depot]!);
  const depotDock = resourceDockingPoint(s, worker, depot, e.x[node]!, e.y[node]!);
  const travel = dockDistance(mineDock, depotDock);
  const roundTrip = (2 * travel) / speed; // ticks (fixed-px / fixed-px-per-tick)
  const cap = 1 + Math.round(roundTrip / mineTicksFor(s, node));
  return Math.max(2, Math.min(MAX_PER_PATCH, cap));
};

export const shouldSpreadExplicitMineralTarget = (
  s: State,
  worker: number,
  node: number,
  owner: number,
  speed: number,
): boolean => {
  const e = s.e;
  return e.timer[worker]! === 0 &&
    e.cargo[worker]! === 0 &&
    Units[e.kind[node]!]!.resourceType === ResourceType.Minerals &&
    minersOn(s, node, owner, worker) >= patchCap(s, worker, node, owner, speed);
};

/**
 * Pick the best free mineral patch for a worker: fewest miners first (spread),
 * then nearest to (fromX,fromY). Skips patches at their derived cap; if all are
 * saturated, returns the nearest anyway so the worker never idles.
 */
export const pickPatch = (
  s: State,
  slot: number,
  owner: number,
  speed: number,
  fromX = s.e.x[slot]!,
  fromY = s.e.y[slot]!,
): number => {
  const e = s.e;
  let best = NONE;
  let bestCount = Infinity;
  let bestD = Infinity;
  let near = NONE;
  let nearD = Infinity;
  for (let i = 0; i < e.hi; i++) {
    // Auto-mining considers mineral patches only; gas is assigned by command.
    if (!isGatherTargetSlot(s, i) || Units[e.kind[i]!]!.resourceType !== ResourceType.Minerals) continue;
    const dx = e.x[i]! - fromX;
    const dy = e.y[i]! - fromY;
    const d = dx * dx + dy * dy;
    if (d < nearD) {
      nearD = d;
      near = i;
    }
    const count = minersOn(s, i, owner, slot);
    if (count >= patchCap(s, slot, i, owner, speed)) continue;
    if (count < bestCount || (count === bestCount && d < bestD)) {
      bestCount = count;
      bestD = d;
      best = i;
    }
  }
  return best !== NONE ? best : near;
};
