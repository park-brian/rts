// Validator-backed command-head masks for UI, AI, and future RL policies.
//
// Performance contract:
// - These exported convenience helpers allocate masks/commands and are intended
//   for UI, tests, bots, and correctness-first policy integration.
// - Do not "speed this up" by duplicating legality rules. Faster RL paths should
//   precompute candidate vocabularies and write into caller-owned buffers while
//   preserving validator-parity tests.
// - Keep this file off the sim tick hot path; it is a controller boundary layer.

import type { Command, CommandRejectReason } from '../commands/types.ts';
import type { State } from '../entity/world.ts';
import { eid, freeEffectSlots, isAlive, NONE, slotOf } from '../entity/world.ts';
import { validateCommand } from '../commands/validate.ts';
import {
  Abilities, Ability, Kind, Role, TechDefs, Units, productionCostCount, productionCount,
  workerBuildKindsFor,
} from '../data/index.ts';
import { addonParentKind } from '../mechanics/addons.ts';
import { hasPendingBuild } from '../mechanics/build-cancel.ts';
import { internalProductCapacity, internalProductReadyCount } from '../mechanics/internal-products.ts';
import { techGas, techMinerals, nextTechLevel } from '../mechanics/tech.ts';
import { transformFor, transformTargetsFor } from '../mechanics/transforms.ts';
import { abilityCapacityAvailable, isFreeAbilityToggleOff } from '../mechanics/abilities.ts';
import { harvestModeCandidates, rallyModeCandidates, repairModeCandidates } from '../commands/intent.ts';
import { readyNukeSilo } from '../mechanics/nuke.ts';

export const ACTION_SCHEMA_VERSION = 1;

export const COMMAND_HEADS = [
  'train',
  'research',
  'build',
  'addon',
  'lift',
  'land',
  'transform',
  'load',
  'unload',
  'cancelBuild',
  'move',
  'amove',
  'stop',
  'hold',
  'patrol',
  'attack',
  'ability',
  'harvest',
  'repair',
  'rally',
  'burrow',
  'unburrow',
  'mine',
] as const;

export type CommandHead = typeof COMMAND_HEADS[number];
export type CommandMaskOptions = {
  target?: number;
  x?: number;
  y?: number;
  kind?: number;
  tech?: number;
  ability?: number;
  queue?: boolean;
};
export type BuildMaskOptions = {
  x: number;
  y: number;
  kinds?: readonly number[];
};
export type EncodedAction = {
  head: CommandHead;
  actor: number;
  target?: number;
  x?: number;
  y?: number;
  kind?: number;
  tech?: number;
  ability?: number;
  queue?: boolean;
};
export type BatchDecodeReservation = {
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  entitySlots: number;
  effectSlots: number;
  energySlots: number[];
  energy: number[];
  hpSlots: number[];
  hp: number[];
  ammoSlots: number[];
  ammo: number[];
};
export type BatchDecodeResult =
  | { ok: true; command: Command }
  | { ok: false; command: Command; reason: CommandRejectReason };

type ActionReservation = {
  minerals?: number;
  gas?: number;
  supply?: number;
  entitySlots?: number;
  effectSlots?: number;
  energySlot?: number;
  energy?: number;
  hpSlot?: number;
  hp?: number;
  ammoSlot?: number;
  ammoKind?: number;
  ammo?: number;
  ammoReject?: CommandRejectReason;
};

type ProducerIndex = ReadonlyMap<number, readonly number[]>;

export const COMMAND_MASK_POLICY: Record<Command['t'], 'policy-facing'> = {
  train: 'policy-facing',
  research: 'policy-facing',
  build: 'policy-facing',
  addon: 'policy-facing',
  lift: 'policy-facing',
  land: 'policy-facing',
  transform: 'policy-facing',
  burrow: 'policy-facing',
  mine: 'policy-facing',
  load: 'policy-facing',
  unload: 'policy-facing',
  cancelBuild: 'policy-facing',
  move: 'policy-facing',
  attack: 'policy-facing',
  amove: 'policy-facing',
  ability: 'policy-facing',
  harvest: 'policy-facing',
  repair: 'policy-facing',
  rally: 'policy-facing',
  hold: 'policy-facing',
  patrol: 'policy-facing',
  stop: 'policy-facing',
};

