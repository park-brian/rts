// Fog-limited observation for one player — the fair-play view a networked human or
// a neural-net policy sees (vs. fullState()'s god view used by scripted bots). The
// sim is deterministic and seeded, so observations are reproducible. This is the
// seam the RL env interface (docs/specs/ai-training.md) builds on.

import type { State } from '../entity/world.ts';
import { eid, isAlive, NEUTRAL, NONE, slotOf } from '../entity/world.ts';
import { EffectKind, Kind, Role, TECH_CAP, TILE, isLarvaSourceKind } from '../data/index.ts';
import { ONE } from '../fixed.ts';
import { actorPresentation, isUserCommandableKind } from '../mechanics/actors.ts';
import {
  abilitiesFor,
  isBaseDepotKind,
  isSmallStaticDefenseKind,
  kindHasCargoCapacity,
  kindHasDirectWeapon,
  producedKindsFor,
  producerKindSupportsWorkerRally,
  researchTechsFor,
  workerBuildKindsForWorkerKind,
} from '../mechanics/capabilities.ts';
import { isDetectorKind, canDetect } from '../mechanics/detection.ts';
import { isContained, sameTeam } from '../mechanics/cargo.ts';
import { CREEP_RADIUS, providesCreep } from '../mechanics/creep.ts';
import { LARVA_MAX, nearestLarvaSource } from '../mechanics/larva.ts';
import { POWER_RADIUS } from '../mechanics/power.ts';
import { entityWorkQueue } from '../entity/work-queue.ts';
import { ORDER_QUEUE_CAP, queuedTravelOrderAt } from '../entity/order-queue.ts';

export type EntityView = {
  id: number; kind: number; owner: number;
  x: number; y: number; hp: number; built: number; order: number;
  orderTarget: number; intentTarget: number; combatTarget: number;
  tx: number; ty: number; patrolX: number; patrolY: number;
  queueSpace: number; capabilities: number;
};

type EntityIntentView = Pick<
  EntityView,
  'orderTarget' | 'intentTarget' | 'combatTarget' | 'tx' | 'ty' | 'patrolX' | 'patrolY'
>;

export type QueueView = {
  id: number;
  prodKind: number;
  prodTimer: number;
  prodQueued: number;
  researchKind: number;
  researchTimer: number;
};

export type OrderQueueEntryView = {
  order: number;
  target: number;
  x: number;
  y: number;
};

export type OrderQueueView = {
  id: number;
  entries: OrderQueueEntryView[];
};

export type CargoView = {
  container: number;
  units: number[];
};

export type StatusView = {
  id: number;
  energy: number;
  energyMax: number;
  stimTimer: number;
  matrixHp: number;
  matrixTimer: number;
  irradiateTimer: number;
  plagueTimer: number;
  ensnareTimer: number;
  lockdownTimer: number;
  stasisTimer: number;
  maelstromTimer: number;
  acidSporeCount: number;
  acidSporeTimer: number;
  opticalFlare: number;
  parasiteOwner: number;
  illusion: number;
  lifeTimer: number;
  cloakActive: number;
  cloakTimer: number;
  cloakAura: number;
  burrowed: number;
  modeTransitionType: number;
  modeTransitionTargetKind: number;
  modeTransitionTargetState: number;
  modeTransitionTimer: number;
  modeTransitionTotal: number;
  castAbility: number;
  castTimer: number;
};

export type EffectView = {
  id: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  radius: number;
  timer: number;
  period: number;
  nextTick: number;
  damage: number;
};

export type LarvaSourceView = {
  id: number;
  count: number;
  max: number;
  timer: number;
};

export type CoverageView = {
  id: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  radius: number;
};

export type Observation = {
  tick: number;
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  tech: Uint8Array; // completed tech/upgrade levels for this player only
  queues: QueueView[]; // own active production/research queues
  orderQueues: OrderQueueView[]; // own queued travel orders
  cargo: CargoView[]; // own contained units grouped by usable transport/garrison
  statuses: StatusView[]; // sparse own energy/status records
  effects: EffectView[]; // fair-play active spatial effects
  larva: LarvaSourceView[]; // owned larva source counts/timers
  creep: CoverageView[]; // fair-play completed creep-provider coverage
  power: CoverageView[]; // fair-play completed Pylon power coverage
  vision: Uint8Array; // 0 unseen, 1 explored, 2 visible (per tile)
  entities: EntityView[]; // own units always; others only on currently-visible tiles
};

