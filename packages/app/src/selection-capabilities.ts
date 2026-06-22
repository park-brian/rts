import {
  Ability, Kind, NONE, Role, Units,
  isAlive,
  abilitySelectionOptions, addonSelectionOptions, commandRejectReasonPriority, internalProductDef, isLiftedStructureFlags, loadSelectionCandidates, slotOf,
  researchSelectionOptions, trainSelectionOptions, transformSelectionOptions, unloadSelectionCandidates, validateCommand, workerBuildSelectionOptions,
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
  if (!current || commandRejectReasonPriority[result.reason] < commandRejectReasonPriority[current.reason!]) {
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
  activeSubgroupKind = NONE,
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
  let canMove = false;
  let canAttackMove = false;
  let canHold = false;
  let canPatrol = false;
  let canStop = false;
  let canBurrow = false;
  let canUnburrow = false;
  let canMine = false;
  let canLift = false;
  let canLand = false;
  let canCancel = false;
  const stopCommands: Command[] = [];
  const holdCommands: Command[] = [];
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
  const subgroupCounts = new Map<number, { name: string; count: number }>();
  const selected = [...selectedIds].filter((id) => isAlive(e, id));
  const visibleSelected: number[] = [];
  const readyVisibleSelected: number[] = [];

  for (const [selectionIndex, id] of selected.entries()) {
    const slot = slotOf(id);
    if (e.owner[slot] !== player && !canSeeEntity(slot)) continue;
    visibleSelected.push(id);
    count++;
    const k = e.kind[slot]!;
    const lifecycle = entityLifecycle(s, slot);
    const ready = lifecycleCanReceiveStandardCommands(lifecycle);
    if (ready) readyVisibleSelected.push(id);
    if (primarySlot < 0) primarySlot = slot;
    const displayName = `${illusionPresentation(s, player, slot).labelPrefix}${entitySelectionName(s, slot)}`;
    kindName = displayName;
    const subgroup = subgroupCounts.get(k);
    if (subgroup) subgroup.count++;
    else subgroupCounts.set(k, { name: displayName, count: 1 });
    const nonStructure = (e.flags[slot]! & Role.Structure) === 0;
    if (nonStructure && validateCommand(s, player, { t: 'move', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canMove = true;
    if (nonStructure && validateCommand(s, player, { t: 'amove', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canAttackMove = true;
    if (nonStructure && validateCommand(s, player, { t: 'patrol', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canPatrol = true;
    if (ready) {
      const holdCommand: Command = { t: 'hold', unit: id };
      if (validateCommand(s, player, holdCommand).ok) {
        canHold = true;
        holdCommands.push(holdCommand);
      }
      const command: Command = { t: 'stop', unit: id };
      if (validateCommand(s, player, command).ok) {
        canStop = true;
        stopCommands.push(command);
      }
    }
    if (ready && (e.flags[slot]! & Role.Worker) !== 0) {
      if (e.illusion[slot] !== 1) canHarvest = true;
    }
    if (ready && e.kind[slot] === Kind.SCV && e.illusion[slot] !== 1) canRepair = true;
    if ((e.flags[slot]! & Role.Structure) !== 0 && ready) canRally = true;
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

  if (count === 0) return EMPTY_SELECTION_VIEW;
  const firstSubgroupKind = subgroupCounts.keys().next().value as number | undefined;
  const resolvedActiveSubgroupKind = subgroupCounts.has(activeSubgroupKind)
    ? activeSubgroupKind
    : firstSubgroupKind ?? NONE;
  const subgroups = [...subgroupCounts.entries()].map(([kind, subgroup]) => ({
    kind,
    name: subgroup.name,
    count: subgroup.count,
    active: kind === resolvedActiveSubgroupKind,
  }));
  const isActiveSubgroupUnit = (id: number): boolean => e.kind[slotOf(id)] === resolvedActiveSubgroupKind;
  const subgroupSelected = visibleSelected.filter(isActiveSubgroupUnit);
  const readySubgroupSelected = readyVisibleSelected.filter(isActiveSubgroupUnit);

  for (const option of transformSelectionOptions(s, player, readySubgroupSelected)) {
    addOption(
      transformOptions,
      option.id,
      option.ok ? { ok: true } : { ok: false, reason: option.reason! },
      { commands: option.commands },
    );
  }
  for (const option of workerBuildSelectionOptions(s, player, readySubgroupSelected)) {
    addOption(
      buildOptions,
      option.id,
      option.ok ? { ok: true } : { ok: false, reason: option.reason! },
      { arm: option.ok ? { t: 'place', kind: option.id } : undefined },
    );
  }
  for (const option of trainSelectionOptions(s, player, readySubgroupSelected)) {
    addOption(
      trainOptions,
      option.id,
      option.ok ? { ok: true } : { ok: false, reason: option.reason! },
      { ...trainOptionMeta(s, slotOf(option.representative), option.id), commands: option.commands },
    );
  }
  for (const option of addonSelectionOptions(s, player, readySubgroupSelected)) {
    addOption(
      addonOptions,
      option.id,
      option.ok ? { ok: true } : { ok: false, reason: option.reason! },
      { commands: option.commands },
    );
  }
  for (const option of researchSelectionOptions(s, player, readySubgroupSelected)) {
    addOption(
      researchOptions,
      option.id,
      option.ok ? { ok: true } : { ok: false, reason: option.reason! },
      { commands: option.commands },
    );
  }
  for (const option of abilitySelectionOptions(s, player, subgroupSelected)) {
    addOption(
      abilityOptions,
      option.id,
      option.ok ? { ok: true } : { ok: false, reason: option.reason! },
      {
        commands: option.commands,
        arm: option.ok && option.target !== 'self' ? abilityArm(option.id) : undefined,
        detail: option.id === Ability.NuclearStrike && !option.ok && option.reason === 'missing-requirement' ? 'No Nuke' : undefined,
      },
    );
  }

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
    ...(canMove ? [armedOrderOption(OrderOptionId.Move, 'Move', { t: 'move' })] : []),
    ...(canAttackMove ? [armedOrderOption(OrderOptionId.AttackMove, 'Atk-Move', { t: 'attackMove' })] : []),
    ...(canPatrol ? [armedOrderOption(OrderOptionId.Patrol, 'Patrol', { t: 'patrol' })] : []),
    ...commandOrderOption(OrderOptionId.Hold, 'Hold', holdCommands),
    ...commandOrderOption(OrderOptionId.Stop, 'Stop', stopCommands),
  ];
  return {
    count,
    kindName: count > 1 ? `${kindName} ×${count}` : kindName,
    status: primarySlot >= 0 ? entityLifecycleStatus(s, primarySlot, player) : EMPTY_SELECTION_VIEW.status,
    subgroups,
    can: {
      build: buildOptions.size > 0,
      rally: canRally,
      load: canLoad,
      unload: canUnload,
      harvest: canHarvest,
      repair: canRepair,
      move: canMove,
      attackMove: canAttackMove,
      hold: canHold,
      patrol: canPatrol,
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
