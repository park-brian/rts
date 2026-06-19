import { Kind, Role, sec, tiles, Trait } from './core.ts';
import { Tech } from './tech.ts';
import { SplashPx } from './weapons.ts';
import { fx } from '../fixed.ts';

export const Ability = {
  StimPack: 1,
  EMPShockwave: 2,
  PsionicStorm: 3,
  DefensiveMatrix: 4,
  Irradiate: 5,
  Lockdown: 6,
  YamatoGun: 7,
  Feedback: 8,
  StasisField: 9,
  Maelstrom: 10,
  DisruptionWeb: 11,
  SpawnBroodling: 12,
  Ensnare: 13,
  Plague: 14,
  Consume: 15,
  DarkSwarm: 16,
  PersonnelCloaking: 17,
  CloakingField: 18,
  ScannerSweep: 19,
  Heal: 20,
  Restoration: 21,
  OpticalFlare: 22,
  Parasite: 23,
  Recall: 24,
  MindControl: 25,
  Hallucination: 26,
  InfestCommandCenter: 27,
  NuclearStrike: 28,
  ShieldRecharge: 29,
} as const;
export type Ability = (typeof Ability)[keyof typeof Ability];

export const EffectKind = {
  PsionicStorm: 1,
  DarkSwarm: 2,
  DisruptionWeb: 3,
  ScannerSweep: 4,
  NuclearStrike: 5,
} as const;
export type EffectKind = (typeof EffectKind)[keyof typeof EffectKind];

export type AbilityTarget = 'self' | 'point' | 'entity';
export type TargetTeam = 'own' | 'enemy' | 'any';
export type AbilityStatusTimer = 'stim' | 'lockdown' | 'irradiate';
export type AbilityAreaStatusTimer = 'stasis' | 'maelstrom' | 'ensnare' | 'plague';
export type AbilityTargetMarker = 'opticalFlare' | 'parasiteOwner';
export type AbilityRestorePool = 'hp' | 'shield';
export type AbilityTargetBuffer = 'matrix';
export type AbilityExecution =
  | { mode: 'caster-status'; timer: AbilityStatusTimer }
  | { mode: 'target-status'; timer: AbilityStatusTimer }
  | { mode: 'point-area-status'; timer: AbilityAreaStatusTimer; team: 'enemy' | 'any'; rolesAny: number; traitsAny: number }
  | { mode: 'point-area-drain' }
  | { mode: 'target-marker'; marker: AbilityTargetMarker }
  | { mode: 'target-restore'; pool: AbilityRestorePool }
  | { mode: 'target-buffer'; buffer: AbilityTargetBuffer }
  | { mode: 'target-damage' }
  | { mode: 'target-energy-feedback' }
  | { mode: 'target-cleanse' }
  | { mode: 'target-sacrifice-energy' }
  | { mode: 'self-toggle'; flag: 'cloakActive' }
  | { mode: 'persistent-effect'; effect: EffectKind };
export type AbilityDef = {
  name: string;
  tech?: number;
  target: AbilityTarget;
  targetTeam: TargetTeam;
  targetRolesAny: number;
  targetRolesNone: number;
  targetTraitsAny: number;
  targetTraitsNone: number;
  targetNeedsEnergy: boolean;
  casters: number[];
  energyCost: number;
  hpCost: number;
  range: number;
  radius: number;
  duration: number;
  period: number;
  damage: number;
  execution?: AbilityExecution;
};

