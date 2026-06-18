import { Abilities } from './data.ts';
import { getTechLevel } from './tech.ts';
import type { State } from './world.ts';

export const abilityTechAvailable = (s: State, player: number, abilityId: number): boolean => {
  const ability = Abilities[abilityId];
  return ability !== undefined && (ability.tech === undefined || getTechLevel(s, player, ability.tech) > 0);
};
