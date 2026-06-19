import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap, type MapDef } from '../src/map.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { eid, kill, NONE, slotOf } from '../src/entity/world.ts';
import {
  CARRIER_INTERCEPTOR_CAPACITY, CARRIER_INTERCEPTOR_UPGRADED_CAPACITY, Kind,
  REAVER_SCARAB_CAPACITY, REAVER_SCARAB_UPGRADED_CAPACITY, Tech, TILE, Units, tiles,
} from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { setTechLevel } from '../src/tech.ts';
import { carrierInterceptorCapacity, reaverScarabCapacity } from '../src/derived.ts';
import {
  canQueueInternalProduct, completeInternalProduct, hasInternalProductReady, storeInternalProduct,
} from '../src/internal-products.ts';
import {
  childActorDef, isExternallySteeredChild, participatesInNormalCombat,
} from '../src/child-actors.ts';
import { applyWeaponHit } from '../src/systems/weapon-hit.ts';
import { carrierBayPoint, carrierLaunchRange, interceptorLaunchCooldown, launchInterceptor } from '../src/interceptor.ts';
import { interceptors } from '../src/systems/interceptors.ts';
import {
  WeaponMechanic, WeaponMechanicByUnit, WeaponMechanicDefs, consumeWeaponMechanicAmmo,
  hasWeaponMechanicAmmo, weaponMechanicDef,
} from '../src/weapon-mechanics.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

const launchedScarabs = (s: ReturnType<Sim['fullState']>, reaverSlot: number): number[] => {
  const e = s.e;
  const home = eid(e, reaverSlot);
  const out: number[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Scarab && e.home[i] === home) out.push(i);
  }
  return out;
};

const launchedInterceptors = (s: ReturnType<Sim['fullState']>, carrierSlot: number): number[] => {
  const e = s.e;
  const home = eid(e, carrierSlot);
  const out: number[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Interceptor && e.home[i] === home) out.push(i);
  }
  return out;
};

const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

test('scarab and interceptor delivery mechanics are descriptor-backed', () => {
  assert.equal(new Set(WeaponMechanicDefs.map((def) => def.unit)).size, WeaponMechanicDefs.length);
  assert.equal(Object.keys(WeaponMechanicByUnit).length, WeaponMechanicDefs.length);
  for (const def of WeaponMechanicDefs) assert.equal(WeaponMechanicByUnit[def.unit], def);

  const scarab = weaponMechanicDef(Kind.Reaver);
  assert.equal(scarab?.id, WeaponMechanic.ScarabLaunch);
  assert.equal(scarab?.childKind, Kind.Scarab);
  assert.equal(scarab?.consumesAmmoOnFire, true);

  const interceptor = weaponMechanicDef(Kind.Carrier);
  assert.equal(interceptor?.id, WeaponMechanic.InterceptorLaunch);
  assert.equal(interceptor?.childKind, Kind.Interceptor);
  assert.equal(interceptor?.launchRange, carrierLaunchRange());
  assert.equal(interceptor?.launchCooldown, interceptorLaunchCooldown());
  assert.equal(childActorDef(Kind.Scarab)?.commandable, false);
  assert.equal(participatesInNormalCombat(Kind.Scarab), false);
  assert.equal(isExternallySteeredChild(Kind.Scarab, NONE), false);
  assert.equal(childActorDef(Kind.Interceptor)?.commandable, false);
  assert.equal(participatesInNormalCombat(Kind.Interceptor), true);
  assert.equal(isExternallySteeredChild(Kind.Interceptor, 123), true);

  assert.equal(weaponMechanicDef(Kind.Lurker)?.onHit, WeaponMechanic.LurkerLineSplash);
  assert.equal(weaponMechanicDef(Kind.Mutalisk)?.onHit, WeaponMechanic.MutaliskBounce);
  assert.equal(weaponMechanicDef(Kind.Devourer)?.onHit, WeaponMechanic.AcidSpores);
  assert.equal(weaponMechanicDef(Kind.Scourge)?.postFire, WeaponMechanic.SuicideOnFire);
  assert.equal(weaponMechanicDef(Kind.InfestedTerran)?.postFire, WeaponMechanic.SuicideOnFire);
  assert.equal(weaponMechanicDef(Kind.SpiderMine)?.postFire, WeaponMechanic.SuicideOnFire);
  assert.equal(weaponMechanicDef(Kind.Bunker)?.containerProvider, true);
});

