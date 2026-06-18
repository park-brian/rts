import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { Kind, Order, SPIDER_MINE_CHARGES, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import {
  consumeInternalProduct,
  hasInternalProductReady,
  internalProductCapacity,
  internalProductDef,
  internalProductReadyCount,
  refillInternalProduct,
} from '../src/internal-products.ts';
import { eid, isAlive, slotOf } from '../src/world.ts';
import { parseReplay } from '../src/replay.ts';
import { simScenario } from '../test-support/scenario.ts';

const mineSlots = (sim: Sim): number[] => {
  const e = sim.fullState().e;
  const out: number[] = [];
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.SpiderMine) out.push(i);
  return out;
};

test('spider mine charges are internal product descriptor-backed', () => {
  const { state: s, spawn, grant } = simScenario({ players: 1, seed: 209 });
  const vulture = slotOf(spawn(Kind.Vulture, 0, fx(400), fx(400)));

  assert.deepEqual(
    internalProductDef(Kind.Vulture, Kind.SpiderMine),
    { producer: Kind.Vulture, product: Kind.SpiderMine, baseCapacity: SPIDER_MINE_CHARGES, requiresTech: Tech.SpiderMines },
  );
  assert.equal(internalProductCapacity(s, vulture, Kind.SpiderMine), 0);
  assert.equal(hasInternalProductReady(s, vulture, Kind.SpiderMine), false);

  grant(0, Tech.SpiderMines);
  assert.equal(internalProductCapacity(s, vulture, Kind.SpiderMine), SPIDER_MINE_CHARGES);
  assert.equal(internalProductReadyCount(s, vulture, Kind.SpiderMine), 0);

  refillInternalProduct(s, vulture, Kind.SpiderMine);
  assert.equal(internalProductReadyCount(s, vulture, Kind.SpiderMine), SPIDER_MINE_CHARGES);
  assert.equal(consumeInternalProduct(s, vulture, Kind.SpiderMine), true);
  assert.equal(internalProductReadyCount(s, vulture, Kind.SpiderMine), SPIDER_MINE_CHARGES - 1);
});

test('vultures lay researched spider mines with finite charges', () => {
  const { sim, state: s, spawn, grant } = simScenario({ players: 1, seed: 210 });
  const e = s.e;
  const vulture = spawn(Kind.Vulture, 0, fx(400), fx(400));

  let results = sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'mine', ok: false, reason: 'missing-requirement' }]);

  grant(0, Tech.SpiderMines);
  results = sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'mine', ok: false, reason: 'target-not-allowed' }]);

  e.specialAmmo[slotOf(vulture)] = SPIDER_MINE_CHARGES;
  results = sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'mine', ok: true }]);
  assert.equal(e.specialAmmo[slotOf(vulture)], SPIDER_MINE_CHARGES - 1);
  const mines = mineSlots(sim);
  assert.equal(mines.length, 1);
  assert.equal(e.burrowed[mines[0]!], 1);
  assert.equal(e.owner[mines[0]!], 0);
});

test('spider mine tech grants charges to current and future vultures', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 211 });
  const e = s.e;
  const vulture = slotOf(spawn(Kind.Vulture, 0, fx(400), fx(400)));
  const factory = slotOf(spawn(Kind.Factory, 0, fx(400), fx(400)));
  const shop = slotOf(spawn(Kind.MachineShop, 0, fx(480), fx(400)));
  e.target[factory] = eid(e, shop);
  e.target[shop] = eid(e, factory);
  e.researchKind[shop] = Tech.SpiderMines;
  e.researchTimer[shop] = 1;

  sim.step([]);
  const later = slotOf(spawn(Kind.Vulture, 0, fx(430), fx(400)));

  assert.equal(e.specialAmmo[vulture], SPIDER_MINE_CHARGES);
  assert.equal(e.specialAmmo[later], SPIDER_MINE_CHARGES);
});

test('burrowed spider mines wake on nearby ground units and detonate with splash', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 212 });
  const e = s.e;
  grant(0, Tech.SpiderMines);
  const vulture = spawn(Kind.Vulture, 0, fx(400), fx(400));
  const tank = spawn(Kind.SiegeTank, 1, fx(470), fx(400));
  const splashEnemy = spawn(Kind.Marine, 1, fx(492), fx(400));
  const splashFriendly = spawn(Kind.Marine, 0, fx(488), fx(406));
  const tankHp = e.hp[slotOf(tank)]!;
  const enemyHp = e.hp[slotOf(splashEnemy)]!;
  const friendlyHp = e.hp[slotOf(splashFriendly)]!;

  sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);
  const mine = eid(e, mineSlots(sim)[0]!);
  for (let i = 0; i < 40 && isAlive(e, mine); i++) sim.step([]);

  assert.equal(isAlive(e, mine), false, 'mine is consumed on detonation');
  assert.ok(e.hp[slotOf(tank)]! < tankHp, 'target takes direct mine damage');
  assert.ok(e.hp[slotOf(splashEnemy)]! < enemyHp, 'nearby ground enemy takes splash');
  assert.ok(e.hp[slotOf(splashFriendly)]! < friendlyHp, 'mine splash includes friendly fire');
});

test('spider mines ignore nearby air-only targets', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 213 });
  const e = s.e;
  grant(0, Tech.SpiderMines);
  const vulture = spawn(Kind.Vulture, 0, fx(400), fx(400));
  spawn(Kind.Wraith, 1, fx(430), fx(400));

  sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);
  const mine = mineSlots(sim)[0]!;
  for (let i = 0; i < Units[Kind.SpiderMine]!.weapon!.cooldown + 10; i++) sim.step([]);

  assert.equal(e.alive[mine], 1);
  assert.equal(e.burrowed[mine], 1);
  assert.equal(e.order[mine], Order.Idle);
});

test('spider mine state round-trips through byte snapshots', () => {
  const { sim, state: s, spawn, grant } = simScenario({ players: 1, seed: 214 });
  const vulture = spawn(Kind.Vulture, 0, fx(400), fx(400));
  grant(0, Tech.SpiderMines);
  s.e.specialAmmo[slotOf(vulture)] = 2;
  sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);

  const restored = Sim.deserialize(sim.serialize());

  assert.equal(restored.fullState().e.specialAmmo[slotOf(vulture)], 1);
  assert.equal(restored.fullState().e.burrowed[mineSlots(restored)[0]!], 1);
  assert.equal(restored.hash(), sim.hash());
});

test('replay parser accepts mine commands', () => {
  const parsed = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 215,
    frames: [[{ player: 0, cmds: [{ t: 'mine', unit: 123 }] }]],
  }));

  assert.deepEqual(parsed.frames[0]![0]!.cmds[0], { t: 'mine', unit: 123 });
});
