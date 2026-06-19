import { Kind } from '../data/index.ts';
import { NONE } from '../entity/world.ts';

export type ActorPresentation = 'projectile' | 'unit';
export type ActorLifecycle = 'normal' | 'seek-impact' | 'sortie-return';
export type ActorSteering = 'normal' | 'seek-impact' | 'orbit-target';

export type ActorDef = {
  kind: number;
  commandable: boolean;
  normalCombatParticipant: boolean;
  lifecycle: ActorLifecycle;
  steering: ActorSteering;
  externallySteeredWhenHomed: boolean;
  presentation: ActorPresentation;
  minReadableScreenRadius?: number;
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
] as const;

export const actorDef = (kind: number): ActorDef | undefined =>
  ActorDefs.find((def) => def.kind === kind);

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
