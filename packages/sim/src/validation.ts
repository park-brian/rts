// Authoritative command and placement validation. Hosts may preflight with these
// helpers for UX, but ingestion remains the source of truth.

import type { Command, CommandRejectReason } from './commands.ts';
import type { State } from './world.ts';
import { isAlive, isEnemy, slotOf, NONE } from './world.ts';
import {
  Ability, Abilities, Kind, Role, Tech, Units,
  unitTraits,
  workerBuildKindsFor,
} from './data.ts';
import { isActiveAddon } from './addon.ts';
import { snapBuildAnchor, structureFootprint, type Footprint } from './footprint.ts';
import { hasPendingBuild } from './build-cost.ts';
import { canDetect } from './detection.ts';
import { isPowered } from './power.ts';
import { isDisabled } from './systems/status.ts';
import { isLiftedStructureFlags } from './terran-mobility.ts';
import { getTechLevel } from './tech.ts';
import { hasReadyNuke } from './nuke.ts';
import { validateCommandSpec } from './command-specs.ts';
import { isContained, sameTeam } from './cargo.ts';
import { requirementsMet } from './requirements.ts';
import { canPlaceStructure, placementForStructure, type PlacementResult } from './placement.ts';

export type { CommandRejectReason };
export { canPlaceStructure, placementForStructure, snapBuildAnchor, structureFootprint, type Footprint, type PlacementResult };

export type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

export type ValidationContext = {
  reservedSupply?: number;
};

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });
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

const canBuildWithWorker = (workerKind: number, structureKind: number): boolean => {
  const worker = Units[workerKind];
  const structure = Units[structureKind];
  if (!worker || worker.race !== structure.race) return false;
  return workerBuildKindsFor(worker.race).includes(structureKind);
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
  if (isContained(s, workerSlot) || e.burrowed[workerSlot] === 1 || e.illusion[workerSlot] === 1) return reject('missing-capability');
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
      return validateCommandSpec(s, player, c, { reservedSupply: ctx.reservedSupply });
    }
    case 'research': {
      return validateCommandSpec(s, player, c);
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
      return validateCommandSpec(s, player, c);
    }
    case 'lift': {
      return validateCommandSpec(s, player, c);
    }
    case 'land': {
      return validateCommandSpec(s, player, c);
    }
    case 'transform': {
      return validateCommandSpec(s, player, c);
    }
    case 'burrow': {
      return validateCommandSpec(s, player, c);
    }
    case 'mine': {
      return validateCommandSpec(s, player, c);
    }
    case 'load': {
      return validateCommandSpec(s, player, c);
    }
    case 'unload': {
      return validateCommandSpec(s, player, c);
    }
    case 'cancelBuild': {
      return validateCommandSpec(s, player, c);
    }
    case 'move':
    case 'amove':
      return validateCommandSpec(s, player, c);
    case 'attack':
      return validateCommandSpec(s, player, c);
    case 'ability': {
      const slot = ownedSlot(s, c.unit, player);
      if (slot === null) return isAlive(e, c.unit) ? reject('wrong-owner') : reject('stale-entity');
      if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
      if (isDisabled(e, slot)) return reject('missing-capability');
      if (e.built[slot] !== 1) return reject('missing-capability');
      if (!isActiveAddon(s, slot)) return reject('missing-capability');
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
      return validateCommandSpec(s, player, c);
    }
    case 'repair': {
      return validateCommandSpec(s, player, c);
    }
    case 'rally': {
      return validateCommandSpec(s, player, c);
    }
    case 'stop':
      return validateCommandSpec(s, player, c);
  }
};
