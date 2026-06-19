import { activeAddonParentSlot, isAddonKind } from '../addon.ts';
import { NONE, type State } from '../entity/world.ts';

export const hasCompletedKind = (s: State, player: number, kind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== kind || e.built[i] !== 1) continue;
    if (isAddonKind(kind) && activeAddonParentSlot(s, i) === NONE) continue;
    return true;
  }
  return false;
};

export const requirementsMet = (s: State, player: number, requirements: number[]): boolean => {
  for (const req of requirements) if (!hasCompletedKind(s, player, req)) return false;
  return true;
};
