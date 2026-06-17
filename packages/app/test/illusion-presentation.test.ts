import test from 'node:test';
import assert from 'node:assert/strict';
import { illusionPresentation } from '../src/illusion-presentation.ts';
import { Sim, fx, sliceMap, spawnUnit, slotOf, Kind } from '../src/sim.ts';

test('illusion presentation is known to owner and spectators but hidden from enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 901 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const slot = slotOf(marine);
  s.e.illusion[slot] = 1;

  assert.equal(illusionPresentation(s, 0, slot).known, true);
  assert.equal(illusionPresentation(s, -1, slot).known, true);
  assert.equal(illusionPresentation(s, 1, slot).known, false);
  assert.equal(illusionPresentation(s, 0, slot).labelPrefix, 'Hallucination ');
  assert.deepEqual(illusionPresentation(s, 1, slot).tint, [1, 1, 1]);
});