const COMMAND_HEAD_INDEX = Object.fromEntries(
  COMMAND_HEADS.map((head, index) => [head, index]),
) as Record<CommandHead, number>;

const buildProducerIndex = <T>(
  entries: Iterable<T>,
  producerOf: (entry: T) => readonly number[],
  valueOf: (entry: T) => number,
): ProducerIndex => {
  const mutable = new Map<number, number[]>();
  for (const entry of entries) {
    for (const producer of producerOf(entry)) {
      let values = mutable.get(producer);
      if (!values) {
        values = [];
        mutable.set(producer, values);
      }
      values.push(valueOf(entry));
    }
  }
  for (const values of mutable.values()) values.sort((a, b) => a - b);
  return mutable;
};

const RESEARCH_BY_PRODUCER = buildProducerIndex(
  Object.entries(TechDefs),
  ([, def]) => def.producers,
  ([tech]) => Number(tech),
);

const ADDONS_BY_PARENT = buildProducerIndex(
  Object.entries(Units),
  ([kind, def]) => def?.buildMethod === 'addon' ? [addonParentKind(Number(kind))] : [],
  ([kind]) => Number(kind),
);

const actorPoint = (s: State, actor: number, opts: CommandMaskOptions): { x: number; y: number } => {
  if (opts.x !== undefined && opts.y !== undefined) return { x: opts.x, y: opts.y };
  if (!isAlive(s.e, actor)) return { x: opts.x ?? 0, y: opts.y ?? 0 };
  const slot = slotOf(actor);
  return { x: opts.x ?? s.e.x[slot]!, y: opts.y ?? s.e.y[slot]! };
};

const decodedMove = (actor: number, x: number, y: number, target: number, queue?: boolean): Extract<Command, { t: 'move' }> => {
  const command: Extract<Command, { t: 'move' }> = target === NONE
    ? { t: 'move', unit: actor, x, y }
    : { t: 'move', unit: actor, x, y, target };
  if (queue === true) command.queue = true;
  return command;
};

const decodedAttackMove = (actor: number, x: number, y: number, queue?: boolean): Extract<Command, { t: 'amove' }> => {
  const command: Extract<Command, { t: 'amove' }> = { t: 'amove', unit: actor, x, y };
  if (queue === true) command.queue = true;
  return command;
};

export const commandHeadIndex = (head: CommandHead): number => COMMAND_HEAD_INDEX[head];

export const commandHeadAllowed = (mask: Uint8Array, head: CommandHead): boolean =>
  mask[commandHeadIndex(head)] === 1;

export const decodeAction = (action: EncodedAction): Command => {
  const target = action.target ?? NONE;
  const x = action.x ?? 0;
  const y = action.y ?? 0;
  const kind = action.kind ?? Kind.None;
  const tech = action.tech ?? 0;
  const ability = action.ability ?? Ability.StimPack;
  switch (action.head) {
    case 'train':
      return { t: 'train', building: action.actor, kind };
    case 'research':
      return { t: 'research', building: action.actor, tech };
    case 'build':
      return { t: 'build', unit: action.actor, kind, x, y };
    case 'addon':
      return { t: 'addon', building: action.actor, kind };
    case 'lift':
      return { t: 'lift', building: action.actor };
    case 'land':
      return { t: 'land', building: action.actor, x, y };
    case 'transform':
      return target === NONE
        ? { t: 'transform', unit: action.actor, kind }
        : { t: 'transform', unit: action.actor, kind, target };
    case 'load':
      return { t: 'load', transport: action.actor, unit: target };
    case 'unload':
      return { t: 'unload', transport: action.actor, unit: target, x, y };
    case 'cancelBuild':
      return { t: 'cancelBuild', building: action.actor };
    case 'move':
      return decodedMove(action.actor, x, y, target, action.queue);
    case 'amove':
      return decodedAttackMove(action.actor, x, y, action.queue);
    case 'stop':
      return { t: 'stop', unit: action.actor };
    case 'hold':
      return { t: 'hold', unit: action.actor };
    case 'patrol':
      return { t: 'patrol', unit: action.actor, x, y };
    case 'attack':
      return { t: 'attack', unit: action.actor, target };
    case 'ability': {
      const command: Extract<Command, { t: 'ability' }> = { t: 'ability', unit: action.actor, ability };
      if (target !== NONE) command.target = target;
      if (action.x !== undefined) command.x = action.x;
      if (action.y !== undefined) command.y = action.y;
      return command;
    }
    case 'harvest':
      return { t: 'harvest', unit: action.actor, patch: target };
    case 'repair':
      return { t: 'repair', unit: action.actor, target };
    case 'rally':
      return target === NONE
        ? { t: 'rally', building: action.actor, x, y }
        : { t: 'rally', building: action.actor, x, y, target };
    case 'burrow':
      return { t: 'burrow', unit: action.actor, active: true };
    case 'unburrow':
      return { t: 'burrow', unit: action.actor, active: false };
    case 'mine':
      return { t: 'mine', unit: action.actor };
  }
};

