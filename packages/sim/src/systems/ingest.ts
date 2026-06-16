// Command ingestion: validate player commands and turn them into unit orders /
// production / construction. Invalid commands (stale ids, wrong owner,
// unaffordable, illegal target) are ignored.

import type { State } from '../world.ts';
import { kill, slotOf, NONE } from '../world.ts';
import type { CommandResult, PlayerCommands } from '../commands.ts';
import { Kind, Order, Units } from '../data.ts';
import { placementForStructure, snapRallyTarget, validateCommand } from '../validation.ts';
import { cancelPendingBuild, hasPendingBuild, refundBuildCost } from '../build-cost.ts';

const EMPTY_RESULTS: CommandResult[] = [];

const startProduction = (s: State, slot: number, kind: number, player: number): void => {
  const e = s.e;
  const def = Units[kind];
  if (!def) return;
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
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

const cancelFoundation = (s: State, slot: number): void => {
  refundBuildCost(s, slot, 3, 4);
  kill(s, slot);
};

const cancelPendingBeforeOrder = (s: State, slot: number): void => {
  if (hasPendingBuild(s.e, slot)) cancelPendingBuild(s, slot);
};

export const applyCommands = (s: State, batch: PlayerCommands[]): CommandResult[] => {
  const e = s.e;
  let total = 0;
  for (const pc of batch) total += pc.cmds.length;
  if (total === 0) return EMPTY_RESULTS;

  const results: CommandResult[] = [];
  let reservedSupply: Int32Array | null = null;
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
          reservedSupply![player] = reservedSupply![player]! + Units[c.kind]!.supply;
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
        case 'cancelBuild': {
          cancelFoundation(s, slotOf(c.building));
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'move': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          e.order[slot] = Order.Move;
          e.target[slot] = NONE;
          e.tx[slot] = c.x;
          e.ty[slot] = c.y;
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'attack': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          e.order[slot] = Order.Attack;
          e.target[slot] = c.target;
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'amove': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          e.order[slot] = Order.AttackMove;
          e.target[slot] = NONE;
          e.tx[slot] = c.x;
          e.ty[slot] = c.y;
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'harvest': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          e.order[slot] = Order.Harvest;
          e.target[slot] = c.patch;
          e.timer[slot] = 0;
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'rally': {
          const slot = slotOf(c.building);
          e.rallyX[slot] = c.x;
          e.rallyY[slot] = c.y;
          // A tap on (near) a resource means "rally to harvest"; else a ground point.
          e.rallyTarget[slot] = snapRallyTarget(s, c.x, c.y);
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
        case 'stop': {
          const slot = slotOf(c.unit);
          cancelPendingBeforeOrder(s, slot);
          e.order[slot] = Order.Idle;
          e.target[slot] = NONE;
          results.push({ player, index, t: c.t, ok: true });
          break;
        }
      }
    }
  }
  return results;
};
