import { Kind, sec, tiles } from './data.ts';

export const WeaponMechanic = {
  ScarabLaunch: 1,
  InterceptorLaunch: 2,
} as const;

export type WeaponMechanicId = typeof WeaponMechanic[keyof typeof WeaponMechanic];

export type WeaponMechanicDef = {
  unit: number;
  id: WeaponMechanicId;
  childKind: number;
  consumesAmmoOnFire?: boolean;
  replacesDirectHit?: boolean;
  launchRange?: number;
  launchCooldown?: number;
};

export const WeaponMechanicDefs: readonly WeaponMechanicDef[] = [
  {
    unit: Kind.Reaver,
    id: WeaponMechanic.ScarabLaunch,
    childKind: Kind.Scarab,
    consumesAmmoOnFire: true,
    replacesDirectHit: true,
  },
  {
    unit: Kind.Carrier,
    id: WeaponMechanic.InterceptorLaunch,
    childKind: Kind.Interceptor,
    launchRange: tiles(8),
    launchCooldown: sec(1),
  },
] as const;

const WeaponMechanicByUnit: Partial<Record<number, WeaponMechanicDef>> = {
  [Kind.Reaver]: WeaponMechanicDefs[0]!,
  [Kind.Carrier]: WeaponMechanicDefs[1]!,
};

export const weaponMechanicDef = (kind: number): WeaponMechanicDef | undefined =>
  WeaponMechanicByUnit[kind];
