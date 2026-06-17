// Authoritative command and placement validation. Hosts may preflight with these
// helpers for UX, but ingestion remains the source of truth.

import type { Command, CommandRejectReason } from './commands.ts';
import type { State } from './world.ts';
import { eid, isAlive, isEnemy, nearest, slotOf, NONE } from './world.ts';
import { buildable, inBounds } from './map.ts';
import { fx } from './fixed.ts';
import {
  Ability, Abilities, Kind, MAX_QUEUE, Order, ResourceType, Role, TECH_CAP, Tech, TechDefs, TILE, Units,
  hasAnyWeapon, isLarvaSourceKind, productionCostCount, productionCount, tiles, unitTraits, weaponForTarget,
  workerBuildKindsFor,
} from './data.ts';
import { addonParentKind, addonPosition, isAddonKind } from './addon.ts';
import { footprintsOverlap, snapBuildAnchor, structureFootprint, type Footprint } from './footprint.ts';
import { hasPendingBuild } from './build-cost.ts';
import { canDetect } from './detection.ts';
import { hasPowerAt, isPowered, requiresPower } from './power.ts';
import { REPAIR_RATE, canContinueConstructionKind, isRepairableKind, repairCost } from './repair.ts';
import { isDisabled } from './systems/status.ts';
import { commandMoveSpeed, isLiftableTerranStructureKind, isLiftedStructureFlags } from './terran-mobility.ts';
import { getTechLevel, isTechInProgress, nextTechLevel, techGas, techMinerals } from './tech.ts';
import { internalAmmoCapacity } from './derived.ts';
import { mergePartnerFor, transformFor } from './unit-transform.ts';
import { canBurrowSlot, canUseWeaponNow, hasBurrowAccess } from './burrow.ts';
import {
  LOAD_RANGE, UNLOAD_RANGE, canLoadInto, cargoUsed, containedBy, isContained, sameTeam,
  transportCapacity, unloadAnchorSlot, unloadPassable,
} from './cargo.ts';

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
const CREEP_RADIUS = tiles(10);

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const canRallyToSlot = (s: State, player: number, source: number, target: number): boolean => {
  const e = s.e;
  if (target === source || e.alive[target] !== 1 || isContained(s, target)) return false;
  if ((e.flags[target]! & Role.Resource) !== 0) return true;
  return sameTeam(s, player, e.owner[target]!);
};

const withinRallySnap = (s: State, slot: number, x: number, y: number): boolean => {
  const e = s.e;
  const dx = e.x[slot]! - x;
  const dy = e.y[slot]! - y;
  return dx * dx + dy * dy <= RALLY_SNAP * RALLY_SNAP;
};
const rejectPlace = (reason: CommandRejectReason): PlacementResult => ({ ok: false, reason });
const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

const playerExists = (s: State, player: number): boolean => player >= 0 && player < s.teams.length;

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

const usableTransportSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  if (e.owner[slot] === player) return slot;
  return e.kind[slot] === Kind.NydusCanal && sameTeam(s, player, e.owner[slot]!) ? slot : null;
};

export { snapBuildAnchor, structureFootprint, type Footprint };

const placementBlockingKind = (s: State, slot: number): boolean => {
  const e = s.e;
  if (isContained(s, slot)) return false;
  const def = Units[e.kind[slot]!];
  if (!def) return false;
  if ((e.flags[slot]! & Role.Air) !== 0) return false;
  if ((e.flags[slot]! & (Role.Structure | Role.Resource)) !== 0) return true;
  return e.kind[slot] === Kind.Geyser;
};

const hasCompletedKind = (s: State, player: number, kind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === kind && e.built[i] === 1) return true;
  }
  return false;
};

const requirementsMet = (s: State, player: number, requirements: number[]): boolean => {
  for (const req of requirements) if (!hasCompletedKind(s, player, req)) return false;
  return true;
};

const validTechId = (tech: number): boolean => Number.isInteger(tech) && tech > 0 && tech < TECH_CAP;

const hasReadyNuke = (s: State, player: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === Kind.NuclearMissile && e.built[i] === 1) return true;
  }
  return false;
};

const canBuildWithWorker = (workerKind: number, structureKind: number): boolean => {
  const worker = Units[workerKind];
  const structure = Units[structureKind];
  if (!worker || worker.race !== structure.race) return false;
  return workerBuildKindsFor(worker.race).includes(structureKind);
};

const providesCreep = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'zerg' && (def.roles & Role.Structure) !== 0 && kind !== Kind.Extractor;
};