export const encodeCommand = (command: Command): EncodedAction => {
  switch (command.t) {
    case 'train': return { head: 'train', actor: command.building, kind: command.kind };
    case 'research': return { head: 'research', actor: command.building, tech: command.tech };
    case 'build': return { head: 'build', actor: command.unit, kind: command.kind, x: command.x, y: command.y };
    case 'addon': return { head: 'addon', actor: command.building, kind: command.kind };
    case 'lift': return { head: 'lift', actor: command.building };
    case 'land': return { head: 'land', actor: command.building, x: command.x, y: command.y };
    case 'transform': return { head: 'transform', actor: command.unit, kind: command.kind, target: command.target };
    case 'burrow': return { head: command.active ? 'burrow' : 'unburrow', actor: command.unit };
    case 'mine': return { head: 'mine', actor: command.unit };
    case 'load': return { head: 'load', actor: command.transport, target: command.unit };
    case 'unload': return { head: 'unload', actor: command.transport, target: command.unit, x: command.x, y: command.y };
    case 'cancelBuild': return { head: 'cancelBuild', actor: command.building };
    case 'move': return {
      head: 'move', actor: command.unit, x: command.x, y: command.y, target: command.target,
      ...(command.queue === true ? { queue: true } : {}),
    };
    case 'attack': return { head: 'attack', actor: command.unit, target: command.target };
    case 'amove': return {
      head: 'amove', actor: command.unit, x: command.x, y: command.y,
      ...(command.queue === true ? { queue: true } : {}),
    };
    case 'ability': return { head: 'ability', actor: command.unit, ability: command.ability, target: command.target, x: command.x, y: command.y };
    case 'harvest': return { head: 'harvest', actor: command.unit, target: command.patch };
    case 'repair': return { head: 'repair', actor: command.unit, target: command.target };
    case 'rally': return { head: 'rally', actor: command.building, x: command.x, y: command.y, target: command.target };
    case 'hold': return { head: 'hold', actor: command.unit };
    case 'patrol': return { head: 'patrol', actor: command.unit, x: command.x, y: command.y };
    case 'stop': return { head: 'stop', actor: command.unit };
  }
};

const sparseGet = (slots: readonly number[], values: readonly number[], slot: number): number => {
  for (let i = 0; i < slots.length; i++) if (slots[i] === slot) return values[i]!;
  return 0;
};

const sparseAdd = (slots: number[], values: number[], slot: number, value: number): void => {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === slot) {
      values[i] = values[i]! + value;
      return;
    }
  }
  slots.push(slot);
  values.push(value);
};

export const createBatchDecodeReservation = (s: State, player: number): BatchDecodeReservation => ({
  player,
  minerals: s.players.minerals[player] ?? 0,
  gas: s.players.gas[player] ?? 0,
  supplyUsed: s.players.supplyUsed[player] ?? 0,
  entitySlots: s.e.freeTop,
  effectSlots: freeEffectSlots(s),
  energySlots: [],
  energy: [],
  hpSlots: [],
  hp: [],
  ammoSlots: [],
  ammo: [],
});

