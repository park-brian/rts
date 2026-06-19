import type { Command, CommandRejectReason } from './commands.ts';
import { Order, Role, Units, workerBuildKindsFor } from './data.ts';
import { cancelPendingBuild, hasPendingBuild } from './build-cost.ts';
import { requirementsMet } from './requirements.ts';
import { canPlaceStructure, type PlacementResult } from './placement.ts';
import type { State } from './world.ts';
import { NONE, canSpawnEntity, isAlive, slotOf } from './world.ts';
import { isContained } from './cargo.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type BuildCommand = Extract<Command, { t: 'build' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });
const playerExists = (s: State, player: number): boolean => player >= 0 && player < s.teams.length;

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

const canBuildWithWorker = (workerKind: number, structureKind: number): boolean => {
  const worker = Units[workerKind];
  const structure = Units[structureKind];
  if (!worker || !structure || worker.race !== structure.race) return false;
  return workerBuildKindsFor(worker.race).includes(structureKind);
};

export const canWorkerStartStructure = (
  s: State,
  player: number,
  workerSlot: number,
  kind: number,
): CommandValidation => {
  if (!playerExists(s, player)) return reject('wrong-owner');
  const e = s.e;
  if (workerSlot < 0 || workerSlot >= e.hi || e.alive[workerSlot] !== 1) return reject('stale-entity');
  if (e.owner[workerSlot] !== player) return reject('wrong-owner');
  if (isContained(s, workerSlot) || e.burrowed[workerSlot] === 1 || e.illusion[workerSlot] === 1) {
    return reject('missing-capability');
  }
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0 || (e.flags[workerSlot]! & Role.Worker) === 0 ||
      !canBuildWithWorker(e.kind[workerSlot]!, kind)) {
    return reject('missing-capability');
  }
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  return { ok: true };
};

export const validateWorkerBuild = (
  s: State,
  player: number,
  workerSlot: number,
  kind: number,
  x: number,
  y: number,
): CommandValidation => {
  const e = s.e;
  const def = Units[kind];
  const buildableByWorker = canWorkerStartStructure(s, player, workerSlot, kind);
  if (!buildableByWorker.ok) return buildableByWorker;
  if (!def) return reject('missing-capability');
  const refundableMinerals = hasPendingBuild(e, workerSlot) ? e.buildCostMinerals[workerSlot]! : 0;
  const refundableGas = hasPendingBuild(e, workerSlot) ? e.buildCostGas[workerSlot]! : 0;
  if (s.players.minerals[player]! + refundableMinerals < def.minerals ||
      s.players.gas[player]! + refundableGas < def.gas) {
    return reject('not-affordable');
  }
  const placement = canPlaceStructure(s, player, workerSlot, kind, x, y);
  return placement.ok ? { ok: true } : reject(placement.reason);
};

export const validateBuildCommand = (s: State, player: number, command: BuildCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  const def = Units[command.kind];
  if (def && def.buildMethod !== 'morph' && !canSpawnEntity(s)) return reject('capacity-full');
  return validateWorkerBuild(s, player, slot, command.kind, command.x, command.y);
};

export const beginWorkerBuild = (
  s: State,
  workerSlot: number,
  kind: number,
  placement: Extract<PlacementResult, { ok: true }>,
  player: number,
): void => {
  const e = s.e;
  const def = Units[kind];
  if (!def) return;
  if (hasPendingBuild(e, workerSlot)) cancelPendingBuild(s, workerSlot);
  e.settled[workerSlot] = 0;
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
  e.order[workerSlot] = Order.Build;
  e.buildKind[workerSlot] = kind;
  e.buildCostMinerals[workerSlot] = def.minerals;
  e.buildCostGas[workerSlot] = def.gas;
  e.target[workerSlot] = NONE;
  e.intentTarget[workerSlot] = NONE;
  e.combatTarget[workerSlot] = NONE;
  e.tx[workerSlot] = placement.x;
  e.ty[workerSlot] = placement.y;
};
