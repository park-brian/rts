import { Kind, sec, tiles } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { consumeInternalProduct, hasInternalProductReady } from './internal-products.ts';

export const WeaponMechanic = {
  ScarabLaunch: 1,
  InterceptorLaunch: 2,
  LurkerLineSplash: 3,
  MutaliskBounce: 4,
  AcidSpores: 5,
  SuicideOnFire: 6,
  ContainerProvider: 7,
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
  postFire?: WeaponMechanicId;
  containerProvider?: boolean;
};

export type InterceptorLaunchMechanic = WeaponMechanicDef & {
  id: typeof WeaponMechanic.InterceptorLaunch;
  childKind: number;
  launchRange: number;
  launchCooldown: number;
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
  {
    unit: Kind.Scourge,
    id: WeaponMechanic.SuicideOnFire,
    postFire: WeaponMechanic.SuicideOnFire,
  },
  {
    unit: Kind.InfestedTerran,
    id: WeaponMechanic.SuicideOnFire,
    postFire: WeaponMechanic.SuicideOnFire,
  },
  {
    unit: Kind.SpiderMine,
    id: WeaponMechanic.SuicideOnFire,
    postFire: WeaponMechanic.SuicideOnFire,
  },
  {
    unit: Kind.Bunker,
    id: WeaponMechanic.ContainerProvider,
    containerProvider: true,
  },
] as const;

const indexWeaponMechanics = (defs: readonly WeaponMechanicDef[]): Partial<Record<number, WeaponMechanicDef>> => {
  const byUnit: Partial<Record<number, WeaponMechanicDef>> = {};
  for (const def of defs) {
    if (byUnit[def.unit] !== undefined) throw new Error(`duplicate weapon mechanic for unit kind ${def.unit}`);
    byUnit[def.unit] = def;
  }
  return byUnit;
};

export const WeaponMechanicByUnit = indexWeaponMechanics(WeaponMechanicDefs);

export const weaponMechanicDef = (kind: number): WeaponMechanicDef | undefined =>
  WeaponMechanicByUnit[kind];

export const isInterceptorLaunchMechanic = (mechanic: WeaponMechanicDef | undefined): mechanic is InterceptorLaunchMechanic =>
  mechanic?.id === WeaponMechanic.InterceptorLaunch &&
  mechanic.childKind !== undefined &&
  mechanic.launchRange !== undefined &&
  mechanic.launchCooldown !== undefined;

export const hasWeaponMechanicAmmo = (s: State, slot: number, mechanic?: WeaponMechanicDef): boolean => {
  if (mechanic?.consumesAmmoOnFire !== true) return true;
  return mechanic.childKind !== undefined && hasInternalProductReady(s, slot, mechanic.childKind);
};

export const consumeWeaponMechanicAmmo = (s: State, slot: number, mechanic?: WeaponMechanicDef): void => {
  if (mechanic?.consumesAmmoOnFire === true && mechanic.childKind !== undefined) {
    consumeInternalProduct(s, slot, mechanic.childKind);
  }
};