export const ObservationCapability = {
  Commandable: 1 << 0,
  Mobile: 1 << 1,
  Structure: 1 << 2,
  Worker: 1 << 3,
  Air: 1 << 4,
  Resource: 1 << 5,
  DirectWeapon: 1 << 6,
  Producer: 1 << 7,
  ResearchProducer: 1 << 8,
  Caster: 1 << 9,
  WorkerBuilder: 1 << 10,
  Transport: 1 << 11,
  Detector: 1 << 12,
  BaseDepot: 1 << 13,
  WorkerRallyProducer: 1 << 14,
  SmallStaticDefense: 1 << 15,
  ProjectilePresentation: 1 << 16,
} as const;

export const OBSERVATION_SCHEMA_VERSION = 7;
// id, kind, owner, x, y, hp, built, order, orderTarget, intentTarget,
// combatTarget, tx, ty, patrolX, patrolY, queueSpace, capabilities
export const OBS_ENTITY_STRIDE = 17;
export const OBS_QUEUE_STRIDE = 6; // id, prodKind, prodTimer, prodQueued, researchKind, researchTimer
export const OBS_ORDER_QUEUE_STRIDE = 2 + ORDER_QUEUE_CAP * 4; // id, len, then order,target,x,y per queued travel entry
export const OBS_CARGO_STRIDE = 3; // container, unitStart, unitCount
// id, energy, energyMax, stimTimer, matrixHp, matrixTimer, irradiateTimer, plagueTimer,
// ensnareTimer, lockdownTimer, stasisTimer, maelstromTimer, acidSporeCount,
// acidSporeTimer, opticalFlare, parasiteOwner, illusion, lifeTimer, cloakActive,
// cloakTimer, cloakAura, burrowed, modeTransitionType, modeTransitionTargetKind,
// modeTransitionTargetState, modeTransitionTimer, modeTransitionTotal, castAbility, castTimer
export const OBS_STATUS_STRIDE = 29;
export const OBS_EFFECT_STRIDE = 9; // id, kind, owner, x, y, radius, timer, period, damage
export const OBS_LARVA_STRIDE = 4; // id, count, max, timer
export const OBS_COVERAGE_STRIDE = 6; // id, kind, owner, x, y, radius
export const OBS_SCALAR_STRIDE = 7; // schema, tick, player, minerals, gas, supplyUsed, supplyMax

export type ObservationBufferLimits = {
  entities?: number;
  queues?: number;
  orderQueues?: number;
  cargo?: number;
  cargoUnits?: number;
  statuses?: number;
  effects?: number;
  larva?: number;
  creep?: number;
  power?: number;
};

export type ObservationBuffers = {
  scalars: Int32Array;
  tech: Uint8Array;
  vision: Uint8Array;
  entities: Int32Array;
  queues: Int32Array;
  orderQueues: Int32Array;
  cargo: Int32Array;
  cargoUnits: Int32Array;
  statuses: Int32Array;
  effects: Int32Array;
  larva: Int32Array;
  creep: Int32Array;
  power: Int32Array;
};

export type ObservationWriteCounts = {
  entities: number;
  queues: number;
  orderQueues: number;
  cargo: number;
  cargoUnits: number;
  statuses: number;
  effects: number;
  larva: number;
  creep: number;
  power: number;
  truncated: number;
};

