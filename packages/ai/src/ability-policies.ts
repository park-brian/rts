import {
  Abilities, Ability, Kind, Role, Trait, Units, abilityTechAvailable, canDetect, canUseAbilityKind, distanceSq, eid,
  hasReadyNuke, isCloaked, isDetectorKind, isEnemy, NONE, TILE, unitTraits, validateCommand, withinRangeSq,
  type Command, type State,
} from '@rts/sim';
import { ONE, isqrt } from '@rts/sim';

const TILE_FX = TILE * ONE;

export type EntityAbilityPolicy = {
  ability: number;
  target: 'friendly-entity' | 'enemy-entity';
  minScore: number;
  canCast?: (s: State, player: number, caster: number) => boolean;
  scoreTarget: (s: State, player: number, target: number, caster: number, focusX: number, focusY: number) => number;
};

export type PointAbilityPolicy = {
  ability: number;
  target: 'enemy-point' | 'friendly-point';
  minScore: number;
  canCast?: (s: State, player: number, caster: number, focusX: number, focusY: number) => boolean;
  scorePoint: (s: State, player: number, x: number, y: number) => number;
};

export type AbilityPolicy = EntityAbilityPolicy | PointAbilityPolicy;

const entityPolicy = (
  target: EntityAbilityPolicy['target'],
  ability: number,
  minScore: number,
  scoreTarget: EntityAbilityPolicy['scoreTarget'],
  canCast?: EntityAbilityPolicy['canCast'],
): EntityAbilityPolicy => {
  const policy: EntityAbilityPolicy = { ability, target, minScore, scoreTarget };
  if (canCast) policy.canCast = canCast;
  return policy;
};

const pointPolicy = (
  target: PointAbilityPolicy['target'],
  ability: number,
  minScore: number,
  scorePoint: PointAbilityPolicy['scorePoint'],
  canCast?: PointAbilityPolicy['canCast'],
): PointAbilityPolicy => {
  const policy: PointAbilityPolicy = { ability, target, minScore, scorePoint };
  if (canCast) policy.canCast = canCast;
  return policy;
};

