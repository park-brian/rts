// Demo: `node minigame/econdemo.ts`
//
// The integration: economy + production wired on top of the deterministic fight
// resolver. Scripted BUILD ORDERS (what to make, when to attack) play a round
// robin; the payoff matrix shows the timing x composition metagame is
// non-transitive — a cheap fast army can win before its hard counter is teched.

import { ECON } from './econfight.ts';
import { ECON_POLICIES } from './econpolicies.ts';
import { econPayoffMatrix, econCycles, playEcon } from './econarena.ts';

const M = econPayoffMatrix(ECON_POLICIES, ECON);
const names = ECON_POLICIES.map((e) => e.name);

console.log('Economy + production game, scripted build orders (row=A vs col=B, W/L/draw from A):');
console.log('              ' + names.map((n) => n.slice(0, 5).padStart(6)).join(' '));
M.forEach((r, i) =>
  console.log(names[i]!.padStart(13) + ' ' + r.map((o) => (o === 1 ? '  W  ' : o === -1 ? '  L  ' : '  .  ')).join('')),
);
console.log(`\nnon-transitive (build-order rock-paper-scissors) triples: ${econCycles(M)}`);
ECON_POLICIES.forEach((e, i) => {
  const w = M[i]!.filter((o) => o === 1).length;
  const l = M[i]!.filter((o) => o === -1).length;
  console.log(`  ${e.name.padEnd(13)} ${w}W ${l}L`);
});

// Show one game's arc.
const g = playEcon(ECON_POLICIES[0]!.policy, ECON_POLICIES[3]!.policy, ECON);
console.log(`\nexample: ${ECON_POLICIES[0]!.name} vs ${ECON_POLICIES[3]!.name} -> ${g.result === 1 ? 'A' : g.result === -1 ? 'B' : 'draw'} in ${g.turns} turns`);
console.log('  (the resolver decides every fight deterministically; only the build order varies)');
