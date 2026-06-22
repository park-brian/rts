import { BUILD_RANGE, EffectKind, Kind, Order, Role, TILE, Units } from '../data/index.ts';
import { ONE } from '../fixed.ts';
import {
  actorMinReadableScreenRadius,
  actorPresentation,
  type ActorPresentation,
} from '../mechanics/actors.ts';
import { canDetect, isCloaked } from '../mechanics/detection.ts';
import { entityLifecycle, type EntityLifecycleState } from '../entity/lifecycle.ts';
import { queuedTravelOrderAt, type QueuedOrder } from '../entity/order-queue.ts';
import { isTransitioning } from '../entity/state.ts';
import { structureFootprint } from '../spatial/footprint.ts';
import { isRepairableKind } from '../mechanics/repair.ts';
import { sameTeam } from '../mechanics/cargo.ts';
import { bodyBounds, distanceSqToRect, usesFootprintInteractionHull } from '../spatial/geometry.ts';
import { eid, isAlive, NONE, slotOf, type State } from '../entity/world.ts';

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

export type EntityLifeBar = {
  kind: 'construction' | 'life';
  x: number;
  y: number;
  width: number;
  fraction: number;
};

type EntityTimerStatusColumn = 'irradiateTimer' | 'plagueTimer';

export type EntityStatusPresentationKind =
  | 'burrowed'
  | 'cloaked'
  | 'detected'
  | 'irradiated'
  | 'plagued';

export type EntityStatusPresentationDef = {
  kind: EntityStatusPresentationKind;
  label: string;
  timerColumn?: EntityTimerStatusColumn;
};

export type EntityStatusPresentation = {
  kind: EntityStatusPresentationKind;
  label: string;
  timer: number;
};

export const EntityStatusPresentationDefs = {
  Burrowed: { kind: 'burrowed', label: 'Burrowed' },
  Cloaked: { kind: 'cloaked', label: 'Cloaked' },
  Detected: { kind: 'detected', label: 'Detected' },
  Irradiated: { kind: 'irradiated', label: 'Irradiated', timerColumn: 'irradiateTimer' },
  Plagued: { kind: 'plagued', label: 'Plagued', timerColumn: 'plagueTimer' },
} satisfies Record<string, EntityStatusPresentationDef>;

const TimedEntityStatusPresentationDefs = [
  EntityStatusPresentationDefs.Irradiated,
  EntityStatusPresentationDefs.Plagued,
] as const;

export type EffectAffordanceKind = 'scan' | 'nuke';
export type EffectFieldKind = 'storm' | 'swarm' | 'web';
export type EffectVisibilityRule = 'owner-or-visible' | 'owner-or-explored';

export type EffectPresentationDef = {
  affordance?: {
    kind: EffectAffordanceKind;
    visibility: EffectVisibilityRule;
  };
  field?: {
    kind: EffectFieldKind;
    visibility: EffectVisibilityRule;
    fill: readonly [number, number, number];
    stroke: readonly [number, number, number];
    alpha: number;
  };
};

export type EffectVisibilityAffordance = {
  kind: EffectAffordanceKind;
  x: number;
  y: number;
  radius: number;
  timer: number;
  hasSource: boolean;
  sourceX: number;
  sourceY: number;
};

export type EffectFieldAffordance = {
  kind: EffectFieldKind;
  x: number;
  y: number;
  radius: number;
  timer: number;
  fill: readonly [number, number, number];
  stroke: readonly [number, number, number];
  alpha: number;
};

export type EffectVisibilityQuery = {
  viewer: number;
  tileVisible: (tx: number, ty: number) => number;
};

export const EffectPresentationDefs: Partial<Record<number, EffectPresentationDef>> = {
  [EffectKind.PsionicStorm]: {
    field: {
      kind: 'storm',
      visibility: 'owner-or-visible',
      fill: [125, 170, 255],
      stroke: [185, 210, 255],
      alpha: 0.14,
    },
  },
  [EffectKind.DarkSwarm]: {
    field: {
      kind: 'swarm',
      visibility: 'owner-or-visible',
      fill: [120, 210, 110],
      stroke: [170, 235, 140],
      alpha: 0.13,
    },
  },
  [EffectKind.DisruptionWeb]: {
    field: {
      kind: 'web',
      visibility: 'owner-or-visible',
      fill: [245, 245, 255],
      stroke: [180, 205, 255],
      alpha: 0.12,
    },
  },
  [EffectKind.ScannerSweep]: { affordance: { kind: 'scan', visibility: 'owner-or-visible' } },
  [EffectKind.NuclearStrike]: { affordance: { kind: 'nuke', visibility: 'owner-or-explored' } },
};