// Order is tactical priority; each caster emits at most one tactical ability per tick.
export const TACTICAL_ABILITY_POLICIES: readonly AbilityPolicy[] = [
  entityPolicy('friendly-entity', Ability.ShieldRecharge, 8, (s, player, target) => {
    const e = s.e;
    if (e.owner[target] !== player || (e.flags[target]! & Role.Mobile) === 0) return 0;
    return Units[e.kind[target]!]!.shields - e.shield[target]!;
  }),
  entityPolicy('friendly-entity', Ability.Restoration, 1, (s, _player, target) => scoreRestorationTarget(s, target)),
  entityPolicy('friendly-entity', Ability.Heal, 6, (s, player, target) => {
    const e = s.e;
    if (e.owner[target] !== player || (unitTraits(e.kind[target]!) & Trait.Biological) === 0) return 0;
    return Units[e.kind[target]!]!.hp - e.hp[target]!;
  }),
  pointPolicy('enemy-point', Ability.ScannerSweep, 0, (s, player, x, y) => scoreScannerTarget(s, player, x, y)),
  entityPolicy(
    'friendly-entity',
    Ability.Hallucination,
    120,
    (s, player, target, _caster, focusX, focusY) => scoreHallucinationTarget(s, player, target, focusX, focusY),
  ),
  pointPolicy(
    'friendly-point',
    Ability.Recall,
    180,
    (s, player, x, y) => scoreFriendlyRecallCluster(s, player, x, y, Abilities[Ability.Recall]!.radius),
    (s, _player, caster, focusX, focusY) => withinRangeSq(s.e.x[caster]!, s.e.y[caster]!, focusX, focusY, TILE_FX * 12),
  ),
  entityPolicy('enemy-entity', Ability.MindControl, 180, (s, player, target) => scoreMindControlTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.YamatoGun, 1, (s, player, target) => scoreYamatoTarget(s, player, target)),
  pointPolicy('enemy-point', Ability.NuclearStrike, 650, (s, player, x, y) => scoreNukeTarget(s, player, x, y), (s, player) => hasReadyNuke(s, player)),
  entityPolicy('enemy-entity', Ability.InfestCommandCenter, 1, (s, player, target) => scoreInfestTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.SpawnBroodling, 1, (s, player, target) => scoreBroodlingTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.Parasite, 220, (s, player, target) => scoreParasiteTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.Feedback, 1, (s, player, target) => scoreFeedbackTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.OpticalFlare, 100, (s, player, target) => scoreOpticalFlareTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.Lockdown, 1, (s, player, target) => scoreLockdownTarget(s, player, target)),
  entityPolicy('enemy-entity', Ability.Irradiate, 1, (s, player, target) => scoreIrradiateTarget(s, player, target)),
  pointPolicy('enemy-point', Ability.EMPShockwave, 100, (s, player, x, y) => scoreEmpTarget(s, player, x, y)),
  pointPolicy('enemy-point', Ability.PsionicStorm, 70, (s, player, x, y) => scoreStormTarget(s, player, x, y)),
  pointPolicy('enemy-point', Ability.Plague, 40, (s, player, x, y) => scorePlagueTarget(s, player, x, y)),
  pointPolicy('enemy-point', Ability.Ensnare, 80, (s, player, x, y) => scoreEnsnareTarget(s, player, x, y)),
  pointPolicy('enemy-point', Ability.Maelstrom, 90, (s, player, x, y) => scoreMaelstromTarget(s, player, x, y)),
  pointPolicy('enemy-point', Ability.StasisField, 140, (s, player, x, y) => scoreStasisTarget(s, player, x, y)),
  pointPolicy('enemy-point', Ability.DisruptionWeb, 70, (s, player, x, y) => scoreDisruptionWebTarget(s, player, x, y)),
  entityPolicy(
    'friendly-entity',
    Ability.DefensiveMatrix,
    90,
    (s, player, target, _caster, focusX, focusY) => scoreMatrixTarget(s, player, target, focusX, focusY),
  ),
  pointPolicy('enemy-point', Ability.DarkSwarm, 60, (s, player, x, y) => scoreDarkSwarmTarget(s, player, x, y)),
  entityPolicy(
    'friendly-entity',
    Ability.Consume,
    80,
    (s, _player, target, caster) => scoreConsumeTarget(s, caster, target),
    (s, _player, caster) => {
      const ability = Abilities[Ability.Consume]!;
      return s.e.energy[caster]! <= s.e.energyMax[caster]! - ability.damage;
    },
  ),
];

export const ACTIVE_CLOAK_ABILITIES: readonly number[] = [Ability.PersonnelCloaking, Ability.CloakingField];

export const castTacticalAbilities = (s: State, player: number, cmds: Command[], casters: number[], focusX: number, focusY: number): void => {
  const used = new Set<number>();
  for (const caster of casters) {
    if (used.has(caster)) continue;
    const kind = s.e.kind[caster]!;
    for (const policy of TACTICAL_ABILITY_POLICIES) {
      if (!canUseAbilityKind(kind, policy.ability)) continue;
      if (tryCastPolicy(s, player, cmds, caster, policy, focusX, focusY)) {
        used.add(caster);
        break;
      }
    }
    if (used.has(caster)) continue;
    for (const ability of ACTIVE_CLOAK_ABILITIES) {
      if (!canUseAbilityKind(kind, ability)) continue;
      if (maybeCastCloak(s, cmds, caster, ability, focusX, focusY)) {
        used.add(caster);
        break;
      }
    }
  }
};

