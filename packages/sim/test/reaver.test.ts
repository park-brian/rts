import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { eid, slotOf } from '../src/world.ts';
import {
  CARRIER_INTERCEPTOR_CAPACITY, CARRIER_INTERCEPTOR_UPGRADED_CAPACITY, Kind,
  REAVER_SCARAB_CAPACITY, REAVER_SCARAB_UPGRADED_CAPACITY, Tech, Units,
} from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { setTechLevel } from '../src/tech.ts';
import { carrierInterceptorCapacity, reaverScarabCapacity } from '../src/derived.ts';

test('reavers build scarabs as internal ammo and require ammo to attack', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 601 });
  const s = sim.fullState();
  const e = s.e;
  const reaver = spawnUnit(s, Kind.Reaver, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.SiegeTank, 1, fx(900), fx(400));
  const r = slotOf(reaver);
  s.players.minerals[0] = 100;

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'attack', unit: reaver, target }] }]), [
    { player: 0, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' },
  ]);

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: reaver, kind: Kind.Scarab }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
  assert.equal(s.players.minerals[0], 100 - Units[Kind.Scarab]!.minerals);
  assert.equal(e.prodKind[r], Kind.Scarab);

  for (let t = 0; t < Units[Kind.Scarab]!.buildTime; t++) sim.step([]);

  assert.equal(e.specialAmmo[r], 1);
  assert.equal(e.prodKind[r], Kind.None);

  const hpBefore = e.hp[slotOf(target)]!;
  e.x[slotOf(target)] = fx(460);
  e.y[slotOf(target)] = fx(400);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'attack', unit: reaver, target }] }]), [
    { player: 0, index: 0, t: 'attack', ok: true },
  ]);

  assert.equal(e.specialAmmo[r], 0);
  assert.ok(e.hp[slotOf(target)]! < hpBefore);
});

test('scarab damage and capacity upgrades affect reaver ammo behavior', () => {
  const normal = new Sim({ map: sliceMap(), players: 2, seed: 602 });
  const upgraded = new Sim({ map: sliceMap(), players: 2, seed: 603 });
  const normalReaver = spawnUnit(normal.fullState(), Kind.Reaver, 0, fx(400), fx(400));
  const normalTarget = spawnUnit(normal.fullState(), Kind.SiegeTank, 1, fx(460), fx(400));
  const upgradedReaver = spawnUnit(upgraded.fullState(), Kind.Reaver, 0, fx(400), fx(400));
  const upgradedTarget = spawnUnit(upgraded.fullState(), Kind.SiegeTank, 1, fx(460), fx(400));

  normal.fullState().e.specialAmmo[slotOf(normalReaver)] = 1;
  upgraded.fullState().e.specialAmmo[slotOf(upgradedReaver)] = 1;
  setTechLevel(upgraded.fullState(), 0, Tech.ScarabDamage, 1);
  setTechLevel(upgraded.fullState(), 0, Tech.ReaverCapacity, 1);

  const normalHp = normal.fullState().e.hp[slotOf(normalTarget)]!;
  const upgradedHp = upgraded.fullState().e.hp[slotOf(upgradedTarget)]!;
  normal.step([{ player: 0, cmds: [{ t: 'attack', unit: normalReaver, target: normalTarget }] }]);
  upgraded.step([{ player: 0, cmds: [{ t: 'attack', unit: upgradedReaver, target: upgradedTarget }] }]);

  const normalDamage = normalHp - normal.fullState().e.hp[slotOf(normalTarget)]!;
  const upgradedDamage = upgradedHp - upgraded.fullState().e.hp[slotOf(upgradedTarget)]!;
  assert.ok(upgradedDamage > normalDamage);
  assert.equal(reaverScarabCapacity(normal.fullState(), slotOf(normalReaver)), REAVER_SCARAB_CAPACITY);
  assert.equal(reaverScarabCapacity(upgraded.fullState(), slotOf(upgradedReaver)), REAVER_SCARAB_UPGRADED_CAPACITY);
});

test('reaver scarab capacity gates queued internal ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 604 });
  const s = sim.fullState();
  const e = s.e;
  const reaver = spawnUnit(s, Kind.Reaver, 0, fx(400), fx(400));
  const r = slotOf(reaver);
  s.players.minerals[0] = 1_000;
  e.specialAmmo[r] = REAVER_SCARAB_CAPACITY - 1;

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, r), kind: Kind.Scarab },
    { t: 'train', building: eid(e, r), kind: Kind.Scarab },
  ] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
    { player: 0, index: 1, t: 'train', ok: false, reason: 'queue-full' },
  ]);

  setTechLevel(s, 0, Tech.ReaverCapacity, 1);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, r), kind: Kind.Scarab }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
});

test('carriers build interceptors as internal ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 605 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  const c = slotOf(carrier);
  s.players.minerals[0] = 100;

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: carrier, kind: Kind.Interceptor }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
  assert.equal(s.players.minerals[0], 100 - Units[Kind.Interceptor]!.minerals);
  assert.equal(e.prodKind[c], Kind.Interceptor);

  for (let t = 0; t < Units[Kind.Interceptor]!.buildTime; t++) sim.step([]);

  assert.equal(e.specialAmmo[c], 1);
  assert.equal(e.prodKind[c], Kind.None);
});

test('carrier capacity upgrade gates queued interceptors', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 606 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  const c = slotOf(carrier);
  s.players.minerals[0] = 1_000;
  e.specialAmmo[c] = CARRIER_INTERCEPTOR_CAPACITY - 1;

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, c), kind: Kind.Interceptor },
    { t: 'train', building: eid(e, c), kind: Kind.Interceptor },
  ] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
    { player: 0, index: 1, t: 'train', ok: false, reason: 'queue-full' },
  ]);

  setTechLevel(s, 0, Tech.CarrierCapacity, 1);
  assert.equal(carrierInterceptorCapacity(s, c), CARRIER_INTERCEPTOR_UPGRADED_CAPACITY);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, c), kind: Kind.Interceptor }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
});
