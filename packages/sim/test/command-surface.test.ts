import test from 'node:test';
import assert from 'node:assert/strict';
import type { Command } from '../src/commands/types.ts';
import { COMMAND_TYPES } from '../src/commands/types.ts';
import { commandSpecs } from '../src/commands/specs.ts';
import {
  COMMAND_HEADS, COMMAND_MASK_POLICY, decodeAction, encodeCommand,
} from '../src/io/action-mask.ts';
import { REPLAY_VERSION, parseReplay } from '../src/io/replay.ts';

const sorted = (values: Iterable<string>): string[] => [...values].sort();

const sampleCommands: Command[] = [
  { t: 'train', building: 1, kind: 2 },
  { t: 'research', building: 1, tech: 2 },
  { t: 'build', unit: 1, kind: 2, x: 100, y: 200 },
  { t: 'addon', building: 1, kind: 2 },
  { t: 'lift', building: 1 },
  { t: 'land', building: 1, x: 100, y: 200 },
  { t: 'transform', unit: 1, kind: 2, target: 3 },
  { t: 'burrow', unit: 1, active: true },
  { t: 'mine', unit: 1 },
  { t: 'load', transport: 1, unit: 2 },
  { t: 'unload', transport: 1, unit: 2, x: 100, y: 200 },
  { t: 'cancelBuild', building: 1 },
  { t: 'move', unit: 1, x: 100, y: 200, target: 2, queue: true },
  { t: 'attack', unit: 1, target: 2 },
  { t: 'amove', unit: 1, x: 100, y: 200, queue: true },
  { t: 'ability', unit: 1, ability: 2, target: 3, x: 100, y: 200 },
  { t: 'harvest', unit: 1, patch: 2 },
  { t: 'repair', unit: 1, target: 2 },
  { t: 'rally', building: 1, x: 100, y: 200, target: 2 },
  { t: 'stop', unit: 1 },
];

test('command registry covers specs and action mask heads', () => {
  assert.deepEqual(sorted(Object.keys(commandSpecs)), sorted(COMMAND_TYPES));
  assert.deepEqual(sorted(Object.keys(COMMAND_MASK_POLICY)), sorted(COMMAND_TYPES));
  assert.deepEqual(sorted(COMMAND_HEADS), sorted(COMMAND_TYPES.flatMap((t) => t === 'burrow' ? ['burrow', 'unburrow'] : [t])));
});

test('action encoding round-trips every command type', () => {
  assert.deepEqual(sorted(sampleCommands.map((command) => command.t)), sorted(COMMAND_TYPES));
  for (const command of sampleCommands) {
    assert.deepEqual(decodeAction(encodeCommand(command)), command, `round-trip ${command.t}`);
  }
  assert.deepEqual(decodeAction(encodeCommand({ t: 'burrow', unit: 1, active: false })), { t: 'burrow', unit: 1, active: false });
});

test('replay ingestion accepts every command type', () => {
  const replay = parseReplay(JSON.stringify({
    version: REPLAY_VERSION,
    map: { kind: 'slice' },
    players: 2,
    seed: 1,
    frames: [[{ player: 0, cmds: sampleCommands }]],
  }));

  assert.deepEqual(replay.frames[0]?.[0]?.cmds, sampleCommands);
});
