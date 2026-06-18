import { Kind, Role, Units } from './data.ts';
import type { State } from './world.ts';

export type EntityPresentationState =
  | 'normal'
  | 'zerg-combat-morph'
  | 'zerg-structure-morph'
  | 'protoss-merge-summon'
  | 'protoss-warp-in'
  | 'terran-construction'
  | 'unfinished-structure';

export type EntityPresentationDef = {
  state: EntityPresentationState;
  artKind: number;
  selectionPrefix: '' | 'Morphing ' | 'Summoning ' | 'Warping ' | 'Building ';
};

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

const selectionPrefix = (state: EntityPresentationState): EntityPresentationDef['selectionPrefix'] => {
  switch (state) {
    case 'zerg-combat-morph':
    case 'zerg-structure-morph':
      return 'Morphing ';
    case 'protoss-merge-summon':
      return 'Summoning ';
    case 'protoss-warp-in':
      return 'Warping ';
    case 'terran-construction':
    case 'unfinished-structure':
      return 'Building ';
    default:
      return '';
  }
};

export const entityPresentation = (s: State, slot: number): EntityPresentationDef => {
  const state = entityPresentationState(s, slot);
  return {
    state,
    artKind: state === 'zerg-combat-morph' ? Kind.Egg : s.e.kind[slot]!,
    selectionPrefix: selectionPrefix(state),
  };
};

export const entitySelectionName = (s: State, slot: number): string =>
  `${entityPresentation(s, slot).selectionPrefix}${Units[s.e.kind[slot]!]!.name}`;
