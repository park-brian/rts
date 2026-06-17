// Repeatable headless throughput benchmark for the deterministic sim boundary.
// This is intentionally a measurement harness, not a pass/fail performance gate:
// CI and local runs can compare the stable JSON output over time.

import { createBot } from '@rts/ai';
import {
  Sim, Terran, Zerg, generateMap,
  Kind, Order, TILE, eid, fx, hashState, makeState, slotOf, spawnUnit, stepWorld,
  type Command, type Controller, type Faction, type MapDef, type PlayerCommands,
} from '@rts/sim';

export type BenchCaseName = 'step-no-vision' | 'step-vision' | 'observe-results' | 'movement-deathball';

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
  units?: number;
  settled?: number;
  activeOrders?: number;
  distinctPositions?: number;
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
  { name: 'movement-deathball', vision: false, observe: false, resultProbe: false },
];

const MOVEMENT_STRESS_UNITS = 32;
const MOVEMENT_KINDS: readonly number[] = [
  Kind.Marine, Kind.Firebat, Kind.Zealot, Kind.Hydralisk,
  Kind.Goliath, Kind.Dragoon, Kind.SiegeTank, Kind.Ultralisk,
];
const tileCenter = (t: number): number => fx(t * TILE + (TILE >> 1));

const blankMap = (name: string, w: number, h: number): MapDef => ({
  name, w, h,
  walk: new Uint8Array(w * h).fill(1),
  build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

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

const runMovementDeathballCase = (opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  const s = makeState(blankMap('Bench Movement Deathball', 96, 96), 1, opts.seed);
  const goalX = tileCenter(54);
  const goalY = tileCenter(30);
  const slots: number[] = [];
  for (let i = 0; i < MOVEMENT_STRESS_UNITS; i++) {
    const x = tileCenter(18 + (i % 8) * 2);
    const y = tileCenter(72 + ((i / 8) | 0) * 2);
    slots.push(slotOf(spawnUnit(s, MOVEMENT_KINDS[i % MOVEMENT_KINDS.length]!, 0, x, y)));
  }
  const batch: PlayerCommands[] = [{
    player: 0,
    cmds: slots.map((slot) => ({ t: 'move' as const, unit: eid(s.e, slot), x: goalX, y: goalY })),
  }];

  let commandResults = 0;
  let accepted = 0;
  let rejected = 0;
  const start = performance.now();
  for (let i = 0; i < opts.ticks; i++) {
    const results = stepWorld(s, i === 0 ? batch : []);
    commandResults += results.length;
    for (const result of results) {
      if (result.ok) accepted++;
      else rejected++;
    }
  }

  let settled = 0;
  let activeOrders = 0;
  const positions = new Set<string>();
  for (const slot of slots) {
    if (s.e.settled[slot] === 1) settled++;
    if (s.e.order[slot] === Order.Move || s.e.order[slot] === Order.AttackMove) activeOrders++;
    positions.add(`${s.e.x[slot]},${s.e.y[slot]}`);
  }

  const elapsedMs = Math.max(0.001, performance.now() - start);
  return {
    name: 'movement-deathball',
    seed: opts.seed,
    ticks: s.tick,
    players: 1,
    vision: false,
    observations: 0,
    observedEntities: 0,
    commandResults,
    accepted,
    rejected,
    hash: hashState(s),
    units: slots.length,
    settled,
    activeOrders,
    distinctPositions: positions.size,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number((s.tick / (elapsedMs / 1000)).toFixed(1)),
  };
};

const runCase = (bench: BenchCase, opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  if (bench.name === 'movement-deathball') return runMovementDeathballCase(opts);
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