test('scarab launch ammo readiness is internal-product backed', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 600 });
  const s = sim.fullState();
  const reaver = slotOf(spawnUnit(s, Kind.Reaver, 0, fx(400), fx(400)));
  const mechanic = weaponMechanicDef(Kind.Reaver);

  assert.equal(hasWeaponMechanicAmmo(s, reaver, mechanic), false);
  s.e.specialAmmo[reaver] = 1;
  assert.equal(hasWeaponMechanicAmmo(s, reaver, mechanic), true);
  consumeWeaponMechanicAmmo(s, reaver, mechanic);
  assert.equal(s.e.specialAmmo[reaver], 0);
  assert.equal(hasWeaponMechanicAmmo(s, reaver, mechanic), false);
});

test('internal product queue and completion helpers preserve capacity semantics', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 6001 });
  const s = sim.fullState();
  const e = s.e;
  const reaver = slotOf(spawnUnit(s, Kind.Reaver, 0, fx(400), fx(400)));

  e.specialAmmo[reaver] = REAVER_SCARAB_CAPACITY - 1;
  assert.equal(canQueueInternalProduct(s, reaver, Kind.Scarab), true);
  assert.equal(canQueueInternalProduct(s, reaver, Kind.Scarab, 1), false);

  assert.equal(completeInternalProduct(s, reaver, Kind.Scarab), true);
  assert.equal(e.specialAmmo[reaver], REAVER_SCARAB_CAPACITY);
  assert.equal(completeInternalProduct(s, reaver, Kind.Scarab), true);
  assert.equal(e.specialAmmo[reaver], REAVER_SCARAB_CAPACITY);
  assert.equal(completeInternalProduct(s, reaver, Kind.Interceptor), false);
});

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
  e.x[slotOf(target)] = fx(620);
  e.y[slotOf(target)] = fx(400);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'attack', unit: reaver, target }] }]), [
    { player: 0, index: 0, t: 'attack', ok: true },
  ]);

  assert.equal(e.specialAmmo[r], 0);
  assert.equal(e.hp[slotOf(target)], hpBefore, 'scarab travel delays damage');
  assert.equal(launchedScarabs(s, r).length, 1);

  for (let t = 0; t < 120 && launchedScarabs(s, r).length > 0; t++) sim.step([]);

  assert.equal(launchedScarabs(s, r).length, 0);
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
  for (let t = 0; t < 60; t++) {
    normal.step([]);
    upgraded.step([]);
  }

  const normalDamage = normalHp - normal.fullState().e.hp[slotOf(normalTarget)]!;
  const upgradedDamage = upgradedHp - upgraded.fullState().e.hp[slotOf(upgradedTarget)]!;
  assert.ok(upgradedDamage > normalDamage);
  assert.equal(reaverScarabCapacity(normal.fullState(), slotOf(normalReaver)), REAVER_SCARAB_CAPACITY);
  assert.equal(reaverScarabCapacity(upgraded.fullState(), slotOf(upgradedReaver)), REAVER_SCARAB_UPGRADED_CAPACITY);
});

test('reaver scarabs dud if their target becomes invalid before impact', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 609 });
  const s = sim.fullState();
  const e = s.e;
  const reaver = spawnUnit(s, Kind.Reaver, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.SiegeTank, 1, fx(620), fx(400));
  const near = spawnUnit(s, Kind.Marine, 1, fx(620), fx(424));
  const r = slotOf(reaver);
  const t = slotOf(target);
  const n = slotOf(near);
  e.specialAmmo[r] = 1;
  const nearHp = e.hp[n]!;

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: reaver, target }] }]);
  assert.equal(launchedScarabs(s, r).length, 1);
  kill(s, t);

  for (let i = 0; i < 200; i++) sim.step([]);

  assert.equal(launchedScarabs(s, r).length, 0);
  assert.equal(e.hp[n], nearHp, 'dud scarab must not splash around a dead target');
  assert.equal(e.specialAmmo[r], 0, 'fired scarabs are spent even if they dud');
});

