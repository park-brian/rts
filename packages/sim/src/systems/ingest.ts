// Command ingestion: validate player commands and turn them into unit orders /
// production / construction. Invalid commands (stale ids, wrong owner,
// unaffordable, illegal target) are ignored.

import type { State } from '../world.ts';
import { eid, slotOf, NONE } from '../world.ts';
import type { Command, CommandResult, PlayerCommands } from '../commands.ts';
import { Kind, Order, Units, productionCostCount, productionCount } from '../data.ts';
import { validateCommand } from '../validation.ts';
import { placementForStructure } from '../placement.ts';
import { castAbility } from './abilities.ts';
import { spawnUnit } from '../factory.ts';
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

export const applyCommands = (s: State, batch: PlayerCommands[]): CommandResult[] => {
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
        case 'addon':
        case 'attack':
        case 'burrow':
        case 'cancelBuild':
        case 'harvest':
        case 'land':
        case 'lift':
        case 'load':
        case 'mine':
        case 'move':
        case 'amove':
        case 'rally':
        case 'repair':
        case 'research':
        case 'stop':
        case 'transform':
        case 'unload':
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
      }
    }
  }
  return results;
};