export const createObservationBuffers = (
  map: State['map'],
  limits: ObservationBufferLimits = {},
): ObservationBuffers => ({
  scalars: new Int32Array(OBS_SCALAR_STRIDE),
  tech: new Uint8Array(TECH_CAP),
  vision: new Uint8Array(map.w * map.h),
  entities: new Int32Array((limits.entities ?? 256) * OBS_ENTITY_STRIDE),
  queues: new Int32Array((limits.queues ?? 64) * OBS_QUEUE_STRIDE),
  orderQueues: new Int32Array((limits.orderQueues ?? 64) * OBS_ORDER_QUEUE_STRIDE),
  cargo: new Int32Array((limits.cargo ?? 32) * OBS_CARGO_STRIDE),
  cargoUnits: new Int32Array(limits.cargoUnits ?? 128),
  statuses: new Int32Array((limits.statuses ?? 128) * OBS_STATUS_STRIDE),
  effects: new Int32Array((limits.effects ?? 64) * OBS_EFFECT_STRIDE),
  larva: new Int32Array((limits.larva ?? 32) * OBS_LARVA_STRIDE),
  creep: new Int32Array((limits.creep ?? 64) * OBS_COVERAGE_STRIDE),
  power: new Int32Array((limits.power ?? 64) * OBS_COVERAGE_STRIDE),
});

const hasStatus = (e: State['e'], i: number): boolean =>
  e.energyMax[i]! > 0 ||
  e.stimTimer[i]! > 0 ||
  e.matrixTimer[i]! > 0 ||
  e.irradiateTimer[i]! > 0 ||
  e.plagueTimer[i]! > 0 ||
  e.ensnareTimer[i]! > 0 ||
  e.lockdownTimer[i]! > 0 ||
  e.stasisTimer[i]! > 0 ||
  e.maelstromTimer[i]! > 0 ||
  e.acidSporeCount[i]! > 0 ||
  e.acidSporeTimer[i]! > 0 ||
  e.opticalFlare[i]! > 0 ||
  e.parasiteOwner[i]! !== NEUTRAL ||
  e.illusion[i]! > 0 ||
  e.lifeTimer[i]! > 0 ||
  e.cloakActive[i]! > 0 ||
  e.cloakTimer[i]! > 0 ||
  e.cloakAura[i]! > 0 ||
  e.burrowed[i]! > 0 ||
  e.modeTransitionTimer[i]! > 0 ||
  e.castAbility[i]! > 0;

const statusView = (e: State['e'], i: number): StatusView => ({
  id: eid(e, i),
  energy: e.energy[i]!,
  energyMax: e.energyMax[i]!,
  stimTimer: e.stimTimer[i]!,
  matrixHp: e.matrixHp[i]!,
  matrixTimer: e.matrixTimer[i]!,
  irradiateTimer: e.irradiateTimer[i]!,
  plagueTimer: e.plagueTimer[i]!,
  ensnareTimer: e.ensnareTimer[i]!,
  lockdownTimer: e.lockdownTimer[i]!,
  stasisTimer: e.stasisTimer[i]!,
  maelstromTimer: e.maelstromTimer[i]!,
  acidSporeCount: e.acidSporeCount[i]!,
  acidSporeTimer: e.acidSporeTimer[i]!,
  opticalFlare: e.opticalFlare[i]!,
  parasiteOwner: e.parasiteOwner[i]!,
  illusion: e.illusion[i]!,
  lifeTimer: e.lifeTimer[i]!,
  cloakActive: e.cloakActive[i]!,
  cloakTimer: e.cloakTimer[i]!,
  cloakAura: e.cloakAura[i]!,
  burrowed: e.burrowed[i]!,
  modeTransitionType: e.modeTransitionType[i]!,
  modeTransitionTargetKind: e.modeTransitionTargetKind[i]!,
  modeTransitionTargetState: e.modeTransitionTargetState[i]!,
  modeTransitionTimer: e.modeTransitionTimer[i]!,
  modeTransitionTotal: e.modeTransitionTotal[i]!,
  castAbility: e.castAbility[i]!,
  castTimer: e.castAbility[i]! > 0 ? e.timer[i]! : 0,
});

