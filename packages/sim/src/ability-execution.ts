import { Abilities, Ability } from './data.ts';
import type { AbilityDef } from './data.ts';
import { canSpawnEffect, canSpawnEntity } from './entity/world.ts';
import type { State } from './entity/world.ts';

export const isFreeAbilityToggleOff = (e: State['e'], slot: number, ability: AbilityDef): boolean =>
  ability.execution?.mode === 'self-toggle' &&
  ability.execution.flag === 'cloakActive' &&
  e.cloakActive[slot] === 1;

export const abilityCapacityAvailable = (s: State, abilityId: number): boolean => {
  const ability = Abilities[abilityId];
  if (!ability) return false;
  if (ability.execution?.mode === 'persistent-effect') return canSpawnEffect(s);
  switch (abilityId) {
    case Ability.SpawnBroodling:
      return canSpawnEntity(s, 1);
    case Ability.Hallucination:
      return canSpawnEntity(s, 2);
    case Ability.NuclearStrike:
      return canSpawnEffect(s);
    default:
      return true;
  }
};
