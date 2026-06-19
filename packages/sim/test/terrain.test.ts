import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import type { MapDef } from '../src/map/core.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { Kind, TILE, Units } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { eid, kill, slotOf } from '../src/entity/world.ts';

const testMap = (): MapDef => {
  const w = 20;
  const h = 20;
  const n = w * h;
  const walk = new Uint8Array(n).fill(1);
  const build = new Uint8Array(n).fill(1);
  const elev = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 10; x < w; x++) elev[y * w + x] = 1;
  }
  return {
    name: 'Terrain Test',
    w,
    h,
    walk,
    build,
    elev,
    starts: [{ x: 4, y: 4 }, { x: 15, y: 15 }],
    resources: [],
    teams: [0, 1],
  };
};

const tilePx = (t: number): number => fx(t * TILE + (TILE >> 1));
const tile = (m: MapDef, x: number, y: number): number => y * m.w + x;

const clearPlayerUnits = (sim: Sim, player: number): void => {
  const s = sim.fullState();
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.owner[i] === player) kill(s, i);
  }
  s.vision[player]!.fill(0);
};

test('low ground vision does not reveal higher tiles but high ground sees down', () => {
  const low = new Sim({ map: testMap(), players: 2, seed: 901, vision: true });
  clearPlayerUnits(low, 0);
  spawnUnit(low.fullState(), Kind.Marine, 0, tilePx(5), tilePx(5));
  low.step([]);

  assert.notEqual(low.observe(0).vision[tile(low.fullState().map, 12, 5)], 2);

  const high = new Sim({ map: testMap(), players: 2, seed: 902, vision: true });
  clearPlayerUnits(high, 0);
  spawnUnit(high.fullState(), Kind.Marine, 0, tilePx(12), tilePx(5));
  high.step([]);

  assert.equal(high.observe(0).vision[tile(high.fullState().map, 5, 5)], 2);
});

test('low-to-high ground attacks use deterministic miss chance', () => {
  const miss = new Sim({ map: testMap(), players: 2, seed: 903 });
  const missState = miss.fullState();
  const attacker = spawnUnit(missState, Kind.Marine, 0, tilePx(9), tilePx(5));
  const target = spawnUnit(missState, Kind.SupplyDepot, 1, tilePx(11), tilePx(5));
  const targetSlot = slotOf(target);
  missState.rng.s = 6;

  miss.step([{ player: 0, cmds: [{ t: 'attack', unit: attacker, target }] }]);

  assert.equal(missState.e.hp[targetSlot], Units[Kind.SupplyDepot]!.hp);

  const hit = new Sim({ map: testMap(), players: 2, seed: 904 });
  const hitState = hit.fullState();
  const hitAttacker = spawnUnit(hitState, Kind.Marine, 0, tilePx(9), tilePx(5));
  const hitTarget = spawnUnit(hitState, Kind.SupplyDepot, 1, tilePx(11), tilePx(5));
  const hitTargetSlot = slotOf(hitTarget);
  hitState.rng.s = 1;

  hit.step([{ player: 0, cmds: [{ t: 'attack', unit: hitAttacker, target: hitTarget }] }]);

  assert.ok(hitState.e.hp[hitTargetSlot]! < Units[Kind.SupplyDepot]!.hp);
});

test('low-to-high miss rolls round-trip through serialized rng state', () => {
  const sim = new Sim({ map: testMap(), players: 2, seed: 905 });
  const s = sim.fullState();
  const attacker = spawnUnit(s, Kind.Marine, 0, tilePx(9), tilePx(5));
  const target = spawnUnit(s, Kind.SupplyDepot, 1, tilePx(11), tilePx(5));
  s.rng.s = 6;

  const restored = Sim.deserialize(sim.serialize());
  const batch = [{ player: 0, cmds: [{ t: 'attack' as const, unit: attacker, target }] }];

  assert.deepEqual(sim.step(batch), restored.step(batch));
  assert.equal(sim.hash(), restored.hash());
  assert.equal(sim.fullState().e.hp[slotOf(target)], restored.fullState().e.hp[slotOf(target)]);
  assert.equal(sim.fullState().e.target[slotOf(attacker)], eid(sim.fullState().e, slotOf(target)));
});