const writeStatus = (out: Int32Array, row: number, e: State['e'], i: number): void => {
  let p = row * OBS_STATUS_STRIDE;
  out[p++] = eid(e, i);
  out[p++] = e.energy[i]!;
  out[p++] = e.energyMax[i]!;
  out[p++] = e.stimTimer[i]!;
  out[p++] = e.matrixHp[i]!;
  out[p++] = e.matrixTimer[i]!;
  out[p++] = e.irradiateTimer[i]!;
  out[p++] = e.plagueTimer[i]!;
  out[p++] = e.ensnareTimer[i]!;
  out[p++] = e.lockdownTimer[i]!;
  out[p++] = e.stasisTimer[i]!;
  out[p++] = e.maelstromTimer[i]!;
  out[p++] = e.acidSporeCount[i]!;
  out[p++] = e.acidSporeTimer[i]!;
  out[p++] = e.opticalFlare[i]!;
  out[p++] = e.parasiteOwner[i]!;
  out[p++] = e.illusion[i]!;
  out[p++] = e.lifeTimer[i]!;
  out[p++] = e.cloakActive[i]!;
  out[p++] = e.cloakTimer[i]!;
  out[p++] = e.cloakAura[i]!;
  out[p++] = e.burrowed[i]!;
  out[p++] = e.modeTransitionType[i]!;
  out[p++] = e.modeTransitionTargetKind[i]!;
  out[p++] = e.modeTransitionTargetState[i]!;
  out[p++] = e.modeTransitionTimer[i]!;
  out[p++] = e.modeTransitionTotal[i]!;
  out[p++] = e.castAbility[i]!;
  out[p++] = e.castAbility[i]! > 0 ? e.timer[i]! : 0;
};

const tileVisibilityAt = (s: State, player: number, x: number, y: number): number => {
  const tx = Math.floor(x / ONE / TILE);
  const ty = Math.floor(y / ONE / TILE);
  return tx >= 0 && ty >= 0 && tx < s.map.w && ty < s.map.h
    ? s.vision[player]![ty * s.map.w + tx]!
    : 0;
};

const effectVisibility = (s: State, player: number, i: number): number => {
  const fx = s.effects;
  if (fx.owner[i] === player) return 2;
  const visible = tileVisibilityAt(s, player, fx.x[i]!, fx.y[i]!);
  if (fx.kind[i] === EffectKind.NuclearStrike) return visible;
  return visible === 2 ? 2 : 0;
};

const effectView = (s: State, i: number): EffectView => {
  const fx = s.effects;
  return {
    id: i,
    kind: fx.kind[i]!,
    owner: fx.owner[i]!,
    x: fx.x[i]!,
    y: fx.y[i]!,
    radius: fx.radius[i]!,
    timer: fx.timer[i]!,
    period: fx.period[i]!,
    nextTick: fx.nextTick[i]!,
    damage: fx.damage[i]!,
  };
};

const coverageView = (s: State, i: number, radius: number): CoverageView => ({
  id: eid(s.e, i),
  kind: s.e.kind[i]!,
  owner: s.e.owner[i]!,
  x: s.e.x[i]!,
  y: s.e.y[i]!,
  radius,
});

const hiddenEntityIntent = {
  orderTarget: NONE,
  intentTarget: NONE,
  combatTarget: NONE,
  tx: 0,
  ty: 0,
  patrolX: 0,
  patrolY: 0,
} satisfies EntityIntentView;

const entityIntentView = (
  e: State['e'],
  i: number,
  own: boolean,
): EntityIntentView => own ? {
  orderTarget: e.target[i]!,
  intentTarget: e.intentTarget[i]!,
  combatTarget: e.combatTarget[i]!,
  tx: e.tx[i]!,
  ty: e.ty[i]!,
  patrolX: e.patrolX[i]!,
  patrolY: e.patrolY[i]!,
} : hiddenEntityIntent;

const entityQueueSpace = (e: State['e'], i: number, own: boolean): number =>
  own ? ORDER_QUEUE_CAP - e.orderQueueLen[i]! : 0;