export const Abilities: Record<number, AbilityDef> = {
  [Ability.StimPack]: {
    name: 'Stim Pack', tech: Tech.StimPack, target: 'self', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Marine, Kind.Firebat],
    energyCost: 0, hpCost: 10, range: 0, radius: 0, duration: sec(12.6), period: 0, damage: 0,
    execution: { mode: 'caster-status', timer: 'stim' },
  },
  [Ability.EMPShockwave]: {
    name: 'EMP Shockwave', tech: Tech.EMPShockwave, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ScienceVessel],
    energyCost: 100, hpCost: 0, range: tiles(8), radius: fx(48), duration: 0, period: 0, damage: 0,
    execution: { mode: 'point-area-drain' },
  },
  [Ability.PsionicStorm]: {
    name: 'Psionic Storm', tech: Tech.PsionicStorm, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.HighTemplar],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(2.67), period: 8, damage: 14,
    execution: { mode: 'persistent-effect', effect: EffectKind.PsionicStorm },
  },
  [Ability.DefensiveMatrix]: {
    name: 'Defensive Matrix', target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ScienceVessel],
    energyCost: 100, hpCost: 0, range: tiles(10), radius: 0, duration: sec(56.7), period: 0, damage: 250,
    execution: { mode: 'target-buffer', buffer: 'matrix' },
  },
  [Ability.Irradiate]: {
    name: 'Irradiate', tech: Tech.Irradiate, target: 'entity', targetTeam: 'any', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ScienceVessel],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: fx(32), duration: sec(25.2), period: sec(1), damage: 10,
    execution: { mode: 'target-status', timer: 'irradiate' },
  },
  [Ability.Lockdown]: {
    name: 'Lockdown', tech: Tech.Lockdown, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Mechanical, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Ghost],
    energyCost: 100, hpCost: 0, range: tiles(8), radius: 0, duration: sec(43.8), period: 0, damage: 0,
    execution: { mode: 'target-status', timer: 'lockdown' },
  },
  [Ability.YamatoGun]: {
    name: 'Yamato Gun', tech: Tech.YamatoCannon, target: 'entity', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: Role.Resource,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Battlecruiser],
    energyCost: 150, hpCost: 0, range: tiles(10), radius: 0, duration: 0, period: 0, damage: 260,
    execution: { mode: 'target-damage' },
  },
  [Ability.Feedback]: {
    name: 'Feedback', target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: true, casters: [Kind.DarkArchon],
    energyCost: 50, hpCost: 0, range: tiles(10), radius: 0, duration: 0, period: 0, damage: 0,
    execution: { mode: 'target-energy-feedback' },
  },
  [Ability.StasisField]: {
    name: 'Stasis Field', tech: Tech.StasisField, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Arbiter],
    energyCost: 100, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(43.8), period: 0, damage: 0,
    execution: { mode: 'point-area-status', timer: 'stasis', team: 'any', rolesAny: Role.Mobile, traitsAny: 0 },
  },
  [Ability.Maelstrom]: {
    name: 'Maelstrom', tech: Tech.Maelstrom, target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.DarkArchon],
    energyCost: 100, hpCost: 0, range: tiles(10), radius: fx(48), duration: sec(7.56), period: 0, damage: 0,
    execution: { mode: 'point-area-status', timer: 'maelstrom', team: 'enemy', rolesAny: 0, traitsAny: Trait.Biological },
  },
  [Ability.DisruptionWeb]: {
    name: 'Disruption Web', tech: Tech.DisruptionWeb, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Corsair],
    energyCost: 125, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(15.12), period: 0, damage: 0,
    execution: { mode: 'persistent-effect', effect: EffectKind.DisruptionWeb },
  },
  [Ability.SpawnBroodling]: {
    name: 'Spawn Broodling', tech: Tech.SpawnBroodling, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: Role.Air,
    targetTraitsAny: Trait.Biological, targetTraitsNone: Trait.Robotic, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 150, hpCost: 0, range: tiles(9), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.Ensnare]: {
    name: 'Ensnare', tech: Tech.Ensnare, target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: fx(64), duration: sec(25.2), period: 0, damage: 0,
    execution: { mode: 'point-area-status', timer: 'ensnare', team: 'enemy', rolesAny: Role.Mobile, traitsAny: 0 },
  },
  [Ability.Plague]: {
    name: 'Plague', tech: Tech.Plague, target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Defiler],
    energyCost: 150, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(25.2), period: 8, damage: 10,
    execution: { mode: 'point-area-status', timer: 'plague', team: 'enemy', rolesAny: Role.Mobile | Role.Structure, traitsAny: 0 },
  },
  [Ability.Consume]: {
    name: 'Consume', tech: Tech.Consume, target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: Role.Structure,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Defiler],
    energyCost: 0, hpCost: 0, range: tiles(1), radius: 0, duration: 0, period: 0, damage: 50,
    execution: { mode: 'target-sacrifice-energy' },
  },
  [Ability.DarkSwarm]: {
    name: 'Dark Swarm', target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Defiler],
    energyCost: 100, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(37.8), period: 0, damage: 0,
    execution: { mode: 'persistent-effect', effect: EffectKind.DarkSwarm },
  },
  [Ability.PersonnelCloaking]: {
    name: 'Personnel Cloaking', tech: Tech.PersonnelCloaking, target: 'self', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Ghost],
    energyCost: 25, hpCost: 0, range: 0, radius: 0, duration: 0, period: sec(1.08), damage: 0,
    execution: { mode: 'self-toggle', flag: 'cloakActive' },
  },
  [Ability.CloakingField]: {
    name: 'Cloaking Field', tech: Tech.CloakingField, target: 'self', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Wraith],
    energyCost: 25, hpCost: 0, range: 0, radius: 0, duration: 0, period: sec(5.26), damage: 0,
    execution: { mode: 'self-toggle', flag: 'cloakActive' },
  },
  [Ability.ScannerSweep]: {
    name: 'Scanner Sweep', target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ComsatStation],
    energyCost: 50, hpCost: 0, range: tiles(999), radius: fx(160), duration: sec(8.4), period: 0, damage: 0,
    execution: { mode: 'persistent-effect', effect: EffectKind.ScannerSweep },
  },
  [Ability.Heal]: {
    name: 'Heal', target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Medic],
    energyCost: 1, hpCost: 0, range: tiles(1), radius: 0, duration: 0, period: 0, damage: 2,
    execution: { mode: 'target-restore', pool: 'hp' },
  },
  [Ability.Restoration]: {
    name: 'Restoration', tech: Tech.Restoration, target: 'entity', targetTeam: 'any', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Medic],
    energyCost: 50, hpCost: 0, range: tiles(6), radius: 0, duration: 0, period: 0, damage: 0,
    execution: { mode: 'target-cleanse' },
  },
  [Ability.OpticalFlare]: {
    name: 'Optical Flare', tech: Tech.OpticalFlare, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Medic],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: 0, duration: 0, period: 0, damage: 0,
    execution: { mode: 'target-marker', marker: 'opticalFlare' },
  },
  [Ability.Parasite]: {
    name: 'Parasite', target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 75, hpCost: 0, range: tiles(12), radius: 0, duration: 0, period: 0, damage: 0,
    execution: { mode: 'target-marker', marker: 'parasiteOwner' },
  },
  [Ability.Recall]: {
    name: 'Recall', tech: Tech.Recall, target: 'point', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Arbiter],
    energyCost: 150, hpCost: 0, range: tiles(999), radius: fx(70), duration: 0, period: 0, damage: 0,
  },
  [Ability.MindControl]: {
    name: 'Mind Control', tech: Tech.MindControl, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.DarkArchon],
    energyCost: 150, hpCost: 0, range: tiles(8), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.Hallucination]: {
    name: 'Hallucination', tech: Tech.Hallucination, target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.HighTemplar],
    energyCost: 100, hpCost: 0, range: tiles(7), radius: 0, duration: sec(56.7), period: 0, damage: 0,
  },
  [Ability.InfestCommandCenter]: {
    name: 'Infest Command Center', target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Structure, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 0, hpCost: 0, range: tiles(1), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.NuclearStrike]: {
    name: 'Nuclear Strike', target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Ghost],
    energyCost: 0, hpCost: 0, range: tiles(10), radius: fx(SplashPx.NuclearStrike.outer), duration: sec(14.5), period: 0, damage: 500,
  },
  [Ability.ShieldRecharge]: {
    name: 'Recharge Shields', target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ShieldBattery],
    energyCost: 1, hpCost: 0, range: tiles(4), radius: 0, duration: 0, period: 0, damage: 2,
    execution: { mode: 'target-restore', pool: 'shield' },
  },
};
