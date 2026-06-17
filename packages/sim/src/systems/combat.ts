// Combat: any unit with a weapon acquires and engages enemies. Order semantics:
//   Attack      -> chase + hit a specific target until it dies
//   AttackMove  -> advance toward a point, engaging enemies met en route
//   Idle        -> hold, but defend by engaging enemies within sight
// Units on Move/Harvest/Build do not fire (they're busy).

import type { State } from '../world.ts';
import { slotOf, eid, isAlive, isEnemy, kill, NONE } from '../world.ts';
import { EffectKind, Kind, Order, Role, Units, hasAnyWeapon, sec, tiles, type Weapon, weaponForTarget } from '../data.ts';
import { applyWeaponDamage } from '../damage.ts';
import { faceToward, within } from './move.ts';
import { navigate } from '../pathing.ts';
import { type Grid, nearestAttackableEnemy, nearestEnemy } from '../grid.ts';
import { effectiveCooldown, effectiveSight, effectiveSpeed, isDisabled } from './status.ts';
import { coveredByEffect } from '../effects.ts';
import { canDetect } from '../detection.ts';
import { upgradedRange } from '../derived.ts';
import { isPowered } from '../power.ts';
import { isContained } from '../cargo.ts';
import { canUseWeaponNow } from '../burrow.ts';
import { edgeDistanceSq, withinEdgeRange } from '../spatial.ts';
import { carrierCanTarget, carrierLaunchRange, interceptorLaunchCooldown, launchInterceptor } from '../interceptor.ts';

const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

const insideMinimumRange = (s: State, attacker: number, target: number, weapon: Weapon): boolean =>
  weapon.minRange !== undefined && edgeDistanceSq(s, attacker, target) < weapon.minRange * weapon.minRange;

const isSuicideAttacker = (kind: number): boolean =>
  kind === Kind.Scourge || kind === Kind.InfestedTerran || kind === Kind.SpiderMine;

const hasSpecialWeaponAmmo = (s: State, slot: number): boolean =>
  s.e.kind[slot] !== Kind.Reaver || s.e.specialAmmo[slot]! > 0;

const consumeSpecialWeaponAmmo = (s: State, slot: number): void => {
  if (s.e.kind[slot] === Kind.Reaver && s.e.specialAmmo[slot]! > 0) {
    s.e.specialAmmo[slot] = s.e.specialAmmo[slot]! - 1;
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

const nearestBounceTarget = (s: State, owner: number, from: number, excludeA: number, excludeB: number, range: number): number => {
  const e = s.e;
  let best = NONE;
  let bestD = range * range + 1;
  for (let i = 0; i < e.hi; i++) {
    if (i === excludeA || i === excludeB || e.alive[i] !== 1 || isContained(s, i)) continue;
    if (!isEnemy(s, owner, e.owner[i]!) || !canDetect(s, owner, i)) continue;
    const d = distSq(e.x[from]!, e.y[from]!, e.x[i]!, e.y[i]!);
    if (d < bestD) { best = i; bestD = d; }
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

const applyWeaponHit = (s: State, target: number, weapon: Weapon, attacker: number): void => {
  applyWeaponDamage(s, target, weapon, attacker);
  if (weapon.splashRadius === undefined || weapon.splashRadius <= 0) return;
  const e = s.e;
  const x = e.x[target]!;
  const y = e.y[target]!;
  const r2 = weapon.splashRadius * weapon.splashRadius;
  const targetIsAir = (e.flags[target]! & Role.Air) !== 0;
  for (let i = 0; i < e.hi; i++) {
    if (i === target || e.alive[i] !== 1 || isContained(s, i) || (e.flags[i]! & Role.Resource) !== 0) continue;
    if (((e.flags[i]! & Role.Air) !== 0) !== targetIsAir) continue;
    if (distSq(e.x[i]!, e.y[i]!, x, y) <= r2) applyWeaponDamage(s, i, weapon, attacker);
  }
};

const distSqToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return distSq(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return distSq(px, py, cx, cy);
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
    if (distSqToSegment(e.x[i]!, e.y[i]!, ax, ay, tx, ty) <= width2) applyWeaponDamage(s, i, weapon, attacker);
  }
};

const bunkerCanAttack = (s: State, bunker: number, target: number): boolean => {
  const e = s.e;
  const targetDef = Units[e.kind[target]!];
  if (!targetDef) return false;
  const bunkerId = eid(e, bunker);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== bunkerId || isDisabled(e, i)) continue;
    const weapon = weaponForTarget(Units[e.kind[i]!]!, targetDef);
    if (!weapon) continue;
    const range = upgradedRange(s, i, weapon);
    if (withinEdgeRange(s, bunker, target, range)) return true;
  }
  return false;
};

const nearestBunkerTarget = (s: State, bunker: number, sight: number): number => {
  const e = s.e;
  const owner = e.owner[bunker]!;
  const r2 = sight * sight;
  let best = NONE;
  let bestD = r2 + 1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || !isEnemy(s, owner, e.owner[i]!) || !canDetect(s, owner, i)) continue;
    const d = edgeDistanceSq(s, bunker, i);
    if (d <= r2 && d < bestD && bunkerCanAttack(s, bunker, i)) { best = i; bestD = d; }
  }
  return best;
};

