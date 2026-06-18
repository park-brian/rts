import { Kind, Order, Units, productionCostCount, productionCount } from './data.ts';
import type { State } from './world.ts';
import { NONE, type Entities } from './world.ts';

export const queuedProductionCount = (e: Entities, slot: number): number =>
  e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;

export const queueProduction = (s: State, slot: number, kind: number, player: number): void => {
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

export const reserveProductionSupply = (reservedSupply: Int32Array | undefined, player: number, kind: number): void => {
  if (reservedSupply) reservedSupply[player] = reservedSupply[player]! + Units[kind]!.supply * productionCount(kind);
};
