// Headless demo: run a 2-player economy game with the scripted macro bot, print a
// summary, then a quick throughput benchmark. Run with: `npm run demo`.

import { Sim, sliceMap, count, Kind, Terran, type PlayerCommands } from '@rts/sim';
import { createMacroBot } from '@rts/ai';

const PLAYERS = 2;
const SEED = 12345;
const bot = createMacroBot(Terran);

const playTo = (sim: Sim, untilTick: number): void => {
  while (sim.tick < untilTick) {
    const batch: PlayerCommands[] = [];
    for (let p = 0; p < PLAYERS; p++) batch.push({ player: p, cmds: bot(sim.fullState(), p) });
    sim.step(batch);
  }
};

const summary = (sim: Sim): string => {
  const s = sim.fullState();
  const parts: string[] = [];
  for (let p = 0; p < PLAYERS; p++) {
    parts.push(
      `P${p}: ${s.players.minerals[p]}m  scv=${count(s, Kind.SCV, p)}  ` +
        `sup=${s.players.supplyUsed[p]}/${s.players.supplyMax[p]}`,
    );
  }
  return parts.join('   |   ');
};

console.log(`Map: ${sliceMap().name}\n`);
const sim = new Sim({ map: sliceMap(), players: PLAYERS, seed: SEED });
for (let t = 100; t <= 800; t += 100) {
  playTo(sim, t);
  console.log(`tick ${String(t).padStart(4)}  ${summary(sim)}`);
}
console.log(`\nfinal hash: 0x${sim.hash().toString(16).padStart(8, '0')}`);

// Throughput benchmark (headless, no rendering).
const bench = new Sim({ map: sliceMap(), players: PLAYERS, seed: SEED });
const TICKS = 200_000;
const t0 = performance.now();
for (let i = 0; i < TICKS; i++) {
  const batch: PlayerCommands[] = [];
  for (let p = 0; p < PLAYERS; p++) batch.push({ player: p, cmds: bot(bench.fullState(), p) });
  bench.step(batch);
}
const ms = performance.now() - t0;
console.log(`\nbench: ${TICKS} ticks in ${ms.toFixed(0)}ms = ${((TICKS / ms) * 1000 / 1000).toFixed(1)}k ticks/s (1 game, single thread)`);
