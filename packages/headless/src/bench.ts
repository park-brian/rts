// Repeatable headless throughput benchmark for the deterministic sim boundary.
// This is intentionally a measurement harness, not a pass/fail performance gate:
// CI and local runs can compare the stable JSON output over time.

import { createBot } from '@rts/ai';
import {
  Sim, Terran, Zerg, generateMap, type Command, type Controller, type Faction, type PlayerCommands,
} from '@rts/sim';

export type BenchCaseName = 'step-no-vision' | 'step-vision' | 'observe-results';

export type BenchResult = {
  name: BenchCaseName;
  seed: number;
  ticks: number;
  players: number;
  vision: boolean;
  observations: number;
  observedEntities: number;
  commandResults: number;
  accepted: number;
  rejected: number;
  hash: number;
  elapsedMs: number;
  ticksPerSecond: number;
};

export type BenchOptions = {
  seed?: number;
  ticks?: number;
  cases?: BenchCaseName[];
};

type BenchCase = {
  name: BenchCaseName;
  vision: boolean;
  observe: boolean;
  resultProbe: boolean;
};

const DEFAULT_SEED = 2026;
const DEFAULT_TICKS = 2_000;
const FACTIONS: Faction[] = [Terran, Zerg];
const CASES: BenchCase[] = [
  { name: 'step-no-vision', vision: false, observe: false, resultProbe: false },
  { name: 'step-vision', vision: true, observe: false, resultProbe: false },
  { name: 'observe-results', vision: true, observe: true, resultProbe: true },
];

const makeControllers = (): Controller[] =>
  FACTIONS.map((faction, i) => createBot(faction, {
    attackThreshold: i % 2 === 0 ? 8 : 14,
    barracksTarget: faction.name === 'Terran' ? 2 : 1,
  }));

const staleProbe = (tick: number): Command => ({ t: 'stop', unit: 0x7fff_0000 + tick });

const batchFor = (sim: Sim, controllers: Controller[], resultProbe: boolean): PlayerCommands[] => {
  const state = sim.fullState();
  return controllers.map((controller, player) => {
    const cmds = controller(state, player);
    if (resultProbe && (sim.tick & 7) === player) cmds.push(staleProbe(sim.tick + player));
    return { player, cmds };
  });
};

const runCase = (bench: BenchCase, opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  const players = FACTIONS.length;
  const sim = new Sim({
    map: generateMap(players / 2, opts.seed),
    players,
    seed: opts.seed,
    vision: bench.vision,
    factions: FACTIONS,
  });
  const controllers = makeControllers();
  let observations = 0;
  let observedEntities = 0;
  let commandResults = 0;
  let accepted = 0;
  let rejected = 0;
  const start = performance.now();
  for (let i = 0; i < opts.ticks && !sim.fullState().result.over; i++) {
    const results = sim.step(batchFor(sim, controllers, bench.resultProbe));
    if (bench.resultProbe) {
      commandResults += results.length;
      for (const result of results) {
        if (result.ok) accepted++;
        else rejected++;
      }
    }
    if (bench.observe) {
      for (let p = 0; p < players; p++) {
        const obs = sim.observe(p);
        observations++;
        observedEntities += obs.entities.length;
      }
    }
  }
  const elapsedMs = Math.max(0.001, performance.now() - start);
  return {
    name: bench.name,
    seed: opts.seed,
    ticks: sim.tick,
    players,
    vision: bench.vision,
    observations,
    observedEntities,
    commandResults,
    accepted,
    rejected,
    hash: sim.hash(),
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number((sim.tick / (elapsedMs / 1000)).toFixed(1)),
  };
};

export const runThroughputBenchmark = (options: BenchOptions = {}): BenchResult[] => {
  const opts = {
    seed: options.seed ?? DEFAULT_SEED,
    ticks: options.ticks ?? DEFAULT_TICKS,
  };
  const selected = new Set(options.cases ?? CASES.map((c) => c.name));
  return CASES.filter((bench) => selected.has(bench.name)).map((bench) => runCase(bench, opts));
};

if (process.argv[1]?.endsWith('bench.ts')) {
  for (const result of runThroughputBenchmark()) console.log(JSON.stringify(result));
}
