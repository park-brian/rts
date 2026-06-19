import test from 'node:test';
import assert from 'node:assert/strict';
import { eid, kill, slotOf, type State } from '../src/entity/world.ts';
import { canDetect } from '../src/mechanics/detection.ts';
import { Kind, Protoss, Tech, Units } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { simScenario } from '../test-support/scenario.ts';

const protossScenario = () => simScenario({ players: 1, seed: 1, factions: [Protoss] });

const find = (s: State, kind: number): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === kind) return i;
  }
  throw new Error(`missing kind ${kind}`);
};

const countKind = (s: State, kind: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === kind) count++;
  }
  return count;
};

test('protoss tech buildings require pylon power for placement', () => {
  const { sim, state: s, spawn, resources } = protossScenario();
  const e = s.e;
  const nexus = find(s, Kind.Nexus);
  const probe = slotOf(spawn(Kind.Probe, 0, e.x[nexus]! + fx(180), e.y[nexus]!));
  spawn(Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!);
  resources(0, 1_000);

  const near = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, probe), kind: Kind.Gateway, x: e.x[nexus]! + fx(200), y: e.y[nexus]! + fx(128) },
  ] }]);
  assert.deepEqual(near, [{ player: 0, index: 0, t: 'build', ok: true }]);

  const farProbe = slotOf(spawn(Kind.Probe, 0, fx(1_600), fx(1_600)));
  const far = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, farProbe), kind: Kind.Gateway, x: fx(1_600), y: fx(1_600) },
  ] }]);
  assert.deepEqual(far, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'placement-blocked' }]);
});

test('unpowered protoss producers reject new work and pause existing queues', () => {
  const { sim, state: s, spawn, resources } = protossScenario();
  const e = s.e;
  const nexus = find(s, Kind.Nexus);
  const pylon = slotOf(spawn(Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!));
  const gateway = slotOf(spawn(Kind.Gateway, 0, e.x[nexus]! + fx(200), e.y[nexus]! + fx(128)));
  resources(0, 1_000, 1_000);

  const accepted = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, gateway), kind: Kind.Zealot }] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'train', ok: true }]);
  e.prodTimer[gateway] = 3;
  kill(s, pylon);

  const rejected = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, gateway), kind: Kind.Zealot }] }]);
  assert.deepEqual(rejected, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-capability' }]);
  assert.equal(e.prodTimer[gateway], 3);

  spawn(Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!);
  for (let i = 0; i < 3; i++) sim.step([]);
  assert.equal(e.prodKind[gateway], Kind.None);
});

test('protoss power and production resume through normal sim stepping', () => {
  const { sim, state: s, spawn, resources } = protossScenario();
  const e = s.e;
  const nexus = find(s, Kind.Nexus);
  const pylon = slotOf(spawn(Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!));
  const gateway = slotOf(spawn(Kind.Gateway, 0, e.x[nexus]! + fx(200), e.y[nexus]! + fx(128)));
  resources(0, 1_000, 1_000);
  const beforeZealots = countKind(s, Kind.Zealot);

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, gateway), kind: Kind.Zealot },
  ] }]), [{ player: 0, index: 0, t: 'train', ok: true }]);

  const started = e.prodTimer[gateway]!;
  sim.step([]);
  assert.equal(e.prodTimer[gateway], started - 1);

  kill(s, pylon);
  const paused = e.prodTimer[gateway]!;
  for (let i = 0; i < 5; i++) sim.step([]);
  assert.equal(e.prodTimer[gateway], paused);
  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, gateway), kind: Kind.Zealot },
  ] }]), [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-capability' }]);

  spawn(Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!);
  while (e.prodKind[gateway] !== Kind.None) sim.step([]);

  assert.equal(countKind(s, Kind.Zealot), beforeZealots + 1);
  assert.equal(e.prodTimer[gateway], 0);
});

test('unpowered protoss research producers reject research', () => {
  const { sim, state: s, spawn, resources } = protossScenario();
  const e = s.e;
  const nexus = find(s, Kind.Nexus);
  const forge = slotOf(spawn(Kind.Forge, 0, e.x[nexus]! + fx(200), e.y[nexus]! + fx(128)));
  resources(0, 1_000, 1_000);

  const rejected = sim.step([{ player: 0, cmds: [{ t: 'research', building: eid(e, forge), tech: Tech.GroundWeapons }] }]);

  assert.deepEqual(rejected, [{ player: 0, index: 0, t: 'research', ok: false, reason: 'missing-capability' }]);
});

test('unpowered photon cannons cannot attack or detect', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 90 });
  const e = s.e;
  const cannon = slotOf(spawn(Kind.PhotonCannon, 0, fx(400), fx(400)));
  const ling = slotOf(spawn(Kind.Zergling, 1, fx(500), fx(400)));
  const dt = slotOf(spawn(Kind.DarkTemplar, 1, fx(650), fx(430)));
  const hp = e.hp[ling]!;

  assert.equal(canDetect(s, 0, dt), false);
  for (let i = 0; i < 40; i++) sim.step([]);
  assert.equal(e.hp[ling], hp);

  spawn(Kind.Pylon, 0, fx(430), fx(400));
  assert.equal(canDetect(s, 0, dt), true);
  for (let i = 0; i < Units[Kind.PhotonCannon]!.weapon!.cooldown + 1; i++) sim.step([]);
  assert.ok(e.hp[ling]! < hp);
});
