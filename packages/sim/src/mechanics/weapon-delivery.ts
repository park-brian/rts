import type { State } from '../entity/world.ts';
import { carrierCanTarget, launchInterceptor } from './interceptor.ts';
import { launchScarab } from './scarab.ts';
import { WeaponMechanic, type WeaponMechanicDef, type WeaponMechanicId } from './weapons.ts';

type WeaponMechanicLauncher = (s: State, attacker: number, target: number) => boolean;

const WeaponMechanicLaunchers: Partial<Record<WeaponMechanicId, WeaponMechanicLauncher>> = {
  [WeaponMechanic.ScarabLaunch]: launchScarab,
  [WeaponMechanic.InterceptorLaunch]: launchInterceptor,
};

export const weaponMechanicLaunchesChild = (mechanic: WeaponMechanicDef | undefined): boolean =>
  mechanic !== undefined && WeaponMechanicLaunchers[mechanic.id] !== undefined;

export const canLaunchWeaponMechanicAtTarget = (
  s: State,
  mechanic: WeaponMechanicDef | undefined,
  attacker: number,
  target: number,
): boolean => {
  if (mechanic?.id === WeaponMechanic.InterceptorLaunch) return carrierCanTarget(s, attacker, target);
  return weaponMechanicLaunchesChild(mechanic);
};

export const launchWeaponMechanic = (
  s: State,
  mechanic: WeaponMechanicDef | undefined,
  attacker: number,
  target: number,
): boolean => {
  if (!mechanic) return false;
  return WeaponMechanicLaunchers[mechanic.id]?.(s, attacker, target) ?? false;
};