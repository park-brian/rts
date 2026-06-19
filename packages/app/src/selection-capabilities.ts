import {
  Abilities, Ability, Kind, NONE, Role, TechDefs, Units,
  addonParentKind, canWorkerStartStructure, eid, isAlive,
  addonSelectionCandidates, internalProductDef, isLiftedStructureFlags, loadSelectionCandidates, slotOf, transformTargetsFor,
  researchSelectionCandidates, selfAbilitySelectionCandidates, trainSelectionCandidates, transformSelectionCandidates, unloadSelectionCandidates, validateCommand, workerBuildKindsFor,
  entityLifecycle,
  entityWorkQueue,
  illusionPresentation,
  type EntityLifecycle,
  type Command, type CommandRejectReason, type CommandValidation, type State,
} from './sim.ts';
import { entityLifecycleStatus } from './entity-lifecycle-status.ts';
import { entitySelectionName } from './entity-presentation.ts';
import { EMPTY_SELECTION_VIEW, OrderOptionId, type ArmedCommand, type CommandOption, type SelectionView } from './store.ts';

type OptionRecord = CommandOption & { priority?: number };
type CommandOptionMeta = Pick<CommandOption, 'label' | 'detail' | 'commands' | 'arm'> & { priority?: number };
type CanSeeEntity = (slot: number) => boolean;

const TECH_IDS = Object.keys(TechDefs).map(Number);
const ADDON_IDS = Object.keys(Units).map(Number).filter((kind) => Units[kind]?.buildMethod === 'addon');
const REASON_PRIORITY: Record<CommandRejectReason, number> = {
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

const addOption = (options: Map<number, OptionRecord>, id: number, result: CommandValidation, meta: CommandOptionMeta = {}): void => {
  const current = options.get(id);
  if (result.ok) {
    const priority = meta.priority ?? 0;
    if (!current?.ok || priority < (current.priority ?? Infinity)) {
      options.set(id, { id, ok: true, ...meta, priority });
    }
    return;
  }
  if (current?.ok) return;
  if (!current || REASON_PRIORITY[result.reason] < REASON_PRIORITY[current.reason!]) {
    const { commands: _commands, arm: _arm, priority: _priority, ...displayMeta } = meta;
    options.set(id, { id, ok: false, reason: result.reason, ...displayMeta });
  }
};

const sortedOptions = (options: Map<number, OptionRecord>): CommandOption[] =>
  [...options.values()]
    .sort((a, b) => a.id - b.id)
    .map(({ priority: _priority, ...option }) => option);

const trainOptionMeta = (s: State, slot: number, train: number): CommandOptionMeta => {
  const display = internalProductDef(s.e.kind[slot]!, train)?.display;
  if (!display) return {};
  const work = entityWorkQueue(s, slot);
  if (work.internalReady?.t === 'internal-ready' && work.internalReady.kind === train) {
    return { label: work.internalReady.label, detail: work.internalReady.detail };
  }
  if (work.active?.t === 'production' && work.active.kind === train && display.optionActiveLabel) {
    return { label: display.optionActiveLabel, detail: display.optionActiveDetail };
  }
  return display.trainLabel ? { label: display.trainLabel } : {};
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
  buildOptions: Map<number, OptionRecord>,
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
        : { ok: true }, { arm: { t: 'place', kind: build } });
    }
  }
};

const abilityArm = (ability: number): ArmedCommand => ({ t: 'ability', ability });
const armedOrderOption = (id: number, label: string, arm: ArmedCommand): CommandOption => ({ id, ok: true, label, arm });
const commandOrderOption = (id: number, label: string, commands: Command[]): CommandOption[] =>
  commands.length > 0 ? [{ id, ok: true, label, commands }] : [];

