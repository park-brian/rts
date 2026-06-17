// Unit-type table for the fight resolver. SC1-flavored: combat is decided by a
// damage-type-vs-size multiplier plus range, frontage, and focus fire (see
// fight.ts). Values are tuned for a clear counter structure, not historical
// fidelity. Integer-only; no behavior lives here, only data.

export const Size = { Small: 0, Medium: 1, Large: 2 } as const;
export type SizeT = (typeof Size)[keyof typeof Size];

export const DamageType = { Normal: 0, Concussive: 1, Explosive: 2 } as const;
export type DamageTypeT = (typeof DamageType)[keyof typeof DamageType];

// percent multiplier [dtype][size], straight from the SC1 model.
export const MULT: readonly (readonly number[])[] = [
  [100, 100, 100], // Normal
  [100, 50, 25], // Concussive: great vs Small, poor vs Large
  [50, 75, 100], // Explosive: poor vs Small, great vs Large
];

export type UnitType = {
  name: string;
  size: SizeT;
  hp: number;
  armor: number;
  damage: number; // per attack round
  dtype: DamageTypeT;
  range: number; // for the army-scale opening volley
  speed: number; // closing speed (range advantage / opening rounds)
  cost: number; // budget cost (for compositions)
};

// A small roster that exercises the mechanics:
//  - Marine:  cheap, fragile, ranged, small/normal — dies to focus, kites melee.
//  - Zealot:  melee bruiser, small/normal, tanky — wants to close distance.
//  - Hydra:   ranged, medium/explosive, glassy DPS.
//  - Tank:    expensive, large/explosive, long range, high damage — but explosive
//             is only 50% vs Small, so masses of cheap small units punish it in the
//             open; a choke (low frontage) lets it dominate.
export const UNITS: Record<string, UnitType> = {
  marine: { name: 'Marine', size: Size.Small, hp: 40, armor: 0, damage: 6, dtype: DamageType.Normal, range: 4, speed: 2, cost: 25 },
  zealot: { name: 'Zealot', size: Size.Small, hp: 160, armor: 1, damage: 16, dtype: DamageType.Normal, range: 0, speed: 2, cost: 100 },
  vulture: { name: 'Vulture', size: Size.Small, hp: 80, armor: 0, damage: 20, dtype: DamageType.Concussive, range: 5, speed: 3, cost: 75 },
  hydra: { name: 'Hydra', size: Size.Medium, hp: 80, armor: 0, damage: 10, dtype: DamageType.Explosive, range: 4, speed: 2, cost: 75 },
  tank: { name: 'Tank', size: Size.Large, hp: 150, armor: 1, damage: 40, dtype: DamageType.Explosive, range: 7, speed: 1, cost: 150 },
};

/** Effective damage of one hit: type×size multiplier, then flat armor, min 1. */
export const effectiveDamage = (attacker: UnitType, target: UnitType): number => {
  const pct = MULT[attacker.dtype]![target.size]!;
  const raw = Math.trunc((attacker.damage * pct) / 100);
  return Math.max(1, raw - target.armor);
};
