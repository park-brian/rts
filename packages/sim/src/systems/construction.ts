// Construction: a worker with a Build order walks to the site and places the
// structure (cost was paid at command time). The structure then completes over
// its build time; until then it is targetable but not yet functional (built=0).
// The worker is freed and auto-returns to mining.

import type { State } from '../entity/world.ts';
import { spawn, slotOf, eid, nearest, kill, NONE } from '../entity/world.ts';
import { Order, Role, Kind, Units, BUILD_RANGE, GAS_AMOUNT, ResourceType, TILE, tiles } from '../data.ts';
import { ONE } from '../fixed.ts';
import { navigate } from '../pathing.ts';
import { navPassable } from '../flow.ts';
import { pickPatch } from './harvest.ts';
import { faceToward, within } from './move.ts';
import { placementForStructure } from '../placement.ts';
import { structureFootprint } from '../footprint.ts';
import { clearBuildCost, refundBuildCost, transferBuildCost } from '../mechanics/refund-ledger.ts';
import { effectiveSpeed, isDisabled } from './status.ts';
import { isAddonKind } from '../mechanics/addons.ts';
import { isContained } from '../cargo.ts';
import { distanceSqToRect } from '../spatial.ts';

const becomeFoundation = (s: State, slot: number, kind: number, x: number, y: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  e.kind[slot] = kind;
  e.x[slot] = x;
  e.y[slot] = y;
  e.hp[slot] = def.hp;
  e.shield[slot] = def.shields;
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = def.startEnergy;
  e.flags[slot] = def.roles;
  e.built[slot] = 0;
  e.ctimer[slot] = def.buildTime;
  e.order[slot] = Order.Idle;
  e.buildKind[slot] = 0;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.cargo[slot] = 0;
  e.cargoType[slot] = 0;
};

const requiresBuilder = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'terran' && def.buildMethod === 'worker';
};

const nearBuildFootprint = (s: State, worker: number, structure: number): boolean => {
  const e = s.e;
  const fp = structureFootprint(e.kind[structure]!, e.x[structure]!, e.y[structure]!);
  const tileFx = TILE * ONE;
  return distanceSqToRect(
    e.x[worker]!,
    e.y[worker]!,
    fp.x0 * tileFx,
    fp.y0 * tileFx,
    (fp.x1 + 1) * tileFx,
    (fp.y1 + 1) * tileFx,
  ) <= BUILD_RANGE * BUILD_RANGE;
};

const buildApproachPoint = (s: State, worker: number, structure: number): { x: number; y: number } => {
  const e = s.e;
  const fp = structureFootprint(e.kind[structure]!, e.x[structure]!, e.y[structure]!);
  const tileFx = TILE * ONE;
  let bestX = e.x[structure]!;
  let bestY = e.y[structure]!;
  let bestD = Infinity;
  for (let ty = fp.y0 - 1; ty <= fp.y1 + 1; ty++) {
    for (let tx = fp.x0 - 1; tx <= fp.x1 + 1; tx++) {
      if (tx > fp.x0 - 1 && tx < fp.x1 + 1 && ty > fp.y0 - 1 && ty < fp.y1 + 1) continue;
      if (!navPassable(s, tx, ty)) continue;
      const x = tx * tileFx + (tileFx >> 1);
      const y = ty * tileFx + (tileFx >> 1);
      const dx = x - e.x[worker]!;
      const dy = y - e.y[worker]!;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestX = x; bestY = y; }
    }
  }
  return { x: bestX, y: bestY };
};

const releaseWorker = (s: State, worker: number): void => {
  const e = s.e;
  e.buildKind[worker] = 0;
  const node = (e.flags[worker]! & Role.Worker) !== 0
    ? pickPatch(s, worker, e.owner[worker]!, Units[e.kind[worker]!]!.speed)
    : NONE;
  if (node !== NONE) {
    e.order[worker] = Order.Harvest;
    e.target[worker] = eid(e, node);
    e.intentTarget[worker] = NONE;
  } else {
    e.order[worker] = Order.Idle;
    e.target[worker] = NONE;
    e.intentTarget[worker] = NONE;
  }
};

const activeBuilder = (s: State, structure: number): number => {
  const e = s.e;
  const id = e.target[structure]!;
  if (id === NONE) return NONE;
  const worker = slotOf(id);
  if (e.alive[worker] !== 1 || isContained(s, worker) || e.order[worker] !== Order.Build || e.target[worker] !== eid(e, structure)) return NONE;
  if (!nearBuildFootprint(s, worker, structure)) return NONE;
  return worker;
};