const tryCastPolicy = (
  s: State,
  player: number,
  cmds: Command[],
  caster: number,
  policy: AbilityPolicy,
  focusX: number,
  focusY: number,
): boolean => {
  if (policy.canCast && !policy.canCast(s, player, caster, focusX, focusY)) return false;
  const e = s.e;
  let bestCommand: Command | null = null;
  let bestScore = policy.minScore;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
    let command: Command;
    let score: number;
    if ('scorePoint' in policy) {
      if (policy.target === 'enemy-point' && !isEnemy(s, player, e.owner[i]!)) continue;
      if (policy.target === 'friendly-point' && e.owner[i] !== player) continue;
      if (policy.target === 'friendly-point' && distanceSq(e.x[i]!, e.y[i]!, e.x[caster]!, e.y[caster]!) < (TILE_FX * 8) ** 2) continue;
      const focusPenalty = policy.target === 'enemy-point' ? Math.trunc(isqrt(distanceSq(e.x[i]!, e.y[i]!, focusX, focusY)) / TILE_FX) : 0;
      score = policy.scorePoint(s, player, e.x[i]!, e.y[i]!) - focusPenalty;
      command = { t: 'ability', unit: eid(e, caster), ability: policy.ability, x: e.x[i]!, y: e.y[i]! };
    } else {
      if (policy.target === 'friendly-entity' && e.owner[i] !== player) continue;
      if (policy.target === 'enemy-entity' && !isEnemy(s, player, e.owner[i]!)) continue;
      score = policy.scoreTarget(s, player, i, caster, focusX, focusY);
      command = { t: 'ability', unit: eid(e, caster), ability: policy.ability, target: eid(e, i) };
    }
    if (score <= bestScore) continue;
    if (!validateCommand(s, player, command).ok) continue;
    bestScore = score;
    bestCommand = command;
  }
  if (!bestCommand) return false;
  cmds.push(bestCommand);
  return true;
};

const scoreEmpTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  const radius = Abilities[Ability.EMPShockwave]!.radius;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !withinRangeSq(e.x[i]!, e.y[i]!, x, y, radius)) continue;
    const value = e.shield[i]! + e.energy[i]! * 2;
    if (isEnemy(s, player, e.owner[i]!)) score += value;
    else if (e.owner[i] === player) score -= value;
  }
  return score;
};

const scoreScannerTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  let best = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !isEnemy(s, player, e.owner[i]!)) continue;
    if (!isCloaked(s, i) || canDetect(s, player, i) || e.x[i] !== x || e.y[i] !== y) continue;
    const def = Units[e.kind[i]!]!;
    const score = e.hp[i]! + e.shield[i]! + (def.weapon || def.airWeapon ? 60 : 0);
    if (score > best) best = score;
  }
  return best;
};

const scoreStormTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  const radius = Abilities[Ability.PsionicStorm]!.radius;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !withinRangeSq(e.x[i]!, e.y[i]!, x, y, radius)) continue;
    const def = Units[e.kind[i]!]!;
    if ((def.roles & Role.Mobile) === 0) continue;
    const value = Math.min(112, e.hp[i]! + e.shield[i]!);
    if (isEnemy(s, player, e.owner[i]!)) score += value;
    else if (e.owner[i] === player) score -= value * 2;
  }
  return score;
};

const scorePlagueTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.Plague]!.radius, (slot) => Math.min(300, s.e.hp[slot]! + s.e.shield[slot]!), 2);

const scoreEnsnareTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.Ensnare]!.radius,
    (slot) => (s.e.flags[slot]! & Role.Mobile) !== 0 && s.e.ensnareTimer[slot]! <= 0 ? 50 + Math.min(100, s.e.hp[slot]!) : 0, 1);

const scoreMaelstromTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.Maelstrom]!.radius,
    (slot) => (unitTraits(s.e.kind[slot]!) & Trait.Biological) !== 0 && s.e.maelstromTimer[slot]! <= 0 ? 60 + Math.min(120, s.e.hp[slot]!) : 0, 2);

const scoreStasisTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.StasisField]!.radius,
    (slot) => (s.e.flags[slot]! & Role.Mobile) !== 0 && s.e.stasisTimer[slot]! <= 0 ? Math.min(220, s.e.hp[slot]! + s.e.shield[slot]!) : 0, 2);

const scoreDisruptionWebTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.DisruptionWeb]!.radius, (slot) => {
    const def = Units[s.e.kind[slot]!]!;
    return (s.e.flags[slot]! & Role.Air) === 0 && def.weapon ? 80 : 0;
  }, 2);

const scoreDarkSwarmTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  const radius = Abilities[Ability.DarkSwarm]!.radius;
  let friendlyMelee = 0;
  let enemyRanged = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !withinRangeSq(e.x[i]!, e.y[i]!, x, y, radius)) continue;
    const def = Units[e.kind[i]!]!;
    const groundWeapon = def.weapon;
    if (e.owner[i] === player && groundWeapon && groundWeapon.range <= TILE_FX * 2) friendlyMelee += 60;
    else if (isEnemy(s, player, e.owner[i]!) && groundWeapon && groundWeapon.range > TILE_FX * 2) enemyRanged += 50;
  }
  return friendlyMelee + enemyRanged;
};

const scoreNukeTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.NuclearStrike]!.radius, (slot) => {
    if ((s.e.flags[slot]! & Role.Resource) !== 0) return 0;
    const def = Units[s.e.kind[slot]!]!;
    const structure = (s.e.flags[slot]! & Role.Structure) !== 0 ? 160 : 0;
    return structure + Math.min(500, s.e.hp[slot]! + s.e.shield[slot]!) + def.gas;
  }, 3);

const scoreYamatoTarget = (s: State, _player: number, slot: number): number =>
  Math.min(260, s.e.hp[slot]! + s.e.shield[slot]!) + (Units[s.e.kind[slot]!]!.gas > 0 ? 80 : 0);

const scoreMindControlTarget = (s: State, _player: number, slot: number): number =>
  Math.min(500, s.e.hp[slot]! + s.e.shield[slot]!) + Units[s.e.kind[slot]!]!.gas + Units[s.e.kind[slot]!]!.supply * 8;

const scoreBroodlingTarget = (s: State, _player: number, slot: number): number => {
  const traits = unitTraits(s.e.kind[slot]!);
  if ((s.e.flags[slot]! & (Role.Mobile | Role.Air)) !== Role.Mobile) return 0;
  if ((traits & Trait.Biological) === 0 || (traits & Trait.Robotic) !== 0) return 0;
  return Math.min(260, s.e.hp[slot]! + s.e.shield[slot]!);
};

const scoreFeedbackTarget = (s: State, _player: number, slot: number): number =>
  s.e.energy[slot]! > 0 ? s.e.energy[slot]! * 2 : 0;

const scoreRestorationTarget = (s: State, slot: number): number =>
  (unitTraits(s.e.kind[slot]!) & Trait.Biological) !== 0 && hasRestorableStatus(s.e, slot) ? 2 : 0;

const scoreParasiteTarget = (s: State, _player: number, slot: number): number => {
  if (s.e.parasiteOwner[slot]! !== 255) return 0;
  const detector = isDetectorKind(s.e.kind[slot]!) ? 120 : 0;
  return detector + Math.min(160, s.e.hp[slot]! + s.e.shield[slot]!) + (Units[s.e.kind[slot]!]!.sight * 8);
};

const scoreOpticalFlareTarget = (s: State, _player: number, slot: number): number => {
  if (s.e.opticalFlare[slot] === 1) return 0;
  const detector = isDetectorKind(s.e.kind[slot]!) ? 150 : 0;
  const caster = s.e.energy[slot]! > 0 ? 60 : 0;
  const armed = Units[s.e.kind[slot]!]!.weapon || Units[s.e.kind[slot]!]!.airWeapon ? 40 : 0;
  return detector + caster + armed + Units[s.e.kind[slot]!]!.sight * 4;
};

const scoreLockdownTarget = (s: State, _player: number, slot: number): number => {
  if ((unitTraits(s.e.kind[slot]!) & Trait.Mechanical) === 0 || (s.e.flags[slot]! & Role.Mobile) === 0 || s.e.lockdownTimer[slot]! > 0) return 0;
  return Math.min(220, s.e.hp[slot]! + s.e.shield[slot]!) + (Units[s.e.kind[slot]!]!.weapon ? 60 : 0);
};

const scoreIrradiateTarget = (s: State, player: number, slot: number): number => {
  const e = s.e;
  if ((unitTraits(e.kind[slot]!) & Trait.Biological) === 0 || e.irradiateTimer[slot]! > 0) return 0;
  const radius = Abilities[Ability.Irradiate]!.radius;
  return scoreArea(s, player, e.x[slot]!, e.y[slot]!, radius,
    (target) => (unitTraits(e.kind[target]!) & Trait.Biological) !== 0 && (e.flags[target]! & Role.Mobile) !== 0 ? 70 : 0, 2);
};