const requiresCreep = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'zerg' && (def.roles & Role.Structure) !== 0 && !isLarvaSourceKind(kind) && kind !== Kind.Extractor;
};

const hasCreepAt = (s: State, player: number, x: number, y: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || !providesCreep(e.kind[i]!)) continue;
    if (distSq(e.x[i]!, e.y[i]!, x, y) <= CREEP_RADIUS * CREEP_RADIUS) return true;
  }
  return false;
};

export const placementForStructure = (
  s: State,
  kind: number,
  x: number,
  y: number,
  ignorePendingSlot = NONE,
  player = NONE,
): PlacementResult => {
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0) return rejectPlace('missing-capability');
  const e = s.e;
  let geyser = NONE;

  if (def.requiresGeyser) {
    geyser = nearest(s, x, y, (sl) => e.kind[sl] === Kind.Geyser);
    if (geyser === NONE) return rejectPlace('placement-requires-geyser');
    const dx = e.x[geyser]! - x;
    const dy = e.y[geyser]! - y;
    if (dx * dx + dy * dy > RALLY_SNAP * RALLY_SNAP) return rejectPlace('placement-requires-geyser');
    x = e.x[geyser]!;
    y = e.y[geyser]!;
  } else {
    const snapped = snapBuildAnchor(x, y);
    x = snapped.x;
    y = snapped.y;
  }

  if (player !== NONE && requiresCreep(kind) && !hasCreepAt(s, player, x, y)) return rejectPlace('placement-blocked');
  if (player !== NONE && requiresPower(kind) && !hasPowerAt(s, player, x, y)) return rejectPlace('placement-blocked');

  const fp = structureFootprint(kind, x, y);
  for (let ty = fp.y0; ty <= fp.y1; ty++) {
    for (let tx = fp.x0; tx <= fp.x1; tx++) {
      if (!inBounds(s.map, tx, ty)) return rejectPlace('placement-off-map');
      if (!buildable(s.map, tx, ty)) return rejectPlace('placement-blocked');
    }
  }

  for (let i = 0; i < e.hi; i++) {
    if (i === ignorePendingSlot) continue;
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
  return placementForStructure(s, kind, x, y, workerSlot, player);
};

