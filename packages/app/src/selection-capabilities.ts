import {
  Abilities, Ability, Kind, Role, TechDefs, Units,
  addonParentKind, canWorkerStartStructure, eid, isAlive,
  isLiftedStructureFlags, slotOf, transformTargetsFor, transportCapacity,
  validateCommand, workerBuildKindsFor,
  type CommandRejectReason, type CommandValidation, type State,
} from './sim.ts';
import { entityLifecycleStatus } from './entity-lifecycle-status.ts';
import { entityWorkQueue } from './entity-work-queue.ts';
import { entitySelectionName } from './entity-presentation.ts';
import { illusionPresentation } from './illusion-presentation.ts';
import { EMPTY_SELECTION_VIEW, type CommandOption, type SelectionView } from './store.ts';

type CommandOptionMeta = Pick<CommandOption, 'label' | 'detail'>;
type CanSeeEntity = (slot: number) => boolean;

const TECH_IDS = Object.keys(TechDefs).map(Number);
const ADDON_IDS = Object.keys(Units).map(Number).filter((kind) => Units[kind]?.buildMethod === 'addon');
const REASON_PRIORITY: Record<CommandRejectReason, number> = {
  'missing-requirement': 0,
  'not-affordable': 1,
  'supply-blocked': 2,
  'queue-full': 3,
  'incomplete-producer': 4,
  'not-enough-energy': 5,
  'not-enough-hit-points': 6,
  'placement-requires-geyser': 7,
  'placement-off-map': 8,
  'placement-blocked': 9,
  'target-not-found': 10,
  'target-out-of-range': 11,
  'target-not-allowed': 12,
  'missing-capability': 13,
  'invalid-ability': 14,
  'wrong-owner': 15,
  'stale-entity': 16,
};

const addOption = (options: Map<number, CommandOption>, id: number, result: CommandValidation, meta: CommandOptionMeta = {}): void => {
  const current = options.get(id);
  if (result.ok) {
    options.set(id, { id, ok: true, ...meta });
    return;
  }
  if (current?.ok) return;
  if (!current || REASON_PRIORITY[result.reason] < REASON_PRIORITY[current.reason!]) {
    options.set(id, { id, ok: false, reason: result.reason, ...meta });
  }
};

const optionKinds = (options: Map<number, CommandOption>): number[] =>
  [...options.values()].filter((o) => o.ok).map((o) => o.id).sort((a, b) => a - b);

const sortedOptions = (options: Map<number, CommandOption>): CommandOption[] =>
  [...options.values()].sort((a, b) => a.id - b.id);

const nukeTrainOptionMeta = (s: State, slot: number): CommandOptionMeta => {
  const work = entityWorkQueue(s, slot);
  if (work.internalReady?.t === 'internal-ready' && work.internalReady.kind === Kind.NuclearMissile) return { label: work.internalReady.label, detail: work.internalReady.detail };
  if (work.active?.t === 'production' && work.active.kind === Kind.NuclearMissile) return { label: 'Arming Nuke', detail: 'Arming' };
  return { label: 'Arm Nuke' };
};

const abilityAvailability = (s: State, player: number, slot: number, abilityId: number): CommandValidation => {
  const e = s.e;
  const ability = Abilities[abilityId];
  if (!ability) return { ok: false, reason: 'invalid-ability' };
  const result = validateCommand(s, player, { t: 'ability', unit: eid(e, slot), ability: abilityId });
  if (result.ok) return result;
  if (ability.target !== 'self' && result.reason === 'target-not-found') return { ok: true };
  return result;
};

const addWorkerBuildOptions = (
  s: State,
  player: number,
  slot: number,
  buildOptions: Map<number, CommandOption>,
): void => {
  const e = s.e;
  const kind = e.kind[slot]!;
  for (const build of workerBuildKindsFor(Units[kind]!.race)) {
    const starter = canWorkerStartStructure(s, player, slot, build);
    if (!starter.ok) {
      if (starter.reason !== 'missing-capability') addOption(buildOptions, build, starter);
    } else {
      const def = Units[build]!;
      addOption(buildOptions, build, s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas
        ? { ok: false, reason: 'not-affordable' }
        : { ok: true });
    }
  }
};

