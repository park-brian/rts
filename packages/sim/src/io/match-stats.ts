import { COMMAND_TYPES, type CommandRejectReason, type CommandResult, type CommandType, type PlayerCommands } from '../commands/types.ts';
import { Role, Units } from '../data/index.ts';
import { CAP, NEUTRAL, type State } from '../entity/world.ts';

export type CountMap<K extends string> = Partial<Record<K, number>>;

export type PlayerMatchStats = {
  player: number;
  team: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  workers: number;
  combatUnits: number;
  structures: number;
  bases: number;
  unitsCreated: number;
  unitsLost: number;
  structuresCreated: number;
  structuresLost: number;
  mineralValueCreated: number;
  gasValueCreated: number;
  mineralValueLost: number;
  gasValueLost: number;
  commandsIssued: number;
  commandsAccepted: number;
  commandsRejected: number;
  commandsByType: CountMap<CommandType>;
  rejectsByReason: CountMap<CommandRejectReason>;
  peakWorkers: number;
  peakCombatUnits: number;
  peakSupplyUsed: number;
  peakMinerals: number;
  peakGas: number;
};

export type MatchStats = {
  players: PlayerMatchStats[];
  startTick: number;
  tick: number;
  winner: number;
  over: boolean;
  prevHi: number;
  prevAlive: Uint8Array;
  prevGen: Uint32Array;
  prevOwner: Uint8Array;
  prevKind: Uint16Array;
};

const blankCounts = <K extends string>(): CountMap<K> => Object.create(null) as CountMap<K>;

const inc = <K extends string>(counts: CountMap<K>, key: K, amount = 1): void => {
  counts[key] = (counts[key] ?? 0) + amount;
};

const playerStats = (player: number, team: number): PlayerMatchStats => ({
  player,
  team,
  minerals: 0,
  gas: 0,
  supplyUsed: 0,
  supplyMax: 0,
  workers: 0,
  combatUnits: 0,
  structures: 0,
  bases: 0,
  unitsCreated: 0,
  unitsLost: 0,
  structuresCreated: 0,
  structuresLost: 0,
  mineralValueCreated: 0,
  gasValueCreated: 0,
  mineralValueLost: 0,
  gasValueLost: 0,
  commandsIssued: 0,
  commandsAccepted: 0,
  commandsRejected: 0,
  commandsByType: blankCounts<CommandType>(),
  rejectsByReason: blankCounts<CommandRejectReason>(),
  peakWorkers: 0,
  peakCombatUnits: 0,
  peakSupplyUsed: 0,
  peakMinerals: 0,
  peakGas: 0,
});

const resetCurrentCounts = (p: PlayerMatchStats): void => {
  p.minerals = 0;
  p.gas = 0;
  p.supplyUsed = 0;
  p.supplyMax = 0;
  p.workers = 0;
  p.combatUnits = 0;
  p.structures = 0;
  p.bases = 0;
};

const recordCurrentEntity = (p: PlayerMatchStats, kind: number): void => {
  const def = Units[kind];
  if (!def) return;
  if ((def.roles & Role.Worker) !== 0) p.workers++;
  if ((def.roles & Role.Structure) !== 0) p.structures++;
  if ((def.roles & Role.ResourceDepot) !== 0) p.bases++;
  if ((def.roles & Role.Mobile) !== 0 && (def.weapon || def.airWeapon) && (def.roles & Role.Worker) === 0) {
    p.combatUnits++;
  }
};

const recordCreated = (p: PlayerMatchStats, kind: number): void => {
  const def = Units[kind];
  if (!def) return;
  if ((def.roles & Role.Structure) !== 0) p.structuresCreated++;
  else p.unitsCreated++;
  p.mineralValueCreated += def.minerals;
  p.gasValueCreated += def.gas;
};

const recordLost = (p: PlayerMatchStats, kind: number): void => {
  const def = Units[kind];
  if (!def) return;
  if ((def.roles & Role.Structure) !== 0) p.structuresLost++;
  else p.unitsLost++;
  p.mineralValueLost += def.minerals;
  p.gasValueLost += def.gas;
};

