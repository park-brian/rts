// Harvest: the worker economy, role-driven (no unit kinds). A harvesting worker
// cycles: go to a patch → mine → carry → return to a depot → deposit → repeat.
//
// Mineral mechanics (SC1 timing, SC2 smoothness):
//  - A patch is *reserved* while a worker is mid-extraction (its mine timer is
//    running). Only one worker extracts at a time; others at the same patch wait
//    their turn — that rotation is the reservation, derived from state (no lock
//    column to go stale), and deterministic via ascending-slot processing.
//  - Saturation cap is *derived from timing*, not hardcoded: while one worker mines,
//    others are in transit, so a patch keeps ~`1 + roundTrip/mineTicks` workers busy
//    without idling — ≈2 at default base distance, scaling with how far the patch is
//    from the depot.
//  - Workers are assigned to the patch with the fewest miners (then nearest), so a
//    base spreads one-per-patch first and only doubles up toward the cap once full.
//  - If a worker's patch depletes or vanishes, it re-routes to the nearest free one.

import type { State } from '../entity/world.ts';
import { CAP, slotOf, eid, nearest, kill, NONE } from '../entity/world.ts';
import { Order, Role, ResourceType, Units, MINE_AMOUNT, MINE_TICKS, GAS_MINE_TICKS, MAX_PER_PATCH } from '../data/index.ts';
import { clearVelocity, faceToward } from '../spatial/motion.ts';
import { navigate } from '../spatial/pathing.ts';
import { effectiveSpeed, isDisabled } from '../mechanics/status.ts';
import { isContained } from '../mechanics/cargo.ts';
import { fx, isqrt } from '../fixed.ts';
import { withinTopDownEdgeRange, type InteractionPoint } from '../spatial/geometry.ts';
import { entityApproachPoint } from '../entity/approach.ts';
import { canPlayerGatherTarget, isGatherTarget, isGatherTargetSlot } from '../mechanics/resources.ts';

const HARVEST_DOCK_EPSILON = fx(1);

// Per-tick scratch (transient; never hashed/cloned). mineLock[node] = the worker
// mid-extraction there (or -1); depotList = drop-off points. Both let the per-worker
// work in the loop be O(1)/O(depots) instead of an O(workers) rescan each.
const mineLock = new Int32Array(CAP);
const depotList = new Int32Array(CAP);

const resourceSlotFromTarget = (s: State, id: number): number => {
  if (id === NONE) return NONE;
  return isGatherTarget(s, id) ? slotOf(id) : NONE;
};

const workerTargetIsGatherable = (s: State, worker: number): boolean =>
  canPlayerGatherTarget(s, s.e.owner[worker]!, s.e.target[worker]!);

const dockingPoint = (
  s: State,
  worker: number,
  target: number,
  approachX: number,
  approachY: number,
): InteractionPoint => {
  const e = s.e;
  return entityApproachPoint(s, worker, target, approachX, approachY);
};

const atDockingPoint = (s: State, worker: number, target: number, p: InteractionPoint): boolean => {
  const e = s.e;
  const dx = e.x[worker]! - p.x;
  const dy = e.y[worker]! - p.y;
  return dx === 0 && dy === 0 && withinTopDownEdgeRange(s, worker, target, HARVEST_DOCK_EPSILON);
};

const dockDistance = (a: InteractionPoint, b: InteractionPoint): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return isqrt(dx * dx + dy * dy);
};

const mineTicksFor = (s: State, node: number): number =>
  Units[s.e.kind[node]!]!.resourceType === ResourceType.Gas ? GAS_MINE_TICKS : MINE_TICKS;

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
  const mineDock = dockingPoint(s, worker, node, e.x[depot]!, e.y[depot]!);
  const depotDock = dockingPoint(s, worker, depot, e.x[node]!, e.y[node]!);
  const travel = dockDistance(mineDock, depotDock);
  const roundTrip = (2 * travel) / speed; // ticks (fixed-px / fixed-px-per-tick)
  const cap = 1 + Math.round(roundTrip / mineTicksFor(s, node));
  return Math.max(2, Math.min(MAX_PER_PATCH, cap));
};

const shouldSpreadExplicitMineralTarget = (s: State, worker: number, node: number, owner: number, speed: number): boolean => {
  const e = s.e;
  return e.timer[worker]! === 0 &&
    e.cargo[worker]! === 0 &&
    Units[e.kind[node]!]!.resourceType === ResourceType.Minerals &&
    minersOn(s, node, owner, worker) >= patchCap(s, worker, node, owner, speed);
};

/**
 * Pick the best free patch for a worker: fewest miners first (spread), then nearest
 * to (fromX,fromY). Skips patches at their derived cap; if all are saturated, returns
 * the nearest anyway so the worker never idles. `from*` lets a rally point bias the
 * choice (default: the worker's own position).
 */
