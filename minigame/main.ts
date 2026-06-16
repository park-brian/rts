// Demo CLI: `node minigame/main.ts`
//
// Shows the two halves of the package working together:
//   1. The scripted archetypes played round-robin -> the payoff matrix, to see
//      whether the strategy space is genuinely non-transitive.
//   2. The exact oracle solving the TINY game from the start: the game value,
//      the optimal opening mix (is it actually mixed?), and each archetype's
//      EXPLOITABILITY — how badly a best-responder beats it. That number is the
//      ground-truth quality score the whole ML plan ultimately optimizes.

import { TINY_MARCH, SMALL } from './params.ts';
import { ARCHETYPES } from './policies.ts';
import { payoffMatrix, countCycles, playMatch } from './arena.ts';
import { initialState } from './game.ts';
import { Oracle } from './oracle.ts';
import type { Action, Outcome } from './types.ts';

const sym = (o: Outcome): string => (o === 1 ? ' W ' : o === -1 ? ' L ' : o === 0 ? ' . ' : ' ? ');
const targetName = ['harv', 'def', 'base'];

const describe = (a: Action): string =>
  `atk=${a.attack} def=${a.defend} tgt=${targetName[a.target]}${a.build ? ' +build' : ''}`;

const section = (t: string): void => console.log(`\n=== ${t} ===`);

// ---- 1. Archetype tournament (on the richer SMALL preset) ----
section('archetype payoff matrix (row=A vs col=B, W/L/draw from A)');
const M = payoffMatrix(ARCHETYPES, SMALL);
const names = ARCHETYPES.map((e) => e.name);
console.log('            ' + names.map((n) => n.slice(0, 5).padStart(5)).join(' '));
M.forEach((row, i) => {
  console.log(names[i]!.padStart(10) + '  ' + row.map(sym).join(''));
});
console.log(`\nnon-transitive (rock-paper-scissors) triples: ${countCycles(M)}`);
ARCHETYPES.forEach((e, i) => {
  const wins = M[i]!.filter((o) => o === 1).length;
  const losses = M[i]!.filter((o) => o === -1).length;
  console.log(`  ${e.name.padEnd(9)} ${wins}W ${losses}L vs the field`);
});

// ---- 2. The oracle on the movement game ----
section('exact oracle (TINY_MARCH: tiny caps + 1-turn march delay)');
const t0 = Date.now();
const oracle = new Oracle(TINY_MARCH);
const start = initialState(TINY_MARCH);
const sol = oracle.solve(start);
const ms = Date.now() - t0;
console.log(`solved ${oracle.nodeCount} internal states in ${ms} ms`);
console.log(`game value from a symmetric start: ${sol.value.toFixed(3)}  (0 => optimal play is a draw)`);

const topMix = sol.rowActions
  .map((a, i) => ({ a, w: sol.row[i]! }))
  .filter((x) => x.w > 1e-3)
  .sort((x, y) => y.w - x.w);
console.log(`optimal opening is a MIX over ${topMix.length} action(s):`);
for (const { a, w } of topMix) console.log(`  ${(w * 100).toFixed(1).padStart(5)}%  ${describe(a)}`);

section('archetype exploitability vs the oracle (TINY_MARCH preset)');
console.log('best-response value to each bot as A (B optimal). < 0 => B can punish it:');
for (const e of ARCHETYPES) {
  const brB = oracle.bestResponseValue(start, e.policy, 'b');
  const mirror = playMatch(e.policy, e.policy, TINY_MARCH).result;
  console.log(`  ${e.name.padEnd(9)} best-response value to it = ${brB.toFixed(2)}  (mirror: ${sym(mirror).trim()})`);
}