const entityCapabilities = (s: State, i: number): number => {
  const e = s.e;
  const kind = e.kind[i]!;
  const flags = e.flags[i]!;
  let capabilities = 0;
  if (isUserCommandableKind(kind)) capabilities |= ObservationCapability.Commandable;
  if ((flags & Role.Mobile) !== 0) capabilities |= ObservationCapability.Mobile;
  if ((flags & Role.Structure) !== 0) capabilities |= ObservationCapability.Structure;
  if ((flags & Role.Worker) !== 0) capabilities |= ObservationCapability.Worker;
  if ((flags & Role.Air) !== 0) capabilities |= ObservationCapability.Air;
  if ((flags & Role.Resource) !== 0) capabilities |= ObservationCapability.Resource;
  if (kindHasDirectWeapon(kind)) capabilities |= ObservationCapability.DirectWeapon;
  if (producedKindsFor(kind).length > 0) capabilities |= ObservationCapability.Producer;
  if (researchTechsFor(kind).length > 0) capabilities |= ObservationCapability.ResearchProducer;
  if (abilitiesFor(kind).length > 0) capabilities |= ObservationCapability.Caster;
  if (workerBuildKindsForWorkerKind(kind).length > 0) capabilities |= ObservationCapability.WorkerBuilder;
  if (kindHasCargoCapacity(kind)) capabilities |= ObservationCapability.Transport;
  if (isDetectorKind(kind)) capabilities |= ObservationCapability.Detector;
  if (isBaseDepotKind(kind)) capabilities |= ObservationCapability.BaseDepot;
  if (producerKindSupportsWorkerRally(kind)) capabilities |= ObservationCapability.WorkerRallyProducer;
  if (isSmallStaticDefenseKind(kind)) capabilities |= ObservationCapability.SmallStaticDefense;
  if (actorPresentation(kind) === 'projectile') capabilities |= ObservationCapability.ProjectilePresentation;
  return capabilities;
};

const writeEntity = (out: Int32Array, row: number, s: State, i: number, own: boolean): void => {
  const e = s.e;
  const intent = entityIntentView(e, i, own);
  let p = row * OBS_ENTITY_STRIDE;
  out[p++] = eid(e, i);
  out[p++] = e.kind[i]!;
  out[p++] = e.owner[i]!;
  out[p++] = e.x[i]!;
  out[p++] = e.y[i]!;
  out[p++] = e.hp[i]!;
  out[p++] = e.built[i]!;
  out[p++] = e.order[i]!;
  out[p++] = intent.orderTarget;
  out[p++] = intent.intentTarget;
  out[p++] = intent.combatTarget;
  out[p++] = intent.tx;
  out[p++] = intent.ty;
  out[p++] = intent.patrolX;
  out[p++] = intent.patrolY;
  out[p++] = entityQueueSpace(e, i, own);
  out[p++] = entityCapabilities(s, i);
};

const writeQueue = (out: Int32Array, row: number, q: QueueView): void => {
  let p = row * OBS_QUEUE_STRIDE;
  out[p++] = q.id;
  out[p++] = q.prodKind;
  out[p++] = q.prodTimer;
  out[p++] = q.prodQueued;
  out[p++] = q.researchKind;
  out[p++] = q.researchTimer;
};

const orderQueueView = (s: State, slot: number): OrderQueueView | undefined => {
  const len = s.e.orderQueueLen[slot]!;
  if (len <= 0) return undefined;
  const entries: OrderQueueEntryView[] = [];
  for (let i = 0; i < len; i++) {
    const order = queuedTravelOrderAt(s.e, slot, i);
    if (order) entries.push({
      order: order.order,
      target: order.target ?? NONE,
      x: order.x,
      y: order.y,
    });
  }
  return entries.length > 0 ? { id: eid(s.e, slot), entries } : undefined;
};

const writeOrderQueue = (out: Int32Array, row: number, q: OrderQueueView): void => {
  let p = row * OBS_ORDER_QUEUE_STRIDE;
  out[p++] = q.id;
  out[p++] = q.entries.length;
  for (let i = 0; i < ORDER_QUEUE_CAP; i++) {
    const entry = q.entries[i];
    out[p++] = entry?.order ?? 0;
    out[p++] = entry?.target ?? NONE;
    out[p++] = entry?.x ?? 0;
    out[p++] = entry?.y ?? 0;
  }
};

const writeEffect = (out: Int32Array, row: number, s: State, i: number): void => {
  const fx = s.effects;
  let p = row * OBS_EFFECT_STRIDE;
  out[p++] = i;
  out[p++] = fx.kind[i]!;
  out[p++] = fx.owner[i]!;
  out[p++] = fx.x[i]!;
  out[p++] = fx.y[i]!;
  out[p++] = fx.radius[i]!;
  out[p++] = fx.timer[i]!;
  out[p++] = fx.period[i]!;
  out[p++] = fx.damage[i]!;
};

