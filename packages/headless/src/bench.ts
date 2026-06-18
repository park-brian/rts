// Repeatable headless throughput benchmark for the deterministic sim boundary.
// This is intentionally a measurement harness, not a pass/fail performance gate:
// CI and local runs can compare the stable JSON output over time.

import { createBot } from '@rts/ai';
import {
  Sim, Terran, Zerg, generateMap,
  Kind, Order, TILE, eid, fx, hashState, makeState, slotOf, spawnUnit, stepWorld,
  COMMAND_HEADS,
  abilityCandidates,
  addonKindCandidates,
  buildKindCandidates,
  createBatchDecodeReservation,
  createObservationBuffers,
  decodeActionBatchInto,
  liveEntityCandidates,
  readCollisionPressureStats,
  researchTechCandidates,
  resetCollisionPressureStats,
  trainKindCandidates,
  transformKindCandidates,
  writeAbilityMask,
  writeAddonKindMask,
  writeBuildKindMask,
  writeCommandHeadMask,
  writeEntityTargetMask,
  writeObservation,
  writeResearchTechMask,
  writeTrainKindMask,
  writeTransformKindMask,
  type Command, type Controller, type EncodedAction, type Faction, type MapDef, type PlayerCommands,
} from '@rts/sim';

export type BenchCaseName =
  | 'step-no-vision'
  | 'step-vision'
  | 'observe-results'
  | 'observe-buffer'
  | 'observe-larva-stress'
  | 'mask-generation'
  | 'bot-generation'
  | 'batch-sequential'
  | 'movement-follow'
  | 'movement-deathball';

export type BenchResult = {
  name: BenchCaseName;
  seed: number;
  ticks: number;
  players: number;
  vision: boolean;
  observations: number;
  observedEntities: number;
  masks: number;
  bufferObservations: number;
  commandsGenerated: number;
  envs?: number;
  commandResults: number;
  accepted: number;
  rejected: number;
  hash: number;
  units?: number;
  settled?: number;
  activeOrders?: number;
  distinctPositions?: number;
  targetsHeld?: number;
  leaderMoved?: number;
  collisionTicks?: number;
  collisionSolidUnits?: number;
  collisionPairChecks?: number;
  collisionResourceRoutePairSkips?: number;
  collisionOverlapPairs?: number;
  collisionMaxOverlapFx?: number;
  collisionNudgedUnits?: number;
  collisionBlockedNudges?: number;
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
  { name: 'observe-buffer', vision: true, observe: false, resultProbe: false },
  { name: 'observe-larva-stress', vision: true, observe: false, resultProbe: false },
  { name: 'mask-generation', vision: true, observe: false, resultProbe: false },
  { name: 'bot-generation', vision: false, observe: false, resultProbe: false },
  { name: 'batch-sequential', vision: false, observe: false, resultProbe: false },
  { name: 'movement-follow', vision: false, observe: false, resultProbe: false },
  { name: 'movement-deathball', vision: false, observe: false, resultProbe: false },
];

const MOVEMENT_STRESS_UNITS = 32;
const MOVEMENT_FOLLOWERS = 16;
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
  resetCollisionPressureStats();
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
  const collision = readCollisionPressureStats();

  const elapsedMs = Math.max(0.001, performance.now() - start);
  return {
    name: 'movement-deathball',
    seed: opts.seed,
    ticks: s.tick,
    players: 1,
    vision: false,
    observations: 0,
    observedEntities: 0,
    masks: 0,
    bufferObservations: 0,
    commandsGenerated: 0,
    commandResults,
    accepted,
    rejected,
    hash: hashState(s),
    units: slots.length,
    settled,
    activeOrders,
    distinctPositions: positions.size,
    collisionTicks: collision.ticks,
    collisionSolidUnits: collision.solidUnits,
    collisionPairChecks: collision.pairChecks,
    collisionResourceRoutePairSkips: collision.resourceRoutePairSkips,
    collisionOverlapPairs: collision.overlapPairs,
    collisionMaxOverlapFx: collision.maxOverlapFx,
    collisionNudgedUnits: collision.nudgedUnits,
    collisionBlockedNudges: collision.blockedNudges,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number((s.tick / (elapsedMs / 1000)).toFixed(1)),
  };
};

