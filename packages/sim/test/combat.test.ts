import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map/core.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { count, eid, kill, NONE, slotOf } from '../src/entity/world.ts';
import { DamageType, Kind, Order, Tech, Units, bwRange, computeDamage, tiles } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { bwApproxEdgeDistance, topDownEdgeDistance, topDownEdgeDistanceSq } from '../src/spatial/geometry.ts';
import { applyWeaponDamage } from '../src/mechanics/damage.ts';
import { setTechLevel } from '../src/tech.ts';
import { entityApproachPoint } from '../src/entity/approach.ts';

test('two enemy marines fight and at least one dies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 5 });
  const s = sim.fullState();
  const a = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const b = spawnUnit(s, Kind.Marine, 1, fx(410), fx(400));

  sim.step([
    { player: 0, cmds: [{ t: 'attack', unit: a, target: b }] },
    { player: 1, cmds: [{ t: 'attack', unit: b, target: a }] },
  ]);
  assert.equal(s.e.combatTarget[slotOf(a)], b);
  assert.equal(s.e.target[slotOf(a)], b);
  assert.equal(s.e.intentTarget[slotOf(a)], NONE);
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

test('weapon damage against hallucinations still respects damage type, armor, and shots', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 2401 });
  const s = sim.fullState();
  const e = s.e;
  const firebat = spawnUnit(s, Kind.Firebat, 0, fx(400), fx(400));
  const battlecruiser = spawnUnit(s, Kind.Battlecruiser, 1, fx(430), fx(400));
  const target = slotOf(battlecruiser);
  e.illusion[target] = 1;
  e.shield[target] = 0;
  const hpBefore = e.hp[target]!;

  applyWeaponDamage(s, target, Units[Kind.Firebat]!.weapon!, slotOf(firebat));

  assert.equal(e.hp[target], hpBefore - 2);
});

test('weapon upgrades affect typed damage against hallucinations before the double-damage rule', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 2402 });
  const s = sim.fullState();
  const e = s.e;
  const dragoon = spawnUnit(s, Kind.Dragoon, 0, fx(400), fx(400));
  const siegeTank = spawnUnit(s, Kind.SiegeTank, 1, fx(430), fx(400));
  const target = slotOf(siegeTank);
  e.illusion[target] = 1;
  setTechLevel(s, 0, Tech.GroundWeapons, 1);
  const hpBefore = e.hp[target]!;

  applyWeaponDamage(s, target, Units[Kind.Dragoon]!.weapon!, slotOf(dragoon));

  assert.equal(e.hp[target], hpBefore - 43);
});

test('explosive splash sources use typed damage against hallucinations', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 2403 });
  const s = sim.fullState();
  const e = s.e;
  const tank = spawnUnit(s, Kind.SiegeTank, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 1, fx(430), fx(400));
  const target = slotOf(marine);
  e.illusion[target] = 1;
  const hpBefore = e.hp[target]!;

  applyWeaponDamage(s, target, { damage: 30, dtype: DamageType.Explosive, cooldown: 1, range: tiles(1) }, slotOf(tank));

  assert.equal(e.hp[target], hpBefore - 30);
});

test('acid spores amplify typed weapon damage before hallucination doubling', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 2404 });
  const s = sim.fullState();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const targetId = spawnUnit(s, Kind.Marine, 1, fx(430), fx(400));
  const target = slotOf(targetId);
  e.illusion[target] = 1;
  e.acidSporeCount[target] = 3;
  e.acidSporeTimer[target] = 100;
  const hpBefore = e.hp[target]!;

  applyWeaponDamage(s, target, Units[Kind.Marine]!.weapon!, slotOf(marine));

  assert.equal(e.hp[target], hpBefore - 18);
});

test('weapon range is measured edge-to-edge against large buildings', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 22 });
  const s = sim.fullState();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const cc = spawnUnit(s, Kind.CommandCenter, 1, fx(590), fx(400));
  const target = slotOf(cc);
  const hpBefore = e.hp[target]!;

  assert.ok(fx(190) > Units[Kind.Marine]!.weapon!.range, 'center distance is outside Marine range');
  assert.ok(topDownEdgeDistanceSq(s, slotOf(marine), target) <= Units[Kind.Marine]!.weapon!.range ** 2);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: cc }] }]);

  assert.ok(e.hp[target]! < hpBefore);
});