export type WorkActivity = {
  worker: number;
  target: number;
  x: number;
  y: number;
  kind: 'build' | 'repair' | 'harvest';
  active: boolean;
};

export type QueuedTravelWaypoint = {
  unit: number;
  index: number;
  intent: 'move' | 'attack' | 'attack-move' | 'patrol' | 'repair';
  target: number;
  x: number;
  y: number;
};

const queuedTravelIntent = (order: QueuedOrder['order']): QueuedTravelWaypoint['intent'] => {
  if (order === Order.Attack) return 'attack';
  if (order === Order.Repair) return 'repair';
  if (order === Order.AttackMove) return 'attack-move';
  if (order === Order.Patrol) return 'patrol';
  return 'move';
};

export type IllusionPresentation = {
  known: boolean;
  labelPrefix: string;
  alpha: number;
  tint: readonly [number, number, number];
};

export type ActorRenderPresentation = {
  role: ActorPresentation;
  radius: number;
  minimapVisible: boolean;
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const structureWorkPoint = (s: State, worker: number, target: number): { x: number; y: number } => {
  const e = s.e;
  const fp = structureFootprint(e.kind[target]!, e.x[target]!, e.y[target]!);
  const tileFx = TILE * ONE;
  return {
    x: clamp(e.x[worker]!, fp.x0 * tileFx, (fp.x1 + 1) * tileFx),
    y: clamp(e.y[worker]!, fp.y0 * tileFx, (fp.y1 + 1) * tileFx),
  };
};

const unitWorkPoint = (s: State, worker: number, target: number): { x: number; y: number } => {
  const e = s.e;
  const r = Units[e.kind[target]!]!.radius;
  const dx = e.x[worker]! - e.x[target]!;
  const dy = e.y[worker]! - e.y[target]!;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: e.x[target]! + Math.trunc((dx / len) * r),
    y: e.y[target]! + Math.trunc((dy / len) * r),
  };
};

const nearBuildFootprint = (s: State, worker: number, target: number): boolean => {
  const e = s.e;
  const fp = structureFootprint(e.kind[target]!, e.x[target]!, e.y[target]!);
  const tileFx = TILE * ONE;
  return distanceSqToRect(
    e.x[worker]!,
    e.y[worker]!,
    fp.x0 * tileFx,
    fp.y0 * tileFx,
    (fp.x1 + 1) * tileFx,
    (fp.y1 + 1) * tileFx,
  ) <= BUILD_RANGE * BUILD_RANGE;
};

const withinRepairRange = (s: State, worker: number, target: number): boolean => {
  const e = s.e;
  const dx = e.x[worker]! - e.x[target]!;
  const dy = e.y[worker]! - e.y[target]!;
  return dx * dx + dy * dy <= BUILD_RANGE * BUILD_RANGE;
};

const isStructure = (s: State, slot: number): boolean =>
  (s.e.flags[slot]! & Role.Structure) !== 0;

const usesLifecycleProgressBar = (state: EntityLifecycleState): boolean => {
  switch (state) {
    case 'constructing':
    case 'morphing':
    case 'merging':
      return true;
    default:
      return false;
  }
};

export const entityCloakOpacity = (s: State, slot: number): number =>
  isCloaked(s, slot) ? 0.5 : 1;

export const illusionPresentation = (s: State, viewer: number, slot: number): IllusionPresentation => {
  const e = s.e;
  if (e.alive[slot] !== 1 || e.illusion[slot] !== 1) {
    return { known: false, labelPrefix: '', alpha: 1, tint: [1, 1, 1] };
  }
  const owner = e.owner[slot]!;
  const known = viewer < 0 || viewer === owner || (
    viewer < s.teams.length && owner < s.teams.length && s.teams[viewer] === s.teams[owner]
  );
  return known
    ? { known: true, labelPrefix: 'Hallucination ', alpha: 0.72, tint: [0.62, 0.82, 1] }
    : { known: false, labelPrefix: '', alpha: 1, tint: [1, 1, 1] };
};

export const actorRenderPresentation = (
  kind: number,
  gameplayRadius: number,
  zoom: number,
): ActorRenderPresentation => {
  const role = actorPresentation(kind);
  const minScreenRadius = actorMinReadableScreenRadius(kind);
  const radius = minScreenRadius === undefined
    ? gameplayRadius
    : Math.max(gameplayRadius, minScreenRadius / Math.max(zoom, 0.001));
  return {
    role,
    radius,
    minimapVisible: entityMinimapVisible(kind),
  };
};

