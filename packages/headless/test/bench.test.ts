import test from 'node:test';
import assert from 'node:assert/strict';
import { runThroughputBenchmark } from '../src/bench.ts';

test('throughput benchmark exposes stable representative case output', () => {
  const results = runThroughputBenchmark({ seed: 77, ticks: 32 });
  assert.deepEqual(results.map((r) => r.name), [
    'step-no-vision',
    'step-vision',
    'observe-results',
    'observe-buffer',
    'observe-larva-stress',
    'mask-generation',
    'bot-generation',
    'batch-sequential',
    'movement-deathball',
  ]);

  for (const result of results) {
    assert.equal(result.seed, 77);
    if (result.name !== 'batch-sequential') assert.equal(result.ticks, 32);
    assert.ok(result.hash > 0);
    assert.ok(result.elapsedMs > 0);
    assert.ok(result.ticksPerSecond > 0);
    assert.ok(result.masks >= 0);
    assert.ok(result.bufferObservations >= 0);
    assert.ok(result.commandsGenerated >= 0);
  }

  const plain = results[0]!;
  assert.equal(plain.players, 2);
  assert.equal(plain.vision, false);
  assert.equal(plain.observations, 0);
  assert.equal(plain.commandResults, 0);

  const vision = results[1]!;
  assert.equal(vision.players, 2);
  assert.equal(vision.vision, true);
  assert.equal(vision.observations, 0);

  const observed = results[2]!;
  assert.equal(observed.players, 2);
  assert.equal(observed.vision, true);
  assert.equal(observed.observations, observed.players * observed.ticks);
  assert.ok(observed.observedEntities > 0);
  assert.ok(observed.commandResults > 0);
  assert.ok(observed.rejected > 0);
  assert.equal(observed.commandResults, observed.accepted + observed.rejected);

  const buffer = results[3]!;
  assert.equal(buffer.name, 'observe-buffer');
  assert.equal(buffer.bufferObservations, buffer.players * buffer.ticks);
  assert.ok(buffer.observedEntities > 0);

  const larvaStress = results[4]!;
  assert.equal(larvaStress.name, 'observe-larva-stress');
  assert.equal(larvaStress.players, 1);
  assert.equal(larvaStress.bufferObservations, larvaStress.ticks);
  assert.ok(larvaStress.observedEntities > 0);

  const masks = results[5]!;
  assert.equal(masks.name, 'mask-generation');
  assert.ok(masks.masks > 0);

  const bot = results[6]!;
  assert.equal(bot.name, 'bot-generation');
  assert.ok(bot.commandsGenerated >= 0);

  const batch = results[7]!;
  assert.equal(batch.name, 'batch-sequential');
  assert.equal(batch.envs, 4);
  assert.equal(batch.ticks, 32 * 4);
  assert.ok(batch.commandsGenerated > 0);

  const movement = results[8]!;
  assert.equal(movement.players, 1);
  assert.equal(movement.vision, false);
  assert.equal(movement.units, 32);
  assert.equal(movement.commandResults, 32);
  assert.equal(movement.accepted, 32);
  assert.equal(movement.rejected, 0);
  assert.equal(movement.commandResults, movement.accepted + movement.rejected);
  assert.ok(movement.distinctPositions! > 1);
  assert.ok(movement.settled! >= 0);
  assert.ok(movement.activeOrders! >= 0);
  assert.equal(movement.collisionTicks, movement.ticks);
  assert.ok(movement.collisionSolidUnits! >= movement.units);
  assert.ok(movement.collisionPairChecks! >= 0);
  assert.ok(movement.collisionResourceRoutePairSkips! >= 0);
  assert.ok(movement.collisionOverlapPairs! >= 0);
  assert.ok(movement.collisionMaxOverlapFx! >= 0);
  assert.ok(movement.collisionNudgedUnits! >= 0);
  assert.ok(movement.collisionBlockedNudges! >= 0);
});
