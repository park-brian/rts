// Authoritative command and placement validation. Hosts may preflight with these
// helpers for UX, but ingestion remains the source of truth.

import type { Command, CommandRejectReason } from './commands.ts';
import type { State } from './world.ts';
import { eid, isAlive, isEnemy, nearest, slotOf, NONE } from './world.ts';
import { buildable, inBounds } from './map.ts';
import { fx } from './fixed.ts';
import { Kind, MAX_QUEUE, Order, Role, TILE, Units } from './data.ts';
import { footprintsOverlap, structureFootprint, type Footprint } from './footprint.ts';
import { hasPendingBuild } from './build-cost.ts';

export type { CommandRejectReason };

export type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

export type PlacementResult =
  | { ok: true; x: number; y: number; geyser: number }
  | { ok: false; reason: CommandRejectReason };

export type ValidationContext = {
  reservedSupply?: number;
};

const RALLY_SNAP = fx(2 * TILE);

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });
const rejectPlace = (reason: CommandRejectReason): PlacementResult => ({ ok: false, reason });

const playerExists = (s: State, player: number): boolean => player >= 0 && player < s.teams.length;

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export { structureFootprint, type Footprint };

const placementBlockingKind = (s: State, slot: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[slot]!];
  if (!def) return false;
  if ((e.flags[slot]! & (Role.Structure | Role.Resource)) !== 0) return true;
  return e.kind[slot] === Kind.Geyser;
};

export const placementForStructure = (
  s: State,
  kind: number,
  x: number,
  y: number,
  ignorePendingSlot = NONE,
): PlacementResult => {
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0) return rejectPlace('missing-capability');
  const e = s.e;
  let geyser = NONE;

  if (kind === Kind.Refinery) {
    geyser = nearest(s, x, y, (sl) => e.kind[sl] === Kind.Geyser);
    if (geyser === NONE) return rejectPlace('placement-requires-geyser');
    const dx = e.x[geyser]! - x;
    const dy = e.y[geyser]! - y;
    if (dx * dx + dy * dy > RALLY_SNAP * RALLY_SNAP) return rejectPlace('placement-requires-geyser');
    x = e.x[geyser]!;
    y = e.y[geyser]!;
  }

  const fp = structureFootprint(kind, x, y);
  for (let ty = fp.y0; ty <= fp.y1; ty++) {
    for (let tx = fp.x0; tx <= fp.x1; tx++) {
      if (!inBounds(s.map, tx, ty)) return rejectPlace('placement-off-map');
      if (!buildable(s.map, tx, ty)) return rejectPlace('placement-blocked');
    }
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !placementBlockingKind(s, i)) continue;
    if (i === geyser) continue; // refinery is allowed to occupy its target geyser
    const other = structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!);
    if (footprintsOverlap(fp, other)) return rejectPlace('placement-blocked');
  }

  for (let i = 0; i < e.hi; i++) {
    if (i === ignorePendingSlot || e.alive[i] !== 1 || !hasPendingBuild(e, i)) continue;
    const other = structureFootprint(e.buildKind[i]!, e.tx[i]!, e.ty[i]!);
    if (footprintsOverlap(fp, other)) return rejectPlace('placement-blocked');
  }

  return { ok: true, x, y, geyser };
};

export const canPlaceStructure = (
  s: State,
  player: number,
  workerSlot: number,
  kind: number,
  x: number,
  y: number,
): PlacementResult => {
  if (!playerExists(s, player)) return rejectPlace('wrong-owner');
  const e = s.e;
  if (workerSlot < 0 || workerSlot >= e.hi || e.alive[workerSlot] !== 1) return rejectPlace('stale-entity');
  if (e.owner[workerSlot] !== player) return rejectPlace('wrong-owner');
  if ((e.flags[workerSlot]! & Role.Worker) === 0) return rejectPlace('missing-capability');
  return placementForStructure(s, kind, x, y, workerSlot);
};

export const validateCommand = (
  s: State,
  player: number,
  c: Command,
  ctx: ValidationContext = {},
): CommandValidation => {
  if (!playerExists(s, player)) return reject('wrong-owner');
  const e = s.e;

  switch (c.t) {
    case 'train': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Producer) === 0) return reject('missing-capability');
      if (e.built[slot] !== 1) return reject('incomplete-producer');
      const def = Units[c.kind];
      const building = Units[e.kind[slot]!];
      if (!def || !building || !building.produces.includes(c.kind)) return reject('target-not-allowed');
      const queued = e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;
      if (queued >= MAX_QUEUE) return reject('queue-full');
      if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
      const used = ctx.reservedSupply ?? s.players.supplyUsed[player]!;
      if (used + def.supply > s.players.supplyMax[player]!) return reject('supply-blocked');
      return { ok: true };
    }
    case 'build': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      const def = Units[c.kind];
      if (!def || (def.roles & Role.Structure) === 0 || (e.flags[slot]! & Role.Worker) === 0) return reject('missing-capability');
      const refundableMinerals = hasPendingBuild(e, slot) ? e.buildCostMinerals[slot]! : 0;
      const refundableGas = hasPendingBuild(e, slot) ? e.buildCostGas[slot]! : 0;
      if (s.players.minerals[player]! + refundableMinerals < def.minerals ||
          s.players.gas[player]! + refundableGas < def.gas) return reject('not-affordable');
      const placement = canPlaceStructure(s, player, slot, c.kind, c.x, c.y);
      return placement.ok ? { ok: true } : reject(placement.reason);
    }
    case 'cancelBuild': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] === 1 ||
          (e.buildCostMinerals[slot] === 0 && e.buildCostGas[slot] === 0)) {
        return reject('target-not-allowed');
      }
      return { ok: true };
    }
    case 'move':
    case 'amove': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Mobile) === 0 || (e.flags[slot]! & Role.Structure) !== 0 || Units[e.kind[slot]!]!.speed <= 0) {
        return reject('missing-capability');
      }
      return { ok: true };
    }
    case 'attack': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (!Units[e.kind[slot]!]!.weapon) return reject('missing-capability');
      if (!isAlive(e, c.target)) return reject('target-not-found');
      if (!isEnemy(s, player, e.owner[slotOf(c.target)]!)) return reject('target-not-allowed');
      return { ok: true };
    }
    case 'harvest': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Worker) === 0) return reject('missing-capability');
      if (!isAlive(e, c.patch)) return reject('target-not-found');
      const target = slotOf(c.patch);
      const isResource = (e.flags[target]! & Role.Resource) !== 0;
      if (!isResource || (e.kind[target] === Kind.Refinery && e.built[target] !== 1)) return reject('target-not-allowed');
      return { ok: true };
    }
    case 'rally': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Structure) === 0) return reject('missing-capability');
      return { ok: true };
    }
    case 'stop': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Mobile) === 0 && e.order[slot] !== Order.Build) return reject('missing-capability');
      return { ok: true };
    }
  }
};

export const snapRallyTarget = (s: State, x: number, y: number): number => {
  const e = s.e;
  const node = nearest(s, x, y, (sl) => (e.flags[sl]! & Role.Resource) !== 0);
  if (node === NONE) return NONE;
  const dx = e.x[node]! - x;
  const dy = e.y[node]! - y;
  return dx * dx + dy * dy <= RALLY_SNAP * RALLY_SNAP ? eid(e, node) : NONE;
};
