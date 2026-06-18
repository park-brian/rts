// Command ingestion: validate player commands and turn them into unit orders /
// production / construction. Invalid commands (stale ids, wrong owner,
// unaffordable, illegal target) are ignored.

import type { State } from '../world.ts';
import { eid, isAlive, kill, slotOf, NONE } from '../world.ts';
import type { Command, CommandResult, PlayerCommands } from '../commands.ts';
import { Kind, Order, Units, productionCostCount, productionCount } from '../data.ts';
import { TechDefs } from '../data.ts';
import { placementForStructure, validateCommand } from '../validation.ts';
import { addonPosition } from '../addon.ts';
import { landedStructureFlags, liftedStructureFlags } from '../terran-mobility.ts';
import { refundBuildCost } from '../build-cost.ts';
import { castAbility } from './abilities.ts';
import { nextTechLevel, techGas, techMinerals, techTime } from '../tech.ts';
import { spawnUnit } from '../factory.ts';
import { canContinueConstructionKind } from '../repair.ts';
import { mergePartnerFor, transformFor } from '../unit-transform.ts';
import { loadUnitInto } from '../cargo.ts';
import { applyCommandSpec, cancelPendingBeforeOrder, clearSettled } from '../command-specs.ts';
import {
  GROUP_SLOT_SPACING,
  groupOffset,
  roundedGroupSpacing,
  usesGroundMoveSlot,
} from '../movement-slots.ts';

const EMPTY_RESULTS: CommandResult[] = [];
type MoveGroupPlan = {
  count: Map<string, number>;
  rank: Map<string, number>;
  spacing: Map<string, number>;
};

const moveGroupKey = (player: number, c: Command): string =>
  (c.t === 'move' || c.t === 'amove') ? `${player}:${c.t}:${c.x}:${c.y}` : '';

const moveRankKey = (key: string, slot: number): string => `${key}:${slot}`;

const buildMoveGroupPlan = (s: State, batch: PlayerCommands[]): MoveGroupPlan => {
  const rawCounts = new Map<string, number>();
  for (const { player, cmds } of batch) {
    for (const c of cmds) {
      if (c.t !== 'move' && c.t !== 'amove') continue;
      const key = moveGroupKey(player, c);
      rawCounts.set(key, (rawCounts.get(key) ?? 0) + 1);
    }
  }
  let hasGroup = false;
  for (const n of rawCounts.values()) {
    if (n > 1) {
      hasGroup = true;
      break;
    }
  }
  if (!hasGroup) return { count: new Map(), rank: new Map(), spacing: new Map() };

  const groups = new Map<string, number[]>();
  for (const { player, cmds } of batch) {
    for (const c of cmds) {
      if (c.t !== 'move' && c.t !== 'amove') continue;
      const key = moveGroupKey(player, c);
      if ((rawCounts.get(key) ?? 0) <= 1) continue;
      const valid = validateCommand(s, player, c);
      if (!valid.ok) continue;
      const slot = slotOf(c.unit);
      const flags = s.e.flags[slot]!;
      if (!usesGroundMoveSlot(flags)) continue;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      if (!group.includes(slot)) group.push(slot);
    }
  }
  const plan: MoveGroupPlan = { count: new Map(), rank: new Map(), spacing: new Map() };
  for (const [key, slots] of groups) {
    if (slots.length <= 1) continue;
    slots.sort((a, b) => a - b);
    plan.count.set(key, slots.length);
    plan.spacing.set(key, roundedGroupSpacing(s, slots));
    for (let i = 0; i < slots.length; i++) plan.rank.set(moveRankKey(key, slots[i]!), i);
  }
  return plan;
};

const groupDestination = (
  c: Extract<Command, { t: 'move' | 'amove' }>,
  slot: number,
  player: number,
  plan: MoveGroupPlan,
): { x: number; y: number } => {
  const key = moveGroupKey(player, c);
  if ((plan.count.get(key) ?? 0) <= 1) return { x: c.x, y: c.y };
  const rank = plan.rank.get(moveRankKey(key, slot)) ?? 0;
  const offset = groupOffset(rank, plan.spacing.get(key) ?? GROUP_SLOT_SPACING);
  return { x: c.x + offset.x, y: c.y + offset.y };
};

