import {
  Factions, Sim, mapFromSpec, parseReplay, toReplay,
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
  playerTeamIds: number[];
  setupRaceNames: FactionName[];
  setupTeamIds: number[];
  playerEnabled: boolean[];
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
  playerTeamIds: number[];
  replayTick: number;
  replaySpeed: number;
  paused: boolean;
};

export const normalizeRace = (race: string | undefined): FactionName =>
  race === 'protoss' || race === 'zerg' ? race : 'terran';

export const defaultRaceNames = (players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => RACE_NAMES[i % RACE_NAMES.length]!);

export const defaultTeamIds = (players: number): number[] =>
  Array.from({ length: players }, (_, i) => i < players / 2 ? 0 : 1);

export const defaultPlayerEnabled = (players: number): boolean[] =>
  Array.from({ length: players }, () => true);

export const normalizePlayerEnabled = (enabled: readonly boolean[] | undefined, players: number): boolean[] =>
  enabled && enabled.length === players ? enabled.map(Boolean) : defaultPlayerEnabled(players);

const activeSetupSlots = (enabled: readonly boolean[]): number[] => {
  const active = enabled.map((on, slot) => on ? slot : -1).filter((slot) => slot >= 0);
  return active.length >= 2 ? active : enabled.map((_, slot) => slot);
};

export const normalizeTeamIds = (teams: readonly number[] | undefined, players: number): number[] =>
  teams && teams.length === players
    ? teams.map((team) => Math.max(0, Math.trunc(team)))
    : defaultTeamIds(players);

export const mapSpecFor = (perTeam: number, seed: number, spec?: MapSpec): MapSpec => {
  if (spec?.kind === 'procedural') return { ...spec, perTeam, seed };
  return { kind: 'procedural', perTeam, seed, preset: 'teamPlateaus', midfield: 'empty' };
};

export const exportReplayJson = (sim: Sim, replay: Replay | null, spec: MapSpec): string | null => {
  const r = replay ?? (sim.frames ? toReplay(sim, spec) : null);
  return r ? JSON.stringify(r) : null;
};

export const parseReplayJson = (json: string): Replay => parseReplay(json);

export const createPlaySession = (
  mode: Mode,
  mapSpec: MapSpec,
  raceNames: readonly string[],
  humanPlayer: number,
  teamIds?: readonly number[],
  enabledSlots?: readonly boolean[],
): PlaySession => {
  const perTeam = mapSpec.kind === 'procedural' ? mapSpec.perTeam : 1;
  const seed = mapSpec.kind === 'procedural' ? mapSpec.seed : 1;
  const setupPlayers = perTeam * 2;
  const setupRaceNames = raceNames.length === setupPlayers
    ? raceNames.map(normalizeRace)
    : defaultRaceNames(setupPlayers);
  const setupTeamIds = normalizeTeamIds(teamIds, setupPlayers);
  const playerEnabled = normalizePlayerEnabled(enabledSlots, setupPlayers);
  const startSlots = activeSetupSlots(playerEnabled);
  const players = startSlots.length;
  const playerRaceNames = startSlots.map((slot) => setupRaceNames[slot]!);
  const playerTeamIds = startSlots.map((slot) => setupTeamIds[slot]!);
  const requestedHumanSlot = Math.max(0, Math.min(setupPlayers - 1, humanPlayer));
  const activeHuman = startSlots.indexOf(requestedHumanSlot);
  const normalizedHuman = activeHuman >= 0 ? activeHuman : 0;
  const resolvedHumanSlot = startSlots[normalizedHuman] ?? requestedHumanSlot;
  const factions: Faction[] = playerRaceNames.map((race) => Factions[race]);
  const map = mapFromSpec(mapSpec);
  const sim = new Sim({ map, players, seed, record: true, vision: true, factions, teams: playerTeamIds, startSlots });
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
    humanPlayer: resolvedHumanSlot,
    playerRaceNames,
    playerTeamIds,
    setupRaceNames,
    setupTeamIds,
    playerEnabled,
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
  const playerTeamIds = normalizeTeamIds(replay.teams, replay.players);
  const map = mapFromSpec(replay.map);
  const factions = playerRaceNames.map((race) => Factions[race]);
  const sim = new Sim({
    map,
    players: replay.players,
    seed: replay.seed,
    vision: true,
    factions,
    teams: playerTeamIds,
    startSlots: replay.startSlots,
  });
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
    playerTeamIds,
    replayTick: 0,
    replaySpeed: 1,
    paused: false,
  };
};

export const createReplaySeekSim = (replay: Replay, map: MapDef): Sim => {
  const races = replay.factions ? replay.factions.map(normalizeRace) : defaultRaceNames(replay.players);
  const factions = races.map((race) => Factions[race]);
  return new Sim({
    map,
    players: replay.players,
    seed: replay.seed,
    vision: true,
    factions,
    teams: normalizeTeamIds(replay.teams, replay.players),
    startSlots: replay.startSlots,
  });
};
