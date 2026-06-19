import type { State } from '../entity/world.ts';
import { isAlive, kill, NONE, slotOf } from '../entity/world.ts';
import { Kind, Order, Units } from '../data/index.ts';
import { actorSortie } from '../mechanics/actors.ts';
import { storeInternalProduct } from '../mechanics/internal-products.ts';
import { carrierBayPoint } from '../mechanics/interceptor.ts';
import { navigate } from '../spatial/pathing.ts';
import { faceToward, within } from '../spatial/motion.ts';
import { effectiveSpeed } from './status.ts';

const INTERCEPTOR_SORTIE = actorSortie(Kind.Interceptor);
if (!INTERCEPTOR_SORTIE) throw new Error('missing Interceptor actor sortie descriptor');

const returnToCarrier = (s: State, interceptor: number, carrier: number): void => {
  const e = s.e;
  const bay = carrierBayPoint(s, carrier, interceptor);
  faceToward(e, interceptor, bay.x, bay.y);
  e.order[interceptor] = Order.Idle;
  e.target[interceptor] = NONE;
  e.timer[interceptor] = -1;
  if (within(e, interceptor, bay.x, bay.y, INTERCEPTOR_SORTIE.returnRange)) {
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
    if (dx * dx + dy * dy > INTERCEPTOR_SORTIE.leashRange * INTERCEPTOR_SORTIE.leashRange) {
      returnToCarrier(s, i, carrier);
      continue;
    }
    e.timer[i] = e.timer[i]! - 1;
    if (e.timer[i]! <= 0) {
      returnToCarrier(s, i, carrier);
      continue;
    }
    const [ox, oy] = INTERCEPTOR_SORTIE.orbitOffsets[((s.tick >> 3) + i) % INTERCEPTOR_SORTIE.orbitOffsets.length]!;
    const tx = e.x[target]! + ox * INTERCEPTOR_SORTIE.orbitRadius;
    const ty = e.y[target]! + oy * INTERCEPTOR_SORTIE.orbitRadius;
    faceToward(e, i, e.x[target]!, e.y[target]!);
    navigate(s, i, tx, ty, effectiveSpeed(s, e, i, Units[Kind.Interceptor]!.speed));
  }
};
