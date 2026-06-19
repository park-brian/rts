import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from '../src/commands/validate.ts';
import type { Command } from '../src/commands/types.ts';
import { Kind } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { simScenario } from '../test-support/scenario.ts';

test('non-commandable actors reject public unit commands through shared validation', () => {
  const scenario = simScenario({ players: 2, seed: 219 });
  const scarab = scenario.spawn(Kind.Scarab, 0, fx(300), fx(300));
  const interceptor = scenario.spawn(Kind.Interceptor, 0, fx(330), fx(300));
  const mine = scenario.spawn(Kind.SpiderMine, 0, fx(360), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(390), fx(300));

  const commands: Command[] = [
    { t: 'move', unit: scarab, x: fx(500), y: fx(300) },
    { t: 'amove', unit: scarab, x: fx(500), y: fx(300) },
    { t: 'patrol', unit: scarab, x: fx(500), y: fx(300) },
    { t: 'attack', unit: interceptor, target: enemy },
    { t: 'hold', unit: mine },
    { t: 'stop', unit: mine },
  ];

  for (const command of commands) {
    assert.deepEqual(validateCommand(scenario.state, 0, command), {
      ok: false,
      reason: 'missing-capability',
    });
  }
});
