import { fx } from './fixed.ts';
import { Kind, Role, Units } from './data.ts';

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
