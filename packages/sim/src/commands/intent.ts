import type { Command, CommandRejectReason } from './types.ts';
import { Abilities, ResourceType, Role, TechDefs, Units, workerBuildKindsFor, type AbilityTarget } from '../data.ts';
import { addonParentKind } from '../mechanics/addons.ts';
import { canWorkerStartStructure } from './build.ts';
import { canPay } from './shared.ts';
import { canAcceptCargo, sameTeam, transportCapacity, unloadAnchorSlot } from '../mechanics/cargo.ts';
import { ONE } from '../fixed.ts';
import { hasPendingBuild } from '../mechanics/build-cancel.ts';
import {
  producerSupportsWorkerRally, resolveUnitRallyEndpoint, resolveWorkerRallyEndpoint, type RallyEndpoint,
} from '../rally.ts';
import { canPlayerGatherTarget, canPlayerGatherTargetSlot } from '../mechanics/resources.ts';
import type { TravelEndpoint, TravelIntent } from './travel.ts';
import { entityWorkQueue } from '../entity/work-queue.ts';
import { transformFor, transformTargetsFor } from '../mechanics/transforms.ts';
import { validateCommand } from './validate.ts';
import { eid, NONE, isAlive, isEnemy, nearest, slotOf, type State } from '../entity/world.ts';

export type SmartCommandScheme = 'mobile' | 'desktop';

export type SmartCommandTarget = {
  hit: number;
  x: number;
  y: number;
};

export type ProducedUnitRallyIntent =
  | { kind: 'none' }
  | { kind: 'gather-near'; x: number; y: number }
  | { kind: 'gather-target'; target: number }
  | { kind: 'load'; transport: number; endpoint: TravelEndpoint }
  | { kind: 'travel'; endpoint: TravelEndpoint; intent: TravelIntent };

type CandidateValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

export type AbilitySelectionOption = {
  id: number;
  ok: boolean;
  target: AbilityTarget;
  representative: number;
  reason?: CommandRejectReason;
  commands?: Command[];
};

export type TransformSelectionOption = {
  id: number;
  ok: boolean;
  representative: number;
  reason?: CommandRejectReason;
  commands?: Command[];
};

export type ResearchSelectionOption = {
  id: number;
  ok: boolean;
  representative: number;
  reason?: CommandRejectReason;
  commands?: Command[];
};

export type TrainSelectionOption = {
  id: number;
  ok: boolean;
  representative: number;
  reason?: CommandRejectReason;
  commands?: Command[];
};

export type AddonSelectionOption = {
  id: number;
  ok: boolean;
  representative: number;
  reason?: CommandRejectReason;
  commands?: Command[];
};

export type WorkerBuildSelectionOption = {
  id: number;
  ok: boolean;
  representative: number;
  reason?: CommandRejectReason;
};

export const commandRejectReasonPriority: Record<CommandRejectReason, number> = {
  'missing-requirement': 0,
  'not-affordable': 1,
  'supply-blocked': 2,
  'queue-full': 3,
  'capacity-full': 4,
  'incomplete-producer': 5,
  'not-enough-energy': 6,
  'not-enough-hit-points': 7,
  'placement-requires-geyser': 8,
  'placement-off-map': 9,
  'placement-blocked': 10,
  'target-not-found': 11,
  'target-out-of-range': 12,
  'target-not-allowed': 13,
  'missing-capability': 14,
  'invalid-ability': 15,
  'wrong-owner': 16,
  'stale-entity': 17,
};

const endpointFromRally = (x: number, y: number, target: number): TravelEndpoint =>
  target === NONE ? { x, y } : { x, y, target };

const defaultWorkerRallyEndpoint = (s: State, producer: number): RallyEndpoint | null => {
  if (!producerSupportsWorkerRally(s, producer)) return null;
  const e = s.e;
  const owner = e.owner[producer]!;
  const target = nearest(s, e.x[producer]!, e.y[producer]!, (sl) =>
    canPlayerGatherTargetSlot(s, owner, sl) &&
    Units[e.kind[sl]!]!.resourceType === ResourceType.Minerals);
  return target === NONE ? null : { x: e.x[target]!, y: e.y[target]!, target };
};