test('marine combat uses top-down physical range while BW compatibility keeps source distance', () => {
  const inRange = new Sim({ map: sliceMap(), players: 2, seed: 2201 });
  const sIn = inRange.fullState();
  const marineIn = spawnUnit(sIn, Kind.Marine, 0, fx(400), fx(400));
  const targetIn = spawnUnit(sIn, Kind.Marine, 1, fx(544), fx(400));
  const targetSlotIn = slotOf(targetIn);
  const hpBefore = sIn.e.hp[targetSlotIn]!;

  assert.equal(Units[Kind.Marine]!.weapon!.range, bwRange(128));
  assert.equal(topDownEdgeDistance(sIn, slotOf(marineIn), targetSlotIn), bwRange(128));
  inRange.step([{ player: 0, cmds: [{ t: 'attack', unit: marineIn, target: targetIn }] }]);
  assert.ok(sIn.e.hp[targetSlotIn]! < hpBefore);

  const outRange = new Sim({ map: sliceMap(), players: 2, seed: 2202 });
  const sOut = outRange.fullState();
  const marineOut = spawnUnit(sOut, Kind.Marine, 0, fx(400), fx(400));
  const targetOut = spawnUnit(sOut, Kind.Marine, 1, fx(545), fx(400));
  const targetSlotOut = slotOf(targetOut);
  const hpOutBefore = sOut.e.hp[targetSlotOut]!;

  assert.equal(bwApproxEdgeDistance(sOut, slotOf(marineOut), targetSlotOut), bwRange(128));
  assert.equal(topDownEdgeDistance(sOut, slotOf(marineOut), targetSlotOut), bwRange(129));
  outRange.step([{ player: 0, cmds: [{ t: 'attack', unit: marineOut, target: targetOut }] }]);
  assert.equal(sOut.e.hp[targetSlotOut], hpOutBefore);
});

test('melee attackers use top-down physical pixel ranges instead of BW target expansion', () => {
  const zealotIn = new Sim({ map: sliceMap(), players: 2, seed: 2203 });
  const sZin = zealotIn.fullState();
  const zIn = spawnUnit(sZin, Kind.Zealot, 0, fx(400), fx(400));
  const mIn = spawnUnit(sZin, Kind.Marine, 1, fx(434), fx(400));
  const mSlotIn = slotOf(mIn);
  const hpBefore = sZin.e.hp[mSlotIn]!;

  assert.equal(Units[Kind.Zealot]!.weapon!.range, bwRange(15));
  assert.equal(topDownEdgeDistance(sZin, slotOf(zIn), mSlotIn), bwRange(15));
  zealotIn.step([{ player: 0, cmds: [{ t: 'attack', unit: zIn, target: mIn }] }]);
  assert.ok(sZin.e.hp[mSlotIn]! < hpBefore);

  const zealotOut = new Sim({ map: sliceMap(), players: 2, seed: 2204 });
  const sZout = zealotOut.fullState();
  const zOut = spawnUnit(sZout, Kind.Zealot, 0, fx(400), fx(400));
  const mOut = spawnUnit(sZout, Kind.Marine, 1, fx(435), fx(400));
  const mSlotOut = slotOf(mOut);
  const hpOutBefore = sZout.e.hp[mSlotOut]!;

  assert.equal(bwApproxEdgeDistance(sZout, slotOf(zOut), mSlotOut), bwRange(15));
  assert.equal(topDownEdgeDistance(sZout, slotOf(zOut), mSlotOut), bwRange(16));
  zealotOut.step([{ player: 0, cmds: [{ t: 'attack', unit: zOut, target: mOut }] }]);
  assert.equal(sZout.e.hp[mSlotOut], hpOutBefore);
});

test('attack-move acquisition uses body edges for large targets', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 23 });
  const s = sim.fullState();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const cc = spawnUnit(s, Kind.CommandCenter, 1, fx(590), fx(400));
  const target = slotOf(cc);
  const hpBefore = e.hp[target]!;

  sim.step([{ player: 0, cmds: [{ t: 'amove', unit: marine, x: fx(900), y: fx(400) }] }]);

  assert.ok(e.hp[target]! < hpBefore);
  assert.equal(e.combatTarget[slotOf(marine)], cc);
  assert.equal(e.target[slotOf(marine)], cc);
  assert.ok(topDownEdgeDistanceSq(s, slotOf(marine), target) <= tiles(4) ** 2);
});