const runMovementFollowCase = (opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  const s = makeState(blankMap('Bench Movement Follow', 96, 96), 1, opts.seed);
  const leader = spawnUnit(s, Kind.Marine, 0, tileCenter(44), tileCenter(44));
  const leaderSlot = slotOf(leader);
  const leaderStartX = s.e.x[leaderSlot]!;
  const leaderStartY = s.e.y[leaderSlot]!;
  const followers: number[] = [];
  for (let i = 0; i < MOVEMENT_FOLLOWERS; i++) {
    const x = tileCenter(18 + (i % 4) * 2);
    const y = tileCenter(36 + ((i / 4) | 0) * 2);
    followers.push(slotOf(spawnUnit(s, MOVEMENT_KINDS[i % MOVEMENT_KINDS.length]!, 0, x, y)));
  }
  const batch: PlayerCommands[] = [{
    player: 0,
    cmds: [
      { t: 'move', unit: leader, x: tileCenter(62), y: tileCenter(50) },
      ...followers.map((slot) => ({
        t: 'move' as const,
        unit: eid(s.e, slot),
        x: s.e.x[leaderSlot]!,
        y: s.e.y[leaderSlot]!,
        target: leader,
      })),
    ],
  }];

  let commandResults = 0;
  let accepted = 0;
  let rejected = 0;
  resetCollisionPressureStats();
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
  let targetsHeld = 0;
  const positions = new Set<string>();
  for (const slot of [leaderSlot, ...followers]) {
    if (s.e.settled[slot] === 1) settled++;
    if (s.e.order[slot] === Order.Move || s.e.order[slot] === Order.AttackMove) activeOrders++;
    positions.add(`${s.e.x[slot]},${s.e.y[slot]}`);
  }
  for (const slot of followers) {
    if (s.e.order[slot] === Order.Move && s.e.intentTarget[slot] === leader) targetsHeld++;
  }
  const collision = readCollisionPressureStats();

  const elapsedMs = Math.max(0.001, performance.now() - start);
  return {
    name: 'movement-follow',
    seed: opts.seed,
    ticks: s.tick,
    players: 1,
    vision: false,
    observations: 0,
    observedEntities: 0,
    masks: 0,
    bufferObservations: 0,
    commandsGenerated: 0,
    commandResults,
    accepted,
    rejected,
    hash: hashState(s),
    units: followers.length + 1,
    settled,
    activeOrders,
    distinctPositions: positions.size,
    targetsHeld,
    leaderMoved: Math.abs(s.e.x[leaderSlot]! - leaderStartX) + Math.abs(s.e.y[leaderSlot]! - leaderStartY),
    collisionTicks: collision.ticks,
    collisionSolidUnits: collision.solidUnits,
    collisionPairChecks: collision.pairChecks,
    collisionResourceRoutePairSkips: collision.resourceRoutePairSkips,
    collisionOverlapPairs: collision.overlapPairs,
    collisionMaxOverlapFx: collision.maxOverlapFx,
    collisionNudgedUnits: collision.nudgedUnits,
    collisionBlockedNudges: collision.blockedNudges,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number((s.tick / (elapsedMs / 1000)).toFixed(1)),
  };
};

const runBatchSequentialCase = (opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  const envs = 4;
  const sims = Array.from({ length: envs }, (_, i) => new Sim({
    map: generateMap(FACTIONS.length / 2, opts.seed + i),
    players: FACTIONS.length,
    seed: opts.seed + i,
    factions: FACTIONS,
  }));
  const controllers = sims.map(() => makeControllers());
  let commandsGenerated = 0;
  const start = performance.now();
  for (let t = 0; t < opts.ticks; t++) {
    for (let i = 0; i < sims.length; i++) {
      const sim = sims[i]!;
      if (sim.fullState().result.over) continue;
      const batch = batchFor(sim, controllers[i]!, false);
      for (const pc of batch) commandsGenerated += pc.cmds.length;
      sim.step(batch);
    }
  }
  const elapsedMs = Math.max(0.001, performance.now() - start);
  const ticks = sims.reduce((n, sim) => n + sim.tick, 0);
  const hash = sims.reduce((h, sim) => (Math.imul(h ^ sim.hash(), 16777619) >>> 0), 2166136261);
  return {
    name: 'batch-sequential',
    seed: opts.seed,
    ticks,
    players: FACTIONS.length,
    vision: false,
    observations: 0,
    observedEntities: 0,
    masks: 0,
    bufferObservations: 0,
    commandsGenerated,
    envs,
    commandResults: 0,
    accepted: 0,
    rejected: 0,
    hash,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number((ticks / (elapsedMs / 1000)).toFixed(1)),
  };
};

const runObserveLarvaStressCase = (opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  const s = makeState(blankMap('Bench Larva Observation', 128, 128), 1, opts.seed);
  s.trackVision = true;
  s.vision[0]!.fill(2);
  for (let i = 0; i < 32; i++) {
    const x = tileCenter(8 + (i % 8) * 12);
    const y = tileCenter(8 + ((i / 8) | 0) * 14);
    spawnUnit(s, Kind.Hatchery, 0, x, y);
    for (let n = 0; n < 3; n++) spawnUnit(s, Kind.Larva, 0, x + fx((n - 1) * 18), y + fx(24));
  }
  const buffers = createObservationBuffers(s.map, { entities: 192, larva: 64 });
  let bufferObservations = 0;
  let observedEntities = 0;
  const start = performance.now();
  for (let i = 0; i < opts.ticks; i++) {
    const counts = writeObservation(s, 0, buffers);
    bufferObservations++;
    observedEntities += counts.entities;
  }
  const elapsedMs = Math.max(0.001, performance.now() - start);
  return {
    name: 'observe-larva-stress',
    seed: opts.seed,
    ticks: opts.ticks,
    players: 1,
    vision: true,
    observations: 0,
    observedEntities,
    masks: 0,
    bufferObservations,
    commandsGenerated: 0,
    commandResults: 0,
    accepted: 0,
    rejected: 0,
    hash: hashState(s),
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number((opts.ticks / (elapsedMs / 1000)).toFixed(1)),
  };
};

