import { Kind } from './data.ts';
import { NONE } from './entity/world.ts';

export type ChildActorPresentation = 'projectile' | 'unit';

export type ChildActorDef = {
  kind: number;
  commandable: boolean;
  normalCombatParticipant: boolean;
  externallySteeredWhenHomed: boolean;
  presentation: ChildActorPresentation;
  minReadableScreenRadius?: number;
};

export const ChildActorDefs: readonly ChildActorDef[] = [
  {
    kind: Kind.Scarab,
    commandable: false,
    normalCombatParticipant: false,
    externallySteeredWhenHomed: true,
    presentation: 'projectile',
    minReadableScreenRadius: 5,
  },
  {
    kind: Kind.Interceptor,
    commandable: false,
    normalCombatParticipant: true,
    externallySteeredWhenHomed: true,
    presentation: 'unit',
  },
] as const;

export const childActorDef = (kind: number): ChildActorDef | undefined =>
  ChildActorDefs.find((def) => def.kind === kind);

export const isUserCommandableKind = (kind: number): boolean =>
  childActorDef(kind)?.commandable ?? true;

export const participatesInNormalCombat = (kind: number): boolean =>
  childActorDef(kind)?.normalCombatParticipant ?? true;

export const isExternallySteeredChild = (kind: number, home: number): boolean =>
  home !== NONE && (childActorDef(kind)?.externallySteeredWhenHomed ?? false);
