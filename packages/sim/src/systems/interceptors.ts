import type { State } from '../entity/world.ts';
import { isAlive, kill, NONE, slotOf } from '../entity/world.ts';
import { Kind, Order, Units, tiles } from '../data.ts';
import { storeInternalProduct } from '../internal-products.ts';
import { carrierBayPoint } from '../interceptor.ts';
import { navigate } from '../pathing.ts';
import { faceToward, within } from './move.ts';
import { effectiveSpeed } from './status.ts';

const ORBIT_RADIUS = tiles(1);
const LEASH_RANGE = tiles(10);
const RETURN_RANGE = tiles(1);

const ORBIT: readonly [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];

const returnToCarrier = (s: State, interceptor: number, carrier: number): void => {
  const e = s.e;
  const bay = carrierBayPoint(s, carrier, interceptor);
  faceToward(e, interceptor, bay.x, bay.y);
  e.order[interceptor] = Order.Idle;
  e.target[interceptor] = NONE;
  e.timer[interceptor] = -1;
  if (within(e, interceptor, bay.x, bay.y, RETURN_RANGE)) {
    storeInternalProduct(s, carrier, Kind.Interceptor);
    kill(s, interceptor);
    return;
  }
  navigate(s, interceptor, bay.x, bay.y, effectiveSpeed(s, e, interceptor, Units[Kind.Interceptor]!.speed));
};

export const interceptors = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.Interceptor || e.home[i] === NONE) continue;
    if (!isAlive(e, e.home[i]!)) { kill(s, i); continue; }
    const carrier = slotOf(e.home[i]!);
    if (e.timer[i]! < 0 || !isAlive(e, e.target[i]!)) {
      returnToCarrier(s, i, carrier);
      continue;
    }
    const target = slotOf(e.target[i]!);
    const dx = e.x[i]! - e.x[carrier]!;
    const dy = e.y[i]! - e.y[carrier]!;
    if (dx * dx + dy * dy > LEASH_RANGE * LEASH_RANGE) {
      returnToCarrier(s, i, carrier);
      continue;
    }
    e.timer[i] = e.timer[i]! - 1;
    if (e.timer[i]! <= 0) {
      returnToCarrier(s, i, carrier);
      continue;
    }
    const [ox, oy] = ORBIT[((s.tick >> 3) + i) & 7]!;
    const tx = e.x[target]! + ox * ORBIT_RADIUS;
    const ty = e.y[target]! + oy * ORBIT_RADIUS;
    faceToward(e, i, e.x[target]!, e.y[target]!);
    navigate(s, i, tx, ty, effectiveSpeed(s, e, i, Units[Kind.Interceptor]!.speed));
  }
};