export const construction = (s: State): void => {
  const e = s.e;

  // 1) Workers heading to a build site.
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || e.order[i] !== Order.Build) continue;
    if (isDisabled(e, i)) continue;
    const speed = effectiveSpeed(s, e, i, Units[e.kind[i]!]!.speed);
    if (e.buildKind[i] === Kind.None) {
      if (e.target[i] === NONE || e.alive[slotOf(e.target[i]!)] !== 1) {
        e.order[i] = Order.Idle;
        e.target[i] = NONE;
        e.intentTarget[i] = NONE;
        e.combatTarget[i] = NONE;
        continue;
      }
      const st = slotOf(e.target[i]!);
      faceToward(e, i, e.x[st]!, e.y[st]!);
      if (!nearBuildFootprint(s, i, st)) {
        const p = buildApproachPoint(s, i, st);
        navigate(s, i, p.x, p.y, speed);
      }
      continue;
    }
    const dx = e.tx[i]! - e.x[i]!;
    const dy = e.ty[i]! - e.y[i]!;
    faceToward(e, i, e.tx[i]!, e.ty[i]!);
    if (dx * dx + dy * dy <= BUILD_RANGE * BUILD_RANGE) {
      const kind = e.buildKind[i]!;
      const def = Units[kind]!;
      const placement = placementForStructure(s, kind, e.tx[i]!, e.ty[i]!, i, e.owner[i]!);
      if (!placement.ok) {
        refundBuildCost(s, i);
        e.order[i] = Order.Idle;
        e.buildKind[i] = 0;
        e.target[i] = NONE;
        e.intentTarget[i] = NONE;
        e.combatTarget[i] = NONE;
        continue;
      }
      if (def.buildMethod === 'morph' && e.kind[i] === Kind.Drone) {
        becomeFoundation(s, i, kind, placement.x, placement.y);
        continue;
      }
      if (e.freeTop <= 0) {
        refundBuildCost(s, i);
        e.order[i] = Order.Idle;
        e.buildKind[i] = 0;
        e.target[i] = NONE;
        e.intentTarget[i] = NONE;
        e.combatTarget[i] = NONE;
        continue;
      }
      const id = spawn(s, kind, e.owner[i]!, placement.x, placement.y, def.hp, def.roles, def.shields, def.energyMax, def.startEnergy);
      const st = slotOf(id);
      e.built[st] = 0;
      e.ctimer[st] = def.buildTime;
      transferBuildCost(e, i, st);
      if (requiresBuilder(kind)) {
        e.buildKind[i] = 0;
        e.target[i] = id;
        e.target[st] = eid(e, i);
        e.tx[i] = placement.x;
        e.ty[i] = placement.y;
      } else {
        // Protoss warp-in frees the worker; auto-return to the nearest free resource.
        releaseWorker(s, i);
      }
    } else {
      navigate(s, i, e.tx[i]!, e.ty[i]!, speed);
    }
  }

  // 2) Structures finishing construction.
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] === 1) continue;
    const def = Units[e.kind[i]!]!;
    if (requiresBuilder(e.kind[i]!) && activeBuilder(s, i) === NONE) continue;
    if (e.ctimer[i]! > 0) {
      e.ctimer[i] = e.ctimer[i]! - 1;
      if (e.ctimer[i]! <= 0) {
        e.built[i] = 1;
        const worker = activeBuilder(s, i);
        if (worker !== NONE) releaseWorker(s, worker);
        if (!isAddonKind(e.kind[i]!)) {
          e.target[i] = NONE;
          e.intentTarget[i] = NONE;
          e.combatTarget[i] = NONE;
        }
        e.morphFromKind[i] = Kind.None;
        clearBuildCost(e, i);
        // A finished gas structure consumes its geyser and starts holding gas to harvest.
        if (def.requiresGeyser && def.resourceType === ResourceType.Gas) {
          const gy = nearest(s, e.x[i]!, e.y[i]!, (sl) => e.kind[sl] === Kind.Geyser);
          if (gy !== NONE && within(e, i, e.x[gy]!, e.y[gy]!, tiles(2))) { e.cargo[i] = GAS_AMOUNT; kill(s, gy); }
        }
      }
    }
  }
};
