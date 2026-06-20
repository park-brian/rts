import {
  type CommandType,
  type CountMap,
  type MatchStats,
  type PlayerMatchStats,
} from './sim.ts';

export type MatchHealthDomain = 'strategy' | 'macro' | 'economy' | 'production' | 'combat';
export type MatchHealthStatus = 'healthy' | 'watch' | 'failing';

export type MatchHealthRow = {
  player: number;
  domain: MatchHealthDomain;
  status: MatchHealthStatus;
  severity: number;
  detail: string;
};

const MACRO_COMMANDS: readonly CommandType[] = ['build', 'train', 'research', 'addon', 'transform'];
const COMBAT_COMMANDS: readonly CommandType[] = ['attack', 'amove', 'ability', 'mine'];

const commandCount = (counts: CountMap<CommandType>, types: readonly CommandType[]): number =>
  types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);

const row = (
  player: number,
  domain: MatchHealthDomain,
  status: MatchHealthStatus,
  severity: number,
  detail: string,
): MatchHealthRow => ({
  player,
  domain,
  status,
  severity,
  detail,
});

const macroHealth = (p: PlayerMatchStats): MatchHealthRow => {
  const rejectedRatio = p.commandsIssued > 0 ? p.commandsRejected / p.commandsIssued : 0;
  const macroCommands = commandCount(p.commandsByType, MACRO_COMMANDS);
  if (rejectedRatio >= 0.25) {
    return row(p.player, 'macro', 'failing', p.commandsRejected, `${p.commandsRejected} rejected commands`);
  }
  if (p.commandsRejected > 0) {
    return row(p.player, 'macro', 'watch', p.commandsRejected, `${p.commandsRejected} rejected commands`);
  }
  if (macroCommands > 0) {
    return row(p.player, 'macro', 'healthy', macroCommands, `${macroCommands} macro command attempts`);
  }
  return row(p.player, 'macro', 'watch', 0, 'no macro command attempts');
};

const economyHealth = (p: PlayerMatchStats): MatchHealthRow => {
  if (p.workersCreated > 0 || p.bases > 1) {
    return row(p.player, 'economy', 'healthy', p.workersCreated + Math.max(0, p.bases - 1), `${p.workersCreated} workers made, ${p.bases} bases`);
  }
  if (p.workers > 0) return row(p.player, 'economy', 'watch', p.workers, `${p.workers} workers, no new workers`);
  return row(p.player, 'economy', 'failing', 1, 'no workers remain');
};

const productionHealth = (p: PlayerMatchStats): MatchHealthRow => {
  if (p.combatUnitsCreated > 0) {
    return row(p.player, 'production', 'healthy', p.combatUnitsCreated, `${p.combatUnitsCreated} combat units made`);
  }
  if (p.peakCombatUnits > 0) return row(p.player, 'production', 'watch', p.peakCombatUnits, 'combat force existed, no new combat units');
  return row(p.player, 'production', 'watch', 0, 'no combat production observed');
};

const combatHealth = (p: PlayerMatchStats): MatchHealthRow => {
  const combatCommands = commandCount(p.commandsByType, COMBAT_COMMANDS);
  if (combatCommands > 0) return row(p.player, 'combat', 'healthy', combatCommands, `${combatCommands} combat command attempts`);
  if (p.mineralValueLost + p.gasValueLost > 0) return row(p.player, 'combat', 'failing', p.mineralValueLost + p.gasValueLost, 'lost value without combat commands');
  return row(p.player, 'combat', 'watch', 0, 'no combat commitment observed');
};

export const matchHealthRows = (stats: MatchStats): MatchHealthRow[] =>
  stats.players.flatMap((player) => [
    macroHealth(player),
    economyHealth(player),
    productionHealth(player),
    combatHealth(player),
  ]);