const startProduction = (s: State, slot: number, kind: number, player: number): void => {
  const e = s.e;
  const def = Units[kind];
  if (!def) return;
  const costCount = productionCostCount(kind);
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals * costCount;
  s.players.gas[player] = s.players.gas[player]! - def.gas * costCount;
  if (e.kind[slot] === Kind.Larva) {
    const egg = Units[Kind.Egg]!;
    e.kind[slot] = Kind.Egg;
    e.hp[slot] = egg.hp;
    e.shield[slot] = egg.shields;
    e.energy[slot] = egg.startEnergy;
    e.energyMax[slot] = egg.energyMax;
    e.flags[slot] = egg.roles;
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
    e.prodKind[slot] = kind;
    e.prodTimer[slot] = def.buildTime;
    e.prodQueued[slot] = 0;
    return;
  }
  if (e.prodKind[slot] === Kind.None) {
    e.prodKind[slot] = kind;
    e.prodTimer[slot] = def.buildTime;
  } else {
    e.prodQueued[slot] = e.prodQueued[slot]! + 1;
  }
};

const startResearch = (s: State, slot: number, tech: number, player: number): void => {
  const def = TechDefs[tech];
  if (!def) return;
  const level = nextTechLevel(s, player, tech);
  s.players.minerals[player] = s.players.minerals[player]! - techMinerals(def, level);
  s.players.gas[player] = s.players.gas[player]! - techGas(def, level);
  s.e.researchKind[slot] = tech;
  s.e.researchTimer[slot] = techTime(def, level);
};

const startBuild = (s: State, slot: number, kind: number, x: number, y: number, player: number): void => {
  const e = s.e;
  const def = Units[kind];
  if (!def) return;
  clearSettled(s, slot);
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
  e.order[slot] = Order.Build;
  e.buildKind[slot] = kind;
  e.buildCostMinerals[slot] = def.minerals;
  e.buildCostGas[slot] = def.gas;
  e.target[slot] = NONE;
  e.tx[slot] = x;
  e.ty[slot] = y;
};

const startAddon = (s: State, parent: number, kind: number, player: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  const pos = addonPosition(s, parent, kind);
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
  const addon = slotOf(spawnUnit(s, kind, player, pos.x, pos.y));
  e.built[addon] = 0;
  e.ctimer[addon] = def.buildTime;
  e.target[addon] = eid(e, parent);
  e.target[parent] = eid(e, addon);
  e.buildCostMinerals[addon] = def.minerals;
  e.buildCostGas[addon] = def.gas;
};

const liftBuilding = (s: State, slot: number): void => {
  const e = s.e;
  clearSettled(s, slot);
  e.flags[slot] = liftedStructureFlags(e.kind[slot]!);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
};

const landBuilding = (s: State, slot: number, x: number, y: number): void => {
  const e = s.e;
  clearSettled(s, slot);
  e.order[slot] = Order.Move;
  e.target[slot] = eid(e, slot);
  e.tx[slot] = x;
  e.ty[slot] = y;
};

const setEntityKind = (s: State, slot: number, kind: number): void => {
  const def = Units[kind]!;
  const e = s.e;
  e.kind[slot] = kind;
  e.flags[slot] = def.roles;
  e.hp[slot] = Math.min(e.hp[slot]!, def.hp);
  e.shield[slot] = Math.min(e.shield[slot]!, def.shields);
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = Math.min(e.energy[slot]!, def.energyMax);
};

const setEntityKindFull = (s: State, slot: number, kind: number): void => {
  const def = Units[kind]!;
  const e = s.e;
  e.kind[slot] = kind;
  e.flags[slot] = def.roles;
  e.hp[slot] = def.hp;
  e.shield[slot] = def.shields;
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = def.startEnergy;
};

const transformUnit = (s: State, slot: number, kind: number): void => {
  const e = s.e;
  clearSettled(s, slot);
  setEntityKind(s, slot, kind);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
};

