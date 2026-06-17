import type { EconAction, EconParams, EconPlayer, EconState } from './econfight.ts';
import { forceValue } from './fight.ts';
import { UNITS } from './units.ts';

// Scripted production strategies over the economy+resolver game. Each is a
// build order + a commit trigger — i.e. a choice of WHAT to make and WHEN to
// attack. They are the typed-army analog of the macro archetypes, and they form
// a non-transitive metagame (timing x composition), which is the whole point.

export type EconPolicy = (s: EconState, who: 'a' | 'b', p: EconParams) => EconAction;

const me = (s: EconState, who: 'a' | 'b'): EconPlayer => s[who];
const armyValue = (pl: EconPlayer): number => forceValue(pl.army);

// Build workers up to `econ`, then spam `unit`; attack once the standing army is
// worth `commitAt`, and keep re-committing whenever an army has rebuilt.
const buildOrder =
  (unit: string, econ: number, commitAt: number): EconPolicy =>
  (s, who, p): EconAction => {
    const pl = me(s, who);
    const commit = !pl.attack && armyValue(pl) >= commitAt;
    if (pl.workers < econ) return { build: 'worker', commit };
    return { build: pl.minerals >= UNITS[unit]!.cost ? unit : 'idle', commit };
  };

// Pure economy, never attacks — the lower-bound punching bag.
export const greedy: EconPolicy = (s, who, p): EconAction => {
  const pl = me(s, who);
  return { build: pl.workers < p.maxWorkers ? 'worker' : 'idle', commit: false };
};

export const marineTiming = buildOrder('marine', 12, 600);
export const tankTech = buildOrder('tank', 15, 900);
export const vultureRush = buildOrder('vulture', 8, 300);
export const zealotPush = buildOrder('zealot', 12, 600);

export const ECON_POLICIES: { name: string; policy: EconPolicy }[] = [
  { name: 'vultureRush', policy: vultureRush },
  { name: 'marineTiming', policy: marineTiming },
  { name: 'zealotPush', policy: zealotPush },
  { name: 'tankTech', policy: tankTech },
  { name: 'greedy', policy: greedy },
];