export const entityMinimapVisible = (kind: number): boolean =>
  actorPresentation(kind) !== 'projectile';

const stampedFootprintCenterOffset = (tiles: number): number => (tiles % 2 === 0 ? -TILE / 2 : 0);

export const usesFootprintHull = (kind: number): boolean => {
  const def = Units[kind]!;
  return usesFootprintInteractionHull(kind, def.roles);
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

export const entityLifeBar = (s: State, slot: number, selected: boolean): EntityLifeBar | undefined => {
  if (!selected) return undefined;
  const e = s.e;
  const kind = e.kind[slot]!;
  const def = Units[kind];
  if (!def || (def.roles & Role.Resource) !== 0 || kind === Kind.Geyser) return undefined;
  const maxLife = def.hp + def.shields;
  if (maxLife <= 0) return undefined;
  const lifecycle = entityLifecycle(s, slot);
  const lifecycleProgress = lifecycle.total > 0 && usesLifecycleProgressBar(lifecycle.state);
  const progress = lifecycleProgress
    ? lifecycle.progress
    : Math.max(0, (e.hp[slot]! + e.shield[slot]!) / maxLife);
  const hull = entityRenderHull(kind, e.x[slot]!, e.y[slot]!);
  return {
    kind: lifecycleProgress ? 'construction' : 'life',
    x: hull.cx,
    y: hull.y0,
    width: Math.max(2, hull.width),
    fraction: Math.max(0, Math.min(1, progress)),
  };
};

export const isZergCombatMorph = (s: State, slot: number): boolean => {
  const e = s.e;
  return isTransitioning(s, slot) &&
    e.morphFromKind[slot] !== Kind.None &&
    Units[e.kind[slot]!]?.race === 'zerg' &&
    !isStructure(s, slot);
};

export const isZergStructureMorph = (s: State, slot: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[slot]!];
  return isTransitioning(s, slot) &&
    (e.morphFromKind[slot] !== Kind.None || def?.buildMethod === 'morph') &&
    def?.race === 'zerg' &&
    isStructure(s, slot);
};

export const isProtossMergeSummon = (s: State, slot: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[slot]!];
  return isTransitioning(s, slot) &&
    e.morphFromKind[slot] === Kind.None &&
    def?.race === 'protoss' &&
    def.buildMethod === 'merge';
};

export const entityPresentationState = (s: State, slot: number): EntityPresentationState => {
  if (isZergCombatMorph(s, slot)) return 'zerg-combat-morph';
  if (isZergStructureMorph(s, slot)) return 'zerg-structure-morph';
  if (isProtossMergeSummon(s, slot)) return 'protoss-merge-summon';
  if (!isTransitioning(s, slot) || !isStructure(s, slot)) return 'normal';
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

export const entityStatusPresentations = (
  s: State,
  slot: number,
  viewer: number,
  out: EntityStatusPresentation[] = [],
): EntityStatusPresentation[] => {
  out.length = 0;
  const e = s.e;
  if (e.burrowed[slot] === 1) out.push({ ...EntityStatusPresentationDefs.Burrowed, timer: 0 });
  if (isCloaked(s, slot)) out.push({ ...EntityStatusPresentationDefs.Cloaked, timer: 0 });
  const owner = e.owner[slot]!;
  if (viewer >= 0 && viewer !== owner && isCloaked(s, slot) && canDetect(s, viewer, slot)) {
    out.push({ ...EntityStatusPresentationDefs.Detected, timer: 0 });
  }
  for (const def of TimedEntityStatusPresentationDefs) {
    const timer = e[def.timerColumn][slot]!;
    if (timer > 0) out.push({ kind: def.kind, label: def.label, timer });
  }
  return out;
};

const effectVisibleForRule = (
  s: State,
  query: EffectVisibilityQuery,
  effect: number,
  visibility: EffectVisibilityRule,
): boolean => {
  const fx = s.effects;
  const tx = Math.trunc(fx.x[effect]! / (ONE * TILE));
  const ty = Math.trunc(fx.y[effect]! / (ONE * TILE));
  const vis = query.viewer < 0 ? 2 : query.tileVisible(tx, ty);
  const owned = query.viewer >= 0 && fx.owner[effect] === query.viewer;
  if (owned) return true;
  if (visibility === 'owner-or-visible') return vis === 2;
  return vis !== 0;
};

const effectSourceVisibleTo = (s: State, query: EffectVisibilityQuery, effect: number): boolean => {
  const owner = s.effects.owner[effect]!;
  return query.viewer < 0 || sameTeam(s, query.viewer, owner);
};

export const effectVisibilityAffordances = (
  s: State,
  query: EffectVisibilityQuery,
  out: EffectVisibilityAffordance[] = [],
): EffectVisibilityAffordance[] => {
  out.length = 0;
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1) continue;
    const affordance = EffectPresentationDefs[fx.kind[i]!]?.affordance;
    if (!affordance) continue;
    if (!effectVisibleForRule(s, query, i, affordance.visibility)) continue;
    const hasSource = effectSourceVisibleTo(s, query, i) &&
      (fx.source[i] !== NONE || fx.sourceX[i] !== 0 || fx.sourceY[i] !== 0);
    out.push({
      kind: affordance.kind,
      x: fx.x[i]! / ONE,
      y: fx.y[i]! / ONE,
      radius: fx.radius[i]! / ONE,
      timer: fx.timer[i]!,
      hasSource,
      sourceX: hasSource ? fx.sourceX[i]! / ONE : 0,
      sourceY: hasSource ? fx.sourceY[i]! / ONE : 0,
    });
  }
  return out;
};

