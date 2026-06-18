import { fx } from './fixed.ts';
import { Kind, Order, Role, Units } from './data.ts';
import { eid, NONE, type State } from './world.ts';
import { clearVelocity } from './systems/move.ts';

export const LIFTED_BUILDING_SPEED = fx(1);

export const isLiftableTerranStructureKind = (kind: number): boolean => {
  switch (kind) {
    case Kind.CommandCenter:
    case Kind.Barracks:
    case Kind.EngineeringBay:
    case Kind.Factory:
    case Kind.Starport:
    case Kind.ScienceFacility:
      return true;
    default:
      return false;
  }
};

export const isLiftedStructureFlags = (flags: number): boolean =>
  (flags & (Role.Structure | Role.Mobile | Role.Air)) === (Role.Structure | Role.Mobile | Role.Air);

export const liftedStructureFlags = (kind: number): number =>
  ((Units[kind]?.roles ?? 0) | Role.Mobile | Role.Air) & ~(Role.Producer | Role.ResourceDepot);

export const landedStructureFlags = (kind: number): number => Units[kind]?.roles ?? 0;

export const commandMoveSpeed = (kind: number, flags: number): number =>
  isLiftedStructureFlags(flags) ? LIFTED_BUILDING_SPEED : (Units[kind]?.speed ?? 0);

const clearSettled = (s: State, slot: number): void => {
  s.e.settled[slot] = 0;
};

export const liftStructure = (s: State, slot: number): void => {
  const e = s.e;
  clearSettled(s, slot);
  clearVelocity(e, slot);
  e.flags[slot] = liftedStructureFlags(e.kind[slot]!);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
};

export const startStructureLanding = (s: State, slot: number, x: number, y: number): void => {
  const e = s.e;
  clearSettled(s, slot);
  clearVelocity(e, slot);
  e.order[slot] = Order.Move;
  e.target[slot] = eid(e, slot);
  e.tx[slot] = x;
  e.ty[slot] = y;
};