test('combat acquisition writes combatTarget without destroying movement intent', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 231 });
  const s = sim.fullState();
  const e = s.e;
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(400), fx(400)));
  const leader = spawnUnit(s, Kind.Marine, 0, fx(460), fx(400));
  const enemy = spawnUnit(s, Kind.Marine, 1, fx(430), fx(400));

  e.order[marine] = Order.AttackMove;
  e.tx[marine] = fx(900);
  e.ty[marine] = fx(400);
  e.intentTarget[marine] = leader;
  e.target[marine] = NONE;
  e.combatTarget[marine] = NONE;

  sim.step([]);

  assert.equal(e.combatTarget[marine], enemy);
  assert.equal(e.target[marine], enemy);
  assert.equal(e.intentTarget[marine], leader);

  kill(s, slotOf(enemy));
  e.x[slotOf(leader)] = fx(520);
  e.y[slotOf(leader)] = fx(420);
  sim.step([]);

  assert.equal(e.combatTarget[marine], NONE);
  assert.equal(e.target[marine], NONE);
  assert.equal(e.intentTarget[marine], leader);
  assert.equal(e.order[marine], Order.AttackMove);
  const p = entityApproachPoint(s, marine, slotOf(leader));
  assert.equal(e.tx[marine], p.x);
  assert.equal(e.ty[marine], p.y);
});

test('attacking units face their current target', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8 });
  const s = sim.fullState();
  const a = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const b = spawnUnit(s, Kind.Marine, 1, fx(460), fx(400));

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: a, target: b }] }]);

  const e = sim.fullState().e;
  assert.ok(e.faceX[slotOf(a)]! > 0, 'attacker faces east toward the target');
  assert.equal(e.faceY[slotOf(a)], 0);
});

test('ground-only attackers cannot target air units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 10 });
  const s = sim.fullState();
  const firebat = spawnUnit(s, Kind.Firebat, 0, fx(400), fx(400));
  const wraith = spawnUnit(s, Kind.Wraith, 1, fx(430), fx(400));

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: firebat, target: wraith }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' }]);
});

test('scourge deals air damage and dies on a successful attack', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 13 });
  const s = sim.fullState();
  const e = s.e;
  const scourge = spawnUnit(s, Kind.Scourge, 0, fx(400), fx(400));
  const wraith = spawnUnit(s, Kind.Wraith, 1, fx(404), fx(400));
  const hpBefore = e.hp[slotOf(wraith)]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: scourge, target: wraith }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.equal(e.alive[slotOf(scourge)], 0);
  assert.ok(e.hp[slotOf(wraith)]! < hpBefore);
});

test('infested terran suicide attack deals ground splash with friendly fire', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 14 });
  const s = sim.fullState();
  const e = s.e;
  const infested = spawnUnit(s, Kind.InfestedTerran, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.SiegeTank, 1, fx(404), fx(400));
  const enemySplash = spawnUnit(s, Kind.SiegeTank, 1, fx(440), fx(400));
  const friendlySplash = spawnUnit(s, Kind.SiegeTank, 0, fx(440), fx(410));
  const enemySplashHp = e.hp[slotOf(enemySplash)]!;
  const friendlySplashHp = e.hp[slotOf(friendlySplash)]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: infested, target }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.equal(e.alive[slotOf(infested)], 0);
  assert.equal(e.alive[slotOf(target)], 0);
  assert.ok(e.hp[slotOf(enemySplash)]! < enemySplashHp);
  assert.ok(e.hp[slotOf(friendlySplash)]! < friendlySplashHp);
});

test('mutalisk attacks bounce to two nearby enemies with reduced damage', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 15 });
  const s = sim.fullState();
  const e = s.e;
  const mutalisk = spawnUnit(s, Kind.Mutalisk, 0, fx(400), fx(400));
  const first = spawnUnit(s, Kind.Marine, 1, fx(450), fx(400));
  const second = spawnUnit(s, Kind.Marine, 1, fx(482), fx(400));
  const third = spawnUnit(s, Kind.Marine, 1, fx(514), fx(400));
  const far = spawnUnit(s, Kind.Marine, 1, fx(700), fx(400));
  const firstHp = e.hp[slotOf(first)]!;
  const secondHp = e.hp[slotOf(second)]!;
  const thirdHp = e.hp[slotOf(third)]!;
  const farHp = e.hp[slotOf(far)]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: mutalisk, target: first }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[slotOf(first)]! < firstHp);
  assert.ok(e.hp[slotOf(second)]! < secondHp);
  assert.ok(e.hp[slotOf(third)]! < thirdHp);
  assert.equal(e.hp[slotOf(far)], farHp);
  assert.ok(firstHp - e.hp[slotOf(first)]! > secondHp - e.hp[slotOf(second)]!);
  assert.ok(secondHp - e.hp[slotOf(second)]! > thirdHp - e.hp[slotOf(third)]!);
});

test('corsair air splash damages nearby air units but not ground units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 16 });
  const s = sim.fullState();
  const e = s.e;
  const corsair = spawnUnit(s, Kind.Corsair, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.Mutalisk, 1, fx(450), fx(400));
  const splashAir = spawnUnit(s, Kind.Mutalisk, 1, fx(480), fx(400));
  const splashGround = spawnUnit(s, Kind.Marine, 1, fx(480), fx(400));
  const airHp = e.hp[slotOf(splashAir)]!;
  const groundHp = e.hp[slotOf(splashGround)]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: corsair, target }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[slotOf(splashAir)]! < airHp);
  assert.equal(e.hp[slotOf(splashGround)], groundHp);
});