export const resetBatchDecodeReservation = (
  s: State,
  player: number,
  ctx: BatchDecodeReservation,
): BatchDecodeReservation => {
  ctx.player = player;
  ctx.minerals = s.players.minerals[player] ?? 0;
  ctx.gas = s.players.gas[player] ?? 0;
  ctx.supplyUsed = s.players.supplyUsed[player] ?? 0;
  ctx.entitySlots = s.e.freeTop;
  ctx.effectSlots = freeEffectSlots(s);
  ctx.energySlots.length = 0;
  ctx.energy.length = 0;
  ctx.hpSlots.length = 0;
  ctx.hp.length = 0;
  ctx.ammoSlots.length = 0;
  ctx.ammo.length = 0;
  return ctx;
};

const commandReservation = (
  s: State,
  player: number,
  command: Command,
  ctx: BatchDecodeReservation,
): ActionReservation => {
  const e = s.e;
  switch (command.t) {
    case 'train': {
      const slot = slotOf(command.building);
      const def = Units[command.kind];
      if (!def) return {};
      const costCount = productionCostCount(command.kind);
      const internalCapacity = internalProductCapacity(s, slot, command.kind);
      const entitySlots = internalCapacity > 0
        ? 0
        : e.kind[slot] === Kind.Larva
          ? Math.max(0, productionCount(command.kind) - 1)
          : 1;
      return {
        minerals: def.minerals * costCount,
        gas: def.gas * costCount,
        supply: def.supply * productionCount(command.kind),
        entitySlots,
      };
    }
    case 'research': {
      const def = TechDefs[command.tech];
      if (!def) return {};
      const level = nextTechLevel(s, player, command.tech);
      return { minerals: techMinerals(def, level), gas: techGas(def, level) };
    }
    case 'build': {
      const slot = slotOf(command.unit);
      const def = Units[command.kind];
      if (!def) return {};
      const refundableMinerals = hasPendingBuild(e, slot) ? e.buildCostMinerals[slot]! : 0;
      const refundableGas = hasPendingBuild(e, slot) ? e.buildCostGas[slot]! : 0;
      return {
        minerals: def.minerals - refundableMinerals,
        gas: def.gas - refundableGas,
        entitySlots: def.buildMethod === 'morph' ? 0 : 1,
      };
    }
    case 'addon': {
      const def = Units[command.kind];
      return def ? { minerals: def.minerals, gas: def.gas, entitySlots: 1 } : {};
    }
    case 'transform': {
      const slot = slotOf(command.unit);
      const transform = transformFor(e.kind[slot]!, command.kind);
      const def = Units[command.kind];
      const source = Units[e.kind[slot]!];
      if (transform?.mode !== 'morph' || !def || !source) return {};
      return {
        minerals: def.minerals,
        gas: def.gas,
        supply: Math.max(0, def.supply - source.supply),
      };
    }
    case 'mine':
      return { entitySlots: 1, ammoSlot: slotOf(command.unit), ammoKind: Kind.SpiderMine, ammo: 1 };
    case 'ability': {
      const slot = slotOf(command.unit);
      const ability = Abilities[command.ability];
      if (!ability || !abilityCapacityAvailable(s, command.ability)) return {};
      const freeToggleOff = isFreeAbilityToggleOff(e, slot, ability);
      const r: ActionReservation = {};
      if (!freeToggleOff) {
        r.energySlot = slot;
        r.energy = ability.energyCost;
        r.hpSlot = slot;
        r.hp = ability.hpCost;
      }
      if (command.ability === Ability.NuclearStrike) {
        r.effectSlots = 1;
        r.ammoSlot = readyNukeSilo(s, player, (nukeSilo) => sparseGet(ctx.ammoSlots, ctx.ammo, nukeSilo));
        r.ammoKind = Kind.NuclearMissile;
        r.ammo = 1;
        r.ammoReject = 'missing-requirement';
      } else if (ability.execution?.mode === 'persistent-effect') r.effectSlots = 1;
      else if (command.ability === Ability.SpawnBroodling) r.entitySlots = 1;
      else if (command.ability === Ability.Hallucination) r.entitySlots = 2;
      return r;
    }
    default:
      return {};
  }
};

