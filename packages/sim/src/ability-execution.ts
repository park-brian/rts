import type { AbilityDef } from './data.ts';
import type { State } from './world.ts';

export const isFreeAbilityToggleOff = (e: State['e'], slot: number, ability: AbilityDef): boolean =>
  ability.execution?.mode === 'self-toggle' &&
  ability.execution.flag === 'cloakActive' &&
  e.cloakActive[slot] === 1;