const writeCoverage = (out: Int32Array, row: number, s: State, i: number, radius: number): void => {
  let p = row * OBS_COVERAGE_STRIDE;
  out[p++] = eid(s.e, i);
  out[p++] = s.e.kind[i]!;
  out[p++] = s.e.owner[i]!;
  out[p++] = s.e.x[i]!;
  out[p++] = s.e.y[i]!;
  out[p++] = radius;
};

const queueView = (s: State, slot: number): QueueView | undefined => {
  const work = entityWorkQueue(s, slot);
  if (!work.production && !work.research) return undefined;
  return {
    id: eid(s.e, slot),
    prodKind: work.production?.kind ?? Kind.None,
    prodTimer: work.production?.remaining ?? 0,
    prodQueued: work.production?.queued ?? 0,
    researchKind: work.research?.tech ?? Kind.None,
    researchTimer: work.research?.remaining ?? 0,
  };
};

const pushRow = (count: number, capacity: number): { row: number; truncated: number } =>
  count < capacity ? { row: count, truncated: 0 } : { row: -1, truncated: 1 };

// Training-facing observation writer. Keep this path caller-owned and mostly
// linear; object allocation belongs in observe(), not here. Any optimization must
// preserve object/buffer parity tests and fair-play visibility semantics.
export const writeObservation = (s: State, player: number, out: ObservationBuffers): ObservationWriteCounts => {
  if (!s.trackVision) throw new Error('writeObservation: vision tracking is disabled for this State');
  const e = s.e;
  const m = s.map;
  const W = m.w;
  const v = s.vision[player]!;
  let entities = 0;
  let queues = 0;
  let orderQueues = 0;
  let cargo = 0;
  let cargoUnits = 0;
  let statuses = 0;
  let effects = 0;
  let larva = 0;
  let creep = 0;
  let power = 0;
  let truncated = 0;
  const entityCap = Math.trunc(out.entities.length / OBS_ENTITY_STRIDE);
  const queueCap = Math.trunc(out.queues.length / OBS_QUEUE_STRIDE);
  const orderQueueCap = Math.trunc(out.orderQueues.length / OBS_ORDER_QUEUE_STRIDE);
  const cargoCap = Math.trunc(out.cargo.length / OBS_CARGO_STRIDE);
  const statusCap = Math.trunc(out.statuses.length / OBS_STATUS_STRIDE);
  const effectCap = Math.trunc(out.effects.length / OBS_EFFECT_STRIDE);
  const larvaCap = Math.trunc(out.larva.length / OBS_LARVA_STRIDE);
  const creepCap = Math.trunc(out.creep.length / OBS_COVERAGE_STRIDE);
  const powerCap = Math.trunc(out.power.length / OBS_COVERAGE_STRIDE);

  out.scalars[0] = OBSERVATION_SCHEMA_VERSION;
  out.scalars[1] = s.tick;
  out.scalars[2] = player;
  out.scalars[3] = s.players.minerals[player]!;
  out.scalars[4] = s.players.gas[player]!;
  out.scalars[5] = s.players.supplyUsed[player]!;
  out.scalars[6] = s.players.supplyMax[player]!;
  out.tech.set(s.players.tech.subarray(player * TECH_CAP, (player + 1) * TECH_CAP));
  out.vision.set(v);

  for (let i = 0; i < s.effects.hi; i++) {
    if (s.effects.alive[i] !== 1 || effectVisibility(s, player, i) <= 0) continue;
    const pushed = pushRow(effects, effectCap);
    truncated |= pushed.truncated;
    if (pushed.row >= 0) writeEffect(out.effects, pushed.row, s, i);
    effects++;
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const own = e.owner[i] === player;
    if (e.built[i] === 1 && (own || tileVisibilityAt(s, player, e.x[i]!, e.y[i]!) === 2)) {
      if (providesCreep(e.kind[i]!)) {
        const pushed = pushRow(creep, creepCap);
        truncated |= pushed.truncated;
        if (pushed.row >= 0) writeCoverage(out.creep, pushed.row, s, i, CREEP_RADIUS);
        creep++;
      }
      if (e.kind[i] === Kind.Pylon) {
        const pushed = pushRow(power, powerCap);
        truncated |= pushed.truncated;
        if (pushed.row >= 0) writeCoverage(out.power, pushed.row, s, i, POWER_RADIUS);
        power++;
      }
    }
    const containerId = e.container[i]!;
    if (own && containerId !== NONE && isAlive(e, containerId)) {
      const containerSlot = slotOf(containerId);
      const containerOwner = e.owner[containerSlot]!;
      const usableContainer = containerOwner === player ||
        (e.kind[containerSlot] === Kind.NydusCanal && sameTeam(s, player, containerOwner));
      if (usableContainer) {
        let row = -1;
        const visibleCargoRows = Math.min(cargo, cargoCap);
        for (let c = 0; c < visibleCargoRows; c++) {
          if (out.cargo[c * OBS_CARGO_STRIDE] === containerId) { row = c; break; }
        }
        if (row < 0) {
          const pushed = pushRow(cargo, cargoCap);
          truncated |= pushed.truncated;
          row = pushed.row;
          if (row >= 0) {
            const p = row * OBS_CARGO_STRIDE;
            out.cargo[p] = containerId;
            out.cargo[p + 1] = cargoUnits;
            out.cargo[p + 2] = 0;
          }
          cargo++;
        }
        if (row >= 0) {
          if (cargoUnits < out.cargoUnits.length) {
            out.cargoUnits[cargoUnits] = eid(e, i);
            out.cargo[row * OBS_CARGO_STRIDE + 2]++;
          } else {
            truncated = 1;
          }
        }
        cargoUnits++;
      }
    }
    if (own && hasStatus(e, i)) {
      const pushed = pushRow(statuses, statusCap);
      truncated |= pushed.truncated;
      if (pushed.row >= 0) writeStatus(out.statuses, pushed.row, e, i);
      statuses++;
    }
    if (own) {
      const queue = queueView(s, i);
      if (queue) {
        const pushed = pushRow(queues, queueCap);
        truncated |= pushed.truncated;
        if (pushed.row >= 0) writeQueue(out.queues, pushed.row, queue);
        queues++;
      }
      const orderQueue = orderQueueView(s, i);
      if (orderQueue) {
        const pushed = pushRow(orderQueues, orderQueueCap);
        truncated |= pushed.truncated;
        if (pushed.row >= 0) writeOrderQueue(out.orderQueues, pushed.row, orderQueue);
        orderQueues++;
      }
    }
    if (!own) {
      if (isContained(s, i)) continue;
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const visible = tx >= 0 && ty >= 0 && tx < W && ty < m.h && v[ty * W + tx] === 2;
      if (!visible || !canDetect(s, player, i)) continue;
    }
    const pushed = pushRow(entities, entityCap);
    truncated |= pushed.truncated;
    if (pushed.row >= 0) writeEntity(out.entities, pushed.row, s, i, own);
    entities++;
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || !isLarvaSourceKind(e.kind[i]!)) continue;
    const pushed = pushRow(larva, larvaCap);
    truncated |= pushed.truncated;
    if (pushed.row >= 0) {
      let p = pushed.row * OBS_LARVA_STRIDE;
      out.larva[p++] = eid(e, i);
      out.larva[p++] = 0;
      out.larva[p++] = LARVA_MAX;
      out.larva[p++] = e.timer[i]!;
    }
    larva++;
  }
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== Kind.Larva) continue;
    const source = nearestLarvaSource(s, i, player);
    if (source === NONE) continue;
    const sourceId = eid(e, source);
    const visibleLarvaRows = Math.min(larva, larvaCap);
    for (let row = 0; row < visibleLarvaRows; row++) {
      const p = row * OBS_LARVA_STRIDE;
      if (out.larva[p] === sourceId) {
        out.larva[p + 1]++;
        break;
      }
    }
  }

  return {
    entities: Math.min(entities, entityCap),
    queues: Math.min(queues, queueCap),
    orderQueues: Math.min(orderQueues, orderQueueCap),
    cargo: Math.min(cargo, cargoCap),
    cargoUnits: Math.min(cargoUnits, out.cargoUnits.length),
    statuses: Math.min(statuses, statusCap),
    effects: Math.min(effects, effectCap),
    larva: Math.min(larva, larvaCap),
    creep: Math.min(creep, creepCap),
    power: Math.min(power, powerCap),
    truncated,
  };
};

