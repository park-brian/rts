import {
  Kind,
  NONE,
  Role,
  Units,
  eid,
  isEnemy,
  productionCount,
  validateCommand,
  type Command,
  type Controller,
  type State,
} from '@rts/sim';
import { maybeQueueStructureAtPoint, type ResourceBudget } from '../src/macro-build.ts';
import { findSpot } from '../src/macro-placement.ts';

const BARRACKS_TARGET = 4;
const SUPPLY_BUFFER = 8;

const firstEnemyTarget = (s: State, player: number): number => {
  const e = s.e;
  let fallback = NONE;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !isEnemy(s, player, e.owner[i]!)) continue;
    if ((e.flags[i]! & Role.ResourceDepot) !== 0) return i;
    if (fallback === NONE) fallback = i;
  }
  return fallback;
};

const firstOwned = (s: State, player: number, kind: number): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === kind) return i;
  }
  return NONE;
};

const firstIdleWorker = (s: State, player: number): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (
      e.alive[i] === 1 &&
      e.owner[i] === player &&
      e.built[i] === 1 &&
      (e.flags[i]! & Role.Worker) !== 0 &&
      e.buildKind[i] === Kind.None
    ) return i;
  }
  return NONE;
};

const ownedOrPendingStructureCount = (s: State, player: number, kind: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === kind) count++;
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === kind) count++;
  }
  return count;
};

const pendingStructureCount = (s: State, player: number, kind: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === kind && e.built[i] !== 1) count++;
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === kind) count++;
  }
  return count;
};

const maybeBuild = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  kind: number,
): boolean => {
  const worker = firstIdleWorker(s, player);
  const anchor = firstOwned(s, player, Kind.CommandCenter);
  if (worker === NONE || anchor === NONE) return false;
  return maybeQueueStructureAtPoint(
    s,
    player,
    cmds,
    budget,
    worker,
    kind,
    s.e.x[anchor]!,
    s.e.y[anchor]!,
    findSpot,
  );
};

const maybeBuildMacroStructure = (s: State, player: number, cmds: Command[], budget: ResourceBudget): void => {
  const futureSupply =
    s.players.supplyMax[player]! +
    pendingStructureCount(s, player, Kind.SupplyDepot) * Units[Kind.SupplyDepot]!.provides;
  if (futureSupply - s.players.supplyUsed[player]! <= SUPPLY_BUFFER) {
    if (maybeBuild(s, player, cmds, budget, Kind.SupplyDepot)) return;
  }
  if (ownedOrPendingStructureCount(s, player, Kind.Barracks) < BARRACKS_TARGET) {
    maybeBuild(s, player, cmds, budget, Kind.Barracks);
  }
};

const maybeTrain = (
  s: State,
  player: number,
  cmds: Command[],
  producer: number,
  kind: number,
  budget: ResourceBudget,
  reservedSupply: { value: number },
): void => {
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return;
  const command: Command = { t: 'train', building: eid(s.e, producer), kind };
  if (!validateCommand(s, player, command, { reservedSupply: reservedSupply.value }).ok) return;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  reservedSupply.value += def.supply * productionCount(kind);
};

/**
 * Deliberately crude pressure opponent: build toward four Barracks, keep SCVs
 * and Marines queued, then send every completed Marine at the enemy depot. It is
 * a regression baseline for bot freezing, not a strategic bot.
 */
export const createAggressiveMarineBot = (): Controller => {
  return (s: State, player: number): Command[] => {
    const e = s.e;
    const cmds: Command[] = [];
    const budget: ResourceBudget = { minerals: s.players.minerals[player]!, gas: s.players.gas[player]! };
    const reservedSupply = { value: s.players.supplyUsed[player]! };
    const target = firstEnemyTarget(s, player);

    maybeBuildMacroStructure(s, player, cmds, budget);

    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1) continue;
      const kind = e.kind[i]!;
      if (kind === Kind.CommandCenter) maybeTrain(s, player, cmds, i, Kind.SCV, budget, reservedSupply);
      if (kind === Kind.Barracks) maybeTrain(s, player, cmds, i, Kind.Marine, budget, reservedSupply);
      if (kind === Kind.Marine && target !== NONE) {
        const command: Command = { t: 'attack', unit: eid(e, i), target: eid(e, target) };
        if (validateCommand(s, player, command).ok) cmds.push(command);
      }
    }
    return cmds;
  };
};
