import { internalAmmoCapacity } from './derived.ts';
import { Kind, Order, Units, sec, tiles, weaponForTarget } from './data.ts';
import { spawnUnit } from './factory.ts';
import { eid, slotOf, type State } from './world.ts';

const LAUNCH_COOLDOWN = sec(1);
const LAUNCH_RANGE = tiles(8);

export const INTERCEPTOR_SORTIE_TICKS = sec(4);

const launchedBy = (s: State, carrier: number): number => {
  const e = s.e;
  const id = eid(e, carrier);
  let n = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Interceptor && e.home[i] === id) n++;
  }
  return n;
};

export const carrierLaunchRange = (): number => LAUNCH_RANGE;

export const carrierCanTarget = (s: State, carrier: number, target: number): boolean => {
  if (s.e.kind[carrier] !== Kind.Carrier) return false;
  const targetDef = Units[s.e.kind[target]!];
  return !!targetDef && !!weaponForTarget(Units[Kind.Interceptor]!, targetDef);
};

export const carrierCanAttack = (s: State, carrier: number, target: number): boolean =>
  s.e.specialAmmo[carrier]! > 0 && carrierCanTarget(s, carrier, target);

export const launchInterceptor = (s: State, carrier: number, target: number): boolean => {
  const e = s.e;
  const capacity = internalAmmoCapacity(s, carrier, Kind.Interceptor);
  if (capacity <= 0 || e.specialAmmo[carrier]! <= 0) return false;
  if (launchedBy(s, carrier) >= capacity) return false;
  e.specialAmmo[carrier] = e.specialAmmo[carrier]! - 1;
  const id = spawnUnit(s, Kind.Interceptor, e.owner[carrier]!, e.x[carrier]!, e.y[carrier]!);
  const interceptor = slotOf(id);
  e.home[interceptor] = eid(e, carrier);
  e.order[interceptor] = Order.Attack;
  e.target[interceptor] = eid(e, target);
  e.timer[interceptor] = INTERCEPTOR_SORTIE_TICKS;
  return true;
};

export const interceptorLaunchCooldown = (): number => LAUNCH_COOLDOWN;