const valid = (s: State, player: number, command: Command): Command[] =>
  validateCommand(s, player, command).ok ? [command] : [];

const firstValid = (s: State, player: number, commands: readonly Command[]): Command[] => {
  for (const command of commands) {
    if (validateCommand(s, player, command).ok) return [command];
  }
  return [];
};

export const smartCommandCandidates = (
  s: State,
  player: number,
  actor: number,
  target: SmartCommandTarget,
  scheme: SmartCommandScheme,
): Command[] => {
  void scheme;
  const e = s.e;
  if (!isAlive(e, actor)) return [];
  const actorSlot = slotOf(actor);
  const targetSlot = target.hit >= 0 && isAlive(e, target.hit) ? slotOf(target.hit) : -1;
  const actorIsStructure = (e.flags[actorSlot]! & Role.Structure) !== 0;

  if (targetSlot >= 0) {
    const commands: Command[] = [];
    if (isEnemy(s, player, e.owner[targetSlot]!)) {
      commands.push({ t: 'attack', unit: actor, target: target.hit });
    }
    if (canPlayerGatherTarget(s, player, target.hit)) {
      commands.push({ t: 'harvest', unit: actor, patch: target.hit });
    }
    commands.push(
      { t: 'repair', unit: actor, target: target.hit },
      { t: 'load', transport: target.hit, unit: actor },
      { t: 'load', transport: actor, unit: target.hit },
    );

    if (actorIsStructure) {
      commands.push({ t: 'rally', building: actor, x: target.x, y: target.y, target: target.hit });
    } else {
      commands.push({ t: 'move', unit: actor, x: target.x, y: target.y, target: target.hit });
    }

    const candidate = firstValid(s, player, commands);
    if (candidate.length > 0) return candidate;
  }

  if (actorIsStructure) return valid(s, player, { t: 'rally', building: actor, x: target.x, y: target.y });
  return valid(s, player, { t: 'move', unit: actor, x: target.x, y: target.y });
};

export const attackModeCandidates = (
  s: State,
  player: number,
  actor: number,
  target: SmartCommandTarget,
): Command[] => {
  const e = s.e;
  if (!isAlive(e, actor)) return [];
  const targetSlot = target.hit >= 0 && isAlive(e, target.hit) ? slotOf(target.hit) : -1;
  if (targetSlot >= 0 && sameTeam(s, player, e.owner[targetSlot]!)) return [];
  return targetSlot >= 0 && isEnemy(s, player, e.owner[targetSlot]!)
    ? valid(s, player, { t: 'attack', unit: actor, target: target.hit })
    : valid(s, player, { t: 'amove', unit: actor, x: target.x, y: target.y });
};

export const harvestModeCandidates = (
  s: State,
  player: number,
  actors: Iterable<number>,
  target: number,
): Command[] => {
  if (!isAlive(s.e, target)) return [];
  const commands: Command[] = [];
  for (const actor of actors) {
    const command: Command = { t: 'harvest', unit: actor, patch: target };
    if (validateCommand(s, player, command).ok) commands.push(command);
  }
  return commands;
};

export const repairModeCandidates = (
  s: State,
  player: number,
  actors: Iterable<number>,
  target: number,
): Command[] => {
  const e = s.e;
  if (!isAlive(e, target)) return [];
  const targetSlot = slotOf(target);
  if (e.built[targetSlot] !== 1) {
    let best: Command | null = null;
    let bestD = Infinity;
    for (const actor of actors) {
      const command: Command = { t: 'repair', unit: actor, target };
      if (!validateCommand(s, player, command).ok) continue;
      const actorSlot = slotOf(actor);
      const dx = e.x[actorSlot]! - e.x[targetSlot]!;
      const dy = e.y[actorSlot]! - e.y[targetSlot]!;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = command;
      }
    }
    return best ? [best] : [];
  }

  const commands: Command[] = [];
  for (const actor of actors) {
    const command: Command = { t: 'repair', unit: actor, target };
    if (validateCommand(s, player, command).ok) commands.push(command);
  }
  return commands;
};

