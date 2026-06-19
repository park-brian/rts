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

const indexActorDefs = (defs: readonly ActorDef[]): Partial<Record<number, ActorDef>> => {
  const byKind: Partial<Record<number, ActorDef>> = {};
  for (const def of defs) {
    if (byKind[def.kind] !== undefined) throw new Error(`duplicate actor descriptor for kind ${def.kind}`);
    byKind[def.kind] = def;
  }
  return byKind;
};

export const ActorDefByKind = indexActorDefs(ActorDefs);

export const actorDef = (kind: number): ActorDef | undefined =>
  ActorDefByKind[kind];

export const isUserCommandableKind = (kind: number): boolean =>
  actorDef(kind)?.commandable ?? true;

export const participatesInNormalCombat = (kind: number): boolean =>
  actorDef(kind)?.normalCombatParticipant ?? true;

export const isExternallySteeredActor = (kind: number, home: number): boolean =>
  home !== NONE && (actorDef(kind)?.externallySteeredWhenHomed ?? false);

export const actorPresentation = (kind: number): ActorPresentation =>
  actorDef(kind)?.presentation ?? 'unit';

export const actorMinReadableScreenRadius = (kind: number): number | undefined =>
  actorDef(kind)?.minReadableScreenRadius;

export const actorTrigger = (kind: number): ActorTriggerDef | undefined =>
  actorDef(kind)?.trigger;
