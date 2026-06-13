import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { count, eid, kill } from '../src/world.ts';
import { Kind, Units, computeDamage } from '../src/data.ts';
import { fx } from '../src/fixed.ts';

test('two enemy marines fight and at least one dies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 5 });
  const s = sim.fullState();
  const a = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const b = spawnUnit(s, Kind.Marine, 1, fx(410), fx(400));

  sim.step([
    { player: 0, cmds: [{ t: 'attack', unit: a, target: b }] },
    { player: 1, cmds: [{ t: 'attack', unit: b, target: a }] },
  ]);
  for (let t = 0; t < 200 && count(sim.fullState(), Kind.Marine, 0) + count(sim.fullState(), Kind.Marine, 1) === 2; t++) {
    sim.step([]);
  }
  const remaining = count(sim.fullState(), Kind.Marine, 0) + count(sim.fullState(), Kind.Marine, 1);
  assert.ok(remaining < 2, `combat should kill a marine (remaining=${remaining})`);
});

test('damage respects type/size/armor', () => {
  const marine = Units[Kind.Marine]!.weapon!; // Normal 6
  assert.equal(computeDamage(marine, 2 /*Large*/, 1), 5); // 100% then -1 armor
  assert.equal(computeDamage(marine, 0 /*Small*/, 0), 6);
  // Concussive 20 vs Large = 25% = 5, minus 0 armor
  const conc = { damage: 20, dtype: 1, cooldown: 1, range: 1 };
  assert.equal(computeDamage(conc, 2 /*Large*/, 0), 5);
  assert.equal(computeDamage(conc, 0 /*Small*/, 0), 20);
});

test('destroying a team\'s last structure ends the game', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 6 });
  const s = sim.fullState();
  assert.equal(s.result.over, false);

  // Kill player 1's command center (their only structure).
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 1) kill(s, i);
  }
  sim.step([]);
  assert.equal(sim.fullState().result.over, true);
  assert.equal(sim.fullState().result.winner, 0, 'player 0 (team 0) wins');
});

test('a worker constructs a supply depot, raising the supply cap', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 7 });
  const s = sim.fullState();
  for (let t = 0; t < 400; t++) sim.step([]); // mine enough minerals

  // Find an SCV and the command center position.
  let scv = -1;
  let cc = -1;
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] !== 1 || s.e.owner[i] !== 0) continue;
    if (s.e.kind[i] === Kind.SCV) scv = i;
    if (s.e.kind[i] === Kind.CommandCenter) cc = i;
  }
  assert.ok(scv >= 0 && cc >= 0);
  const capBefore = s.players.supplyMax[0]!;

  sim.step([
    { player: 0, cmds: [{ t: 'build', unit: eid(s.e, scv), kind: Kind.SupplyDepot, x: s.e.x[cc]! + fx(96), y: s.e.y[cc]! }] },
  ]);
  for (let t = 0; t < Units[Kind.SupplyDepot]!.buildTime + 100; t++) sim.step([]);

  assert.equal(count(sim.fullState(), Kind.SupplyDepot, 0), 1, 'depot built');
  assert.equal(sim.fullState().players.supplyMax[0], capBefore + Units[Kind.SupplyDepot]!.provides, 'cap raised');
});
