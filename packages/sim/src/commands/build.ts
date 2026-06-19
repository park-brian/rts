import type { Command } from './types.ts';
import { Order, Role, Units, workerBuildKindsFor } from '../data/index.ts';
import { cancelPendingBuild, hasPendingBuild } from '../mechanics/build-cancel.ts';
import { requirementsMet } from '../mechanics/requirements.ts';
import { canPlaceStructure, placementForStructure, type PlacementResult } from '../mechanics/placement.ts';
import type { State } from '../entity/world.ts';
import { NONE, canSpawnEntity, slotOf } from '../entity/world.ts';
import { isContained } from '../mechanics/cargo.ts';
import {
  canPay,
  reject,
  rejectMissingOwnedSlot,
  ownedSlot,
  type CommandValidation,
} from './shared.ts';

type BuildCommand = Extract<Command, { t: 'build' }>;

const playerExists = (s: State, player: number): boolean => player >= 0 && player < s.teams.length;

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
  const payment = canPay(
    s,
    player,
    { minerals: def.minerals, gas: def.gas },
    { minerals: refundableMinerals, gas: refundableGas },
  );
  if (!payment.ok) return payment;
  const placement = canPlaceStructure(s, player, workerSlot, kind, x, y);
  return placement.ok ? { ok: true } : reject(placement.reason);
};

export const validateBuildCommand = (s: State, player: number, command: BuildCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
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

export const applyBuildCommand = (s: State, player: number, command: BuildCommand): void => {
  const slot = slotOf(command.unit);
  const placement = placementForStructure(s, command.kind, command.x, command.y, slot, player);
  if (placement.ok) beginWorkerBuild(s, slot, command.kind, placement, player);
};