const lifecycleCanReceiveStandardCommands = (lifecycle: EntityLifecycle): boolean => {
  switch (lifecycle.state) {
    case 'complete':
    case 'training':
    case 'researching':
    case 'channeling':
      return true;
    default:
      return false;
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
  const stopCommands: Command[] = [];
  const burrowCommands: Command[] = [];
  const unburrowCommands: Command[] = [];
  const mineCommands: Command[] = [];
  const liftCommands: Command[] = [];
  const cancelCommands: Command[] = [];
  let landKind = NONE;
  const buildOptions = new Map<number, OptionRecord>();
  const addonOptions = new Map<number, OptionRecord>();
  const transformOptions = new Map<number, OptionRecord>();
  const trainOptions = new Map<number, OptionRecord>();
  const abilityOptions = new Map<number, OptionRecord>();
  const researchOptions = new Map<number, OptionRecord>();
  const selected = [...selectedIds].filter((id) => isAlive(e, id));

  for (const [selectionIndex, id] of selected.entries()) {
    const slot = slotOf(id);
    if (e.owner[slot] !== player && !canSeeEntity(slot)) continue;
    count++;
    const k = e.kind[slot]!;
    const lifecycle = entityLifecycle(s, slot);
    const ready = lifecycleCanReceiveStandardCommands(lifecycle);
    if (primarySlot < 0) primarySlot = slot;
    kindName = `${illusionPresentation(s, player, slot).labelPrefix}${entitySelectionName(s, slot)}`;
    const nonStructure = (e.flags[slot]! & Role.Structure) === 0;
    if (nonStructure && validateCommand(s, player, { t: 'amove', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canAttackMove = true;
    if (ready) {
      const command: Command = { t: 'stop', unit: id };
      if (validateCommand(s, player, command).ok) {
        canStop = true;
        stopCommands.push(command);
      }
    }
    if (ready && (e.flags[slot]! & Role.Worker) !== 0) {
      if (e.illusion[slot] !== 1) canHarvest = true;
      addWorkerBuildOptions(s, player, slot, buildOptions);
    }
    if (ready && e.kind[slot] === Kind.SCV && e.illusion[slot] !== 1) canRepair = true;
    if ((e.flags[slot]! & Role.Structure) !== 0 && ready) canRally = true;
    if (ready) {
      for (const addon of ADDON_IDS) {
        if (addonParentKind(addon) !== k) continue;
        const command: Command = { t: 'addon', building: id, kind: addon };
        const result = validateCommand(s, player, command);
        if (result.ok || result.reason !== 'target-not-allowed') {
          addOption(addonOptions, addon, result, { priority: selectionIndex });
        }
      }
      for (const train of Units[k]!.produces) {
        const command: Command = { t: 'train', building: id, kind: train };
        const result = validateCommand(s, player, command);
        if (e.illusion[slot] === 1 && !result.ok && result.reason === 'missing-capability') continue;
        const load = entityWorkQueue(s, slot).producerLoad;
        addOption(trainOptions, train, result, {
          ...trainOptionMeta(s, slot, train),
          priority: load,
        });
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
        const command: Command = { t: 'research', building: id, tech };
        const result = validateCommand(s, player, command);
        if (result.ok || result.reason !== 'target-not-allowed') {
          addOption(researchOptions, tech, result, { priority: selectionIndex });
        }
      }
    }
    const burrowCommand: Command = { t: 'burrow', unit: id, active: true };
    if (validateCommand(s, player, burrowCommand).ok) {
      canBurrow = true;
      burrowCommands.push(burrowCommand);
    }
    const unburrowCommand: Command = { t: 'burrow', unit: id, active: false };
    if (validateCommand(s, player, unburrowCommand).ok) {
      canUnburrow = true;
      unburrowCommands.push(unburrowCommand);
    }
    const mineCommand: Command = { t: 'mine', unit: id };
    if (validateCommand(s, player, mineCommand).ok) {
      canMine = true;
      mineCommands.push(mineCommand);
    }
    const liftCommand: Command = { t: 'lift', building: id };
    if (validateCommand(s, player, liftCommand).ok) {
      canLift = true;
      liftCommands.push(liftCommand);
    }
    if (isLiftedStructureFlags(e.flags[slot]!)) {
      canLand = true;
      if (landKind === NONE) landKind = k;
    }
    if (lifecycle.cancelable) {
      const cancelCommand: Command = { t: 'cancelBuild', building: id };
      if (validateCommand(s, player, cancelCommand).ok) {
        canCancel = true;
        cancelCommands.push(cancelCommand);
      }
    }
  }

  for (const option of transformOptions.values()) {
    if (!option.ok) continue;
    option.commands = transformSelectionCandidates(s, player, selected, option.id);
  }
  for (const option of trainOptions.values()) {
    if (!option.ok) continue;
    option.commands = trainSelectionCandidates(s, player, selected, option.id);
  }
  for (const option of addonOptions.values()) {
    if (!option.ok) continue;
    option.commands = addonSelectionCandidates(s, player, selected, option.id);
  }
  for (const option of researchOptions.values()) {
    if (!option.ok) continue;
    option.commands = researchSelectionCandidates(s, player, selected, option.id);
  }
  for (const option of abilityOptions.values()) {
    if (!option.ok) continue;
    const ability = Abilities[option.id];
    if (!ability) continue;
    if (ability.target === 'self') option.commands = selfAbilitySelectionCandidates(s, player, selected, option.id);
    else option.arm = abilityArm(option.id);
  }

  if (count === 0) return EMPTY_SELECTION_VIEW;
  const loadCommands = loadSelectionCandidates(s, player, selected);
  const unloadCommands = unloadSelectionCandidates(s, player, selected);
  canLoad = loadCommands.length > 0;
  canUnload = unloadCommands.length > 0;
  const orderOptions: CommandOption[] = [
    ...(canRally ? [armedOrderOption(OrderOptionId.Rally, 'Set Rally', { t: 'rally' })] : []),
    ...(canHarvest ? [armedOrderOption(OrderOptionId.Harvest, 'Harvest', { t: 'target', mode: 'harvest' })] : []),
    ...(canRepair ? [armedOrderOption(OrderOptionId.Repair, 'Repair', { t: 'target', mode: 'repair' })] : []),
    ...commandOrderOption(OrderOptionId.Load, 'Load', loadCommands),
    ...commandOrderOption(OrderOptionId.Unload, 'Unload', unloadCommands),
    ...commandOrderOption(OrderOptionId.Burrow, 'Burrow', burrowCommands),
    ...commandOrderOption(OrderOptionId.Unburrow, 'Unburrow', unburrowCommands),
    ...commandOrderOption(OrderOptionId.Mine, 'Lay Mine', mineCommands),
    ...commandOrderOption(OrderOptionId.Lift, 'Lift Off', liftCommands),
    ...(landKind !== NONE ? [armedOrderOption(OrderOptionId.Land, 'Land', { t: 'land', kind: landKind })] : []),
    ...commandOrderOption(OrderOptionId.Cancel, 'Cancel', cancelCommands),
    ...(canAttackMove ? [armedOrderOption(OrderOptionId.AttackMove, 'Atk-Move', { t: 'attackMove' })] : []),
    ...commandOrderOption(OrderOptionId.Stop, 'Stop', stopCommands),
  ];
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
    options: {
      build: sortedOptions(buildOptions),
      addon: sortedOptions(addonOptions),
      transform: sortedOptions(transformOptions),
      train: sortedOptions(trainOptions),
      ability: sortedOptions(abilityOptions),
      research: sortedOptions(researchOptions),
      order: orderOptions,
    },
  };
};
