import { EffectKind, Kind, Role, TILE, Units } from './data.ts';
import { ONE } from './fixed.ts';
import { structureFootprint } from './footprint.ts';
import { bodyBounds } from './spatial.ts';
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

export type EntityRenderHull = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  usesFootprint: boolean;
};

export type SelectionBase =
  | { shape: 'circle'; radius: number; offsetX: number; offsetY: number }
  | { shape: 'rect'; width: number; height: number; offsetX: number; offsetY: number };

export type EffectVisibilityAffordance = {
  kind: 'scan' | 'nuke';
  x: number;
  y: number;
  radius: number;
  timer: number;
};

export type EffectVisibilityQuery = {
  viewer: number;
  tileVisible: (tx: number, ty: number) => number;
};

const isUnfinished = (s: State, slot: number): boolean =>
  s.e.alive[slot] === 1 && s.e.built[slot] !== 1;

const isStructure = (s: State, slot: number): boolean =>
  (s.e.flags[slot]! & Role.Structure) !== 0;

const stampedFootprintCenterOffset = (tiles: number): number => (tiles % 2 === 0 ? -TILE / 2 : 0);

export const usesFootprintHull = (kind: number): boolean => {
  const def = Units[kind]!;
  return (def.roles & (Role.Structure | Role.Resource)) !== 0 || kind === Kind.Geyser;
};

export const entityRenderHull = (kind: number, x: number, y: number): EntityRenderHull => {
  if (usesFootprintHull(kind)) {
    const fp = structureFootprint(kind, x, y);
    const x0 = fp.x0 * TILE;
    const y0 = fp.y0 * TILE;
    const x1 = (fp.x1 + 1) * TILE;
    const y1 = (fp.y1 + 1) * TILE;
    return {
      x0,
      y0,
      x1,
      y1,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      width: x1 - x0,
      height: y1 - y0,
      usesFootprint: true,
    };
  }
  const b = bodyBounds(kind);
  const cx = x / ONE;
  const cy = y / ONE;
  const x0 = cx - b.left / ONE;
  const y0 = cy - b.up / ONE;
  const x1 = cx + b.right / ONE;
  const y1 = cy + b.down / ONE;
  return {
    x0,
    y0,
    x1,
    y1,
    cx,
    cy,
    width: x1 - x0,
    height: y1 - y0,
    usesFootprint: false,
  };
};

export const selectionBase = (kind: number): SelectionBase => {
  const def = Units[kind]!;
  if (usesFootprintHull(kind)) {
    return {
      shape: 'rect',
      width: def.footprintW * TILE,
      height: def.footprintH * TILE,
      offsetX: stampedFootprintCenterOffset(def.footprintW),
      offsetY: stampedFootprintCenterOffset(def.footprintH),
    };
  }
  return { shape: 'circle', radius: def.radius / ONE, offsetX: 0, offsetY: 0 };
};

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

export const effectVisibilityAffordances = (
  s: State,
  query: EffectVisibilityQuery,
  out: EffectVisibilityAffordance[] = [],
): EffectVisibilityAffordance[] => {
  out.length = 0;
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1) continue;
    const effectKind = fx.kind[i]!;
    const kind = effectKind === EffectKind.ScannerSweep
      ? 'scan'
      : effectKind === EffectKind.NuclearStrike
      ? 'nuke'
      : undefined;
    if (!kind) continue;
    const tx = Math.trunc(fx.x[i]! / (ONE * TILE));
    const ty = Math.trunc(fx.y[i]! / (ONE * TILE));
    const vis = query.viewer < 0 ? 2 : query.tileVisible(tx, ty);
    const owned = query.viewer >= 0 && fx.owner[i] === query.viewer;
    if (kind === 'scan' && !owned && vis !== 2) continue;
    if (kind === 'nuke' && !owned && vis === 0) continue;
    out.push({
      kind,
      x: fx.x[i]! / ONE,
      y: fx.y[i]! / ONE,
      radius: fx.radius[i]! / ONE,
      timer: fx.timer[i]!,
    });
  }
  return out;
};
