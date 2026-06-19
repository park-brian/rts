import { Kind, Order, tiles } from '../data/index.ts';
import { NONE } from '../entity/world.ts';

export type ActorPresentation = 'projectile' | 'unit';
export type ActorLifecycle = 'normal' | 'seek-impact' | 'sortie-return' | 'stationary-trigger';
export type ActorSteering = 'normal' | 'seek-impact' | 'orbit-target';
export type ActorTriggerTarget = 'enemy-detected-ground-mobile';

export type ActorTriggerDef = {
  range: number;
  target: ActorTriggerTarget;
  wakeOrder: number;
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
  },
  {
    kind: Kind.Interceptor,
    commandable: false,
    normalCombatParticipant: true,
    lifecycle: 'sortie-return',
    steering: 'orbit-target',
    externallySteeredWhenHomed: true,
    presentation: 'unit',
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
} => {
  const indexed = actorArray<ActorDef>();
  const flags = new Uint8Array(MAX_KIND + 1);
  const minReadableScreenRadius = new Int16Array(MAX_KIND + 1);
  const triggers = actorArray<ActorTriggerDef>();
  flags.fill(DEFAULT_ACTOR_FLAGS);
  minReadableScreenRadius.fill(-1);
  for (const def of defs) {
    if (indexed[def.kind] !== undefined) throw new Error(`duplicate actor descriptor for kind ${def.kind}`);
    indexed[def.kind] = def;
    flags[def.kind] = actorFlag(def);
    minReadableScreenRadius[def.kind] = def.minReadableScreenRadius ?? -1;
    triggers[def.kind] = def.trigger;
  }
  return { byKind: indexed, flags, minReadableScreenRadius, triggers };
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

export const actorMinReadableScreenRadius = (kind: number): number | undefined => {
  const radius = ActorIndex.minReadableScreenRadius[kind] ?? -1;
  return radius >= 0 ? radius : undefined;
};

export const actorTrigger = (kind: number): ActorTriggerDef | undefined =>
  ActorIndex.triggers[kind];
