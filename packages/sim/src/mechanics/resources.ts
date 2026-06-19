import { ResourceType, Role, Units } from '../data/index.ts';
import { isContained, sameTeam } from './cargo.ts';
import { isAlive, slotOf, NONE, type State } from '../entity/world.ts';

export const isGatherTargetSlot = (s: State, slot: number): boolean => {
  const e = s.e;
  if (slot === NONE || slot < 0 || slot >= e.hi || e.alive[slot] !== 1 || isContained(s, slot)) return false;
  if ((e.flags[slot]! & Role.Resource) === 0) return false;
  const def = Units[e.kind[slot]!];
  if (!def || (def.resourceType !== ResourceType.Minerals && def.resourceType !== ResourceType.Gas)) return false;
  return def.resourceType !== ResourceType.Gas || e.built[slot] === 1;
};

export const isGatherTarget = (s: State, id: number): boolean =>
  id !== NONE && isAlive(s.e, id) && isGatherTargetSlot(s, slotOf(id));

export const canPlayerGatherTargetSlot = (s: State, player: number, slot: number): boolean => {
  if (!isGatherTargetSlot(s, slot)) return false;
  const def = Units[s.e.kind[slot]!];
  return def?.resourceType === ResourceType.Minerals || sameTeam(s, player, s.e.owner[slot]!);
};

export const canPlayerGatherTarget = (s: State, player: number, id: number): boolean =>
  id !== NONE && isAlive(s.e, id) && canPlayerGatherTargetSlot(s, player, slotOf(id));
