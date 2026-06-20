import {
  EffectKind, Kind, Role, Units, sec, tiles, type Weapon, weaponForTarget,
} from '../data/index.ts';
import { eid, isEnemy, kill, NONE, type State } from '../entity/world.ts';
import {
  distanceSq, distanceSqToRect, topDownEdgeDistanceSq, topDownInteractionRect, withinTopDownEdgeRange,
  type InteractionRect,
} from '../spatial/geometry.ts';
import { isContained } from './cargo.ts';
import { applyWeaponDamage } from './damage.ts';
import { canDetect } from './detection.ts';
import { coveredByEffect } from './effects.ts';
import { consumeInternalProduct, hasInternalProductReady } from './internal-products.ts';
import { effectiveCooldown, isDisabled } from './status.ts';
import { upgradedRange } from './upgrades.ts';
import { applyWeaponHit } from './weapon-hit.ts';

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

const ACID_SPORE_DURATION = sec(30);
const ACID_SPORE_MAX = 9;

const applyAcidSpore = (s: State, target: number): void => {
  const e = s.e;
  if (e.alive[target] !== 1) return;
  e.acidSporeCount[target] = Math.min(ACID_SPORE_MAX, e.acidSporeCount[target]! + 1);
  e.acidSporeTimer[target] = ACID_SPORE_DURATION;
};

const bounceWeapon = (weapon: Weapon, damage: number): Weapon => ({
  damage,
  dtype: weapon.dtype,
  cooldown: weapon.cooldown,
  range: weapon.range,
  shots: 1,
});

const nearestBounceTarget = (
  s: State,
  owner: number,
  from: number,
  excludeA: number,
  excludeB: number,
  range: number,
): number => {
  const e = s.e;
  let best = NONE;
  let bestD = range * range + 1;
  for (let i = 0; i < e.hi; i++) {
    if (i === excludeA || i === excludeB || e.alive[i] !== 1 || isContained(s, i)) continue;
    if (!isEnemy(s, owner, e.owner[i]!) || !canDetect(s, owner, i)) continue;
    const d = topDownEdgeDistanceSq(s, from, i);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
};

const applyMutaliskBounce = (s: State, attacker: number, first: number, weapon: Weapon): void => {
  const owner = s.e.owner[attacker]!;
  const range = tiles(3);
  const second = nearestBounceTarget(s, owner, first, first, NONE, range);
  if (second === NONE) return;
  applyWeaponDamage(s, second, bounceWeapon(weapon, Math.max(1, Math.trunc(weapon.damage / 3))), attacker);
  const third = nearestBounceTarget(s, owner, second, first, second, range);
  if (third !== NONE) applyWeaponDamage(s, third, bounceWeapon(weapon, Math.max(1, Math.trunc(weapon.damage / 9))), attacker);
};

const distSqToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return distanceSq(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return distanceSq(px, py, cx, cy);
};

const segmentIntersectsRect = (ax: number, ay: number, bx: number, by: number, rect: InteractionRect): boolean => {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - rect.x0) && clip(dx, rect.x1 - ax) &&
    clip(-dy, ay - rect.y0) && clip(dy, rect.y1 - ay);
};

const distSqRectToSegment = (rect: InteractionRect, ax: number, ay: number, bx: number, by: number): number => {
  if (segmentIntersectsRect(ax, ay, bx, by, rect)) return 0;
  return Math.min(
    distanceSqToRect(ax, ay, rect.x0, rect.y0, rect.x1, rect.y1),
    distanceSqToRect(bx, by, rect.x0, rect.y0, rect.x1, rect.y1),
    distSqToSegment(rect.x0, rect.y0, ax, ay, bx, by),
    distSqToSegment(rect.x1, rect.y0, ax, ay, bx, by),
    distSqToSegment(rect.x0, rect.y1, ax, ay, bx, by),
    distSqToSegment(rect.x1, rect.y1, ax, ay, bx, by),
  );
};

