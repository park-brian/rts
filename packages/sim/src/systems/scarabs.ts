import type { State } from '../entity/world.ts';
import { eid, isAlive, isEnemy, kill, NONE, slotOf } from '../entity/world.ts';
import { Kind, Role, Units, weaponForTarget } from '../data/index.ts';
import { trySpawnUnit } from '../entity/factory.ts';
import { canDetect } from '../mechanics/detection.ts';
import { isContained } from '../mechanics/cargo.ts';
import { navigate } from '../spatial/pathing.ts';
import { withinTopDownEdgeRange } from '../spatial/geometry.ts';
import { faceToward } from '../spatial/motion.ts';
import { effectiveSpeed } from './status.ts';
import { applyWeaponHit } from './weapon-hit.ts';

const SCARAB_LIFETIME = 180;

const validScarabTarget = (s: State, scarab: number, reaver: number, target: number): boolean => {
  const e = s.e;
  if (e.alive[target] !== 1 || isContained(s, target)) return false;
  if (!isEnemy(s, e.owner[scarab]!, e.owner[target]!)) return false;
  if (!canDetect(s, e.owner[scarab]!, target)) return false;
  if ((e.flags[target]! & Role.Air) !== 0) return false;
  return weaponForTarget(Units[e.kind[reaver]!]!, Units[e.kind[target]!]!) !== null;
};

export const launchScarab = (s: State, reaver: number, target: number): boolean => {
  const e = s.e;
  const id = trySpawnUnit(s, Kind.Scarab, e.owner[reaver]!, e.x[reaver]!, e.y[reaver]!);
  if (id === NONE) return false;
  const scarab = slotOf(id);
  e.home[scarab] = eid(e, reaver);
  e.target[scarab] = eid(e, target);
  e.timer[scarab] = SCARAB_LIFETIME;
  faceToward(e, scarab, e.x[target]!, e.y[target]!);
  return true;
};

const impactIfReady = (s: State, scarab: number, reaver: number, target: number): boolean => {
  const weapon = Units[Kind.Scarab]!.weapon!;
  if (!withinTopDownEdgeRange(s, scarab, target, weapon.range)) return false;
  applyWeaponHit(s, target, weapon, reaver);
  kill(s, scarab);
  return true;
};

export const scarabs = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.Scarab || e.home[i] === NONE) continue;
    if (!isAlive(e, e.home[i]!)) { kill(s, i); continue; }
    const reaver = slotOf(e.home[i]!);
    if (!isAlive(e, e.target[i]!)) { kill(s, i); continue; }
    const target = slotOf(e.target[i]!);
    if (!validScarabTarget(s, i, reaver, target)) { kill(s, i); continue; }
    if (e.timer[i]! <= 0) { kill(s, i); continue; }
    if (impactIfReady(s, i, reaver, target)) continue;
    e.timer[i] = e.timer[i]! - 1;
    faceToward(e, i, e.x[target]!, e.y[target]!);
    navigate(s, i, e.x[target]!, e.y[target]!, effectiveSpeed(s, e, i, Units[Kind.Scarab]!.speed));
    if (e.alive[i] === 1 && validScarabTarget(s, i, reaver, target)) impactIfReady(s, i, reaver, target);
  }
};
