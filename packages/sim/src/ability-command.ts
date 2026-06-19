import type { Command } from './commands.ts';
import { Ability, Abilities, Kind, Units, unitTraits } from './data.ts';
import { isActiveAddon } from './addon.ts';
import { isContained } from './cargo.ts';
import { canDetect } from './detection.ts';
import { isPowered } from './power.ts';
import { hasReadyNuke } from './nuke.ts';
import type { State } from './world.ts';
import { isAlive, isEnemy, NONE, slotOf } from './world.ts';
import { castAbility } from './systems/abilities.ts';
import { withinRangeSq, withinTopDownEdgeRange } from './spatial.ts';
import { abilityTechAvailable } from './ability-availability.ts';
import { abilityCapacityAvailable, isFreeAbilityToggleOff } from './ability-execution.ts';
import { canReceiveOrder, reject, type CommandValidation } from './command-validation.ts';

type AbilityCommand = Extract<Command, { t: 'ability' }>;

export const validateAbilityCommand = (s: State, player: number, command: AbilityCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true, rejectIllusion: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (!isActiveAddon(s, slot)) return reject('missing-capability');
  if (!isPowered(s, slot)) return reject('missing-capability');
  const caster = Units[e.kind[slot]!]!;
  const ability = Abilities[command.ability];
  if (!ability || !caster.abilities.includes(command.ability) || !ability.casters.includes(e.kind[slot]!)) {
    return reject('invalid-ability');
  }
  if (!abilityTechAvailable(s, player, command.ability)) return reject('missing-requirement');
  const freeToggleOff = isFreeAbilityToggleOff(e, slot, ability);
  if (!freeToggleOff && e.energy[slot]! < ability.energyCost) return reject('not-enough-energy');
  if (!freeToggleOff && e.hp[slot]! <= ability.hpCost) return reject('not-enough-hit-points');
  if (!abilityCapacityAvailable(s, command.ability)) return reject('capacity-full');
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
  if (!withinTopDownEdgeRange(s, slot, target, ability.range)) {
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
  s.e.intentTarget[slot] = NONE;
  s.e.combatTarget[slot] = NONE;
  castAbility(s, slot, command);
};
