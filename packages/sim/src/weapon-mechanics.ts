import { Kind, sec, tiles } from './data.ts';

export const WeaponMechanic = {
  ScarabLaunch: 1,
  InterceptorLaunch: 2,
  LurkerLineSplash: 3,
  MutaliskBounce: 4,
  AcidSpores: 5,
} as const;

export type WeaponMechanicId = typeof WeaponMechanic[keyof typeof WeaponMechanic];

export type WeaponMechanicDef = {
  unit: number;
  id: WeaponMechanicId;
  childKind?: number;
  consumesAmmoOnFire?: boolean;
  replacesDirectHit?: boolean;
  launchRange?: number;
  launchCooldown?: number;
  onHit?: WeaponMechanicId;
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
  {
    unit: Kind.Lurker,
    id: WeaponMechanic.LurkerLineSplash,
    onHit: WeaponMechanic.LurkerLineSplash,
  },
  {
    unit: Kind.Mutalisk,
    id: WeaponMechanic.MutaliskBounce,
    onHit: WeaponMechanic.MutaliskBounce,
  },
  {
    unit: Kind.Devourer,
    id: WeaponMechanic.AcidSpores,
    onHit: WeaponMechanic.AcidSpores,
  },
] as const;

const WeaponMechanicByUnit: Partial<Record<number, WeaponMechanicDef>> = {
  [Kind.Reaver]: WeaponMechanicDefs[0]!,
  [Kind.Carrier]: WeaponMechanicDefs[1]!,
  [Kind.Lurker]: WeaponMechanicDefs[2]!,
  [Kind.Mutalisk]: WeaponMechanicDefs[3]!,
  [Kind.Devourer]: WeaponMechanicDefs[4]!,
};

export const weaponMechanicDef = (kind: number): WeaponMechanicDef | undefined =>
  WeaponMechanicByUnit[kind];