const rejectReservation = (
  s: State,
  ctx: BatchDecodeReservation,
  r: ActionReservation,
): CommandRejectReason | null => {
  if ((r.minerals ?? 0) > ctx.minerals || (r.gas ?? 0) > ctx.gas) return 'not-affordable';
  if ((r.supply ?? 0) > 0 && ctx.supplyUsed + r.supply! > s.players.supplyMax[ctx.player]!) return 'supply-blocked';
  if ((r.entitySlots ?? 0) > ctx.entitySlots || (r.effectSlots ?? 0) > ctx.effectSlots) return 'capacity-full';
  if (r.energySlot !== undefined && r.energy !== undefined &&
      s.e.energy[r.energySlot]! - sparseGet(ctx.energySlots, ctx.energy, r.energySlot) < r.energy) {
    return 'not-enough-energy';
  }
  if (r.hpSlot !== undefined && r.hp !== undefined &&
      s.e.hp[r.hpSlot]! - sparseGet(ctx.hpSlots, ctx.hp, r.hpSlot) <= r.hp) {
    return 'not-enough-hit-points';
  }
  if (r.ammoSlot !== undefined && r.ammoKind !== undefined && r.ammo !== undefined &&
      (r.ammoSlot === NONE ||
        internalProductReadyCount(s, r.ammoSlot, r.ammoKind) - sparseGet(ctx.ammoSlots, ctx.ammo, r.ammoSlot) < r.ammo)) {
    return r.ammoReject ?? 'target-not-allowed';
  }
  return null;
};

const reserve = (ctx: BatchDecodeReservation, r: ActionReservation): void => {
  ctx.minerals -= r.minerals ?? 0;
  ctx.gas -= r.gas ?? 0;
  ctx.supplyUsed += r.supply ?? 0;
  ctx.entitySlots -= r.entitySlots ?? 0;
  ctx.effectSlots -= r.effectSlots ?? 0;
  if (r.energySlot !== undefined && r.energy !== undefined && r.energy > 0) sparseAdd(ctx.energySlots, ctx.energy, r.energySlot, r.energy);
  if (r.hpSlot !== undefined && r.hp !== undefined && r.hp > 0) sparseAdd(ctx.hpSlots, ctx.hp, r.hpSlot, r.hp);
  if (r.ammoSlot !== undefined && r.ammo !== undefined && r.ammo > 0) sparseAdd(ctx.ammoSlots, ctx.ammo, r.ammoSlot, r.ammo);
};

export const decodeBatchAction = (
  s: State,
  ctx: BatchDecodeReservation,
  action: EncodedAction,
): BatchDecodeResult => {
  const command = decodeAction(action);
  const validation = validateCommand(s, ctx.player, command, { reservedSupply: ctx.supplyUsed });
  if (!validation.ok) return { ok: false, command, reason: validation.reason };
  const r = commandReservation(s, ctx.player, command, ctx);
  const reason = rejectReservation(s, ctx, r);
  if (reason) return { ok: false, command, reason };
  reserve(ctx, r);
  return { ok: true, command };
};

export const decodeActionBatch = (
  s: State,
  player: number,
  actions: readonly EncodedAction[],
): BatchDecodeResult[] => {
  const ctx = createBatchDecodeReservation(s, player);
  return actions.map((action) => decodeBatchAction(s, ctx, action));
};

export const decodeActionBatchInto = (
  s: State,
  player: number,
  actions: readonly EncodedAction[],
  out: BatchDecodeResult[],
  ctx: BatchDecodeReservation = createBatchDecodeReservation(s, player),
): BatchDecodeResult[] => {
  resetBatchDecodeReservation(s, player, ctx);
  out.length = 0;
  for (let i = 0; i < actions.length; i++) out.push(decodeBatchAction(s, ctx, actions[i]!));
  return out;
};

export const commandForHead = (
  s: State,
  actor: number,
  head: CommandHead,
  opts: CommandMaskOptions = {},
): Command => {
  const point = actorPoint(s, actor, opts);
  return decodeAction({
    head,
    actor,
    target: opts.target,
    x: point.x,
    y: point.y,
    kind: opts.kind,
    tech: opts.tech,
    ability: opts.ability,
    queue: opts.queue,
  });
};

