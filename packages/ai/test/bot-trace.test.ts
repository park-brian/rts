import assert from 'node:assert/strict';
import test from 'node:test';
import { Kind, Sim, Terran, sliceMap, spawnUnit } from '@rts/sim';
import { botTraceFrame, createBotPlanner } from '../src/index.ts';

test('bot trace frame exposes facts, commands, intents, and outcomes', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8101, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 500;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.tick, s.tick);
  assert.equal(frame.player, 0);
  assert.equal(frame.workers, Terran.startWorkers);
  assert.equal(frame.bases, 1);
  assert.equal(frame.minerals, 500);
  assert.equal(frame.commandsIssued, plan.commands.length);
  assert.equal(frame.commandsByType.train! > 0 || frame.commandsByType.build! > 0, true);
  assert.equal(frame.intentsByKind['train-worker']! > 0 || frame.intentsByKind['add-production']! > 0, true);
  assert.equal(frame.outcomesByStatus.done! + frame.outcomesByStatus.waiting! + frame.outcomesByStatus.blocked! + frame.outcomesByStatus.failed!,
    plan.intentResults.length);
});

test('bot trace frame records waiting reasons when production is blocked', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8102, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 0;
  const plan = createBotPlanner(Terran, { workerTarget: 99, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.intentsByKind['train-worker']! > 0, true);
  assert.equal(frame.waitsByReason['resource-starved']! > 0, true);
  assert.equal(frame.commandsByType.train, 0);
  assert.equal(frame.commandsByType.build, 0);
});

test('bot trace frame reports combat commitment commands', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8103, factions: [Terran, Terran] });
  const s = sim.fullState();
  const e = s.e;
  let base = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.CommandCenter) base = i;
  }
  for (let n = 0; n < 4; n++) {
    spawnUnit(s, Kind.Marine, 0, e.x[base]! + n * 128, e.y[base]!);
  }
  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.army >= 4, true);
  assert.equal((frame.commandsByType.attack ?? 0) + (frame.commandsByType.amove ?? 0) > 0, true);
  assert.equal(frame.intentsByKind['attack-wave']! + frame.intentsByKind.harass! + frame.intentsByKind.counterattack! > 0, true);
});
