import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Units } from '../src/data.ts';
import { BW_BODY_BOUNDS, bodyBounds } from '../src/spatial.ts';
import { fx } from '../src/fixed.ts';

test('current unit registry has explicit BW body bounds', () => {
  for (const kind of Object.keys(Units).map(Number)) {
    assert.ok(BW_BODY_BOUNDS[kind], `${Units[kind]!.name} is missing BW body bounds`);
  }
});

test('building and resource bodies preserve BW footprint-relevant dimensions', () => {
  assert.deepEqual(bodyBounds(Kind.Nexus), { left: fx(56), up: fx(39), right: fx(56), down: fx(39) });
  assert.deepEqual(bodyBounds(Kind.CommandCenter), { left: fx(58), up: fx(41), right: fx(58), down: fx(41) });
  assert.deepEqual(bodyBounds(Kind.Gateway), { left: fx(48), up: fx(32), right: fx(48), down: fx(40) });
  assert.deepEqual(bodyBounds(Kind.Geyser), { left: fx(64), up: fx(32), right: fx(63), down: fx(31) });
});
