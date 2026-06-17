import { Kind, Role, Units, type State } from './sim.ts';

export const isZergCombatMorph = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.alive[slot] === 1 &&
    e.built[slot] !== 1 &&
    e.morphFromKind[slot] !== Kind.None &&
    Units[e.kind[slot]!]?.race === 'zerg' &&
    (e.flags[slot]! & Role.Structure) === 0;
};

export const morphPresentationKind = (s: State, slot: number): number =>
  isZergCombatMorph(s, slot) ? Kind.Egg : s.e.kind[slot]!;

export const morphSelectionName = (s: State, slot: number): string =>
  isZergCombatMorph(s, slot) ? `Morphing ${Units[s.e.kind[slot]!]!.name}` : Units[s.e.kind[slot]!]!.name;
