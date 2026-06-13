// Harvest: the worker economy, role-driven (no unit kinds). A harvesting worker
// cycles: go to a patch → mine → carry → return to a depot → deposit → repeat.
//
// Mineral mechanics (SC1 timing, SC2 smoothness):
//  - A patch is *reserved* while a worker is mid-extraction (its mine timer is
//    running). Only one worker extracts at a time; others at the same patch wait
//    their turn — that rotation is the reservation, derived from state (no lock
//    column to go stale), and deterministic via ascending-slot processing.
//  - Saturation cap is *derived from timing*, not hardcoded: while one worker mines
//    (occupying the patch for MINE_TICKS), others are in transit, so a patch keeps
//    ~`1 + roundTrip/MINE_TICKS` workers busy without idling — ≈3 at default base
//    distance, scaling with how far the patch is from the depot.
//  - Workers are assigned to the patch with the fewest miners (then nearest), so a
//    base spreads one-per-patch first and only doubles up toward the cap once full.
//  - If a worker's patch depletes or vanishes, it re-routes to the nearest free one.

import type { State } from '../world.ts';
import { slotOf, eid, nearest, kill, isAlive, NONE } from '../world.ts';
import { Order, Role, ResourceType, Units, MINE_AMOUNT, MINE_TICKS, MINE_RANGE, DEPOSIT_RANGE, MAX_PER_PATCH } from '../data.ts';
import { isqrt } from '../fixed.ts';
import { within } from './move.ts';
import { navigate } from '../pathing.ts';

export const isResource = (e: State['e'], id: number): boolean =>
  isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Resource) !== 0;

/** Workers (excluding `except`) currently assigned to harvest node slot `node`. */
const minersOn = (s: State, node: number, owner: number, except: number): number => {
  const e = s.e;
  let n = 0;
  for (let i = 0; i < e.hi; i++) {
    if (i === except || e.alive[i] !== 1 || e.owner[i] !== owner) continue;
    if ((e.flags[i]! & Role.Worker) === 0 || e.order[i] !== Order.Harvest) continue;
    if (isResource(e, e.target[i]!) && slotOf(e.target[i]!) === node) n++;
  }
  return n;
};

/** True if another worker is mid-extraction on `node` (the patch is reserved this tick). */
const nodeBusy = (s: State, node: number, except: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (i === except || e.alive[i] !== 1) continue;
    if ((e.flags[i]! & Role.Worker) === 0 || e.order[i] !== Order.Harvest || e.timer[i]! <= 0) continue;
    if (isResource(e, e.target[i]!) && slotOf(e.target[i]!) === node) return true;
  }
  return false;
};

/** Saturation cap of a patch, derived from its round-trip-to-depot vs mine time. */
const patchCap = (s: State, node: number, owner: number, speed: number): number => {
  const e = s.e;
  const depot = nearest(s, e.x[node]!, e.y[node]!, (sl) => (e.flags[sl]! & Role.ResourceDepot) !== 0 && e.owner[sl] === owner);
  if (depot === NONE || speed <= 0) return MAX_PER_PATCH;
  const dx = e.x[depot]! - e.x[node]!; const dy = e.y[depot]! - e.y[node]!;
  const roundTrip = (2 * isqrt(dx * dx + dy * dy)) / speed; // ticks (fixed-px / fixed-px-per-tick)
  const cap = 1 + Math.round(roundTrip / MINE_TICKS);
  return Math.max(2, Math.min(MAX_PER_PATCH, cap));
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
    if (e.alive[i] !== 1 || (e.flags[i]! & Role.Resource) === 0) continue;
    const dx = e.x[i]! - fromX; const dy = e.y[i]! - fromY;
    const d = dx * dx + dy * dy;
    if (d < nearD) { nearD = d; near = i; }
    const count = minersOn(s, i, owner, slot);
    if (count >= patchCap(s, i, owner, speed)) continue;
    if (count < bestCount || (count === bestCount && d < bestD)) { bestCount = count; bestD = d; best = i; }
  }
  return best !== NONE ? best : near;
};

export const harvest = (s: State): void => {
  const e = s.e;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || (e.flags[i]! & Role.Worker) === 0 || e.order[i] !== Order.Harvest) continue;
    const owner = e.owner[i]!;
    const speed = Units[e.kind[i]!]!.speed;

    if (e.cargo[i]! > 0) {
      // Returning: deliver to the nearest owned resource depot.
      const depot = nearest(s, e.x[i]!, e.y[i]!, (sl) => (e.flags[sl]! & Role.ResourceDepot) !== 0 && e.owner[sl] === owner);
      if (depot === NONE) { e.order[i] = Order.Idle; continue; }
      if (within(e, i, e.x[depot]!, e.y[depot]!, DEPOSIT_RANGE)) {
        const pool = e.cargoType[i]! === ResourceType.Gas ? s.players.gas : s.players.minerals;
        pool[owner] = pool[owner]! + e.cargo[i]!;
        e.cargo[i] = 0;
        e.timer[i] = 0;
        if (!isResource(e, e.target[i]!)) {
          const np = pickPatch(s, i, owner, speed);
          e.target[i] = np === NONE ? NONE : eid(e, np);
        }
      } else {
        navigate(s, i, e.x[depot]!, e.y[depot]!, speed);
      }
      continue;
    }

    // Going to mine: ensure we have a live patch assigned.
    if (!isResource(e, e.target[i]!)) {
      const np = pickPatch(s, i, owner, speed);
      if (np === NONE) { e.order[i] = Order.Idle; e.target[i] = NONE; continue; }
      e.target[i] = eid(e, np);
    }
    const node = slotOf(e.target[i]!);
    if (within(e, i, e.x[node]!, e.y[node]!, MINE_RANGE)) {
      if (e.timer[i]! > 0) {
        // We hold the patch (reserved): extract.
        e.timer[i] = e.timer[i]! - 1;
        if (e.timer[i]! === 0) {
          const taken = Math.min(MINE_AMOUNT, e.cargo[node]!);
          e.cargo[node] = e.cargo[node]! - taken;
          e.cargo[i] = taken;
          e.cargoType[i] = Units[e.kind[node]!]!.resourceType;
          if (e.cargo[node]! <= 0) kill(s, node);
        }
      } else if (!nodeBusy(s, node, i)) {
        e.timer[i] = MINE_TICKS; // patch free → reserve it and begin mining
      }
      // else: another worker is mining here — wait our turn (hold position).
    } else {
      navigate(s, i, e.x[node]!, e.y[node]!, speed);
    }
  }
};
