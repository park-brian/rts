import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { Kind, Order, SPIDER_MINE_CHARGES, Tech, Units, tiles } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import {
  consumeInternalProduct,
  hasInternalProductReady,
  internalProductCapacity,
  internalProductDef,
  internalProductReadyCount,
  refillInternalProduct,
} from '../src/mechanics/internal-products.ts';
import {
  ActorDefByKind,
  actorDef,
  actorTrigger,
  isUserCommandableKind,
  participatesInNormalCombat,
} from '../src/mechanics/actors.ts';
import { eid, isAlive, slotOf } from '../src/entity/world.ts';
import { parseReplay } from '../src/io/replay.ts';
import { validateMineCommand } from '../src/commands/mine.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { bodyBounds, distanceSq, topDownEdgeDistanceSq } from '../src/spatial/geometry.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';

type MineCommand = Extract<Command, { t: 'mine' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

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

test('spider mine wakeup is actor descriptor-backed', () => {
  assert.equal(ActorDefByKind[Kind.SpiderMine], actorDef(Kind.SpiderMine));
  assert.equal(actorDef(Kind.SpiderMine)?.commandable, false);
  assert.equal(actorDef(Kind.SpiderMine)?.lifecycle, 'stationary-trigger');
  assert.equal(actorDef(Kind.SpiderMine)?.steering, 'normal');
  assert.equal(isUserCommandableKind(Kind.SpiderMine), false);
  assert.equal(participatesInNormalCombat(Kind.SpiderMine), true);
  assert.deepEqual(actorTrigger(Kind.SpiderMine), {
    range: tiles(3),
    target: 'enemy-detected-ground-mobile',
    wakeOrder: Order.Attack,
  });
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

test('mine validation shares actor ownership gates', () => {
  const { state: s, spawn, grant } = simScenario({ players: 2, seed: 2101 });
  const e = s.e;
  const friendly = spawn(Kind.Vulture, 0, fx(400), fx(400));
  const enemy = spawn(Kind.Vulture, 1, fx(430), fx(400));
  const contained = spawn(Kind.Vulture, 0, fx(460), fx(400));
  const burrowed = spawn(Kind.Vulture, 0, fx(490), fx(400));
  const illusion = spawn(Kind.Vulture, 0, fx(520), fx(400));
  const disabled = spawn(Kind.Vulture, 0, fx(550), fx(400));
  const unfinished = spawn(Kind.Vulture, 0, fx(580), fx(400));
  grant(0, Tech.SpiderMines);
  for (const id of [friendly, contained, burrowed, illusion, disabled, unfinished]) {
    e.specialAmmo[slotOf(id)] = SPIDER_MINE_CHARGES;
  }
  e.container[slotOf(contained)] = spawn(Kind.Dropship, 0, fx(460), fx(430));
  e.burrowed[slotOf(burrowed)] = 1;
  e.illusion[slotOf(illusion)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;

  const assertMine = (command: MineCommand, expected: Expected): void => {
    assert.deepEqual(validateMineCommand(s, 0, command), expected);
    assert.deepEqual(validateCommand(s, 0, command), expected);
  };

  assertMine({ t: 'mine', unit: friendly }, { ok: true });
  assertMine({ t: 'mine', unit: enemy }, { ok: false, reason: 'wrong-owner' });
  assertMine({ t: 'mine', unit: 999_999 }, { ok: false, reason: 'stale-entity' });
  assertMine({ t: 'mine', unit: contained }, { ok: false, reason: 'missing-capability' });
  assertMine({ t: 'mine', unit: burrowed }, { ok: false, reason: 'missing-capability' });
  assertMine({ t: 'mine', unit: illusion }, { ok: false, reason: 'missing-capability' });
  assertMine({ t: 'mine', unit: disabled }, { ok: false, reason: 'missing-capability' });
  assertMine({ t: 'mine', unit: unfinished }, { ok: false, reason: 'missing-capability' });
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

test('spider mine wake range uses top-down body edges', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 2131 });
  const e = s.e;
  grant(0, Tech.SpiderMines);
  const trigger = tiles(3);
  const vulture = spawn(Kind.Vulture, 0, fx(400), fx(400));
  const targetX = e.x[slotOf(vulture)]! + trigger + bodyBounds(Kind.SpiderMine).right + bodyBounds(Kind.SiegeTank).left - fx(4);
  const tank = spawn(Kind.SiegeTank, 1, targetX, e.y[slotOf(vulture)]!);
  e.specialAmmo[slotOf(vulture)] = 1;

  sim.step([{ player: 0, cmds: [{ t: 'mine', unit: vulture }] }]);
  const mine = mineSlots(sim)[0]!;

  assert.ok(distanceSq(e.x[mine]!, e.y[mine]!, e.x[slotOf(tank)]!, e.y[slotOf(tank)]!) > trigger * trigger);
  assert.ok(topDownEdgeDistanceSq(s, mine, slotOf(tank)) <= trigger * trigger);
  assert.equal(e.burrowed[mine], 0);
  assert.equal(e.order[mine], Order.Attack);
  assert.equal(e.target[mine], tank);
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