export const loadSelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
): Command[] => {
  const e = s.e;
  const transports = selected.filter((id) => isAlive(e, id) && transportCapacity(s, slotOf(id)) > 0);
  const commands: Command[] = [];
  for (const transport of transports) {
    for (const unit of selected) {
      if (transports.includes(unit)) continue;
      const command: Command = { t: 'load', transport, unit };
      if (validateCommand(s, player, command).ok) commands.push(command);
    }
  }
  return commands;
};

const unloadOffsets: readonly (readonly [number, number])[] = [
  [0, 64], [64, 0], [-64, 0], [0, -64],
  [64, 64], [-64, 64], [64, -64], [-64, -64],
];

export const unloadSelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
): Command[] => {
  const e = s.e;
  const commands: Command[] = [];
  for (const transport of selected) {
    if (!isAlive(e, transport)) continue;
    const transportSlot = slotOf(transport);
    const anchor = unloadAnchorSlot(s, transportSlot);
    if (anchor === NONE) continue;
    let n = 0;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== player || e.container[i] !== transport) continue;
      const [ox, oy] = unloadOffsets[n % unloadOffsets.length]!;
      const ring = Math.trunc(n / unloadOffsets.length);
      const command: Command = {
        t: 'unload',
        transport,
        unit: eid(e, i),
        x: e.x[anchor]! + (ox + ring * 24) * ONE,
        y: e.y[anchor]! + oy * ONE,
      };
      if (validateCommand(s, player, command).ok) {
        commands.push(command);
        n++;
      }
    }
  }
  return commands;
};

export const transformSelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
  kind: number,
): Command[] => {
  const e = s.e;
  const used = new Set<number>();
  const mergePartnerForSelection = (id: number): number => {
    if (!isAlive(e, id)) return NONE;
    for (const other of selected) {
      if (other === id || used.has(other) || !isAlive(e, other)) continue;
      const command: Command = { t: 'transform', unit: id, kind, target: other };
      if (validateCommand(s, player, command).ok) return other;
    }
    return NONE;
  };
  const commands: Command[] = [];
  for (const id of selected) {
    if (used.has(id)) continue;
    const command: Command = { t: 'transform', unit: id, kind };
    if (!isAlive(e, id) || !validateCommand(s, player, command).ok) continue;
    const transform = transformFor(e.kind[slotOf(id)]!, kind);
    if (transform?.mode === 'merge') {
      const partner = mergePartnerForSelection(id);
      if (partner !== NONE) {
        commands.push({ ...command, target: partner });
        used.add(id);
        used.add(partner);
      } else {
        commands.push(command);
        used.add(id);
      }
    } else {
      commands.push(command);
    }
  }
  return commands;
};

const addTransformSelectionOption = (
  options: Map<number, TransformSelectionOption>,
  id: number,
  representative: number,
  result: CandidateValidation,
): void => {
  const current = options.get(id);
  if (result.ok) {
    if (!current?.ok) options.set(id, { id, ok: true, representative });
    return;
  }
  if (current?.ok) return;
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
    options.set(id, { id, ok: false, representative, reason: result.reason });
  }
};

export const transformSelectionOptions = (
  s: State,
  player: number,
  selected: readonly number[],
): TransformSelectionOption[] => {
  const e = s.e;
  const options = new Map<number, TransformSelectionOption>();
  for (const id of selected) {
    if (!isAlive(e, id)) continue;
    for (const kind of transformTargetsFor(e.kind[slotOf(id)]!)) {
      addTransformSelectionOption(options, kind, id, validateCommand(s, player, { t: 'transform', unit: id, kind }));
    }
  }
  for (const option of options.values()) {
    if (option.ok) option.commands = transformSelectionCandidates(s, player, selected, option.id);
  }
  return [...options.values()].sort((a, b) => a.id - b.id);
};

