import { internalAmmoCapacity } from './derived.ts';
import { Kind, Order, Units, sec, tiles, weaponForTarget } from './data.ts';
import { spawnUnit } from './factory.ts';
import { isqrt } from './fixed.ts';
import { eid, slotOf, type State } from './world.ts';
import { faceToward } from './systems/move.ts';
import { WeaponMechanic, weaponMechanicDef } from './weapon-mechanics.ts';

const BAY_FORWARD = tiles(0.3);
const BAY_SIDE = tiles(0.58);

const interceptorMechanic = () => {
  const mechanic = weaponMechanicDef(Kind.Carrier);
  if (mechanic?.id !== WeaponMechanic.InterceptorLaunch) throw new Error('missing carrier interceptor mechanic');
  return mechanic;
};

export const INTERCEPTOR_SORTIE_TICKS = sec(4);

export type InterceptorBayPoint = { x: number; y: number };

export const carrierBayPoint = (s: State, carrier: number, bay: number): InterceptorBayPoint => {
  const e = s.e;
  let fx = e.faceX[carrier]!;
  let fy = e.faceY[carrier]!;
  let len = isqrt(fx * fx + fy * fy);
  if (len === 0) {
    fx = 0;
    fy = -1;
    len = 1;
  }
  const side = (bay & 1) === 0 ? -BAY_SIDE : BAY_SIDE;
  const forward = (bay & 2) === 0 ? BAY_FORWARD : -BAY_FORWARD;
  return {
    x: e.x[carrier]! + Math.trunc((fx * forward - fy * side) / len),
    y: e.y[carrier]! + Math.trunc((fy * forward + fx * side) / len),
  };
};

const launchedBy = (s: State, carrier: number): number => {
  const e = s.e;
  const id = eid(e, carrier);
  let n = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Interceptor && e.home[i] === id) n++;
  }
  return n;
};

export const carrierLaunchRange = (): number => interceptorMechanic().launchRange!;

export const carrierCanTarget = (s: State, carrier: number, target: number): boolean => {
  const mechanic = weaponMechanicDef(s.e.kind[carrier]!);
  if (mechanic?.id !== WeaponMechanic.InterceptorLaunch) return false;
  const targetDef = Units[s.e.kind[target]!];
  return !!targetDef && !!weaponForTarget(Units[mechanic.childKind]!, targetDef);
};

export const carrierCanAttack = (s: State, carrier: number, target: number): boolean =>
  s.e.specialAmmo[carrier]! > 0 && carrierCanTarget(s, carrier, target);

export const launchInterceptor = (s: State, carrier: number, target: number): boolean => {
  const e = s.e;
  const mechanic = interceptorMechanic();
  const capacity = internalAmmoCapacity(s, carrier, mechanic.childKind);
  if (capacity <= 0 || e.specialAmmo[carrier]! <= 0) return false;
  const launched = launchedBy(s, carrier);
  if (launched >= capacity) return false;
  e.specialAmmo[carrier] = e.specialAmmo[carrier]! - 1;
  faceToward(e, carrier, e.x[target]!, e.y[target]!);
  const bay = carrierBayPoint(s, carrier, launched);
  const id = spawnUnit(s, mechanic.childKind, e.owner[carrier]!, bay.x, bay.y);
  const interceptor = slotOf(id);
  e.home[interceptor] = eid(e, carrier);
  e.order[interceptor] = Order.Attack;
  e.target[interceptor] = eid(e, target);
  e.timer[interceptor] = INTERCEPTOR_SORTIE_TICKS;
  faceToward(e, interceptor, e.x[target]!, e.y[target]!);
  return true;
};

export const interceptorLaunchCooldown = (): number => interceptorMechanic().launchCooldown!;
