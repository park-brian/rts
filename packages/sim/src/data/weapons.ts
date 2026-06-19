import { bwRange } from './core.ts';

// percent multiplier [damageType][size]
export const DAMAGE_MULT: readonly (readonly number[])[] = [
  [100, 100, 100], // Normal
  [100, 50, 25], // Concussive
  [50, 75, 100], // Explosive
];

export type Weapon = {
  damage: number;
  dtype: number; // DamageType
  cooldown: number; // ticks
  range: number; // fixed-point px
  shots?: number; // armor applies per shot
  minRange?: number; // fixed-point px
  splashRadius?: number; // fixed-point px, outer splash radius
  splashInnerRadius?: number; // fixed-point px, 100% splash damage inside this radius
  splashMediumRadius?: number; // fixed-point px, 50% splash damage inside this radius
};

export const WeaponRangePx = {
  // Terran
  FusionCutter: 10,
  GaussRifle: 128,
  FlameThrower: 32,
  C10CanisterRifle: 224,
  FragmentationGrenade: 160,
  SpiderMines: 10,
  TwinAutocannons: 192,
  HellfireMissilePack: 160,
  ArcliteCannon: 224,
  ArcliteShockCannon: 384,
  BurstLasers: 160,
  GeminiMissiles: 160,
  ATSLaserBattery: 192,
  LongboltMissile: 224,
  HaloRockets: 192,

  // Protoss
  ParticleBeam: 32,
  PsiBlades: 15,
  PhaseDisruptor: 128,
  WarpBlades: 15,
  PsionicShockwave: 64,
  ReaverLaunch: 256,
  ScarabImpact: 16,
  DualPhotonBlasters: 128,
  AntiMatterMissiles: 128,
  PulseCannon: 128,
  PhaseDisruptorCannon: 160,
  NeutronFlare: 160,
  PhotonCannon: 224,

  // Zerg
  Spines: 32,
  Claws: 15,
  NeedleSpines: 128,
  SubterraneanSpines: 192,
  GlaveWurm: 96,
  SuicideScourge: 3,
  AcidSpore: 256,
  CorrosiveAcid: 192,
  KaiserBlades: 25,
  SuicideInfestedTerran: 3,
  ToxicSpores: 2,
  SubterraneanTentacle: 224,
  SeekerSpores: 224,
} as const;

export const WeaponMinRangePx = {
  ArcliteShockCannon: 64,
} as const;

export const WeaponRangeUpgradePx = {
  U238Shells: 32,
  CharonBoosters: 96,
  SingularityCharge: 64,
  GroovedSpines: 32,
} as const;

export const HarvestRangePx = {
  Mine: 10,
  Deposit: 10,
} as const;

export type SplashSpecPx = {
  readonly inner: number;
  readonly medium: number;
  readonly outer: number;
};

export const SplashPx = {
  FlameThrower: { inner: 15, medium: 20, outer: 25 },
  ArcliteShockCannon: { inner: 10, medium: 25, outer: 40 },
  SpiderMines: { inner: 50, medium: 75, outer: 100 },
  NuclearStrike: { inner: 128, medium: 192, outer: 256 },
  Scarab: { inner: 20, medium: 40, outer: 60 },
  PsionicShockwave: { inner: 3, medium: 15, outer: 30 },
  InfestedTerran: { inner: 20, medium: 40, outer: 60 },
  AirSplash: { inner: 5, medium: 50, outer: 100 },
} satisfies Record<string, SplashSpecPx>;

/** Damage of one hit to HP: type x size multiplier, then flat armor, min 1. */
export const computeDamage = (w: Weapon, targetSize: number, targetArmor: number): number => {
  const pct = DAMAGE_MULT[w.dtype]![targetSize]!;
  const raw = Math.trunc((w.damage * pct) / 100);
  return Math.max(1, raw - targetArmor);
};

/** Damage of one hit to shields: type x size multiplier, no unit armor in this slice. */
export const computeShieldDamage = (w: Weapon, targetSize: number): number => {
  const pct = DAMAGE_MULT[w.dtype]![targetSize]!;
  return Math.max(1, Math.trunc((w.damage * pct) / 100));
};
