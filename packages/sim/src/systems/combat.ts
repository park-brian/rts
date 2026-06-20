// Combat: any unit with a weapon acquires and engages enemies. Order semantics:
//   Attack      -> chase + hit a specific target until it dies
//   AttackMove  -> advance toward a point, engaging enemies met en route
//   Hold        -> fire at enemies in range without chasing
//   Patrol      -> move between two points, engaging enemies met en route
//   Idle        -> defend by engaging enemies within sight
// Units on Move/Harvest/Build do not fire (they're busy).

import type { State } from '../entity/world.ts';
import { slotOf, eid, isAlive, isEnemy, NONE } from '../entity/world.ts';
import { startNextQueuedTravelOrder } from '../entity/order-queue.ts';
import { EffectKind, Order, Role, Units, tiles, type Weapon, weaponForTarget } from '../data/index.ts';
import { faceToward, within } from '../spatial/motion.ts';
import { navigate } from '../spatial/pathing.ts';
import { type Grid, nearestAttackableEnemy, nearestEnemy } from '../spatial/grid.ts';
import { effectiveCooldown, effectiveSight, effectiveSpeed, isDisabled } from '../mechanics/status.ts';
import { coveredByEffect } from '../mechanics/effects.ts';
import { canDetect } from '../mechanics/detection.ts';
import { upgradedRange } from '../mechanics/upgrades.ts';
import { isPowered } from '../mechanics/power.ts';
import { isContained } from '../mechanics/cargo.ts';
import { canUseWeaponNow } from '../mechanics/burrow.ts';
import { kindHasDirectWeapon } from '../mechanics/capabilities.ts';
import { topDownEdgeDistanceSq, withinTopDownEdgeRange } from '../spatial/geometry.ts';
import { carrierCanTarget, launchInterceptor } from '../mechanics/interceptor.ts';
import { applyWeaponHit } from '../mechanics/weapon-hit.ts';
import { launchScarab } from '../mechanics/scarab.ts';
import { isLocalAvoidanceSolid } from '../spatial/local-avoidance.ts';
import { isExternallySteeredActor, participatesInNormalCombat } from '../mechanics/actors.ts';
import {
  WeaponMechanic,
  applyWeaponMechanicOnHit,
  applyWeaponMechanicPostFire,
  canContainerProviderAttack,
  consumeWeaponMechanicAmmo,
  fireContainerProvider,
  hasWeaponMechanicAmmo,
  isInterceptorLaunchMechanic,
  nearestContainerProviderTarget,
  weaponMechanicDef,
} from '../mechanics/weapons.ts';

const insideMinimumRange = (s: State, attacker: number, target: number, weapon: Weapon): boolean =>
  weapon.minRange !== undefined && topDownEdgeDistanceSq(s, attacker, target) < weapon.minRange * weapon.minRange;

const currentCombatTarget = (s: State, slot: number): number => {
  const e = s.e;
  return e.combatTarget[slot] !== NONE ? e.combatTarget[slot]! : e.target[slot]!;
};

const rememberCombatTarget = (s: State, slot: number, target: number): void => {
  s.e.combatTarget[slot] = eid(s.e, target);
};

const clearCombatTarget = (s: State, slot: number): void => {
  const e = s.e;
  const old = e.combatTarget[slot]!;
  e.combatTarget[slot] = NONE;
  if (old === NONE || e.target[slot] === old) e.target[slot] = NONE;
};

