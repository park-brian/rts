import type { State } from '../entity/world.ts';
import { isAlive, isEnemy, kill, NONE, slotOf } from '../entity/world.ts';
import { Kind, Role, Units, weaponForTarget, type Weapon } from '../data/index.ts';
import { canDetect } from '../mechanics/detection.ts';
import { isContained } from '../mechanics/cargo.ts';
import { navigate } from '../spatial/pathing.ts';
import { withinTopDownEdgeRange } from '../spatial/geometry.ts';
import { faceToward } from '../spatial/motion.ts';
import { effectiveSpeed } from '../mechanics/status.ts';
import { applyWeaponHit } from '../mechanics/weapon-hit.ts';
import { actorProjectile, type ActorImpactPolicy, type ActorProjectileTarget } from '../mechanics/actors.ts';

const SCARAB_PROJECTILE = actorProjectile(Kind.Scarab);
if (!SCARAB_PROJECTILE) throw new Error('missing Scarab actor projectile descriptor');

const matchesProjectileTarget = (
  s: State,
  actor: number,
  home: number,
  target: number,
  policy: ActorProjectileTarget,
): boolean => {
  const e = s.e;
  if (e.alive[target] !== 1 || isContained(s, target)) return false;
  if (!isEnemy(s, e.owner[actor]!, e.owner[target]!)) return false;
  switch (policy) {
    case 'scarab-ground-detectable':
      if (!canDetect(s, e.owner[actor]!, target)) return false;
      if ((e.flags[target]! & Role.Air) !== 0) return false;
      return weaponForTarget(Units[e.kind[home]!]!, Units[e.kind[target]!]!) !== null;
    default:
      policy satisfies never;
      return false;
  }
};

const applyProjectileImpact = (
  s: State,
  actor: number,
  home: number,
  target: number,
  weapon: Weapon,
  policy: ActorImpactPolicy,
): void => {
  switch (policy) {
    case 'weapon-hit-from-home':
      applyWeaponHit(s, target, weapon, home);
      kill(s, actor);
      break;
    default:
      policy satisfies never;
  }
};

const impactIfReady = (s: State, scarab: number, reaver: number, target: number): boolean => {
  const weapon = Units[s.e.kind[scarab]!]!.weapon!;
  if (!withinTopDownEdgeRange(s, scarab, target, weapon.range)) return false;
  applyProjectileImpact(s, scarab, reaver, target, weapon, SCARAB_PROJECTILE.impact);
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
    if (!matchesProjectileTarget(s, i, reaver, target, SCARAB_PROJECTILE.target)) { kill(s, i); continue; }
    if (e.timer[i]! <= 0) { kill(s, i); continue; }
    if (impactIfReady(s, i, reaver, target)) continue;
    e.timer[i] = e.timer[i]! - 1;
    faceToward(e, i, e.x[target]!, e.y[target]!);
    navigate(s, i, e.x[target]!, e.y[target]!, effectiveSpeed(s, e, i, Units[Kind.Scarab]!.speed));
    if (e.alive[i] === 1 && matchesProjectileTarget(s, i, reaver, target, SCARAB_PROJECTILE.target)) {
      impactIfReady(s, i, reaver, target);
    }
  }
};
