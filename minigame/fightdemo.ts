// Demo: `node minigame/fightdemo.ts`
//
// Shows the mechanical layer (the deterministic fight resolver) turning "what
// beats what" into a solvable strategic question. Prints the composition payoff
// matrix and the optimal (mixed) army choice in the open field, then at a choke —
// where terrain collapses the counter cycle onto a different answer.

import { pureComps, compositionMatrix, solveCompositionGame, countCounterCycles } from './compose.ts';
import { OPEN_FIELD } from './fight.ts';
import type { FightContext } from './fight.ts';
import type { NamedComp } from './compose.ts';

const NAMES = ['marine', 'zealot', 'vulture', 'hydra', 'tank'];
const BUDGET = 600;
const comps = pureComps(BUDGET, NAMES);
const short = (c: NamedComp) => c.label.split('x ')[1]!.slice(0, 4);

const report = (ctx: FightContext, title: string): void => {
  const M = compositionMatrix(comps, ctx);
  const sol = solveCompositionGame(comps, ctx);
  console.log(`\n=== ${title}  (counter cycles: ${countCounterCycles(M)}) ===`);
  console.log('  row vs col, W/L/draw from row:');
  console.log('            ' + comps.map((c) => short(c).padStart(5)).join(' '));
  M.forEach((r, i) =>
    console.log(comps[i]!.label.padStart(11) + ' ' + r.map((o) => (o === 1 ? '  W ' : o === -1 ? '  L ' : '  . ')).join('')),
  );
  const mix = sol.mix
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p > 1e-3)
    .sort((x, y) => y.p - x.p)
    .map((x) => `${short(comps[x.i]!)} ${(x.p * 100).toFixed(0)}%`)
    .join('   ');
  console.log(`optimal army (game value ${sol.value.toFixed(2)}): ${mix}`);
};

console.log(`Composition game @ budget ${BUDGET}: ${comps.map((c) => c.label).join('  |  ')}`);
report(OPEN_FIELD, 'OPEN FIELD');
report({ frontageA: 2, frontageB: 2, dmgMultA: 1, dmgMultB: 1 }, 'CHOKE (frontage 2)');
console.log('\nThe mechanical layer is deterministic + symmetric, so this matrix is exact:');
console.log('the army you should build is the Nash of a game the resolver fills in — no RL needed to');
console.log('discover counters, and terrain (frontage) provably changes the strategic answer.');
