// Command ingestion: validate player commands and turn them into unit orders /
// production / construction. Invalid commands (stale ids, wrong owner,
// unaffordable, illegal target) are ignored.

import type { State } from '../entity/world.ts';
import { eid, slotOf, NONE } from '../entity/world.ts';
import type { Command, CommandResult, PlayerCommands } from './types.ts';
import { validateCommand } from './validate.ts';
import { applyCommandSpec, validateCommandSpec } from './specs.ts';
import { reserveProductionSupply } from './production.ts';
import {
  GROUP_SLOT_SPACING,
  groupOffset,
  roundedGroupSpacing,
  usesGroundMoveSlot,
} from '../spatial/movement-slots.ts';

type MoveGroupPlan = {
  count: Map<string, number>;
  rank: Map<string, number>;
  spacing: Map<string, number>;
};

// Command ingestion is a boundary layer, not a per-entity tick system. The
// Map/string-key plan keeps grouped human/bot command batches simple and stable.
// If RL emits very large command batches every tick, replace this with a measured
// numeric scratch table while preserving the same destination-slot tests.
const moveGroupKey = (player: number, c: Command): string =>
  (c.t === 'amove' || (c.t === 'move' && c.target === undefined)) ? `${player}:${c.t}:${c.x}:${c.y}` : '';

const moveRankKey = (key: string, slot: number): string => `${key}:${slot}`;

const buildMoveGroupPlan = (s: State, batch: PlayerCommands[]): MoveGroupPlan => {
  const rawCounts = new Map<string, number>();
  for (const { player, cmds } of batch) {
    for (const c of cmds) {
      if (c.t !== 'amove' && (c.t !== 'move' || c.target !== undefined)) continue;
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
      if (c.t !== 'amove' && (c.t !== 'move' || c.target !== undefined)) continue;
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
): { x: number; y: number; target?: number } => {
  if (c.t === 'move' && c.target !== undefined) return { x: c.x, y: c.y, target: slotOf(c.target) };
  const key = moveGroupKey(player, c);
  if ((plan.count.get(key) ?? 0) <= 1) return { x: c.x, y: c.y };
  const rank = plan.rank.get(moveRankKey(key, slot)) ?? 0;
  const offset = groupOffset(rank, plan.spacing.get(key) ?? GROUP_SLOT_SPACING);
  return { x: c.x + offset.x, y: c.y + offset.y };
};

export const applyCommands = (s: State, batch: PlayerCommands[]): CommandResult[] => {
  let total = 0;
  for (const pc of batch) total += pc.cmds.length;
  if (total === 0) return [];

  const results: CommandResult[] = [];
  let reservedSupply: Int32Array | null = null;
  const moveGroups = buildMoveGroupPlan(s, batch);
  for (const { player, cmds } of batch) {
    for (let index = 0; index < cmds.length; index++) {
      const c = cmds[index]!;
      if (c.t === 'train' && !reservedSupply) reservedSupply = new Int32Array(s.players.supplyUsed);
      const valid = c.t === 'train'
        ? validateCommandSpec(s, player, c, { reservedSupply: reservedSupply![player] })
        : validateCommand(s, player, c);
      if (!valid.ok) {
        results.push({ player, index, t: c.t, ok: false, reason: valid.reason });
        continue;
      }
      switch (c.t) {
        case 'ability':
        case 'addon':
        case 'attack':
        case 'build':
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
        case 'train':
        case 'transform':
        case 'unload':
          applyCommandSpec(s, player, c, {
            destination: (command, slot, commandPlayer) => groupDestination(command, slot, commandPlayer, moveGroups),
            reservedSupply: reservedSupply?.[player],
            reserveSupply: (kind) => reserveProductionSupply(reservedSupply ?? undefined, player, kind),
          });
          results.push({ player, index, t: c.t, ok: true });
          break;
      }
    }
  }
  return results;
};
