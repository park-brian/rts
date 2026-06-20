import { Kind } from '../data/index.ts';
import { trySpawnUnit } from '../entity/factory.ts';
import { eid, NONE, slotOf, type State } from '../entity/world.ts';
import { faceToward } from '../spatial/motion.ts';
import { actorProjectile } from './actors.ts';

const SCARAB_PROJECTILE = actorProjectile(Kind.Scarab);
if (!SCARAB_PROJECTILE) throw new Error('missing Scarab actor projectile descriptor');

export const launchScarab = (s: State, reaver: number, target: number): boolean => {
  const e = s.e;
  const id = trySpawnUnit(s, Kind.Scarab, e.owner[reaver]!, e.x[reaver]!, e.y[reaver]!);
  if (id === NONE) return false;
  const scarab = slotOf(id);
  e.home[scarab] = eid(e, reaver);
  e.target[scarab] = eid(e, target);
  e.timer[scarab] = SCARAB_PROJECTILE.lifetime;
  faceToward(e, scarab, e.x[target]!, e.y[target]!);
  return true;
};