export const selectionCapabilities = (
  s: State,
  player: number,
  selectedIds: Iterable<number>,
  canSeeEntity: CanSeeEntity,
): SelectionView => {
  const e = s.e;
  let count = 0;
  let kindName = '';
  let primarySlot = -1;
  let canRally = false;
  let canLoad = false;
  let canUnload = false;
  let canHarvest = false;
  let canRepair = false;
  let canAttackMove = false;
  let canStop = false;
  let canBurrow = false;
  let canUnburrow = false;
  let canMine = false;
  let canLift = false;
  let canLand = false;
  let canCancel = false;
  const buildOptions = new Map<number, CommandOption>();
  const addonOptions = new Map<number, CommandOption>();
  const transformOptions = new Map<number, CommandOption>();
  const trainOptions = new Map<number, CommandOption>();
  const abilityOptions = new Map<number, CommandOption>();
  const researchOptions = new Map<number, CommandOption>();
  const selected = [...selectedIds].filter((id) => isAlive(e, id));

  for (const id of selected) {
    const slot = slotOf(id);
    if (e.owner[slot] !== player && !canSeeEntity(slot)) continue;
    count++;
    const k = e.kind[slot]!;
    const completed = e.built[slot] === 1;
    if (primarySlot < 0) primarySlot = slot;
    kindName = `${illusionPresentation(s, player, slot).labelPrefix}${entitySelectionName(s, slot)}`;
    const nonStructure = (e.flags[slot]! & Role.Structure) === 0;
    if (nonStructure && validateCommand(s, player, { t: 'amove', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canAttackMove = true;
    if (completed && validateCommand(s, player, { t: 'stop', unit: id }).ok) canStop = true;
    if (completed && (e.flags[slot]! & Role.Worker) !== 0) {
      if (e.illusion[slot] !== 1) canHarvest = true;
      addWorkerBuildOptions(s, player, slot, buildOptions);
    }
    if (completed && e.kind[slot] === Kind.SCV && e.illusion[slot] !== 1) canRepair = true;
    if ((e.flags[slot]! & Role.Structure) !== 0 && completed) canRally = true;
    if (completed) {
      for (const addon of ADDON_IDS) {
        if (addonParentKind(addon) !== k) continue;
        const result = validateCommand(s, player, { t: 'addon', building: id, kind: addon });
        if (result.ok || result.reason !== 'target-not-allowed') addOption(addonOptions, addon, result);
      }
      for (const train of Units[k]!.produces) {
        const result = validateCommand(s, player, { t: 'train', building: id, kind: train });
        if (e.illusion[slot] === 1 && !result.ok && result.reason === 'missing-capability') continue;
        const meta = k === Kind.NuclearSilo && train === Kind.NuclearMissile ? nukeTrainOptionMeta(s, slot) : {};
        addOption(trainOptions, train, result, meta);
      }
      for (const target of transformTargetsFor(k)) {
        addOption(transformOptions, target, validateCommand(s, player, { t: 'transform', unit: id, kind: target }));
      }
      for (const ability of Units[k]!.abilities) {
        const result = abilityAvailability(s, player, slot, ability);
        addOption(abilityOptions, ability, result,
          ability === Ability.NuclearStrike && !result.ok && result.reason === 'missing-requirement' ? { detail: 'No Nuke' } : {});
      }
      for (const tech of TECH_IDS) {
        const def = TechDefs[tech];
        if (!def?.producers.includes(k)) continue;
        const result = validateCommand(s, player, { t: 'research', building: id, tech });
        if (result.ok || result.reason !== 'target-not-allowed') addOption(researchOptions, tech, result);
      }
    }
    if (validateCommand(s, player, { t: 'burrow', unit: id, active: true }).ok) canBurrow = true;
    if (validateCommand(s, player, { t: 'burrow', unit: id, active: false }).ok) canUnburrow = true;
    if (validateCommand(s, player, { t: 'mine', unit: id }).ok) canMine = true;
    if (validateCommand(s, player, { t: 'lift', building: id }).ok) canLift = true;
    if (isLiftedStructureFlags(e.flags[slot]!)) canLand = true;
    if (validateCommand(s, player, { t: 'cancelBuild', building: id }).ok) canCancel = true;
  }

  for (const transport of selected) {
    const ts = slotOf(transport);
    if (transportCapacity(s, ts) <= 0) continue;
    for (const unit of selected) {
      if (unit === transport) continue;
      if (validateCommand(s, player, { t: 'load', transport, unit }).ok) canLoad = true;
    }
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && e.owner[i] === player && e.container[i] === transport) canUnload = true;
    }
  }

  if (count === 0) return EMPTY_SELECTION_VIEW;
  return {
    count,
    kindName: count > 1 ? `${kindName} ×${count}` : kindName,
    status: primarySlot >= 0 ? entityLifecycleStatus(s, primarySlot, player) : EMPTY_SELECTION_VIEW.status,
    can: {
      build: buildOptions.size > 0,
      rally: canRally,
      load: canLoad,
      unload: canUnload,
      harvest: canHarvest,
      repair: canRepair,
      attackMove: canAttackMove,
      stop: canStop,
      burrow: canBurrow,
      unburrow: canUnburrow,
      mine: canMine,
      lift: canLift,
      land: canLand,
      cancel: canCancel,
    },
    kinds: {
      build: optionKinds(buildOptions),
      addon: optionKinds(addonOptions),
      transform: optionKinds(transformOptions),
      train: optionKinds(trainOptions),
      abilities: optionKinds(abilityOptions),
      research: optionKinds(researchOptions),
    },
    options: {
      build: sortedOptions(buildOptions),
      addon: sortedOptions(addonOptions),
      transform: sortedOptions(transformOptions),
      train: sortedOptions(trainOptions),
      ability: sortedOptions(abilityOptions),
      research: sortedOptions(researchOptions),
    },
  };
};
