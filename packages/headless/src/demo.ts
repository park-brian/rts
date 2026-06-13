// Headless demo: a full AI-vs-AI 1v1 on a procedural map, played to completion,
// then a throughput benchmark. Run with: `npm run demo`.

import { Sim, generateMap, count, Kind, Terran, type PlayerCommands } from '@rts/sim';
import { createBot } from '@rts/ai';

const SEED = 2026;
const map = generateMap(1, SEED);
const sim = new Sim({ map, players: 2, seed: SEED });
const bots = [
  createBot(Terran, { attackThreshold: 8, barracksTarget: 2 }), // aggressive
  createBot(Terran, { attackThreshold: 16, barracksTarget: 3 }), // greedier
];

const line = (sim: Sim): string => {
  const s = sim.fullState();
  const parts: string[] = [];
  for (let p = 0; p < 2; p++) {
    parts.push(
      `P${p}: ${String(s.players.minerals[p]).padStart(4)}m ` +
        `scv=${count(s, Kind.SCV, p)} rax=${count(s, Kind.Barracks, p)} ` +
        `marine=${String(count(s, Kind.Marine, p)).padStart(2)} ` +
        `sup=${s.players.supplyUsed[p]}/${s.players.supplyMax[p]}`,
    );
  }
  return parts.join('  |  ');
};

console.log(`Map: ${map.name}  (${map.w}x${map.h} tiles)\n`);
let next = 0;
while (!sim.fullState().result.over && sim.tick < 80000) {
  if (sim.tick >= next) {
    console.log(`t${String(sim.tick).padStart(5)}  ${line(sim)}`);
    next += 4000;
  }
  sim.step([
    { player: 0, cmds: bots[0]!(sim.fullState(), 0) },
    { player: 1, cmds: bots[1]!(sim.fullState(), 1) },
  ] as PlayerCommands[]);
}
const r = sim.fullState().result;
console.log(`\nresult: ${r.over ? `team ${r.winner} wins` : 'ongoing'} at tick ${sim.tick} (~${(sim.tick / 24 / 60).toFixed(1)} min)`);

// Throughput benchmark.
const bench = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED });
const TICKS = 100_000;
const t0 = performance.now();
for (let i = 0; i < TICKS && !bench.fullState().result.over; i++) {
  bench.step([
    { player: 0, cmds: bots[0]!(bench.fullState(), 0) },
    { player: 1, cmds: bots[1]!(bench.fullState(), 1) },
  ] as PlayerCommands[]);
}
const ms = performance.now() - t0;
console.log(`bench: ${bench.tick} ticks in ${ms.toFixed(0)}ms = ${(bench.tick / ms).toFixed(1)}k ticks/s`);