export const trainSelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
  kind: number,
): Command[] => {
  const e = s.e;
  let best: Command | null = null;
  let bestLoad = Infinity;
  for (const building of selected) {
    if (!isAlive(e, building)) continue;
    const command: Command = { t: 'train', building, kind };
    if (!validateCommand(s, player, command).ok) continue;
    const load = entityWorkQueue(s, slotOf(building)).producerLoad;
    if (load < bestLoad) {
      best = command;
      bestLoad = load;
    }
  }
  return best ? [best] : [];
};

type TrainSelectionOptionRecord = TrainSelectionOption & { priority?: number };

const addTrainSelectionOption = (
  options: Map<number, TrainSelectionOptionRecord>,
  id: number,
  representative: number,
  result: CandidateValidation,
  priority: number,
): void => {
  const current = options.get(id);
  if (result.ok) {
    if (!current?.ok || priority < (current.priority ?? Infinity)) {
      options.set(id, { id, ok: true, representative, priority });
    }
    return;
  }
  if (current?.ok) return;
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
    options.set(id, { id, ok: false, representative, reason: result.reason, priority });
  }
};

export const trainSelectionOptions = (
  s: State,
  player: number,
  selected: readonly number[],
): TrainSelectionOption[] => {
  const e = s.e;
  const options = new Map<number, TrainSelectionOptionRecord>();
  for (const building of selected) {
    if (!isAlive(e, building)) continue;
    const slot = slotOf(building);
    for (const kind of Units[e.kind[slot]!]!.produces) {
      const command: Command = { t: 'train', building, kind };
      const result = validateCommand(s, player, command);
      if (e.illusion[slot] === 1 && !result.ok && result.reason === 'missing-capability') continue;
      addTrainSelectionOption(options, kind, building, result, entityWorkQueue(s, slot).producerLoad);
    }
  }
  for (const option of options.values()) {
    if (option.ok) option.commands = trainSelectionCandidates(s, player, selected, option.id);
  }
  return [...options.values()]
    .sort((a, b) => a.id - b.id)
    .map(({ priority: _priority, ...option }) => option);
};

export const addonSelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
  kind: number,
): Command[] => {
  const e = s.e;
  for (const building of selected) {
    if (!isAlive(e, building)) continue;
    const command: Command = { t: 'addon', building, kind };
    if (validateCommand(s, player, command).ok) return [command];
  }
  return [];
};

const addAddonSelectionOption = (
  options: Map<number, AddonSelectionOption>,
  id: number,
  representative: number,
  result: CandidateValidation,
): void => {
  const current = options.get(id);
  if (result.ok) {
    if (!current?.ok) options.set(id, { id, ok: true, representative });
    return;
  }
  if (current?.ok) return;
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
    options.set(id, { id, ok: false, representative, reason: result.reason });
  }
};

const ADDON_KINDS = Object.keys(Units).map(Number).filter((kind) => Units[kind]?.buildMethod === 'addon');

export const addonSelectionOptions = (
  s: State,
  player: number,
  selected: readonly number[],
): AddonSelectionOption[] => {
  const e = s.e;
  const options = new Map<number, AddonSelectionOption>();
  for (const building of selected) {
    if (!isAlive(e, building)) continue;
    const kind = e.kind[slotOf(building)]!;
    for (const addon of ADDON_KINDS) {
      if (addonParentKind(addon) !== kind) continue;
      const command: Command = { t: 'addon', building, kind: addon };
      const result = validateCommand(s, player, command);
      if (result.ok || result.reason !== 'target-not-allowed') {
        addAddonSelectionOption(options, addon, building, result);
      }
    }
  }
  for (const option of options.values()) {
    if (option.ok) option.commands = addonSelectionCandidates(s, player, selected, option.id);
  }
  return [...options.values()].sort((a, b) => a.id - b.id);
};

