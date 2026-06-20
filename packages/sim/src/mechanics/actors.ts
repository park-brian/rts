import { Kind, Order, tiles } from '../data/index.ts';
import { NONE } from '../entity/world.ts';

export type ActorPresentation = 'projectile' | 'unit';
export type ActorLifecycle = 'normal' | 'seek-impact' | 'sortie-return' | 'stationary-trigger';
export type ActorSteering = 'normal' | 'seek-impact' | 'orbit-target';
export type ActorTriggerTarget = 'enemy-detected-ground-mobile';
export type ActorProjectileTarget = 'scarab-ground-detectable';
export type ActorImpactPolicy = 'weapon-hit-from-home';

export type ActorTriggerDef = {
  range: number;
  target: ActorTriggerTarget;
  wakeOrder: number;
};

export type ActorProjectileDef = {
  lifetime: number;
  target: ActorProjectileTarget;
  impact: ActorImpactPolicy;
};

export type ActorSortieDef = {
  orbitRadius: number;
  leashRange: number;
  returnRange: number;
  orbitOffsets: readonly (readonly [number, number])[];
};

export type ActorDef = {
  kind: number;
  commandable: boolean;
  normalCombatParticipant: boolean;
  lifecycle: ActorLifecycle;
  steering: ActorSteering;
  externallySteeredWhenHomed: boolean;
  presentation: ActorPresentation;
  minReadableScreenRadius?: number;
  trigger?: ActorTriggerDef;
  projectile?: ActorProjectileDef;
  sortie?: ActorSortieDef;
};

const ActorFlags = {
  Commandable: 1 << 0,
  NormalCombatParticipant: 1 << 1,
  ExternallySteeredWhenHomed: 1 << 2,
  ProjectilePresentation: 1 << 3,
} as const;

const DEFAULT_ACTOR_FLAGS = ActorFlags.Commandable | ActorFlags.NormalCombatParticipant;

export const ActorDefs: readonly ActorDef[] = [
  {
    kind: Kind.Scarab,
    commandable: false,
    normalCombatParticipant: false,
    lifecycle: 'seek-impact',
    steering: 'seek-impact',
    externallySteeredWhenHomed: true,
    presentation: 'projectile',
    minReadableScreenRadius: 5,
    projectile: {
      lifetime: 180,
      target: 'scarab-ground-detectable',
      impact: 'weapon-hit-from-home',
    },
  },
  {
    kind: Kind.Interceptor,
    commandable: false,
    normalCombatParticipant: true,
    lifecycle: 'sortie-return',
    steering: 'orbit-target',
    externallySteeredWhenHomed: true,
    presentation: 'unit',
    sortie: {
      orbitRadius: tiles(1),
      leashRange: tiles(10),
      returnRange: tiles(1),
      orbitOffsets: [
        [1, 0], [1, 1], [0, 1], [-1, 1],
        [-1, 0], [-1, -1], [0, -1], [1, -1],
      ],
    },
  },
  {
    kind: Kind.SpiderMine,
    commandable: false,
    normalCombatParticipant: true,
    lifecycle: 'stationary-trigger',
    steering: 'normal',
    externallySteeredWhenHomed: false,
    presentation: 'unit',
    trigger: {
      range: tiles(3),
      target: 'enemy-detected-ground-mobile',
      wakeOrder: Order.Attack,
    },
  },
] as const;

const maxKind = (): number => {
  let max = 0;
  for (const value of Object.values(Kind)) {
    if (typeof value === 'number' && value > max) max = value;
  }
  return max;
};

const MAX_KIND = maxKind();

const actorArray = <T>(): Array<T | undefined> =>
  new Array(MAX_KIND + 1);

const actorFlag = (def: ActorDef): number => {
  let flags = 0;
  if (def.commandable) flags |= ActorFlags.Commandable;
  if (def.normalCombatParticipant) flags |= ActorFlags.NormalCombatParticipant;
  if (def.externallySteeredWhenHomed) flags |= ActorFlags.ExternallySteeredWhenHomed;
  if (def.presentation === 'projectile') flags |= ActorFlags.ProjectilePresentation;
  return flags;
};

const indexActorDefs = (
  defs: readonly ActorDef[],
): {
  byKind: Array<ActorDef | undefined>;
  flags: Uint8Array;
  minReadableScreenRadius: Int16Array;
  triggers: Array<ActorTriggerDef | undefined>;
  projectiles: Array<ActorProjectileDef | undefined>;
  sorties: Array<ActorSortieDef | undefined>;
} => {
  const indexed = actorArray<ActorDef>();
  const flags = new Uint8Array(MAX_KIND + 1);
  const minReadableScreenRadius = new Int16Array(MAX_KIND + 1);
  const triggers = actorArray<ActorTriggerDef>();
  const projectiles = actorArray<ActorProjectileDef>();
  const sorties = actorArray<ActorSortieDef>();
  flags.fill(DEFAULT_ACTOR_FLAGS);
  minReadableScreenRadius.fill(-1);
  for (const def of defs) {
    if (indexed[def.kind] !== undefined) throw new Error(`duplicate actor descriptor for kind ${def.kind}`);
    indexed[def.kind] = def;
    flags[def.kind] = actorFlag(def);
    minReadableScreenRadius[def.kind] = def.minReadableScreenRadius ?? -1;
    triggers[def.kind] = def.trigger;
    projectiles[def.kind] = def.projectile;
    sorties[def.kind] = def.sortie;
  }
  return { byKind: indexed, flags, minReadableScreenRadius, triggers, projectiles, sorties };
};

const ActorIndex = indexActorDefs(ActorDefs);

export const ActorDefByKind = ActorIndex.byKind;

export const actorDef = (kind: number): ActorDef | undefined =>
  ActorDefByKind[kind];

const actorFlags = (kind: number): number =>
  ActorIndex.flags[kind] ?? DEFAULT_ACTOR_FLAGS;

export const isUserCommandableKind = (kind: number): boolean =>
  (actorFlags(kind) & ActorFlags.Commandable) !== 0;

export const participatesInNormalCombat = (kind: number): boolean =>
  (actorFlags(kind) & ActorFlags.NormalCombatParticipant) !== 0;

export const isExternallySteeredActor = (kind: number, home: number): boolean =>
  home !== NONE && (actorFlags(kind) & ActorFlags.ExternallySteeredWhenHomed) !== 0;

export const actorPresentation = (kind: number): ActorPresentation =>
  (actorFlags(kind) & ActorFlags.ProjectilePresentation) !== 0 ? 'projectile' : 'unit';

export const isProjectileActorKind = (kind: number): boolean =>
  (actorFlags(kind) & ActorFlags.ProjectilePresentation) !== 0;

export const actorMinReadableScreenRadius = (kind: number): number | undefined => {
  const radius = ActorIndex.minReadableScreenRadius[kind] ?? -1;
  return radius >= 0 ? radius : undefined;
};

export const actorTrigger = (kind: number): ActorTriggerDef | undefined =>
  ActorIndex.triggers[kind];

export const actorProjectile = (kind: number): ActorProjectileDef | undefined =>
  ActorIndex.projectiles[kind];

export const actorSortie = (kind: number): ActorSortieDef | undefined =>
  ActorIndex.sorties[kind];