export const observe = (s: State, player: number): Observation => {
  if (!s.trackVision) throw new Error('observe: vision tracking is disabled for this State');
  const e = s.e; const m = s.map; const W = m.w;
  const v = s.vision[player]!;
  const entities: EntityView[] = [];
  const queues: QueueView[] = [];
  const orderQueues: OrderQueueView[] = [];
  const statuses: StatusView[] = [];
  const effects: EffectView[] = [];
  const larva: LarvaSourceView[] = [];
  const creep: CoverageView[] = [];
  const power: CoverageView[] = [];
  const larvaSourceSlots: number[] = [];
  const larvaSlots: number[] = [];
  const cargoByContainer = new Map<number, number[]>();
  for (let i = 0; i < s.effects.hi; i++) {
    if (s.effects.alive[i] === 1 && effectVisibility(s, player, i) > 0) effects.push(effectView(s, i));
  }
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const own = e.owner[i] === player;
    if (own && e.built[i] === 1 && isLarvaSourceKind(e.kind[i]!)) {
      larvaSourceSlots.push(i);
    } else if (own && e.kind[i] === Kind.Larva) {
      larvaSlots.push(i);
    }
    if (e.built[i] === 1 && (own || tileVisibilityAt(s, player, e.x[i]!, e.y[i]!) === 2)) {
      if (providesCreep(e.kind[i]!)) creep.push(coverageView(s, i, CREEP_RADIUS));
      if (e.kind[i] === Kind.Pylon) power.push(coverageView(s, i, POWER_RADIUS));
    }
    const containerId = e.container[i]!;
    if (own && containerId !== NONE && isAlive(e, containerId)) {
      const containerSlot = slotOf(containerId);
      const containerOwner = e.owner[containerSlot]!;
      const usableContainer = containerOwner === player ||
        (e.kind[containerSlot] === Kind.NydusCanal && sameTeam(s, player, containerOwner));
      if (usableContainer) {
        const unitId = eid(e, i);
        const units = cargoByContainer.get(containerId);
        if (units) units.push(unitId);
        else cargoByContainer.set(containerId, [unitId]);
      }
    }
    if (own && hasStatus(e, i)) statuses.push(statusView(e, i));
    if (own) {
      const queue = queueView(s, i);
      if (queue) queues.push(queue);
      const orderQueue = orderQueueView(s, i);
      if (orderQueue) orderQueues.push(orderQueue);
    }
    if (!own) {
      if (isContained(s, i)) continue;
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const visible = tx >= 0 && ty >= 0 && tx < W && ty < m.h && v[ty * W + tx] === 2;
      if (!visible) continue; // hidden by fog
      if (!canDetect(s, player, i)) continue; // visible cloak shimmer is not a targetable observation
    }
    entities.push({
      id: eid(e, i), kind: e.kind[i]!, owner: e.owner[i]!,
      x: e.x[i]!, y: e.y[i]!, hp: e.hp[i]!, built: e.built[i]!, order: e.order[i]!,
      ...entityIntentView(e, i, own),
      queueSpace: entityQueueSpace(e, i, own),
      capabilities: entityCapabilities(s, i),
    });
  }
  const larvaCounts = new Map<number, number>();
  for (const source of larvaSourceSlots) larvaCounts.set(source, 0);
  for (const slot of larvaSlots) {
    const source = nearestLarvaSource(s, slot, player);
    if (larvaCounts.has(source)) larvaCounts.set(source, larvaCounts.get(source)! + 1);
  }
  for (const source of larvaSourceSlots) {
    larva.push({ id: eid(e, source), count: larvaCounts.get(source)!, max: LARVA_MAX, timer: e.timer[source]! });
  }
  return {
    tick: s.tick,
    player,
    minerals: s.players.minerals[player]!,
    gas: s.players.gas[player]!,
    supplyUsed: s.players.supplyUsed[player]!,
    supplyMax: s.players.supplyMax[player]!,
    tech: s.players.tech.slice(player * TECH_CAP, (player + 1) * TECH_CAP),
    queues,
    orderQueues,
    cargo: [...cargoByContainer].map(([container, units]) => ({ container, units })),
    statuses,
    effects,
    larva,
    creep,
    power,
    vision: v.slice(),
    entities,
  };
};