test('scarab splash damage falls off by radius after upgrades and armor', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 611 });
  const s = sim.fullState();
  const e = s.e;
  const reaver = slotOf(spawnUnit(s, Kind.Reaver, 0, fx(400), fx(400)));
  const target = slotOf(spawnUnit(s, Kind.SiegeTank, 1, fx(620), fx(400)));
  const inner = slotOf(spawnUnit(s, Kind.SiegeTank, 1, fx(636), fx(400)));
  const medium = slotOf(spawnUnit(s, Kind.SiegeTank, 1, fx(652), fx(400)));
  const outer = slotOf(spawnUnit(s, Kind.SiegeTank, 1, fx(672), fx(400)));
  const beyond = slotOf(spawnUnit(s, Kind.SiegeTank, 1, fx(684), fx(400)));
  const before = [target, inner, medium, outer, beyond].map((slot) => e.hp[slot]!);
  setTechLevel(s, 0, Tech.ScarabDamage, 1);

  applyWeaponHit(s, target, Units[Kind.Scarab]!.weapon!, reaver);

  assert.equal(before[0]! - e.hp[target]!, 124);
  assert.equal(before[1]! - e.hp[inner]!, 124);
  assert.equal(before[2]! - e.hp[medium]!, 61);
  assert.equal(before[3]! - e.hp[outer]!, 30);
  assert.equal(e.hp[beyond], before[4]);
});

test('reaver scarabs path around terrain before impacting', () => {
  const w = 20;
  const h = 12;
  const walk = new Uint8Array(w * h).fill(1);
  for (let y = 0; y <= 8; y++) walk[y * w + 10] = 0;
  const map: MapDef = {
    name: 'scarab-wall', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [{ x: 2, y: 10 }, { x: 17, y: 1 }], resources: [], teams: [0, 1],
  };
  const sim = new Sim({ map, players: 2, seed: 610 });
  const s = sim.fullState();
  const e = s.e;
  const reaver = spawnUnit(s, Kind.Reaver, 0, tc(4), tc(4));
  const target = spawnUnit(s, Kind.SiegeTank, 1, tc(12), tc(4));
  const r = slotOf(reaver);
  const t = slotOf(target);
  e.specialAmmo[r] = 1;
  const hpBefore = e.hp[t]!;

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: reaver, target }] }]);
  assert.equal(launchedScarabs(s, r).length, 1);

  for (let i = 0; i < 180 && launchedScarabs(s, r).length > 0; i++) sim.step([]);

  assert.equal(launchedScarabs(s, r).length, 0);
  assert.ok(e.hp[t]! < hpBefore, 'scarab should route around the wall and impact');
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

test('carrier interceptor launch and return use internal product readiness', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 6051 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = slotOf(spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400)));

  assert.equal(hasInternalProductReady(s, carrier, Kind.Interceptor), false);
  assert.equal(storeInternalProduct(s, carrier, Kind.Interceptor), true);
  assert.equal(hasInternalProductReady(s, carrier, Kind.Interceptor), true);
  assert.equal(storeInternalProduct(s, carrier, Kind.Interceptor), true);
  assert.equal(e.specialAmmo[carrier], 2);
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

