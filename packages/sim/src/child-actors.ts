import { Kind } from './data.ts';

export type ChildActorPresentation = 'projectile' | 'unit';

export type ChildActorDef = {
  kind: number;
  commandable: boolean;
  presentation: ChildActorPresentation;
  minReadableScreenRadius?: number;
};

export const ChildActorDefs: readonly ChildActorDef[] = [
  {
    kind: Kind.Scarab,
    commandable: false,
    presentation: 'projectile',
    minReadableScreenRadius: 5,
  },
  {
    kind: Kind.Interceptor,
    commandable: false,
    presentation: 'unit',
  },
] as const;

export const childActorDef = (kind: number): ChildActorDef | undefined =>
  ChildActorDefs.find((def) => def.kind === kind);

export const isProjectilePresentationKind = (kind: number): boolean =>
  childActorDef(kind)?.presentation === 'projectile';

export const isUserCommandableKind = (kind: number): boolean =>
  childActorDef(kind)?.commandable ?? true;

export const readableProjectileRadius = (kind: number, gameplayRadius: number, zoom: number): number => {
  const minScreenRadius = childActorDef(kind)?.minReadableScreenRadius;
  if (minScreenRadius === undefined) return gameplayRadius;
  return Math.max(gameplayRadius, minScreenRadius / Math.max(zoom, 0.001));
};
