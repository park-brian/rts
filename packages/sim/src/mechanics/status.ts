import type { Entities, State } from '../entity/world.ts';
import { upgradedCooldown, upgradedSight, upgradedSpeed } from './upgrades.ts';

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