test('carriers launch interceptors from deterministic facing bays', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 612 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.CommandCenter, 1, fx(560), fx(400));
  const c = slotOf(carrier);
  const t = slotOf(target);
  e.specialAmmo[c] = 2;

  assert.equal(launchInterceptor(s, c, t), true);
  const firstBay = carrierBayPoint(s, c, 0);
  const first = launchedInterceptors(s, c)[0]!;
  assert.equal(e.x[first], firstBay.x);
  assert.equal(e.y[first], firstBay.y);
  assert.ok(e.faceX[c]! > 0, 'carrier should face its launch target');
  assert.ok(e.faceX[first]! > 0, 'interceptor should face its launch target');

  assert.equal(launchInterceptor(s, c, t), true);
  const secondBay = carrierBayPoint(s, c, 1);
  const second = launchedInterceptors(s, c)[1]!;
  assert.equal(e.x[second], secondBay.x);
  assert.equal(e.y[second], secondBay.y);
});

test('launched interceptor steering is owned by the interceptor system', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 613 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.CommandCenter, 1, fx(560), fx(400));
  const c = slotOf(carrier);
  e.specialAmmo[c] = 1;

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: carrier, target }] }]);

  const interceptor = launchedInterceptors(s, c)[0]!;
  const bay = carrierBayPoint(s, c, 0);
  const moved = distSq(e.x[interceptor]!, e.y[interceptor]!, bay.x, bay.y);
  const maxStep = Units[Kind.Interceptor]!.speed + 1;
  assert.ok(moved <= maxStep * maxStep, 'first tick should move once, not once in combat and again in interceptor steering');
});

test('returning interceptors dock at carrier bays and restore ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 614 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.CommandCenter, 1, fx(560), fx(400));
  const c = slotOf(carrier);
  const t = slotOf(target);
  e.specialAmmo[c] = 1;
  assert.equal(launchInterceptor(s, c, t), true);
  const interceptor = launchedInterceptors(s, c)[0]!;
  e.x[interceptor] = fx(540);
  e.y[interceptor] = fx(460);
  e.target[interceptor] = NONE;
  e.timer[interceptor] = -1;
  const bay = carrierBayPoint(s, c, interceptor);
  const before = distSq(e.x[interceptor]!, e.y[interceptor]!, bay.x, bay.y);

  interceptors(s);

  assert.ok(distSq(e.x[interceptor]!, e.y[interceptor]!, bay.x, bay.y) < before);

  for (let i = 0; i < 80 && launchedInterceptors(s, c).length > 0; i++) interceptors(s);

  assert.equal(launchedInterceptors(s, c).length, 0);
  assert.equal(e.specialAmmo[c], 1);
});

test('carriers launch interceptors that orbit targets and return as ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 607 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.CommandCenter, 1, fx(560), fx(400));
  const c = slotOf(carrier);
  const t = slotOf(target);
  e.specialAmmo[c] = 1;
  const hpBefore = e.hp[t]!;

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'attack', unit: carrier, target }] }]), [
    { player: 0, index: 0, t: 'attack', ok: true },
  ]);
  assert.equal(e.specialAmmo[c], 0);
  assert.equal(launchedInterceptors(s, c).length, 1);

  for (let i = 0; i < 70; i++) sim.step([]);

  const launched = launchedInterceptors(s, c);
  assert.equal(launched.length, 1);
  const interceptor = launched[0]!;
  assert.equal(e.target[interceptor], target);
  const dx = e.x[interceptor]! - e.x[t]!;
  const dy = e.y[interceptor]! - e.y[t]!;
  assert.ok(dx * dx + dy * dy <= tiles(2) * tiles(2));
  assert.ok(e.hp[t]! < hpBefore);

  kill(s, t);
  for (let i = 0; i < 120; i++) sim.step([]);

  assert.equal(launchedInterceptors(s, c).length, 0);
  assert.equal(e.specialAmmo[c], 1);
});

test('idle carriers auto-launch interceptors at visible enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 608 });
  const s = sim.fullState();
  const e = s.e;
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(400), fx(400));
  spawnUnit(s, Kind.CommandCenter, 1, fx(500), fx(400));
  const c = slotOf(carrier);
  e.specialAmmo[c] = 1;

  for (let i = 0; i < 3; i++) sim.step([]);

  assert.equal(e.specialAmmo[c], 0);
  assert.equal(launchedInterceptors(s, c).length, 1);
});
