import { EffectKind, ONE, TILE } from './sim.ts';
import type { Game } from './game.ts';

export type VisibilityAffordance = {
  kind: 'scan' | 'nuke';
  x: number;
  y: number;
  radius: number;
  timer: number;
};

export const visibilityAffordances = (game: Game, out: VisibilityAffordance[] = []): VisibilityAffordance[] => {
  out.length = 0;
  const s = game.sim.fullState();
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1) continue;
    const effectKind = fx.kind[i]!;
    if (effectKind !== EffectKind.ScannerSweep && effectKind !== EffectKind.NuclearStrike) continue;
    const tx = Math.trunc(fx.x[i]! / (ONE * TILE));
    const ty = Math.trunc(fx.y[i]! / (ONE * TILE));
    const vis = game.human < 0 ? 2 : game.tileVisible(tx, ty);
    const owned = game.human >= 0 && fx.owner[i] === game.human;
    if (effectKind === EffectKind.ScannerSweep && !owned && vis !== 2) continue;
    if (effectKind === EffectKind.NuclearStrike && !owned && vis === 0) continue;
    out.push({
      kind: effectKind === EffectKind.ScannerSweep ? 'scan' : 'nuke',
      x: fx.x[i]! / ONE,
      y: fx.y[i]! / ONE,
      radius: fx.radius[i]! / ONE,
      timer: fx.timer[i]!,
    });
  }
  return out;
};
