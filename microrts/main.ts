// Demo: `node microrts/main.ts`
// Runs scripted bots on the microRTS-style engine and prints the outcome plus a
// board snapshot, showing the deterministic 2D engine works end to end.

import { playGame, playBothSides, render } from './run.ts';
import { workerRush, economyBot } from './bots.ts';
import { makeMap } from './setup.ts';
import { step, winner, hashState } from './game.ts';

const name = (w: 0 | 1 | 'draw') => (w === 'draw' ? 'draw' : `player ${w}`);

console.log('=== workerRush (P0) vs economy (P1) ===');
const g = playGame(workerRush(1), economyBot);
console.log(`winner: ${name(g.winner)} at cycle ${g.cycles}`);
console.log('final board:\n' + render(g.final) + '\n');

console.log('=== fair (both-sides) comparison, netting out first-resolver bias ===');
const bs = playBothSides(workerRush(1), economyBot);
console.log(`workerRush vs economy over 2 games (swapped sides): rush ${bs.winsA}W, economy ${bs.winsB}W, ${bs.draws}D\n`);

console.log('=== a mid-game snapshot of the mirror (cycle ~120) ===');
let s = makeMap();
while (s.time < 120 && winner(s, 3000) === null) s = step(s, workerRush(1)(s, 0), workerRush(1)(s, 1));
console.log(render(s));
console.log(`\nresources: P0=${s.resources[0]} P1=${s.resources[1]} | units=${s.units.length} | state hash ${hashState(s).slice(0, 24)}…`);
