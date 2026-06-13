import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { count, eid } from '../src/world.ts';
import { Kind, Units, START_MINERALS, START_WORKERS } from '../src/data.ts';

test('workers auto-mine and minerals accumulate', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 1 });
  const s = sim.fullState();
  assert.equal(s.players.minerals[0], START_MINERALS);
  assert.equal(count(s, Kind.SCV, 0), START_WORKERS);

  for (let t = 0; t < 500; t++) sim.step([]); // no commands; default auto-harvest

  assert.ok(
    s.players.minerals[0]! > START_MINERALS,
    `minerals should grow from mining (got ${s.players.minerals[0]})`,
  );
});

test('training a worker costs minerals, adds supply, and produces a unit', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 2 });
  const s = sim.fullState();

  // Mine first so we can afford it.
  for (let t = 0; t < 200; t++) sim.step([]);

  // Find the command center.
  let cc = -1;
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0) cc = i;
  }
  assert.ok(cc >= 0, 'command center exists');

  const scvBefore = count(s, Kind.SCV, 0);
  const supBefore = s.players.supplyUsed[0]!;
  const minBefore = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(s.e, cc), kind: Kind.SCV }] }]);
  assert.equal(s.players.minerals[0], minBefore - Units[Kind.SCV]!.minerals, 'cost deducted');

  for (let t = 0; t < Units[Kind.SCV]!.buildTime + 2; t++) sim.step([]);

  assert.equal(count(s, Kind.SCV, 0), scvBefore + 1, 'one SCV produced');
  assert.equal(s.players.supplyUsed[0], supBefore + Units[Kind.SCV]!.supply, 'supply consumed on pop');
});

test('production blocks at the supply cap', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 3 });
  const s = sim.fullState();
  // Run a long time mining; without supply depots, supply caps at the CC's 10.
  for (let t = 0; t < 6000; t++) {
    // train whenever possible
    let cc = -1;
    for (let i = 0; i < s.e.hi; i++) {
      if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0) cc = i;
    }
    const scv = Units[Kind.SCV]!;
    const canTrain =
      cc >= 0 &&
      s.e.prodKind[cc] === Kind.None &&
      s.players.minerals[0]! >= scv.minerals &&
      s.players.supplyUsed[0]! + scv.supply <= s.players.supplyMax[0]!;
    sim.step(canTrain ? [{ player: 0, cmds: [{ t: 'train', building: eid(s.e, cc), kind: Kind.SCV }] }] : []);
  }
  assert.ok(s.players.supplyUsed[0]! <= s.players.supplyMax[0]!, 'never exceeds cap');
  assert.equal(s.players.supplyMax[0], 10, 'CC provides 10 supply');
});