const bunkerFire = (s: State, bunker: number, target: number): void => {
  const e = s.e;
  const targetDef = Units[e.kind[target]!];
  if (!targetDef) return;
  const bunkerId = eid(e, bunker);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== bunkerId || isDisabled(e, i)) continue;
    const weapon = weaponForTarget(Units[e.kind[i]!]!, targetDef);
    if (!weapon || e.wcd[i]! > 0) continue;
    const range = upgradedRange(s, i, weapon);
    if (!withinEdgeRange(s, bunker, target, range)) continue;
    if ((e.flags[target]! & Role.Air) === 0 && coveredByEffect(s, target, EffectKind.DarkSwarm) && range > tiles(2)) continue;
    if (e.illusion[i] !== 1) applyWeaponHit(s, target, weapon, i);
    e.wcd[i] = effectiveCooldown(e, i, weapon.cooldown);
  }
};

export const combat = (s: State, grid: Grid): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && isContained(s, i) && e.wcd[i]! > 0) e.wcd[i] = e.wcd[i]! - 1;
  }
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || isContained(s, i)) continue;
    const def = Units[e.kind[i]!];
    const isBunker = e.kind[i] === Kind.Bunker;
    const isCarrier = e.kind[i] === Kind.Carrier;
    if (!def || (!hasAnyWeapon(def) && !isBunker && !isCarrier)) continue;
    if (!isBunker && !isCarrier && !hasSpecialWeaponAmmo(s, i)) continue;
    if (!isBunker && !canUseWeaponNow(s, i)) continue;
    if (e.wcd[i]! > 0) e.wcd[i] = e.wcd[i]! - 1;
    if (isDisabled(e, i)) continue;
    if (!isPowered(s, i)) continue;
    if ((e.flags[i]! & Role.Air) === 0 && coveredByEffect(s, i, EffectKind.DisruptionWeb)) continue;

    const order = e.order[i]!;
    const engaging = order === Order.Attack || order === Order.AttackMove || order === Order.Idle;
    if (!engaging) continue;

    // Keep the current target while it's still valid — for Attack, chase it at any
    // range; for Idle/AttackMove, hold it while it's in sight. This avoids a grid
    // re-acquire every tick once a unit is engaged (the bulk of a melee). Only when
    // there's no valid target do Idle/AttackMove units acquire the nearest enemy.
    const owner = e.owner[i]!;
    const sight = tiles(effectiveSight(s, e, i, def.sight));
    let tgt = NONE;
    const rem = e.target[i]!;
    if (isAlive(e, rem)) {
      const rs = slotOf(rem);
      if (!isContained(s, rs) && isEnemy(s, owner, e.owner[rs]!) && canDetect(s, owner, rs) &&
          (isBunker ? bunkerCanAttack(s, i, rs) : isCarrier ? carrierCanTarget(s, i, rs) : weaponForTarget(def, Units[e.kind[rs]!]!)) &&
          (order === Order.Attack || within(e, i, e.x[rs]!, e.y[rs]!, sight))) tgt = rs;
    }
    if (tgt === NONE && order !== Order.Attack) {
      tgt = isBunker ? nearestBunkerTarget(s, i, sight) : isCarrier ? nearestEnemy(s, grid, i, sight) : nearestAttackableEnemy(s, grid, i, sight);
    }
    if (tgt !== NONE) e.target[i] = eid(e, tgt); // remember for next tick

    if (tgt === NONE) {
      if (order === Order.Attack) e.order[i] = Order.Idle; // target gone
      else if (order === Order.AttackMove) {
        if (navigate(s, i, e.tx[i]!, e.ty[i]!, def.speed)) e.order[i] = Order.Idle;
      }
      continue;
    }

    if (isBunker) {
      bunkerFire(s, i, tgt);
      continue;
    }
    if (isCarrier) {
      if (withinEdgeRange(s, i, tgt, carrierLaunchRange())) {
        if (e.wcd[i]! <= 0 && launchInterceptor(s, i, tgt)) e.wcd[i] = interceptorLaunchCooldown();
      } else {
        navigate(s, i, e.x[tgt]!, e.y[tgt]!, effectiveSpeed(s, e, i, def.speed));
      }
      continue;
    }

    faceToward(e, i, e.x[tgt]!, e.y[tgt]!);
    const weapon = weaponForTarget(def, Units[e.kind[tgt]!]!);
    if (!weapon) {
      if (order === Order.Attack) e.order[i] = Order.Idle;
      continue;
    }
    const range = upgradedRange(s, i, weapon);
    if (withinEdgeRange(s, i, tgt, range) && !insideMinimumRange(s, i, tgt, weapon)) {
      if (e.wcd[i]! <= 0) {
        if ((e.flags[tgt]! & Role.Air) !== 0 || !coveredByEffect(s, tgt, EffectKind.DarkSwarm) || range <= tiles(2)) {
          if (e.illusion[i] !== 1) {
            applyWeaponHit(s, tgt, weapon, i);
            consumeSpecialWeaponAmmo(s, i);
            if (e.kind[i] === Kind.Lurker) applyLurkerLineSplash(s, i, tgt, weapon);
            if (e.kind[i] === Kind.Mutalisk) applyMutaliskBounce(s, i, tgt, weapon);
            if (e.kind[i] === Kind.Devourer) applyAcidSpore(s, tgt);
          }
          if (isSuicideAttacker(e.kind[i]!) && e.alive[i] === 1) kill(s, i);
        }
        e.wcd[i] = effectiveCooldown(e, i, weapon.cooldown);
      }
    } else {
      navigate(s, i, e.x[tgt]!, e.y[tgt]!, effectiveSpeed(s, e, i, def.speed)); // approach
    }
  }
};