const runCase = (bench: BenchCase, opts: Required<Pick<BenchOptions, 'seed' | 'ticks'>>): BenchResult => {
  if (bench.name === 'movement-follow') return runMovementFollowCase(opts);
  if (bench.name === 'movement-deathball') return runMovementDeathballCase(opts);
  if (bench.name === 'batch-sequential') return runBatchSequentialCase(opts);
  if (bench.name === 'observe-larva-stress') return runObserveLarvaStressCase(opts);
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
  let masks = 0;
  let bufferObservations = 0;
  let commandsGenerated = 0;
  let commandResults = 0;
  let accepted = 0;
  let rejected = 0;
  const obsBuffers = Array.from({ length: players }, () => createObservationBuffers(sim.fullState().map));
  const commandMaskScratch = new Uint8Array(COMMAND_HEADS.length);
  const argMaskScratch = new Uint8Array(128);
  const targetMaskScratch = new Uint8Array(64);
  const batchDecodeScratch = createBatchDecodeReservation(sim.fullState(), 0);
  const batchDecodeResults: ReturnType<typeof decodeActionBatchInto> = [];
  const encodedActions: EncodedAction[] = [];
  const start = performance.now();
  for (let i = 0; i < opts.ticks && !sim.fullState().result.over; i++) {
    if (bench.name === 'bot-generation') {
      const state = sim.fullState();
      for (let p = 0; p < players; p++) commandsGenerated += controllers[p]!(state, p).length;
      sim.step([]);
    } else {
      const batch = batchFor(sim, controllers, bench.resultProbe);
      for (const pc of batch) commandsGenerated += pc.cmds.length;
      const results = sim.step(batch);
      if (bench.resultProbe) {
        commandResults += results.length;
        for (const result of results) {
          if (result.ok) accepted++;
          else rejected++;
        }
      }
    }
    if (bench.observe) {
      for (let p = 0; p < players; p++) {
        const obs = sim.observe(p);
        observations++;
        observedEntities += obs.entities.length;
      }
    }
    if (bench.name === 'observe-buffer') {
      for (let p = 0; p < players; p++) {
        const counts = writeObservation(sim.fullState(), p, obsBuffers[p]!);
        bufferObservations++;
        observedEntities += counts.entities;
      }
    }
    if (bench.name === 'mask-generation') {
      const state = sim.fullState();
      const ids = liveEntityCandidates(state);
      const targetIds = ids.length > targetMaskScratch.length ? ids.slice(0, targetMaskScratch.length) : ids;
      for (let p = 0; p < players; p++) {
        for (const id of ids) {
          writeCommandHeadMask(commandMaskScratch, state, p, id);
          masks += COMMAND_HEADS.length;
          const slot = slotOf(id);
          const x = state.e.x[slot]!;
          const y = state.e.y[slot]!;
          const train = trainKindCandidates(state, id);
          writeTrainKindMask(argMaskScratch, state, p, id, train);
          masks += train.length;
          const build = buildKindCandidates(state, id);
          writeBuildKindMask(argMaskScratch, state, p, id, { x, y, kinds: build });
          masks += build.length;
          const research = researchTechCandidates(state, id);
          writeResearchTechMask(argMaskScratch, state, p, id, research);
          masks += research.length;
          const addons = addonKindCandidates(state, id);
          writeAddonKindMask(argMaskScratch, state, p, id, addons);
          masks += addons.length;
          const transforms = transformKindCandidates(state, id);
          writeTransformKindMask(argMaskScratch, state, p, id, transforms);
          masks += transforms.length;
          const abilities = abilityCandidates(state, id);
          writeAbilityMask(argMaskScratch, state, p, id, { x, y }, abilities);
          masks += abilities.length;
          writeEntityTargetMask(targetMaskScratch, state, p, id, 'attack', targetIds);
          masks += targetIds.length;
        }
        encodedActions.length = 0;
        for (let j = 0; j < Math.min(4, ids.length); j++) {
          const slot = slotOf(ids[j]!);
          encodedActions.push({ head: 'move', actor: ids[j]!, x: state.e.x[slot]!, y: state.e.y[slot]! });
        }
        decodeActionBatchInto(state, p, encodedActions, batchDecodeResults, batchDecodeScratch);
        masks += encodedActions.length;
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
    masks,
    bufferObservations,
    commandsGenerated,
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