const addWorkerBuildSelectionOption = (
  options: Map<number, WorkerBuildSelectionOption>,
  id: number,
  representative: number,
  result: CandidateValidation,
): void => {
  const current = options.get(id);
  if (result.ok) {
    if (!current?.ok) options.set(id, { id, ok: true, representative });
    return;
  }
  if (current?.ok) return;
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
    options.set(id, { id, ok: false, representative, reason: result.reason });
  }
};

export const workerBuildSelectionOptions = (
  s: State,
  player: number,
  selected: readonly number[],
): WorkerBuildSelectionOption[] => {
  const e = s.e;
  const options = new Map<number, WorkerBuildSelectionOption>();
  for (const worker of selected) {
    if (!isAlive(e, worker)) continue;
    const slot = slotOf(worker);
    if ((e.flags[slot]! & Role.Worker) === 0) continue;
    const kind = e.kind[slot]!;
    for (const build of Units[kind] ? workerBuildKindsFor(Units[kind]!.race) : []) {
      const starter = canWorkerStartStructure(s, player, slot, build);
      if (!starter.ok) {
        if (starter.reason !== 'missing-capability') {
          addWorkerBuildSelectionOption(options, build, worker, starter);
        }
        continue;
      }
      const def = Units[build]!;
      const credit = hasPendingBuild(e, slot)
        ? { minerals: e.buildCostMinerals[slot]!, gas: e.buildCostGas[slot]! }
        : {};
      addWorkerBuildSelectionOption(
        options,
        build,
        worker,
        canPay(s, player, { minerals: def.minerals, gas: def.gas }, credit),
      );
    }
  }
  return [...options.values()].sort((a, b) => a.id - b.id);
};

export const researchSelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
  tech: number,
): Command[] => {
  const e = s.e;
  for (const building of selected) {
    if (!isAlive(e, building)) continue;
    const command: Command = { t: 'research', building, tech };
    if (validateCommand(s, player, command).ok) return [command];
  }
  return [];
};

const addResearchSelectionOption = (
  options: Map<number, ResearchSelectionOption>,
  id: number,
  representative: number,
  result: CandidateValidation,
): void => {
  const current = options.get(id);
  if (result.ok) {
    if (!current?.ok) options.set(id, { id, ok: true, representative });
    return;
  }
  if (current?.ok) return;
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
    options.set(id, { id, ok: false, representative, reason: result.reason });
  }
};

export const researchSelectionOptions = (
  s: State,
  player: number,
  selected: readonly number[],
): ResearchSelectionOption[] => {
  const e = s.e;
  const options = new Map<number, ResearchSelectionOption>();
  for (const building of selected) {
    if (!isAlive(e, building)) continue;
    const kind = e.kind[slotOf(building)]!;
    for (const key of Object.keys(TechDefs)) {
      const tech = Number(key);
      if (!TechDefs[tech]?.producers.includes(kind)) continue;
      const command: Command = { t: 'research', building, tech };
      const result = validateCommand(s, player, command);
      if (result.ok || result.reason !== 'target-not-allowed') {
        addResearchSelectionOption(options, tech, building, result);
      }
    }
  }
  for (const option of options.values()) {
    if (option.ok) option.commands = researchSelectionCandidates(s, player, selected, option.id);
  }
  return [...options.values()].sort((a, b) => a.id - b.id);
};

export const selfAbilitySelectionCandidates = (
  s: State,
  player: number,
  selected: readonly number[],
  ability: number,
): Command[] => {
  if (Abilities[ability]?.target !== 'self') return [];
  const e = s.e;
  const commands: Command[] = [];
  for (const unit of selected) {
    if (!isAlive(e, unit)) continue;
    const command: Command = { t: 'ability', unit, ability };
    if (validateCommand(s, player, command).ok) commands.push(command);
  }
  return commands;
};