export const canWorkerStartStructure = (
  s: State,
  player: number,
  workerSlot: number,
  kind: number,
): CommandValidation => {
  if (!playerExists(s, player)) return reject('wrong-owner');
  const e = s.e;
  if (workerSlot < 0 || workerSlot >= e.hi || e.alive[workerSlot] !== 1) return reject('stale-entity');
  if (e.owner[workerSlot] !== player) return reject('wrong-owner');
  if (isContained(s, workerSlot) || e.burrowed[workerSlot] === 1) return reject('missing-capability');
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0 || (e.flags[workerSlot]! & Role.Worker) === 0 ||
      !canBuildWithWorker(e.kind[workerSlot]!, kind)) {
    return reject('missing-capability');
  }
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  return { ok: true };
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
      if (!isPowered(s, slot)) return reject('missing-capability');
      const def = Units[c.kind];
      const building = Units[e.kind[slot]!];
      if (!def || !building || !building.produces.includes(c.kind)) return reject('target-not-allowed');
      if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
      const queued = e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;
      const internalCapacity = internalAmmoCapacity(s, slot, c.kind);
      if (internalCapacity > 0 && e.specialAmmo[slot]! + queued >= internalCapacity) {
        return reject('queue-full');
      }
      if (queued >= MAX_QUEUE) return reject('queue-full');
      const costCount = productionCostCount(c.kind);
      if (s.players.minerals[player]! < def.minerals * costCount || s.players.gas[player]! < def.gas * costCount) return reject('not-affordable');
      const used = ctx.reservedSupply ?? s.players.supplyUsed[player]!;
      if (used + def.supply * productionCount(c.kind) > s.players.supplyMax[player]!) return reject('supply-blocked');
      return { ok: true };
    }
    case 'research': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Structure) === 0) return reject('missing-capability');
      if (e.built[slot] !== 1) return reject('incomplete-producer');
      if (isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
      if (!isPowered(s, slot)) return reject('missing-capability');
      if (e.researchKind[slot] !== Kind.None) return reject('queue-full');
      if (!validTechId(c.tech)) return reject('target-not-allowed');
      const def = TechDefs[c.tech];
      if (!def || !def.producers.includes(e.kind[slot]!)) return reject('target-not-allowed');
      if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
      if (isTechInProgress(s, player, c.tech) || getTechLevel(s, player, c.tech) >= def.maxLevel) return reject('target-not-allowed');
      const level = nextTechLevel(s, player, c.tech);
      if (s.players.minerals[player]! < techMinerals(def, level) || s.players.gas[player]! < techGas(def, level)) return reject('not-affordable');
      return { ok: true };
    }
    case 'build': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      const def = Units[c.kind];
      const buildableByWorker = canWorkerStartStructure(s, player, slot, c.kind);
      if (!buildableByWorker.ok) return buildableByWorker;
      const refundableMinerals = hasPendingBuild(e, slot) ? e.buildCostMinerals[slot]! : 0;
      const refundableGas = hasPendingBuild(e, slot) ? e.buildCostGas[slot]! : 0;
      if (s.players.minerals[player]! + refundableMinerals < def.minerals ||
          s.players.gas[player]! + refundableGas < def.gas) return reject('not-affordable');
      const placement = canPlaceStructure(s, player, slot, c.kind, c.x, c.y);
      return placement.ok ? { ok: true } : reject(placement.reason);
    }
    case 'addon': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
      if (isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
      const def = Units[c.kind];
      if (!def || !isAddonKind(c.kind) || addonParentKind(c.kind) !== e.kind[slot]) return reject('target-not-allowed');
      if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('queue-full');
      if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
      if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
      const pos = addonPosition(s, slot, c.kind);
      const placement = placementForStructure(s, c.kind, pos.x, pos.y, NONE, player);
      return placement.ok ? { ok: true } : reject(placement.reason);
    }
    case 'lift': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
      if (!isLiftableTerranStructureKind(e.kind[slot]!) || isLiftedStructureFlags(e.flags[slot]!)) return reject('target-not-allowed');
      if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('target-not-allowed');
      if (e.prodKind[slot] !== Kind.None || e.researchKind[slot] !== Kind.None) return reject('queue-full');
      return { ok: true };
    }
    case 'land': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if (!isLiftableTerranStructureKind(e.kind[slot]!) || !isLiftedStructureFlags(e.flags[slot]!)) return reject('target-not-allowed');
      const placement = placementForStructure(s, e.kind[slot]!, c.x, c.y, slot, player);
      return placement.ok ? { ok: true } : reject(placement.reason);
    }
    case 'transform': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
      if (isDisabled(e, slot) || e.built[slot] !== 1) return reject('missing-capability');
      const transform = transformFor(e.kind[slot]!, c.kind);
      if (!transform) return reject('target-not-allowed');
      if (transform.tech !== undefined && getTechLevel(s, player, transform.tech) <= 0) return reject('missing-requirement');
      if (transform.mode === 'merge') {
        if (mergePartnerFor(s, slot, c.kind, c.target ?? NONE) === NONE) return reject('target-not-allowed');
      }
      if (transform.mode === 'morph') {
        const def = Units[c.kind]!;
        if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
        if (e.prodKind[slot] !== Kind.None || e.researchKind[slot] !== Kind.None) return reject('queue-full');
        if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
      }
      return { ok: true };
    }
    case 'burrow': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || isDisabled(e, slot)) return reject('missing-capability');
      if (!canBurrowSlot(s, slot)) return reject('missing-capability');
      if (!hasBurrowAccess(s, player, e.kind[slot]!)) return reject('missing-requirement');
      if ((e.burrowed[slot] === 1) === c.active) return reject('target-not-allowed');
      return { ok: true };
    }
    case 'mine': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || e.burrowed[slot] === 1 || isDisabled(e, slot)) return reject('missing-capability');
      if (e.kind[slot] !== Kind.Vulture || e.built[slot] !== 1) return reject('missing-capability');
      if (getTechLevel(s, player, Tech.SpiderMines) <= 0) return reject('missing-requirement');
      if (e.specialAmmo[slot]! <= 0) return reject('target-not-allowed');
      return { ok: true };
    }
    case 'load': {
      const transport = usableTransportSlot(s, c.transport, player);
      if (transport === null) return isAlive(e, c.transport) ? reject('wrong-owner') : reject('stale-entity');
      const unit = ownedSlot(s, c.unit, player);
      if (unit === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (transport === unit || isContained(s, transport)) return reject('target-not-allowed');
      const capacity = transportCapacity(s, transport);
      if (capacity <= 0 || e.built[transport] !== 1 || isDisabled(e, transport)) return reject('missing-capability');
      if (!canLoadInto(s, transport, unit)) return reject('target-not-allowed');
      const unitSize = Units[e.kind[unit]!]!.cargoSize;
      if (cargoUsed(s, transport) + unitSize > capacity) return reject('queue-full');
      if (distSq(e.x[transport]!, e.y[transport]!, e.x[unit]!, e.y[unit]!) > LOAD_RANGE * LOAD_RANGE) return reject('target-out-of-range');
      return { ok: true };
    }
    case 'unload': {
      const transport = usableTransportSlot(s, c.transport, player);
      if (transport === null) return isAlive(e, c.transport) ? reject('wrong-owner') : reject('stale-entity');
      const unit = ownedSlot(s, c.unit, player);
      if (unit === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (!containedBy(s, unit, transport)) return reject('target-not-allowed');
      const anchor = unloadAnchorSlot(s, transport, c.x, c.y);
      if (anchor === NONE || distSq(e.x[anchor]!, e.y[anchor]!, c.x, c.y) > UNLOAD_RANGE * UNLOAD_RANGE) return reject('target-out-of-range');
      if (!unloadPassable(s, c.x, c.y)) return reject('placement-blocked');
      return { ok: true };
    }
    case 'cancelBuild': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if (e.morphFromKind[slot] !== Kind.None) return { ok: true };
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
      if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
      if (isDisabled(e, slot)) return reject('missing-capability');
      if (e.built[slot] !== 1) return reject('missing-capability');
      if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
      if ((e.flags[slot]! & Role.Mobile) === 0 || commandMoveSpeed(e.kind[slot]!, e.flags[slot]!) <= 0) {
        return reject('missing-capability');
      }
      return { ok: true };
    }
    case 'attack': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot)) return reject('missing-capability');
      if (isDisabled(e, slot)) return reject('missing-capability');
      if (e.built[slot] !== 1) return reject('missing-capability');
      if (!isPowered(s, slot)) return reject('missing-capability');
      if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
      const attacker = Units[e.kind[slot]!]!;
      if (!hasAnyWeapon(attacker)) return reject('missing-capability');
      if (!canUseWeaponNow(s, slot)) return reject('missing-capability');
      if (e.kind[slot] === Kind.Reaver && e.specialAmmo[slot]! <= 0) return reject('target-not-allowed');
      if (!isAlive(e, c.target)) return reject('target-not-found');
      const target = slotOf(c.target);
      if (isContained(s, target)) return reject('target-not-allowed');
      if (!isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
      if (!canDetect(s, player, target)) return reject('target-not-allowed');
      if (!weaponForTarget(attacker, Units[e.kind[target]!]!)) return reject('target-not-allowed');
      return { ok: true };
    }
    case 'ability': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
      if (isDisabled(e, slot)) return reject('missing-capability');
      if (e.built[slot] !== 1) return reject('missing-capability');
      if (!isPowered(s, slot)) return reject('missing-capability');
      const caster = Units[e.kind[slot]!]!;
      const ability = Abilities[c.ability];
      if (!ability || !caster.abilities.includes(c.ability) || !ability.casters.includes(e.kind[slot]!)) return reject('invalid-ability');
      if (ability.tech !== undefined && getTechLevel(s, player, ability.tech) <= 0) return reject('missing-requirement');
      const togglingCloakOff = (c.ability === Ability.PersonnelCloaking || c.ability === Ability.CloakingField) && e.cloakActive[slot] === 1;
      if (!togglingCloakOff && e.energy[slot]! < ability.energyCost) return reject('not-enough-energy');
      if (!togglingCloakOff && e.hp[slot]! <= ability.hpCost) return reject('not-enough-hit-points');
      if (c.ability === Ability.NuclearStrike && !hasReadyNuke(s, player)) return reject('missing-requirement');
      if (ability.target === 'self') return { ok: true };
      if (ability.target === 'point') {
        if (typeof c.x !== 'number' || typeof c.y !== 'number') return reject('target-not-found');
        if (distSq(e.x[slot]!, e.y[slot]!, c.x, c.y) > ability.range * ability.range) return reject('target-out-of-range');
        return { ok: true };
      }
      if (c.target === undefined || !isAlive(e, c.target)) return reject('target-not-found');
      const target = slotOf(c.target);
      if (isContained(s, target)) return reject('target-not-allowed');
      if (distSq(e.x[slot]!, e.y[slot]!, e.x[target]!, e.y[target]!) > ability.range * ability.range) return reject('target-out-of-range');
      if (ability.targetTeam === 'own' && e.owner[target] !== player) return reject('target-not-allowed');
      if (ability.targetTeam === 'enemy') {
        if (!isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
        if (!canDetect(s, player, target)) return reject('target-not-allowed');
      }
      if (ability.targetTeam === 'any' && isEnemy(s, player, e.owner[target]!) && !canDetect(s, player, target)) return reject('target-not-allowed');
      if (c.ability === Ability.Consume && target === slot) return reject('target-not-allowed');
      if (ability.targetRolesAny !== 0 && (e.flags[target]! & ability.targetRolesAny) === 0) return reject('target-not-allowed');
      if (ability.targetRolesNone !== 0 && (e.flags[target]! & ability.targetRolesNone) !== 0) return reject('target-not-allowed');
      const traits = unitTraits(e.kind[target]!);
      if (ability.targetTraitsAny !== 0 && (traits & ability.targetTraitsAny) === 0) return reject('target-not-allowed');
      if (ability.targetTraitsNone !== 0 && (traits & ability.targetTraitsNone) !== 0) return reject('target-not-allowed');
      if (ability.targetNeedsEnergy && e.energy[target]! <= 0) return reject('target-not-allowed');
      if (c.ability === Ability.Hallucination && e.illusion[target] === 1) return reject('target-not-allowed');
      if (c.ability === Ability.ShieldRecharge) {
        const def = Units[e.kind[target]!];
        if (!def || def.shields <= 0 || e.shield[target]! >= def.shields) return reject('target-not-allowed');
      }
      if (c.ability === Ability.InfestCommandCenter) {
        if (e.kind[target] !== Kind.CommandCenter || e.hp[target]! * 2 > Units[Kind.CommandCenter]!.hp) return reject('target-not-allowed');
      }
      return { ok: true };
    }
    case 'harvest': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
      if (isDisabled(e, slot)) return reject('missing-capability');
      if ((e.flags[slot]! & Role.Worker) === 0) return reject('missing-capability');
      if (!isAlive(e, c.patch)) return reject('target-not-found');
      const target = slotOf(c.patch);
      const isResource = (e.flags[target]! & Role.Resource) !== 0;
      const def = Units[e.kind[target]!]!;
      if (!isResource || (def.resourceType === ResourceType.Gas && e.built[target] !== 1)) return reject('target-not-allowed');
      return { ok: true };
    }
    case 'repair': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
      if (isDisabled(e, slot) || e.kind[slot] !== Kind.SCV) return reject('missing-capability');
      if (!isAlive(e, c.target)) return reject('target-not-found');
      const target = slotOf(c.target);
      if (isContained(s, target)) return reject('target-not-allowed');
      if (isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
      const def = Units[e.kind[target]!];
      if (def && e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) return { ok: true };
      if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) return reject('target-not-allowed');
      const cost = repairCost(e.kind[target]!, Math.min(REPAIR_RATE, def.hp - e.hp[target]!));
      if (s.players.minerals[player]! < cost.minerals || s.players.gas[player]! < cost.gas) return reject('not-affordable');
      return { ok: true };
    }
    case 'rally': {
      const slot = ownedSlot(s, c.building, player);
      if (slot === null) return isAlive(e, c.building) ? reject('wrong-owner') : reject('stale-entity');
      if ((e.flags[slot]! & Role.Structure) === 0) return reject('missing-capability');
      if (c.target !== undefined) {
        if (!isAlive(e, c.target)) return reject('target-not-found');
        if (!canRallyToSlot(s, player, slot, slotOf(c.target))) return reject('target-not-allowed');
      }
      return { ok: true };
    }
    case 'stop': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot)) return reject('missing-capability');
      if ((e.flags[slot]! & Role.Mobile) === 0 && e.order[slot] !== Order.Build) return reject('missing-capability');
      return { ok: true };
    }
  }
};

export const snapRallyTarget = (s: State, player: number, x: number, y: number, source = NONE): number => {
  const e = s.e;
  const unit = nearest(s, x, y, (sl) =>
    canRallyToSlot(s, player, source, sl) && (e.flags[sl]! & Role.Resource) === 0);
  if (unit !== NONE && withinRallySnap(s, unit, x, y)) return eid(e, unit);
  const node = nearest(s, x, y, (sl) => canRallyToSlot(s, player, source, sl));
  return node !== NONE && withinRallySnap(s, node, x, y) ? eid(e, node) : NONE;
};
