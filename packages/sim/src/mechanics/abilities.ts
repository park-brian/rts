import { Abilities, Ability } from '../data/index.ts';
import type { AbilityDef } from '../data/index.ts';
import { canSpawnEffect, canSpawnEntity } from '../entity/world.ts';
import type { State } from '../entity/world.ts';
import { getTechLevel } from './tech.ts';

export const abilityTechAvailable = (s: State, player: number, abilityId: number): boolean => {
  const ability = Abilities[abilityId];
  return ability !== undefined && (ability.tech === undefined || getTechLevel(s, player, ability.tech) > 0);
};

export const isFreeAbilityToggleOff = (e: State['e'], slot: number, ability: AbilityDef): boolean =>
  ability.execution?.mode === 'self-toggle' &&
  ability.execution.flag === 'cloakActive' &&
  e.cloakActive[slot] === 1;

export const abilityCapacityAvailable = (s: State, abilityId: number): boolean => {
  const ability = Abilities[abilityId];
  if (!ability) return false;
  if (ability.execution?.mode === 'persistent-effect' || ability.execution?.mode === 'point-channel-effect') return canSpawnEffect(s);
  if (ability.execution?.mode === 'target-kill-spawn') return canSpawnEntity(s, ability.execution.count);
  switch (abilityId) {
    case Ability.Hallucination:
      return canSpawnEntity(s, 2);
    default:
      return true;
  }
};