const abilityAvailability = (s: State, player: number, unit: number, abilityId: number): CandidateValidation => {
  const ability = Abilities[abilityId];
  if (!ability) return { ok: false, reason: 'invalid-ability' };
  const result = validateCommand(s, player, { t: 'ability', unit, ability: abilityId });
  if (result.ok) return result;
  return ability.target !== 'self' && result.reason === 'target-not-found' ? { ok: true } : result;
};

const addAbilitySelectionOption = (
  options: Map<number, AbilitySelectionOption>,
  id: number,
  target: AbilityTarget,
  representative: number,
  result: CandidateValidation,
): void => {
  const current = options.get(id);
  if (result.ok) {
    if (!current?.ok) options.set(id, { id, ok: true, target, representative });
    return;
  }
  if (current?.ok) return;
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
    options.set(id, { id, ok: false, target, representative, reason: result.reason });
  }
};

export const abilitySelectionOptions = (
  s: State,
  player: number,
  selected: readonly number[],
): AbilitySelectionOption[] => {
  const e = s.e;
  const options = new Map<number, AbilitySelectionOption>();
  for (const id of selected) {
    if (!isAlive(e, id)) continue;
    const slot = slotOf(id);
    for (const abilityId of Units[e.kind[slot]!]!.abilities) {
      const ability = Abilities[abilityId];
      if (!ability) continue;
      addAbilitySelectionOption(options, abilityId, ability.target, id, abilityAvailability(s, player, id, abilityId));
    }
  }
  for (const option of options.values()) {
    if (option.ok && option.target === 'self') {
      option.commands = selfAbilitySelectionCandidates(s, player, selected, option.id);
    }
  }
  return [...options.values()].sort((a, b) => a.id - b.id);
};

export const rallyModeCandidates = (
  s: State,
  player: number,
  buildings: Iterable<number>,
  target: SmartCommandTarget,
): Command[] => {
  const e = s.e;
  const targetSlot = target.hit >= 0 && isAlive(e, target.hit) ? slotOf(target.hit) : -1;
  const canTarget = targetSlot >= 0 &&
    (canPlayerGatherTarget(s, player, target.hit) || sameTeam(s, player, e.owner[targetSlot]!));
  const commands: Command[] = [];
  for (const building of buildings) {
    const targeted: Command | null = canTarget
      ? { t: 'rally', building, x: target.x, y: target.y, target: target.hit }
      : null;
    if (targeted && validateCommand(s, player, targeted).ok) {
      commands.push(targeted);
      continue;
    }
    const point: Command = { t: 'rally', building, x: target.x, y: target.y };
    if (validateCommand(s, player, point).ok) commands.push(point);
  }
  return commands;
};

export const producedUnitRallyIntent = (
  s: State,
  producer: number,
  unit: number,
): ProducedUnitRallyIntent => {
  const e = s.e;
  const isWorker = (e.flags[unit]! & Role.Worker) !== 0;
  const workerRally = isWorker ? resolveWorkerRallyEndpoint(s, producer, unit) : null;
  const unitRally = resolveUnitRallyEndpoint(s, producer, unit);

  if (workerRally) {
    const target = workerRally.target;
    if (target !== NONE && Units[e.kind[target]!]!.resourceType === ResourceType.Gas) {
      return { kind: 'gather-target', target };
    }
    return { kind: 'gather-near', x: workerRally.x, y: workerRally.y };
  }

  if (isWorker && !unitRally) {
    const fallback = defaultWorkerRallyEndpoint(s, producer);
    return fallback
      ? { kind: 'gather-near', x: fallback.x, y: fallback.y }
      : { kind: 'gather-near', x: e.x[unit]!, y: e.y[unit]! };
  }

  if (!unitRally) return { kind: 'none' };
  const endpoint = endpointFromRally(unitRally.x, unitRally.y, unitRally.target);
  if (unitRally.target !== NONE && canAcceptCargo(s, unitRally.target, unit)) {
    return { kind: 'load', transport: unitRally.target, endpoint };
  }
  return { kind: 'travel', endpoint, intent: isWorker ? 'move' : 'smart' };
};