const applyLurkerLineSplash = (s: State, attacker: number, target: number, weapon: Weapon): void => {
  const e = s.e;
  const ax = e.x[attacker]!;
  const ay = e.y[attacker]!;
  const tx = e.x[target]!;
  const ty = e.y[target]!;
  const width = tiles(1);
  const width2 = width * width;
  for (let i = 0; i < e.hi; i++) {
    if (i === attacker || i === target || e.alive[i] !== 1 || isContained(s, i)) continue;
    if ((e.flags[i]! & (Role.Air | Role.Resource)) !== 0) continue;
    const body = topDownInteractionRect(e.kind[i]!, e.x[i]!, e.y[i]!, e.flags[i]!);
    if (distSqRectToSegment(body, ax, ay, tx, ty) <= width2) applyWeaponDamage(s, i, weapon, attacker);
  }
};

type WeaponMechanicOnHitApplicator = (s: State, attacker: number, target: number, weapon: Weapon) => void;
type WeaponMechanicPostFireApplicator = (s: State, attacker: number) => void;

const WeaponMechanicOnHitApplicators: Partial<Record<WeaponMechanicId, WeaponMechanicOnHitApplicator>> = {
  [WeaponMechanic.LurkerLineSplash]: applyLurkerLineSplash,
  [WeaponMechanic.MutaliskBounce]: applyMutaliskBounce,
  [WeaponMechanic.AcidSpores]: (s, _attacker, target) => applyAcidSpore(s, target),
};

const WeaponMechanicPostFireApplicators: Partial<Record<WeaponMechanicId, WeaponMechanicPostFireApplicator>> = {
  [WeaponMechanic.SuicideOnFire]: (s, attacker) => {
    if (s.e.alive[attacker] === 1) kill(s, attacker);
  },
};

export const applyWeaponMechanicOnHit = (
  s: State,
  mechanic: WeaponMechanicDef | undefined,
  attacker: number,
  target: number,
  weapon: Weapon,
): void => {
  const onHit = mechanic?.onHit;
  if (onHit !== undefined) WeaponMechanicOnHitApplicators[onHit]?.(s, attacker, target, weapon);
};

export const applyWeaponMechanicPostFire = (
  s: State,
  mechanic: WeaponMechanicDef | undefined,
  attacker: number,
): void => {
  const postFire = mechanic?.postFire;
  if (postFire !== undefined) WeaponMechanicPostFireApplicators[postFire]?.(s, attacker);
};

export const canContainerProviderAttack = (s: State, provider: number, target: number): boolean => {
  const e = s.e;
  const targetDef = Units[e.kind[target]!];
  if (!targetDef) return false;
  const providerId = eid(e, provider);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== providerId || isDisabled(e, i)) continue;
    const weapon = weaponForTarget(Units[e.kind[i]!]!, targetDef);
    if (!weapon) continue;
    const range = upgradedRange(s, i, weapon);
    if (withinTopDownEdgeRange(s, provider, target, range)) return true;
  }
  return false;
};

export const nearestContainerProviderTarget = (s: State, provider: number, sight: number): number => {
  const e = s.e;
  const owner = e.owner[provider]!;
  const r2 = sight * sight;
  let best = NONE;
  let bestD = r2 + 1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || !isEnemy(s, owner, e.owner[i]!) || !canDetect(s, owner, i)) continue;
    const d = topDownEdgeDistanceSq(s, provider, i);
    if (d <= r2 && d < bestD && canContainerProviderAttack(s, provider, i)) {
      best = i;
      bestD = d;
    }
  }
  return best;
};

export const fireContainerProvider = (s: State, provider: number, target: number): void => {
  const e = s.e;
  const targetDef = Units[e.kind[target]!];
  if (!targetDef) return;
  const providerId = eid(e, provider);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== providerId || isDisabled(e, i)) continue;
    const weapon = weaponForTarget(Units[e.kind[i]!]!, targetDef);
    if (!weapon || e.wcd[i]! > 0) continue;
    const range = upgradedRange(s, i, weapon);
    if (!withinTopDownEdgeRange(s, provider, target, range)) continue;
    if ((e.flags[target]! & Role.Air) === 0 && coveredByEffect(s, target, EffectKind.DarkSwarm) && range > tiles(2)) continue;
    if (e.illusion[i] !== 1) applyWeaponHit(s, target, weapon, i);
    e.wcd[i] = effectiveCooldown(s, e, i, weapon.cooldown);
  }
};