test('valkyrie multi-missile air splash damages nearby air units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 17 });
  const s = sim.fullState();
  const e = s.e;
  const valkyrie = spawnUnit(s, Kind.Valkyrie, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.Mutalisk, 1, fx(450), fx(400));
  const splashAir = spawnUnit(s, Kind.Mutalisk, 1, fx(480), fx(400));
  const airHp = e.hp[slotOf(splashAir)]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: valkyrie, target }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[slotOf(splashAir)]! < airHp);
});

test('devourer attacks apply acid spores that amplify later damage', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 18 });
  const s = sim.fullState();
  const e = s.e;
  const devourer = spawnUnit(s, Kind.Devourer, 0, fx(400), fx(400));
  const mutalisk = spawnUnit(s, Kind.Mutalisk, 1, fx(450), fx(400));

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: devourer, target: mutalisk }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.equal(e.acidSporeCount[slotOf(mutalisk)], 1);
  assert.ok(e.acidSporeTimer[slotOf(mutalisk)]! > 0);

  const normal = new Sim({ map: sliceMap(), players: 2, seed: 19 });
  const normalWraith = spawnUnit(normal.fullState(), Kind.Wraith, 0, fx(400), fx(400));
  const normalTarget = spawnUnit(normal.fullState(), Kind.Mutalisk, 1, fx(450), fx(400));
  const normalHp = normal.fullState().e.hp[slotOf(normalTarget)]!;
  normal.step([{ player: 0, cmds: [{ t: 'attack', unit: normalWraith, target: normalTarget }] }]);
  const normalDamage = normalHp - normal.fullState().e.hp[slotOf(normalTarget)]!;

  const acid = new Sim({ map: sliceMap(), players: 2, seed: 20 });
  const acidWraith = spawnUnit(acid.fullState(), Kind.Wraith, 0, fx(400), fx(400));
  const acidTarget = spawnUnit(acid.fullState(), Kind.Mutalisk, 1, fx(450), fx(400));
  acid.fullState().e.acidSporeCount[slotOf(acidTarget)] = 3;
  acid.fullState().e.acidSporeTimer[slotOf(acidTarget)] = 100;
  const acidHp = acid.fullState().e.hp[slotOf(acidTarget)]!;
  acid.step([{ player: 0, cmds: [{ t: 'attack', unit: acidWraith, target: acidTarget }] }]);
  const acidDamage = acidHp - acid.fullState().e.hp[slotOf(acidTarget)]!;

  assert.ok(acidDamage > normalDamage);
});

test('acid spores expire through status ticking', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 21 });
  const s = sim.fullState();
  const mutalisk = slotOf(spawnUnit(s, Kind.Mutalisk, 0, fx(400), fx(400)));
  s.e.acidSporeCount[mutalisk] = 4;
  s.e.acidSporeTimer[mutalisk] = 1;

  sim.step([]);

  assert.equal(s.e.acidSporeCount[mutalisk], 0);
  assert.equal(s.e.acidSporeTimer[mutalisk], 0);
});

test('shields absorb weapon damage before hit points', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 11 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  const z = slotOf(zealot);
  const hpBefore = s.e.hp[z]!;
  const shieldBefore = s.e.shield[z]!;

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);
  for (let t = 0; t < Units[Kind.Marine]!.weapon!.cooldown + 1; t++) sim.step([]);

  assert.equal(s.e.hp[z], hpBefore, 'HP stays intact while shields remain');
  assert.ok(s.e.shield[z]! < shieldBefore, 'shield took the hit');
});

test('shield overflow applies armor only to damage that reaches hit points', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 12 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = 1;
  const hpBefore = s.e.hp[z]!;

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.shield[z], 0);
  assert.equal(s.e.hp[z], hpBefore - 4);
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

test('victory supports sparse team ids', () => {
  const sim = new Sim({ map: sliceMap(), players: 4, seed: 9 });
  const s = sim.fullState();
  s.teams.set([2, 2, 7, 7]);
  s.startTeams = 2;

  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i]! >= 2) kill(s, i);
  }
  sim.step([]);

  assert.equal(s.result.over, true);
  assert.equal(s.result.winner, 2);
});

test('a worker constructs a supply depot, raising the supply cap', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 7 });
  const s = sim.fullState();
  s.players.minerals[0] = Units[Kind.SupplyDepot]!.minerals;

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