const commandForResolvedPoint = (
  actor: number,
  head: CommandHead,
  point: { x: number; y: number },
  opts: CommandMaskOptions,
  target?: number,
  ability?: number,
): Command => decodeAction({
  head,
  actor,
  target,
  x: point.x,
  y: point.y,
  kind: opts.kind,
  tech: opts.tech,
  ability: ability ?? opts.ability,
  queue: opts.queue,
});

export const commandHeadMask = (
  s: State,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
): Uint8Array => {
  const mask = new Uint8Array(COMMAND_HEADS.length);
  return writeCommandHeadMask(mask, s, player, actor, opts);
};

export const writeCommandHeadMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
): Uint8Array => {
  for (let i = 0; i < COMMAND_HEADS.length; i++) {
    const command = commandForHead(s, actor, COMMAND_HEADS[i]!, opts);
    mask[i] = validateCommand(s, player, command).ok ? 1 : 0;
  }
  return mask;
};

const actorKind = (s: State, actor: number): number => {
  if (!isAlive(s.e, actor)) return 0;
  return s.e.kind[slotOf(actor)]!;
};

export const trainKindCandidates = (s: State, producer: number): readonly number[] => {
  const def = Units[actorKind(s, producer)];
  return def?.produces ?? [];
};

export const buildKindCandidates = (s: State, worker: number): readonly number[] => {
  const def = Units[actorKind(s, worker)];
  return def && (def.roles & Role.Worker) !== 0 ? workerBuildKindsFor(def.race) : [];
};

export const researchTechCandidates = (s: State, producer: number): readonly number[] => {
  const kind = actorKind(s, producer);
  return RESEARCH_BY_PRODUCER.get(kind) ?? [];
};

export const addonKindCandidates = (s: State, producer: number): readonly number[] => {
  const kind = actorKind(s, producer);
  return ADDONS_BY_PARENT.get(kind) ?? [];
};

export const transformKindCandidates = (s: State, actor: number): readonly number[] =>
  transformTargetsFor(actorKind(s, actor));

export const abilityCandidates = (s: State, actor: number): readonly number[] =>
  Units[actorKind(s, actor)]?.abilities ?? [];

export const trainKindMask = (
  s: State,
  player: number,
  producer: number,
  kinds: readonly number[] = trainKindCandidates(s, producer),
): Uint8Array => {
  const mask = new Uint8Array(kinds.length);
  return writeTrainKindMask(mask, s, player, producer, kinds);
};

export const writeTrainKindMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  producer: number,
  kinds: readonly number[] = trainKindCandidates(s, producer),
): Uint8Array => {
  for (let i = 0; i < kinds.length; i++) {
    mask[i] = validateCommand(s, player, { t: 'train', building: producer, kind: kinds[i]! }).ok ? 1 : 0;
  }
  return mask;
};

export const buildKindMask = (
  s: State,
  player: number,
  worker: number,
  opts: BuildMaskOptions,
): Uint8Array => {
  const kinds = opts.kinds ?? buildKindCandidates(s, worker);
  const mask = new Uint8Array(kinds.length);
  return writeBuildKindMask(mask, s, player, worker, { ...opts, kinds });
};

export const writeBuildKindMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  worker: number,
  opts: BuildMaskOptions,
): Uint8Array => {
  const kinds = opts.kinds ?? buildKindCandidates(s, worker);
  for (let i = 0; i < kinds.length; i++) {
    mask[i] = validateCommand(s, player, { t: 'build', unit: worker, kind: kinds[i]!, x: opts.x, y: opts.y }).ok ? 1 : 0;
  }
  return mask;
};

export const researchTechMask = (
  s: State,
  player: number,
  producer: number,
  techs: readonly number[] = researchTechCandidates(s, producer),
): Uint8Array => {
  const mask = new Uint8Array(techs.length);
  return writeResearchTechMask(mask, s, player, producer, techs);
};

export const writeResearchTechMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  producer: number,
  techs: readonly number[] = researchTechCandidates(s, producer),
): Uint8Array => {
  for (let i = 0; i < techs.length; i++) {
    mask[i] = validateCommand(s, player, { t: 'research', building: producer, tech: techs[i]! }).ok ? 1 : 0;
  }
  return mask;
};