export const combat = (s: State, grid: Grid): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && isContained(s, i) && e.wcd[i]! > 0) e.wcd[i] = e.wcd[i]! - 1;
  }
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || isContained(s, i)) continue;
    if (!participatesInNormalCombat(e.kind[i]!)) continue;
    const def = Units[e.kind[i]!];
    const mechanic = weaponMechanicDef(e.kind[i]!);
    const containerProvider = mechanic?.containerProvider === true;
    const interceptorMechanic = isInterceptorLaunchMechanic(mechanic) ? mechanic : undefined;
    const interceptorLaunch = interceptorMechanic !== undefined;
    if (!def || (!kindHasDirectWeapon(e.kind[i]!) && !containerProvider && !interceptorLaunch)) continue;
    if (e.wcd[i]! > 0) e.wcd[i] = e.wcd[i]! - 1;
    if (!containerProvider && !interceptorLaunch && !hasWeaponMechanicAmmo(s, i, mechanic)) continue;
    if (!containerProvider && !canUseWeaponNow(s, i)) continue;
    if (isDisabled(e, i)) continue;
    if (!isPowered(s, i)) continue;
    if ((e.flags[i]! & Role.Air) === 0 && coveredByEffect(s, i, EffectKind.DisruptionWeb)) continue;

    const order = e.order[i]!;
    // Resolved channels keep castAbility through combat so a caster cannot also fire this tick.
    if (e.castAbility[i]! !== 0) continue;
    const holdPosition = order === Order.Hold;
    const patrol = order === Order.Patrol;
    const engaging = order === Order.Attack || order === Order.AttackMove || order === Order.Idle || holdPosition || patrol;
    if (!engaging) continue;

    // Keep the current target while it's still valid — for Attack, chase it at any
    // range; for Idle/AttackMove, hold it while it's in sight. This avoids a grid
    // re-acquire every tick once a unit is engaged (the bulk of a melee). Only when
    // there's no valid target do Idle/AttackMove units acquire the nearest enemy.
    const owner = e.owner[i]!;
    const sight = tiles(effectiveSight(s, e, i, def.sight));
    let tgt = NONE;
    const rem = currentCombatTarget(s, i);
    if (isAlive(e, rem)) {
      const rs = slotOf(rem);
      if (!isContained(s, rs) && isEnemy(s, owner, e.owner[rs]!) && canDetect(s, owner, rs) &&
          (containerProvider ? canContainerProviderAttack(s, i, rs) : interceptorLaunch ? carrierCanTarget(s, i, rs) : weaponForTarget(def, Units[e.kind[rs]!]!)) &&
          (order === Order.Attack || within(e, i, e.x[rs]!, e.y[rs]!, sight))) tgt = rs;
    } else if (e.combatTarget[i] !== NONE) {
      clearCombatTarget(s, i);
    }
    if (tgt === NONE && order !== Order.Attack) {
      tgt = containerProvider ? nearestContainerProviderTarget(s, i, sight) : interceptorLaunch ? nearestEnemy(s, grid, i, sight) : nearestAttackableEnemy(s, grid, i, sight);
    }
    if (tgt !== NONE && !holdPosition) rememberCombatTarget(s, i, tgt); // remember for next tick

    if (tgt === NONE) {
      if (order === Order.Attack) {
        e.order[i] = Order.Idle; // target gone
        clearCombatTarget(s, i);
      }
      else if (order === Order.AttackMove) {
        if (navigate(s, i, e.tx[i]!, e.ty[i]!, def.speed) && !isLocalAvoidanceSolid(s, i) && !startNextQueuedTravelOrder(s, i)) {
          e.order[i] = Order.Idle;
          clearCombatTarget(s, i);
        }
      }
      continue;
    }

    if (containerProvider) {
      fireContainerProvider(s, i, tgt);
      continue;
    }
    if (interceptorLaunch) {
      if (withinTopDownEdgeRange(s, i, tgt, interceptorMechanic.launchRange)) {
        if (e.wcd[i]! <= 0 && launchInterceptor(s, i, tgt)) e.wcd[i] = interceptorMechanic.launchCooldown;
      } else if (holdPosition) {
        clearCombatTarget(s, i);
      } else {
        navigate(s, i, e.x[tgt]!, e.y[tgt]!, effectiveSpeed(s, e, i, def.speed));
      }
      continue;
    }

    faceToward(e, i, e.x[tgt]!, e.y[tgt]!);
    const weapon = weaponForTarget(def, Units[e.kind[tgt]!]!);
    const actorSystemSteers = isExternallySteeredActor(e.kind[i]!, e.home[i]!);
    if (!weapon) {
      if (order === Order.Attack) {
        e.order[i] = Order.Idle;
        clearCombatTarget(s, i);
      }
      continue;
    }
    const range = upgradedRange(s, i, weapon);
    if (withinTopDownEdgeRange(s, i, tgt, range) && !insideMinimumRange(s, i, tgt, weapon)) {
      if (e.wcd[i]! <= 0) {
        if ((e.flags[tgt]! & Role.Air) !== 0 || !coveredByEffect(s, tgt, EffectKind.DarkSwarm) || range <= tiles(2)) {
          if (e.illusion[i] !== 1) {
            let hit = true;
            let fired = true;
            if (mechanic?.id === WeaponMechanic.ScarabLaunch) {
              fired = launchScarab(s, i, tgt);
              hit = fired;
            } else {
              hit = applyWeaponHit(s, tgt, weapon, i);
            }
            if (!fired) continue;
            consumeWeaponMechanicAmmo(s, i, mechanic);
            if (hit) {
              applyWeaponMechanicOnHit(s, mechanic, i, tgt, weapon);
            }
          }
          applyWeaponMechanicPostFire(s, mechanic, i);
        }
        e.wcd[i] = effectiveCooldown(s, e, i, weapon.cooldown);
      }
    } else if (holdPosition) {
      clearCombatTarget(s, i);
    } else if (!actorSystemSteers) {
      navigate(s, i, e.x[tgt]!, e.y[tgt]!, effectiveSpeed(s, e, i, def.speed)); // approach
    }
  }
};
