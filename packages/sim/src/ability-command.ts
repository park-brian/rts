import type { Command, CommandRejectReason } from './commands.ts';
import { Ability, Abilities, Kind, Units, unitTraits } from './data.ts';
import { isActiveAddon } from './addon.ts';
import { isContained } from './cargo.ts';
import { canDetect } from './detection.ts';
import { isPowered } from './power.ts';
import { hasReadyNuke } from './nuke.ts';
import type { State } from './world.ts';
import { isAlive, isEnemy, slotOf } from './world.ts';
import { isDisabled } from './systems/status.ts';
import { castAbility } from './systems/abilities.ts';
import { withinRangeSq } from './spatial.ts';
import { abilityTechAvailable } from './ability-availability.ts';

type AbilityCommand = Extract<Command, { t: 'ability' }>;

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateAbilityCommand = (s: State, player: number, command: AbilityCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('missing-capability');
  if (!isActiveAddon(s, slot)) return reject('missing-capability');
  if (!isPowered(s, slot)) return reject('missing-capability');
  const caster = Units[e.kind[slot]!]!;
  const ability = Abilities[command.ability];
  if (!ability || !caster.abilities.includes(command.ability) || !ability.casters.includes(e.kind[slot]!)) {
    return reject('invalid-ability');
  }
  if (!abilityTechAvailable(s, player, command.ability)) return reject('missing-requirement');
  const togglingCloakOff = (command.ability === Ability.PersonnelCloaking || command.ability === Ability.CloakingField) &&
    e.cloakActive[slot] === 1;
  if (!togglingCloakOff && e.energy[slot]! < ability.energyCost) return reject('not-enough-energy');
  if (!togglingCloakOff && e.hp[slot]! <= ability.hpCost) return reject('not-enough-hit-points');
  if (command.ability === Ability.NuclearStrike && !hasReadyNuke(s, player)) return reject('missing-requirement');
  if (ability.target === 'self') return { ok: true };
  if (ability.target === 'point') {
    if (typeof command.x !== 'number' || typeof command.y !== 'number') return reject('target-not-found');
    if (!withinRangeSq(e.x[slot]!, e.y[slot]!, command.x, command.y, ability.range)) {
      return reject('target-out-of-range');
    }
    return { ok: true };
  }
  if (command.target === undefined || !isAlive(e, command.target)) return reject('target-not-found');
  const target = slotOf(command.target);
  if (isContained(s, target)) return reject('target-not-allowed');
  if (!withinRangeSq(e.x[slot]!, e.y[slot]!, e.x[target]!, e.y[target]!, ability.range)) {
    return reject('target-out-of-range');
  }
  if (ability.targetTeam === 'own' && e.owner[target] !== player) return reject('target-not-allowed');
  if (ability.targetTeam === 'enemy') {
    if (!isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
    if (!canDetect(s, player, target)) return reject('target-not-allowed');
  }
  if (ability.targetTeam === 'any' && isEnemy(s, player, e.owner[target]!) && !canDetect(s, player, target)) {
    return reject('target-not-allowed');
  }
  if (command.ability === Ability.Consume && target === slot) return reject('target-not-allowed');
  if (ability.targetRolesAny !== 0 && (e.flags[target]! & ability.targetRolesAny) === 0) return reject('target-not-allowed');
  if (ability.targetRolesNone !== 0 && (e.flags[target]! & ability.targetRolesNone) !== 0) return reject('target-not-allowed');
  const traits = unitTraits(e.kind[target]!);
  if (ability.targetTraitsAny !== 0 && (traits & ability.targetTraitsAny) === 0) return reject('target-not-allowed');
  if (ability.targetTraitsNone !== 0 && (traits & ability.targetTraitsNone) !== 0) return reject('target-not-allowed');
  if (ability.targetNeedsEnergy && e.energy[target]! <= 0) return reject('target-not-allowed');
  if (command.ability === Ability.Hallucination && e.illusion[target] === 1) return reject('target-not-allowed');
  if (command.ability === Ability.ShieldRecharge) {
    const def = Units[e.kind[target]!];
    if (!def || def.shields <= 0 || e.shield[target]! >= def.shields) return reject('target-not-allowed');
  }
  if (command.ability === Ability.InfestCommandCenter) {
    if (e.kind[target] !== Kind.CommandCenter || e.hp[target]! * 2 > Units[Kind.CommandCenter]!.hp) {
      return reject('target-not-allowed');
    }
  }
  return { ok: true };
};

export const applyAbilityCommand = (s: State, command: AbilityCommand): void => {
  const slot = slotOf(command.unit);
  s.e.settled[slot] = 0;
  castAbility(s, slot, command);
};