export const addonKindMask = (
  s: State,
  player: number,
  producer: number,
  kinds: readonly number[] = addonKindCandidates(s, producer),
): Uint8Array => {
  const mask = new Uint8Array(kinds.length);
  return writeAddonKindMask(mask, s, player, producer, kinds);
};

export const writeAddonKindMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  producer: number,
  kinds: readonly number[] = addonKindCandidates(s, producer),
): Uint8Array => {
  for (let i = 0; i < kinds.length; i++) {
    mask[i] = validateCommand(s, player, { t: 'addon', building: producer, kind: kinds[i]! }).ok ? 1 : 0;
  }
  return mask;
};

export const transformKindMask = (
  s: State,
  player: number,
  actor: number,
  kinds: readonly number[] = transformKindCandidates(s, actor),
  target = NONE,
): Uint8Array => {
  const mask = new Uint8Array(kinds.length);
  return writeTransformKindMask(mask, s, player, actor, kinds, target);
};

export const writeTransformKindMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  actor: number,
  kinds: readonly number[] = transformKindCandidates(s, actor),
  target = NONE,
): Uint8Array => {
  for (let i = 0; i < kinds.length; i++) {
    const command: Command = target === NONE
      ? { t: 'transform', unit: actor, kind: kinds[i]! }
      : { t: 'transform', unit: actor, kind: kinds[i]!, target };
    mask[i] = validateCommand(s, player, command).ok ? 1 : 0;
  }
  return mask;
};

export const abilityMask = (
  s: State,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
  abilities: readonly number[] = abilityCandidates(s, actor),
): Uint8Array => {
  const mask = new Uint8Array(abilities.length);
  return writeAbilityMask(mask, s, player, actor, opts, abilities);
};

export const writeAbilityMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
  abilities: readonly number[] = abilityCandidates(s, actor),
): Uint8Array => {
  const point = actorPoint(s, actor, opts);
  for (let i = 0; i < abilities.length; i++) {
    const command = commandForResolvedPoint(actor, 'ability', point, opts, opts.target, abilities[i]!);
    mask[i] = validateCommand(s, player, command).ok ? 1 : 0;
  }
  return mask;
};

export const entityTargetMask = (
  s: State,
  player: number,
  actor: number,
  head: Extract<CommandHead, 'move' | 'attack' | 'ability' | 'harvest' | 'repair' | 'rally' | 'load' | 'unload' | 'transform'>,
  targets: readonly number[],
  opts: CommandMaskOptions = {},
): Uint8Array => {
  const mask = new Uint8Array(targets.length);
  return writeEntityTargetMask(mask, s, player, actor, head, targets, opts);
};

const commandIntentTargetAllowed = (
  s: State,
  player: number,
  actor: number,
  head: Extract<CommandHead, 'harvest' | 'repair' | 'rally'>,
  target: number,
  point: { x: number; y: number },
): boolean => {
  switch (head) {
    case 'harvest':
      return harvestModeCandidates(s, player, [actor], target).length > 0;
    case 'repair':
      return repairModeCandidates(s, player, [actor], target).length > 0;
    case 'rally':
      return rallyModeCandidates(s, player, [actor], { hit: target, x: point.x, y: point.y })
        .some((command) => command.t === 'rally' && command.target === target);
  }
};

export const writeEntityTargetMask = (
  mask: Uint8Array,
  s: State,
  player: number,
  actor: number,
  head: Extract<CommandHead, 'move' | 'attack' | 'ability' | 'harvest' | 'repair' | 'rally' | 'load' | 'unload' | 'transform'>,
  targets: readonly number[],
  opts: CommandMaskOptions = {},
): Uint8Array => {
  const point = actorPoint(s, actor, opts);
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    mask[i] = (head === 'harvest' || head === 'repair' || head === 'rally')
      ? (commandIntentTargetAllowed(s, player, actor, head, target, point) ? 1 : 0)
      : (validateCommand(s, player, commandForResolvedPoint(actor, head, point, opts, target)).ok ? 1 : 0);
  }
  return mask;
};

export const liveEntityCandidates = (s: State): number[] => {
  const ids: number[] = [];
  for (let i = 0; i < s.e.hi; i++) if (s.e.alive[i] === 1) ids.push(eid(s.e, i));
  return ids;
};
