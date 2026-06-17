import { Kind, Units, tiles } from './data.ts';
import type { State } from './world.ts';

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

export const addonPosition = (s: State, parent: number, addonKind: number): { x: number; y: number } => {
  const e = s.e;
  const parentDef = Units[e.kind[parent]!]!;
  const addonDef = Units[addonKind]!;
  return {
    x: e.x[parent]! + tiles((parentDef.footprintW + addonDef.footprintW) / 2),
    y: e.y[parent]! + tiles((parentDef.footprintH - addonDef.footprintH) / 2),
  };
};