const startMorph = (s: State, slot: number, kind: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  const player = e.owner[slot]!;
  clearSettled(s, slot);
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
  e.morphFromKind[slot] = e.kind[slot]!;
  setEntityKind(s, slot, kind);
  e.built[slot] = 0;
  e.ctimer[slot] = def.buildTime;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.prodKind[slot] = Kind.None;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  e.researchKind[slot] = Kind.None;
  e.researchTimer[slot] = 0;
  e.buildCostMinerals[slot] = def.minerals;
  e.buildCostGas[slot] = def.gas;
};

const startMerge = (s: State, slot: number, kind: number, partner: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  const x = Math.trunc((e.x[slot]! + e.x[partner]!) / 2);
  const y = Math.trunc((e.y[slot]! + e.y[partner]!) / 2);
  clearSettled(s, slot);
  kill(s, partner);
  setEntityKindFull(s, slot, kind);
  e.x[slot] = x;
  e.y[slot] = y;
  e.built[slot] = 0;
  e.ctimer[slot] = def.buildTime;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.prodKind[slot] = Kind.None;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  e.researchKind[slot] = Kind.None;
  e.researchTimer[slot] = 0;
};

const applyTransform = (s: State, slot: number, kind: number, target = NONE): void => {
  const transform = transformFor(s.e.kind[slot]!, kind);
  if (transform?.mode === 'merge') {
    const partner = mergePartnerFor(s, slot, kind, target);
    if (partner !== NONE) startMerge(s, slot, kind, partner);
  } else if (transform?.mode === 'morph') startMorph(s, slot, kind);
  else transformUnit(s, slot, kind);
};

const burrowUnit = (s: State, slot: number, active: boolean): void => {
  const e = s.e;
  clearSettled(s, slot);
  e.burrowed[slot] = active ? 1 : 0;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
};

const laySpiderMine = (s: State, vulture: number): void => {
  const e = s.e;
  clearSettled(s, vulture);
  e.specialAmmo[vulture] = e.specialAmmo[vulture]! - 1;
  const mine = slotOf(spawnUnit(s, Kind.SpiderMine, e.owner[vulture]!, e.x[vulture]!, e.y[vulture]!));
  e.burrowed[mine] = 1;
  e.order[mine] = Order.Idle;
  e.target[mine] = NONE;
};

const unloadUnit = (s: State, unit: number, x: number, y: number): void => {
  const e = s.e;
  clearSettled(s, unit);
  e.container[unit] = NONE;
  e.x[unit] = x;
  e.y[unit] = y;
  e.order[unit] = Order.Idle;
  e.target[unit] = NONE;
};

const cancelFoundation = (s: State, slot: number): void => {
  const e = s.e;
  if (e.morphFromKind[slot] !== Kind.None) {
    const original = e.morphFromKind[slot]!;
    refundBuildCost(s, slot, 3, 4);
    setEntityKind(s, slot, original);
    e.built[slot] = 1;
    e.ctimer[slot] = 0;
    e.morphFromKind[slot] = Kind.None;
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
    return;
  }
  const workerId = e.target[slot]!;
  if (workerId !== NONE && isAlive(e, workerId)) {
    const worker = slotOf(workerId);
    if (e.order[worker] === Order.Build && e.target[worker] === eid(e, slot)) {
      e.order[worker] = Order.Idle;
      e.target[worker] = NONE;
    }
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) {
    const parent = slotOf(e.target[slot]!);
    if (e.target[parent] === eid(e, slot)) e.target[parent] = NONE;
  }
  refundBuildCost(s, slot, 3, 4);
  kill(s, slot);
};

