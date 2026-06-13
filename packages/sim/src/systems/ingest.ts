// Command ingestion: validate player commands and turn them into unit orders /
// production / construction. Invalid commands (stale ids, wrong owner,
// unaffordable, illegal target) are ignored.

import type { State } from '../world.ts';
import { slotOf, eid, isAlive, nearest, NONE } from '../world.ts';
import { buildable } from '../map.ts';
import { tileX, tileY } from '../pathing.ts';
import type { PlayerCommands } from '../commands.ts';
import { Kind, Order, Role, Units, MAX_QUEUE, TILE } from '../data.ts';
import { fx } from '../fixed.ts';

const RALLY_SNAP = fx(2 * TILE); // a rally tap this close to a resource means "harvest it"

const startProduction = (s: State, slot: number, kind: number, player: number): void => {
  const e = s.e;
  if ((e.flags[slot]! & Role.Producer) === 0 || e.built[slot] !== 1) return;
  const def = Units[kind];
  const building = Units[e.kind[slot]!];
  if (!def || !building || !building.produces.includes(kind)) return;
  const queued = e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;
  if (queued >= MAX_QUEUE) return;
  if (s.players.minerals[player]! < def.minerals) return;
  if (s.players.gas[player]! < def.gas) return;
  if (s.players.supplyUsed[player]! + def.supply > s.players.supplyMax[player]!) return;
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
  if ((e.flags[slot]! & Role.Worker) === 0) return;
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0) return;
  // A Refinery must sit on a vespene geyser — find the nearest and snap onto it.
  if (kind === Kind.Refinery) {
    const gy = nearest(s, x, y, (sl) => e.kind[sl] === Kind.Geyser);
    if (gy === NONE) return;
    const dx = e.x[gy]! - x; const dy = e.y[gy]! - y;
    if (dx * dx + dy * dy > RALLY_SNAP * RALLY_SNAP) return; // tapped too far from a geyser
    x = e.x[gy]!; y = e.y[gy]!;
  } else if (!buildable(s.map, tileX(x), tileY(y))) return; // can't build on cliffs/obstacles
  if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return;
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
  e.order[slot] = Order.Build;
  e.buildKind[slot] = kind;
  e.target[slot] = NONE;
  e.tx[slot] = x;
  e.ty[slot] = y;
};

export const applyCommands = (s: State, batch: PlayerCommands[]): void => {
  const e = s.e;
  for (const { player, cmds } of batch) {
    for (const c of cmds) {
      switch (c.t) {
        case 'train': {
          if (!isAlive(e, c.building)) break;
          const slot = slotOf(c.building);
          if (e.owner[slot] === player) startProduction(s, slot, c.kind, player);
          break;
        }
        case 'build': {
          if (!isAlive(e, c.unit)) break;
          const slot = slotOf(c.unit);
          if (e.owner[slot] === player) startBuild(s, slot, c.kind, c.x, c.y, player);
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
        case 'attack': {
          if (!isAlive(e, c.unit) || !isAlive(e, c.target)) break;
          const slot = slotOf(c.unit);
          if (e.owner[slot] !== player) break;
          e.order[slot] = Order.Attack;
          e.target[slot] = c.target;
          break;
        }
        case 'amove': {
          if (!isAlive(e, c.unit)) break;
          const slot = slotOf(c.unit);
          if (e.owner[slot] !== player) break;
          e.order[slot] = Order.AttackMove;
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
        case 'rally': {
          if (!isAlive(e, c.building)) break;
          const slot = slotOf(c.building);
          if (e.owner[slot] !== player || (e.flags[slot]! & Role.Structure) === 0) break;
          e.rallyX[slot] = c.x;
          e.rallyY[slot] = c.y;
          // A tap on (near) a resource means "rally to harvest"; else a ground point.
          e.rallyTarget[slot] = NONE;
          const node = nearest(s, c.x, c.y, (sl) => (e.flags[sl]! & Role.Resource) !== 0);
          if (node !== NONE) {
            const dx = e.x[node]! - c.x; const dy = e.y[node]! - c.y;
            if (dx * dx + dy * dy <= RALLY_SNAP * RALLY_SNAP) e.rallyTarget[slot] = eid(e, node);
          }
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
