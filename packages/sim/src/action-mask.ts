// Validator-backed command-head masks for UI, AI, and future RL policies.
// This layer is intentionally declarative: every bit is derived by asking the
// authoritative command validator about one representative command.

import type { Command } from './commands.ts';
import type { State } from './world.ts';
import { isAlive, NONE, slotOf } from './world.ts';
import { validateCommand } from './validation.ts';
import { Role, Units, workerBuildKindsFor } from './data.ts';

export const COMMAND_HEADS = [
  'move',
  'amove',
  'stop',
  'attack',
  'harvest',
  'repair',
  'rally',
  'burrow',
  'unburrow',
  'mine',
] as const;

export type CommandHead = typeof COMMAND_HEADS[number];
export type CommandMaskOptions = {
  target?: number;
  x?: number;
  y?: number;
};
export type BuildMaskOptions = {
  x: number;
  y: number;
  kinds?: readonly number[];
};

const COMMAND_HEAD_INDEX = Object.fromEntries(
  COMMAND_HEADS.map((head, index) => [head, index]),
) as Record<CommandHead, number>;

const actorPoint = (s: State, actor: number, opts: CommandMaskOptions): { x: number; y: number } => {
  if (opts.x !== undefined && opts.y !== undefined) return { x: opts.x, y: opts.y };
  if (!isAlive(s.e, actor)) return { x: opts.x ?? 0, y: opts.y ?? 0 };
  const slot = slotOf(actor);
  return { x: opts.x ?? s.e.x[slot]!, y: opts.y ?? s.e.y[slot]! };
};

export const commandHeadIndex = (head: CommandHead): number => COMMAND_HEAD_INDEX[head];

export const commandHeadAllowed = (mask: Uint8Array, head: CommandHead): boolean =>
  mask[commandHeadIndex(head)] === 1;

export const commandForHead = (
  s: State,
  actor: number,
  head: CommandHead,
  opts: CommandMaskOptions = {},
): Command => {
  const point = actorPoint(s, actor, opts);
  const target = opts.target ?? NONE;
  switch (head) {
    case 'move':
      return { t: 'move', unit: actor, x: point.x, y: point.y };
    case 'amove':
      return { t: 'amove', unit: actor, x: point.x, y: point.y };
    case 'stop':
      return { t: 'stop', unit: actor };
    case 'attack':
      return { t: 'attack', unit: actor, target };
    case 'harvest':
      return { t: 'harvest', unit: actor, patch: target };
    case 'repair':
      return { t: 'repair', unit: actor, target };
    case 'rally':
      return target === NONE
        ? { t: 'rally', building: actor, x: point.x, y: point.y }
        : { t: 'rally', building: actor, x: point.x, y: point.y, target };
    case 'burrow':
      return { t: 'burrow', unit: actor, active: true };
    case 'unburrow':
      return { t: 'burrow', unit: actor, active: false };
    case 'mine':
      return { t: 'mine', unit: actor };
  }
};

export const commandHeadMask = (
  s: State,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
): Uint8Array => {
  const mask = new Uint8Array(COMMAND_HEADS.length);
  for (let i = 0; i < COMMAND_HEADS.length; i++) {
    const command = commandForHead(s, actor, COMMAND_HEADS[i]!, opts);
    mask[i] = validateCommand(s, player, command).ok ? 1 : 0;
  }
  return mask;
};

const actorKind = (s: State, actor: number): number => {
  if (!isAlive(s.e, actor)) return 0;
  return s.e.kind[slotOf(actor)]!;
};

export const trainKindCandidates = (s: State, producer: number): readonly number[] => {
  const def = Units[actorKind(s, producer)];
  return def?.produces ?? [];
};

export const buildKindCandidates = (s: State, worker: number): readonly number[] => {
  const def = Units[actorKind(s, worker)];
  return def && (def.roles & Role.Worker) !== 0 ? workerBuildKindsFor(def.race) : [];
};

export const trainKindMask = (
  s: State,
  player: number,
  producer: number,
  kinds: readonly number[] = trainKindCandidates(s, producer),
): Uint8Array => {
  const mask = new Uint8Array(kinds.length);
  for (let i = 0; i < kinds.length; i++) {
    mask[i] = validateCommand(s, player, { t: 'train', building: producer, kind: kinds[i]! }).ok ? 1 : 0;
  }
  return mask;
};

export const buildKindMask = (
  s: State,
  player: number,
  worker: number,
  opts: BuildMaskOptions,
): Uint8Array => {
  const kinds = opts.kinds ?? buildKindCandidates(s, worker);
  const mask = new Uint8Array(kinds.length);
  for (let i = 0; i < kinds.length; i++) {
    mask[i] = validateCommand(s, player, { t: 'build', unit: worker, kind: kinds[i]!, x: opts.x, y: opts.y }).ok ? 1 : 0;
  }
  return mask;
};
