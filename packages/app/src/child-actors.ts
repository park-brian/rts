import { Kind } from './sim.ts';

export const isProjectilePresentationKind = (kind: number): boolean =>
  kind === Kind.Scarab;

export const isUserCommandableKind = (kind: number): boolean =>
  kind !== Kind.Scarab && kind !== Kind.Interceptor;

export const readableProjectileRadius = (kind: number, gameplayRadius: number, zoom: number): number =>
  isProjectilePresentationKind(kind) ? Math.max(gameplayRadius, 5 / Math.max(zoom, 0.001)) : gameplayRadius;
