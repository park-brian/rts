import { Kind, Units, tiles } from './data.ts';
import { isLiftedStructureFlags } from './terran-mobility.ts';
import type { State } from './world.ts';
import { NONE, eid, isAlive, slotOf } from './world.ts';
import { spawnUnit } from './factory.ts';

export const addonParentKind = (addonKind: number): number => {
  switch (addonKind) {
    case Kind.MachineShop: return Kind.Factory;
    case Kind.ControlTower: return Kind.Starport;
    case Kind.ComsatStation:
    case Kind.NuclearSilo: return Kind.CommandCenter;
    case Kind.PhysicsLab:
    case Kind.CovertOps: return Kind.ScienceFacility;
    default: return Kind.None;
  }
};

export const isAddonKind = (kind: number): boolean => Units[kind]?.buildMethod === 'addon';

export const activeAddonParentSlot = (s: State, addon: number): number => {
  const e = s.e;
  if (addon < 0 || addon >= e.hi || e.alive[addon] !== 1 || !isAddonKind(e.kind[addon]!)) return NONE;
  const parentId = e.target[addon]!;
  if (!isAlive(e, parentId)) return NONE;
  const parent = slotOf(parentId);
  if (e.owner[parent] !== e.owner[addon]) return NONE;
  if (e.built[parent] !== 1 || isLiftedStructureFlags(e.flags[parent]!)) return NONE;
  if (addonParentKind(e.kind[addon]!) !== e.kind[parent]) return NONE;
  return e.target[parent] === eid(e, addon) ? parent : NONE;
};

export const isActiveAddon = (s: State, slot: number): boolean =>
  !isAddonKind(s.e.kind[slot]!) || activeAddonParentSlot(s, slot) !== NONE;

export const addonPosition = (s: State, parent: number, addonKind: number): { x: number; y: number } => {
  const e = s.e;
  const parentDef = Units[e.kind[parent]!]!;
  const addonDef = Units[addonKind]!;
  return {
    x: e.x[parent]! + tiles((parentDef.footprintW + addonDef.footprintW) / 2),
    y: e.y[parent]! + tiles((parentDef.footprintH - addonDef.footprintH) / 2),
  };
};

export const startAddon = (s: State, parent: number, kind: number, player: number): void => {
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