export const effectFieldAffordances = (
  s: State,
  query: EffectVisibilityQuery,
  out: EffectFieldAffordance[] = [],
): EffectFieldAffordance[] => {
  out.length = 0;
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1) continue;
    const field = EffectPresentationDefs[fx.kind[i]!]?.field;
    if (!field || !effectVisibleForRule(s, query, i, field.visibility)) continue;
    out.push({
      kind: field.kind,
      x: fx.x[i]! / ONE,
      y: fx.y[i]! / ONE,
      radius: fx.radius[i]! / ONE,
      timer: fx.timer[i]!,
      fill: field.fill,
      stroke: field.stroke,
      alpha: field.alpha,
    });
  }
  return out;
};

export const queuedTravelWaypoints = (
  s: State,
  selected: Iterable<number>,
  out: QueuedTravelWaypoint[] = [],
): QueuedTravelWaypoint[] => {
  out.length = 0;
  const e = s.e;
  for (const unit of selected) {
    if (!isAlive(e, unit)) continue;
    const slot = slotOf(unit);
    for (let i = 0; i < e.orderQueueLen[slot]!; i++) {
      const waypoint = queuedTravelOrderAt(e, slot, i);
      if (!waypoint) continue;
      const targetSlot = waypoint.target !== undefined && isAlive(e, waypoint.target)
        ? slotOf(waypoint.target)
        : NONE;
      if (waypoint.target !== undefined && targetSlot === NONE) continue;
      out.push({
        unit,
        index: i,
        intent: queuedTravelIntent(waypoint.order),
        target: waypoint.target ?? NONE,
        x: (targetSlot === NONE ? waypoint.x : e.x[targetSlot]!) / ONE,
        y: (targetSlot === NONE ? waypoint.y : e.y[targetSlot]!) / ONE,
      });
    }
  }
  return out;
};

export const workActivities = (s: State, out: WorkActivity[] = []): WorkActivity[] => {
  const e = s.e;
  out.length = 0;
  for (let worker = 0; worker < e.hi; worker++) {
    if (e.alive[worker] !== 1 || e.container[worker] !== NONE) continue;
    if ((e.flags[worker]! & Role.Worker) === 0) continue;
    const targetId = e.target[worker]!;
    if (!isAlive(e, targetId)) continue;
    const target = slotOf(targetId);
    if (e.container[target] !== NONE) continue;

    if (e.order[worker] === Order.Build && e.buildKind[worker] === Kind.None) {
      if (e.built[target] === 1 || e.ctimer[target]! <= 0) continue;
      if (!nearBuildFootprint(s, worker, target)) continue;
      const p = structureWorkPoint(s, worker, target);
      out.push({ worker, target, x: p.x, y: p.y, kind: 'build', active: true });
    } else if (e.order[worker] === Order.Repair) {
      const def = Units[e.kind[target]!];
      if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) continue;
      if (!withinRepairRange(s, worker, target)) continue;
      const p = (def.roles & Role.Structure) !== 0 ? structureWorkPoint(s, worker, target) : unitWorkPoint(s, worker, target);
      out.push({ worker, target, x: p.x, y: p.y, kind: 'repair', active: true });
    } else if (e.order[worker] === Order.Harvest) {
      const def = Units[e.kind[target]!];
      if (!def || (def.roles & Role.Resource) === 0) continue;
      const p = unitWorkPoint(s, worker, target);
      out.push({ worker, target, x: p.x, y: p.y, kind: 'harvest', active: e.cargo[worker] === 0 && e.timer[worker]! > 0 });
    }
  }
  return out;
};