const refreshSnapshot = (stats: MatchStats, s: State): void => {
  const e = s.e;
  stats.prevHi = e.hi;
  for (let i = 0; i < e.hi; i++) {
    stats.prevAlive[i] = e.alive[i]!;
    stats.prevGen[i] = e.gen[i]!;
    stats.prevOwner[i] = e.owner[i]!;
    stats.prevKind[i] = e.kind[i]!;
  }
};

const refreshCurrentStats = (stats: MatchStats, s: State): void => {
  for (const p of stats.players) resetCurrentCounts(p);

  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const owner = e.owner[i]!;
    if (owner >= stats.players.length || owner === NEUTRAL) continue;
    recordCurrentEntity(stats.players[owner]!, e.kind[i]!);
  }

  for (const p of stats.players) {
    p.team = s.teams[p.player] ?? p.team;
    p.minerals = s.players.minerals[p.player]!;
    p.gas = s.players.gas[p.player]!;
    p.supplyUsed = s.players.supplyUsed[p.player]!;
    p.supplyMax = s.players.supplyMax[p.player]!;
    p.peakWorkers = Math.max(p.peakWorkers, p.workers);
    p.peakCombatUnits = Math.max(p.peakCombatUnits, p.combatUnits);
    p.peakSupplyUsed = Math.max(p.peakSupplyUsed, p.supplyUsed);
    p.peakMinerals = Math.max(p.peakMinerals, p.minerals);
    p.peakGas = Math.max(p.peakGas, p.gas);
  }
};

const recordLifecycleDeltas = (stats: MatchStats, s: State): void => {
  const e = s.e;
  const hi = Math.max(stats.prevHi, e.hi);
  for (let i = 0; i < hi; i++) {
    const wasAlive = stats.prevAlive[i] === 1;
    const isAlive = i < e.hi && e.alive[i] === 1;
    const sameGeneration = isAlive && stats.prevGen[i] === e.gen[i];

    if (wasAlive && (!isAlive || !sameGeneration)) {
      const owner = stats.prevOwner[i]!;
      if (owner < stats.players.length && owner !== NEUTRAL) recordLost(stats.players[owner]!, stats.prevKind[i]!);
    }
    if (isAlive && (!wasAlive || !sameGeneration)) {
      const owner = e.owner[i]!;
      if (owner < stats.players.length && owner !== NEUTRAL) recordCreated(stats.players[owner]!, e.kind[i]!);
    }
  }
};

const recordCommandStats = (
  stats: MatchStats,
  batch: readonly PlayerCommands[],
  results: readonly CommandResult[],
): void => {
  for (const pc of batch) {
    const p = stats.players[pc.player];
    if (!p) continue;
    for (const command of pc.cmds) {
      p.commandsIssued++;
      inc(p.commandsByType, command.t);
    }
  }

  for (const result of results) {
    const p = stats.players[result.player];
    if (!p) continue;
    if (result.ok) p.commandsAccepted++;
    else {
      p.commandsRejected++;
      inc(p.rejectsByReason, result.reason);
    }
  }
};

export const createMatchStats = (s: State): MatchStats => {
  const stats: MatchStats = {
    players: Array.from({ length: s.players.minerals.length }, (_, player) =>
      playerStats(player, s.teams[player] ?? player)),
    startTick: s.tick,
    tick: s.tick,
    winner: s.result.winner,
    over: s.result.over,
    prevHi: 0,
    prevAlive: new Uint8Array(CAP),
    prevGen: new Uint32Array(CAP),
    prevOwner: new Uint8Array(CAP),
    prevKind: new Uint16Array(CAP),
  };
  for (const type of COMMAND_TYPES) {
    for (const p of stats.players) p.commandsByType[type] = 0;
  }
  refreshSnapshot(stats, s);
  refreshCurrentStats(stats, s);
  return stats;
};

export const recordMatchStatsStep = (
  stats: MatchStats,
  s: State,
  batch: readonly PlayerCommands[],
  results: readonly CommandResult[],
): MatchStats => {
  recordCommandStats(stats, batch, results);
  recordLifecycleDeltas(stats, s);
  refreshCurrentStats(stats, s);
  refreshSnapshot(stats, s);
  stats.tick = s.tick;
  stats.over = s.result.over;
  stats.winner = s.result.winner;
  return stats;
};