const resumeConstruction = (s: State, worker: number, foundation: number): void => {
  const e = s.e;
  const foundationId = eid(e, foundation);
  const old = e.target[foundation]!;
  if (old !== NONE && isAlive(e, old)) {
    const oldWorker = slotOf(old);
    if (e.order[oldWorker] === Order.Build && e.target[oldWorker] === foundationId) {
      e.order[oldWorker] = Order.Idle;
      e.target[oldWorker] = NONE;
    }
  }
  e.order[worker] = Order.Build;
  e.buildKind[worker] = Kind.None;
  e.target[worker] = foundationId;
  e.target[foundation] = eid(e, worker);
  e.tx[worker] = e.x[foundation]!;
  e.ty[worker] = e.y[foundation]!;
  e.timer[worker] = 0;
};

export const applyCommands = (s: State, batch: PlayerCommands[]): CommandResult[] => {
  const e = s.e;
  let total = 0;
  for (const pc of batch) total += pc.cmds.length;
  if (total === 0) return EMPTY_RESULTS;

  const results: CommandResult[] = [];
  let reservedSupply: Int32Array | null = null;
  const moveGroups = buildMoveGroupPlan(s, batch);
  for (const { player, cmds } of batch) {
    for (let index = 0; index < cmds.length; index++) {
      const c = cmds[index]!;
      if (c.t === 'train' && !reservedSupply) reservedSupply = new Int32Array(s.players.supplyUsed);
      const valid = validateCommand(
        s,
        player,
        c,
        c.t === 'train' && reservedSupply ? { reservedSupply: reservedSupply[player] } : {},
      );
      if (!valid.ok) {
        results.push({ player, index, t: c.t, ok: false, reason: valid.reason });
        continue;
      }
      switch (c.t) {
        case 'train': {
          const slot = slotOf(c.building);
          startProduction(s, slot, c.kind, player);
          reservedSupply![player] = reservedSupply![player]! + Units[c.kind]!.supply * productionCount(c.kind);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'research': {
          const slot = slotOf(c.building);
          startResearch(s, slot, c.tech, player);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'build': {
          const slot = slotOf(c.unit);
          const placement = placementForStructure(s, c.kind, c.x, c.y, slot);
          if (!placement.ok) {
            results.push({ player, index, t: c.t, ok: false, reason: placement.reason });
            break;
          }
          cancelPendingBeforeOrder(s, slot);
          startBuild(s, slot, c.kind, placement.x, placement.y, player);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'addon': {
          startAddon(s, slotOf(c.building), c.kind, player);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'lift': {
          liftBuilding(s, slotOf(c.building));
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'land': {
          const slot = slotOf(c.building);
          const placement = placementForStructure(s, e.kind[slot]!, c.x, c.y, slot, player);
          if (!placement.ok) {
            results.push({ player, index, t: c.t, ok: false, reason: placement.reason });
            break;
          }
          landBuilding(s, slot, placement.x, placement.y);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'transform': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          applyTransform(s, slot, c.kind, c.target ?? NONE);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'burrow': {
          burrowUnit(s, slotOf(c.unit), c.active);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'mine': {
          laySpiderMine(s, slotOf(c.unit));
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'load': {
          const unit = slotOf(c.unit);
          loadUnitInto(s, slotOf(c.transport), unit);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'unload': {
          unloadUnit(s, slotOf(c.unit), c.x, c.y);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'cancelBuild': {
          cancelFoundation(s, slotOf(c.building));
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'attack':
        case 'move':
        case 'amove':
        case 'rally':
        case 'stop':
          applyCommandSpec(s, player, c, {
            destination: (command, slot, commandPlayer) => groupDestination(command, slot, commandPlayer, moveGroups),
          });
          results.push({ player, index, t: c.t, ok: true });
          break;
        case 'ability': {
          const slot = slotOf(c.unit);
          clearSettled(s, slot);
          castAbility(s, slot, c);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'harvest': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          clearSettled(s, slot);
          e.order[slot] = Order.Harvest;
          e.target[slot] = c.patch;
          e.timer[slot] = 0;
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'repair': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          clearSettled(s, slot);
          const target = slotOf(c.target);
          if (e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) {
            resumeConstruction(s, slot, target);
          } else {
            e.order[slot] = Order.Repair;
            e.target[slot] = c.target;
            e.timer[slot] = 0;
          }
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
      }
    }
  }
  return results;
};
