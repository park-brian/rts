import type { State } from './sim.ts';

export type IllusionPresentation = {
  known: boolean;
  labelPrefix: string;
  alpha: number;
  tint: readonly [number, number, number];
};

export const illusionPresentation = (s: State, viewer: number, slot: number): IllusionPresentation => {
  const e = s.e;
  if (e.alive[slot] !== 1 || e.illusion[slot] !== 1) {
    return { known: false, labelPrefix: '', alpha: 1, tint: [1, 1, 1] };
  }
  const owner = e.owner[slot]!;
  const known = viewer < 0 || viewer === owner || (
    viewer < s.teams.length && owner < s.teams.length && s.teams[viewer] === s.teams[owner]
  );
  return known
    ? { known: true, labelPrefix: 'Hallucination ', alpha: 0.72, tint: [0.62, 0.82, 1] }
    : { known: false, labelPrefix: '', alpha: 1, tint: [1, 1, 1] };
};