export const pickPatch = (
  s: State, slot: number, owner: number, speed: number, fromX = s.e.x[slot]!, fromY = s.e.y[slot]!,
): number => {
  const e = s.e;
  let best = NONE; let bestCount = Infinity; let bestD = Infinity;
  let near = NONE; let nearD = Infinity;
  for (let i = 0; i < e.hi; i++) {
    // Auto-mining considers mineral patches only; gas (geysers/refineries) is assigned by command.
    if (!isGatherTargetSlot(s, i) || Units[e.kind[i]!]!.resourceType !== ResourceType.Minerals) continue;
    const dx = e.x[i]! - fromX; const dy = e.y[i]! - fromY;
    const d = dx * dx + dy * dy;
    if (d < nearD) { nearD = d; near = i; }
    const count = minersOn(s, i, owner, slot);
    if (count >= patchCap(s, slot, i, owner, speed)) continue;
    if (count < bestCount || (count === bestCount && d < bestD)) { bestCount = count; bestD = d; best = i; }
  }
  return best !== NONE ? best : near;
};

export const harvest = (s: State): void => {
  const e = s.e;

  // Pre-passes (each O(entities) once): node reservations + the drop-off list, so
  // the per-worker checks below are O(1)/O(depots), not an O(workers) rescan each.
  mineLock.fill(-1, 0, e.hi);
  let nDepots = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i)) continue;
    if ((e.flags[i]! & Role.ResourceDepot) !== 0) depotList[nDepots++] = i;
    if ((e.flags[i]! & Role.Worker) !== 0 && e.order[i] === Order.Harvest && e.timer[i]! > 0 && isGatherTarget(s, e.target[i]!)) {
      mineLock[slotOf(e.target[i]!)] = i;
    }
  }
  const nearestDepot = (x: number, y: number, owner: number): number => {
    let best = NONE; let bd = Infinity;
    for (let k = 0; k < nDepots; k++) {
      const d = depotList[k]!;
      if (e.owner[d] !== owner) continue;
      const dx = e.x[d]! - x; const dy = e.y[d]! - y; const dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  };

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || (e.flags[i]! & Role.Worker) === 0 || e.order[i] !== Order.Harvest) continue;
    if (isDisabled(e, i)) continue;
    const owner = e.owner[i]!;
    const speed = effectiveSpeed(s, e, i, Units[e.kind[i]!]!.speed);

    if (e.cargo[i]! > 0) {
      // Returning: deliver to the nearest owned resource depot.
      const depot = nearestDepot(e.x[i]!, e.y[i]!, owner);
      if (depot === NONE) { e.order[i] = Order.Idle; continue; }
      const source = resourceSlotFromTarget(s, e.target[i]!);
      const approachX = source === NONE ? e.x[i]! : e.x[source]!;
      const approachY = source === NONE ? e.y[i]! : e.y[source]!;
      const dock = dockingPoint(s, i, depot, approachX, approachY);
      faceToward(e, i, e.x[depot]!, e.y[depot]!);
      if (atDockingPoint(s, i, depot, dock)) {
        clearVelocity(e, i);
        const pool = e.cargoType[i]! === ResourceType.Gas ? s.players.gas : s.players.minerals;
        pool[owner] = pool[owner]! + e.cargo[i]!;
        e.cargo[i] = 0;
        e.timer[i] = 0;
        if (!workerTargetIsGatherable(s, i)) {
          const np = pickPatch(s, i, owner, speed);
          e.target[i] = np === NONE ? NONE : eid(e, np);
        }
      } else {
        navigate(s, i, dock.x, dock.y, speed);
      }
      continue;
    }

    // Going to mine: ensure we have a live patch assigned.
    if (!workerTargetIsGatherable(s, i)) {
      const np = pickPatch(s, i, owner, speed);
      if (np === NONE) { e.order[i] = Order.Idle; e.target[i] = NONE; continue; }
      e.target[i] = eid(e, np);
    }
    let node = slotOf(e.target[i]!);
    if (shouldSpreadExplicitMineralTarget(s, i, node, owner, speed)) {
      const np = pickPatch(s, i, owner, speed, e.x[node]!, e.y[node]!);
      if (np !== NONE && np !== node) {
        e.target[i] = eid(e, np);
        node = np;
      }
    }
    const depot = nearestDepot(e.x[node]!, e.y[node]!, owner);
    const approachX = depot === NONE ? e.x[i]! : e.x[depot]!;
    const approachY = depot === NONE ? e.y[i]! : e.y[depot]!;
    const dock = dockingPoint(s, i, node, approachX, approachY);
    faceToward(e, i, e.x[node]!, e.y[node]!);
    if (atDockingPoint(s, i, node, dock)) {
      clearVelocity(e, i);
      if (e.timer[i]! > 0) {
        // We hold the patch (reserved): extract.
        e.timer[i] = e.timer[i]! - 1;
        if (e.timer[i]! === 0) {
          const taken = Math.min(MINE_AMOUNT, e.cargo[node]!);
          e.cargo[node] = e.cargo[node]! - taken;
          e.cargo[i] = taken;
          e.cargoType[i] = Units[e.kind[node]!]!.resourceType;
          mineLock[node] = -1; // done extracting → release for a waiting worker
          if (e.cargo[node]! <= 0) kill(s, node);
        }
      } else if (mineLock[node] === -1) {
        e.timer[i] = mineTicksFor(s, node); mineLock[node] = i; // patch free → reserve it and begin mining
      }
      // else: another worker is mining here — wait our turn (hold position).
    } else {
      if (e.timer[i]! > 0) {
        if (mineLock[node] === i) mineLock[node] = -1;
        e.timer[i] = 0;
      }
      navigate(s, i, dock.x, dock.y, speed);
    }
  }
};