const scoreMatrixTarget = (s: State, player: number, target: number, focusX: number, focusY: number): number => {
  const e = s.e;
  if (e.owner[target] !== player || (e.flags[target]! & Role.Mobile) === 0 || e.matrixTimer[target]! > 0) return 0;
  const def = Units[e.kind[target]!]!;
  const missing = Math.max(0, def.hp - e.hp[target]!) + Math.max(0, def.shields - e.shield[target]!);
  const nearFight = withinRangeSq(e.x[target]!, e.y[target]!, focusX, focusY, TILE_FX * 7) ? 80 : 0;
  return missing + nearFight + (def.weapon || def.airWeapon ? 40 : 0);
};

const maybeCastCloak = (s: State, cmds: Command[], caster: number, abilityId: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const ability = Abilities[abilityId]!;
  if (!abilityTechAvailable(s, e.owner[caster]!, abilityId)) return false;
  if (e.cloakActive[caster] === 1 || e.energy[caster]! < ability.energyCost + 1) return false;
  if (!withinRangeSq(e.x[caster]!, e.y[caster]!, focusX, focusY, TILE_FX * 10)) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: abilityId });
  return true;
};

const scoreHallucinationTarget = (s: State, player: number, target: number, focusX: number, focusY: number): number => {
  const e = s.e;
  const def = Units[e.kind[target]!]!;
  if (e.owner[target] !== player || e.illusion[target] === 1 || (e.flags[target]! & Role.Mobile) === 0) return 0;
  if (!(def.weapon || def.airWeapon)) return 0;
  const nearFight = withinRangeSq(e.x[target]!, e.y[target]!, focusX, focusY, TILE_FX * 10) ? 80 : 0;
  return nearFight + e.hp[target]! + e.shield[target]! + def.supply * 8;
};

const scoreConsumeTarget = (s: State, caster: number, target: number): number => {
  const e = s.e;
  if (target === caster || e.owner[target] !== e.owner[caster] || (e.flags[target]! & Role.Mobile) === 0) return 0;
  if ((unitTraits(e.kind[target]!) & Trait.Biological) === 0) return 0;
  const kind = e.kind[target]!;
  const expendable = kind === Kind.Broodling || kind === Kind.Zergling ? 140 : kind === Kind.Drone ? 60 : 90;
  return expendable - Math.min(80, e.hp[target]!);
};

const scoreInfestTarget = (s: State, _player: number, slot: number): number =>
  s.e.kind[slot] === Kind.CommandCenter && s.e.hp[slot]! * 2 <= Units[Kind.CommandCenter]!.hp ? 500 : 0;

const scoreFriendlyRecallCluster = (s: State, player: number, x: number, y: number, radius: number): number => {
  const e = s.e;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || !withinRangeSq(e.x[i]!, e.y[i]!, x, y, radius)) continue;
    if ((e.flags[i]! & Role.Mobile) === 0 || !(Units[e.kind[i]!]!.weapon || Units[e.kind[i]!]!.airWeapon)) continue;
    score += 70 + Math.min(80, e.hp[i]! + e.shield[i]!);
  }
  return score;
};

const scoreArea = (
  s: State,
  player: number,
  x: number,
  y: number,
  radius: number,
  value: (slot: number) => number,
  friendlyPenalty: number,
): number => {
  const e = s.e;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !withinRangeSq(e.x[i]!, e.y[i]!, x, y, radius)) continue;
    const v = value(i);
    if (v <= 0) continue;
    if (isEnemy(s, player, e.owner[i]!)) score += v;
    else if (e.owner[i] === player) score -= v * friendlyPenalty;
  }
  return score;
};

const hasRestorableStatus = (e: State['e'], slot: number): boolean =>
  e.irradiateTimer[slot]! > 0 || e.plagueTimer[slot]! > 0 || e.ensnareTimer[slot]! > 0 ||
  e.lockdownTimer[slot]! > 0 || e.maelstromTimer[slot]! > 0 || e.opticalFlare[slot] === 1 ||
  e.parasiteOwner[slot]! !== 255;
