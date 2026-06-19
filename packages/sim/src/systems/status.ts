import type { Entities } from '../entity/world.ts';
import type { State } from '../entity/world.ts';
import { upgradedCooldown, upgradedSight, upgradedSpeed } from '../mechanics/upgrades.ts';
import { Units, sec } from '../data/index.ts';
import { clearVelocity } from '../spatial/motion.ts';

export const isDisabled = (e: Entities, slot: number): boolean =>
  e.lockdownTimer[slot]! > 0 || e.stasisTimer[slot]! > 0 || e.maelstromTimer[slot]! > 0;

export const effectiveSight = (s: State, e: Entities, slot: number, baseSight: number): number => {
  const sight = upgradedSight(s, slot, baseSight);
  return e.opticalFlare[slot] === 1 ? Math.min(1, sight) : sight;
};

export const effectiveSpeed = (s: State, e: Entities, slot: number, baseSpeed: number): number => {
  if (baseSpeed <= 0 || isDisabled(e, slot)) return 0;
  const speed = upgradedSpeed(s, slot, baseSpeed);
  const boosted = e.stimTimer[slot]! > 0 ? speed + Math.trunc(speed / 2) : speed;
  return Math.max(1, Math.trunc(boosted * (e.ensnareTimer[slot]! > 0 ? 50 : 100) / 100));
};

export const effectiveCooldown = (s: State, e: Entities, slot: number, baseCooldown: number): number => {
  const cooldown = upgradedCooldown(s, slot, baseCooldown);
  return e.stimTimer[slot]! > 0 ? Math.max(1, Math.trunc((cooldown * 2) / 3)) : cooldown;
};

const tick = (a: Int32Array, i: number): void => {
  if (a[i]! > 0) a[i] = a[i]! - 1;
};

export const tickRegeneration = (s: State): void => {
  const e = s.e;
  const healZerg = (s.tick + 1) % sec(2) === 0;
  const rechargeProtoss = (s.tick + 1) % sec(3) === 0;
  if (!healZerg && !rechargeProtoss) return;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.stasisTimer[i]! > 0) continue;
    const def = Units[e.kind[i]!];
    if (!def) continue;
    if (healZerg && def.race === 'zerg' && e.hp[i]! > 0 && e.hp[i]! < def.hp) e.hp[i] = e.hp[i]! + 1;
    if (rechargeProtoss && def.race === 'protoss' && e.shield[i]! < def.shields) e.shield[i] = e.shield[i]! + 1;
  }
};

export const tickStatusTimers = (e: Entities): void => {
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    if (isDisabled(e, i)) clearVelocity(e, i);
    tick(e.stimTimer, i);
    tick(e.matrixTimer, i);
    if (e.matrixTimer[i]! <= 0) e.matrixHp[i] = 0;
    tick(e.irradiateTimer, i);
    tick(e.plagueTimer, i);
    tick(e.ensnareTimer, i);
    tick(e.lockdownTimer, i);
    tick(e.stasisTimer, i);
    tick(e.maelstromTimer, i);
    tick(e.acidSporeTimer, i);
    if (e.acidSporeTimer[i]! <= 0) e.acidSporeCount[i] = 0;
  }
};
