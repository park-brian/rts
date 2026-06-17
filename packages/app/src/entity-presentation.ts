import { Kind, Role, Units, type State } from './sim.ts';

export type EntityPresentationState =
  | 'normal'
  | 'zerg-combat-morph'
  | 'zerg-structure-morph'
  | 'protoss-merge-summon'
  | 'protoss-warp-in'
  | 'terran-construction'
  | 'unfinished-structure';

const isUnfinished = (s: State, slot: number): boolean =>
  s.e.alive[slot] === 1 && s.e.built[slot] !== 1;

const isStructure = (s: State, slot: number): boolean =>
  (s.e.flags[slot]! & Role.Structure) !== 0;

export const isZergCombatMorph = (s: State, slot: number): boolean => {
  const e = s.e;
  return isUnfinished(s, slot) &&
    e.morphFromKind[slot] !== Kind.None &&
    Units[e.kind[slot]!]?.race === 'zerg' &&
    !isStructure(s, slot);
};

export const isZergStructureMorph = (s: State, slot: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[slot]!];
  return isUnfinished(s, slot) &&
    (e.morphFromKind[slot] !== Kind.None || def?.buildMethod === 'morph') &&
    def?.race === 'zerg' &&
    isStructure(s, slot);
};

export const isProtossMergeSummon = (s: State, slot: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[slot]!];
  return isUnfinished(s, slot) &&
    e.morphFromKind[slot] === Kind.None &&
    def?.race === 'protoss' &&
    def.buildMethod === 'merge';
};

export const entityPresentationState = (s: State, slot: number): EntityPresentationState => {
  if (isZergCombatMorph(s, slot)) return 'zerg-combat-morph';
  if (isZergStructureMorph(s, slot)) return 'zerg-structure-morph';
  if (isProtossMergeSummon(s, slot)) return 'protoss-merge-summon';
  if (!isUnfinished(s, slot) || !isStructure(s, slot)) return 'normal';
  const def = Units[s.e.kind[slot]!]!;
  if (def.race === 'protoss') return 'protoss-warp-in';
  if (def.race === 'terran') return 'terran-construction';
  return 'unfinished-structure';
};

export const morphPresentationKind = (s: State, slot: number): number =>
  isZergCombatMorph(s, slot) ? Kind.Egg : s.e.kind[slot]!;

export const entitySelectionName = (s: State, slot: number): string => {
  const name = Units[s.e.kind[slot]!]!.name;
  switch (entityPresentationState(s, slot)) {
    case 'zerg-combat-morph':
    case 'zerg-structure-morph':
      return `Morphing ${name}`;
    case 'protoss-merge-summon':
      return `Summoning ${name}`;
    case 'protoss-warp-in':
      return `Warping ${name}`;
    case 'terran-construction':
    case 'unfinished-structure':
      return `Building ${name}`;
    default:
      return name;
  }
};
