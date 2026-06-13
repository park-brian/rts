// Command ingestion: validate player commands and turn them into unit orders /
// production. Invalid commands (stale ids, unaffordable, wrong owner) are ignored.

import type { State } from '../world.ts';
import { slotOf, isAlive, NONE } from '../world.ts';
import type { PlayerCommands } from '../commands.ts';
import { Kind, Order, Units, MAX_QUEUE } from '../data.ts';

const startProduction = (s: State, slot: number, kind: number, player: number): void => {
  const def = Units[kind];
  if (!def) return;
  const e = s.e;
  const queued = e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;
  if (queued >= MAX_QUEUE) return;
  if (s.players.minerals[player]! < def.minerals) return;
  if (s.players.supplyUsed[player]! + def.supply > s.players.supplyMax[player]!) return;
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  if (e.prodKind[slot] === Kind.None) {
    e.prodKind[slot] = kind;
    e.prodTimer[slot] = def.buildTime;
  } else {
    e.prodQueued[slot] = e.prodQueued[slot]! + 1;
  }
};

export const applyCommands = (s: State, batch: PlayerCommands[]): void => {
  const e = s.e;
  for (const { player, cmds } of batch) {
    for (const c of cmds) {
      switch (c.t) {
        case 'train': {
          if (!isAlive(e, c.building)) break;
          const slot = slotOf(c.building);
          if (e.owner[slot] !== player) break;
          startProduction(s, slot, c.kind, player);
          break;
        }
        case 'move': {
          if (!isAlive(e, c.unit)) break;
          const slot = slotOf(c.unit);
          if (e.owner[slot] !== player) break;
          e.order[slot] = Order.Move;
          e.target[slot] = NONE;
          e.tx[slot] = c.x;
          e.ty[slot] = c.y;
          break;
        }
        case 'harvest': {
          if (!isAlive(e, c.unit) || !isAlive(e, c.patch)) break;
          const slot = slotOf(c.unit);
          if (e.owner[slot] !== player) break;
          e.order[slot] = Order.Harvest;
          e.target[slot] = c.patch;
          e.timer[slot] = 0;
          break;
        }
        case 'stop': {
          if (!isAlive(e, c.unit)) break;
          const slot = slotOf(c.unit);
          if (e.owner[slot] !== player) break;
          e.order[slot] = Order.Idle;
          e.target[slot] = NONE;
          break;
        }
      }
    }
  }
};
