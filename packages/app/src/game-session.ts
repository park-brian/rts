import {
  Factions, Sim, generateMap, mapFromSpec, parseReplay, toReplay,
  type Controller, type Faction, type FactionName, type MapDef, type MapSpec, type Replay,
} from './sim.ts';
import {
  botDiagnosticController,
  createBotDiagnostics,
  type AppBotDiagnostics,
} from './bot-diagnostics.ts';
import type { Mode } from './store.ts';

const RACE_NAMES: FactionName[] = ['terran', 'protoss', 'zerg'];

export type PlaySession = {
  mode: Mode;
  seed: number;
  perTeam: number;
  players: number;
  map: MapDef;
  sim: Sim;
  human: number;
  humanPlayer: number;
  playerRaceNames: FactionName[];
  controllers: (Controller | null)[];
  botDiagnostics: AppBotDiagnostics[];
};

export type ReplaySession = {
  replay: Replay;
  mode: 'replay';
  perTeam: number;
  seed: number;
  map: MapDef;
  sim: Sim;
  human: -1;
  controllers: [];
  botDiagnostics: [];
  playerRaceNames: FactionName[];
  replayTick: number;
  replaySpeed: number;
  paused: boolean;
};

export const normalizeRace = (race: string | undefined): FactionName =>
  race === 'protoss' || race === 'zerg' ? race : 'terran';

export const defaultRaceNames = (players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => RACE_NAMES[i % RACE_NAMES.length]!);

export const mapSpecFor = (perTeam: number, seed: number): MapSpec =>
  ({ kind: 'procedural', perTeam, seed });

export const exportReplayJson = (sim: Sim, replay: Replay | null, spec: MapSpec): string | null => {
  const r = replay ?? (sim.frames ? toReplay(sim, spec) : null);
  return r ? JSON.stringify(r) : null;
};

export const parseReplayJson = (json: string): Replay => parseReplay(json);

export const createPlaySession = (
  mode: Mode,
  seed: number,
  perTeam: number,
  raceNames: readonly string[],
  humanPlayer: number,
): PlaySession => {
  const players = perTeam * 2;
  const playerRaceNames = raceNames.length === players
    ? raceNames.map(normalizeRace)
    : defaultRaceNames(players);
  const normalizedHuman = Math.max(0, Math.min(players - 1, humanPlayer));
  const factions: Faction[] = playerRaceNames.map((race) => Factions[race]);
  const map = generateMap(perTeam, seed);
  const sim = new Sim({ map, players, seed, record: true, vision: true, factions });
  const botDiagnostics = createBotDiagnostics(players, factions);
  const human = mode === 'play' ? normalizedHuman : -1;
  const controllers = Array.from({ length: players }, (_, p) =>
    mode === 'play' && p === normalizedHuman ? null : botDiagnosticController(botDiagnostics[p]!));
  return {
    mode,
    seed,
    perTeam,
    players,
    map,
    sim,
    human,
    humanPlayer: normalizedHuman,
    playerRaceNames,
    controllers,
    botDiagnostics,
  };
};

export const replayFromCurrent = (sim: Sim, spec: MapSpec): Replay | null =>
  sim.frames ? toReplay(sim, spec) : null;

export const createReplaySession = (
  replay: Replay,
  fallbackPerTeam: number,
  fallbackSeed: number,
): ReplaySession => {
  const perTeam = replay.map.kind === 'procedural' ? replay.map.perTeam : fallbackPerTeam;
  const seed = replay.map.kind === 'procedural' ? replay.map.seed : fallbackSeed;
  const playerRaceNames = replay.factions ? replay.factions.map(normalizeRace) : defaultRaceNames(replay.players);
  const map = mapFromSpec(replay.map);
  const factions = playerRaceNames.map((race) => Factions[race]);
  const sim = new Sim({ map, players: replay.players, seed: replay.seed, vision: true, factions });
  return {
    replay,
    mode: 'replay',
    perTeam,
    seed,
    map,
    sim,
    human: -1,
    controllers: [],
    botDiagnostics: [],
    playerRaceNames,
    replayTick: 0,
    replaySpeed: 1,
    paused: false,
  };
};

export const createReplaySeekSim = (replay: Replay, map: MapDef): Sim => {
  const races = replay.factions ? replay.factions.map(normalizeRace) : defaultRaceNames(replay.players);
  const factions = races.map((race) => Factions[race]);
  return new Sim({ map, players: replay.players, seed: replay.seed, vision: true, factions });
};
