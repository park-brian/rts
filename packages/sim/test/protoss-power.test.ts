import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { setupMatch } from '../src/setup.ts';
import { eid, kill, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { canDetect } from '../src/detection.ts';
import { Kind, Protoss, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';

const protossSim = (): Sim => Sim.fromState(setupMatch(sliceMap(), 1, 1, [Protoss]));

const find = (sim: Sim, kind: number): number => {
  const e = sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === kind) return i;
  }
  throw new Error(`missing kind ${kind}`);
};

test('protoss tech buildings require pylon power for placement', () => {
  const sim = protossSim();
  const s = sim.fullState();
  const e = s.e;
  const nexus = find(sim, Kind.Nexus);
  const probe = slotOf(spawnUnit(s, Kind.Probe, 0, e.x[nexus]! + fx(180), e.y[nexus]!));
  spawnUnit(s, Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!);
  s.players.minerals[0] = 1_000;

  const near = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, probe), kind: Kind.Gateway, x: e.x[nexus]! + fx(200), y: e.y[nexus]! + fx(128) },
  ] }]);
  assert.deepEqual(near, [{ player: 0, index: 0, t: 'build', ok: true }]);

  const farProbe = slotOf(spawnUnit(s, Kind.Probe, 0, fx(1_600), fx(1_600)));
  const far = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, farProbe), kind: Kind.Gateway, x: fx(1_600), y: fx(1_600) },
  ] }]);
  assert.deepEqual(far, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'placement-blocked' }]);
});

test('unpowered protoss producers reject new work and pause existing queues', () => {
  const sim = protossSim();
  const s = sim.fullState();
  const e = s.e;
  const nexus = find(sim, Kind.Nexus);
  const pylon = slotOf(spawnUnit(s, Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!));
  const gateway = slotOf(spawnUnit(s, Kind.Gateway, 0, e.x[nexus]! + fx(200), e.y[nexus]! + fx(128)));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const accepted = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, gateway), kind: Kind.Zealot }] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'train', ok: true }]);
  e.prodTimer[gateway] = 3;
  kill(s, pylon);

  const rejected = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, gateway), kind: Kind.Zealot }] }]);
  assert.deepEqual(rejected, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-capability' }]);
  assert.equal(e.prodTimer[gateway], 3);

  spawnUnit(s, Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!);
  for (let i = 0; i < 3; i++) sim.step([]);
  assert.equal(e.prodKind[gateway], Kind.None);
});

test('unpowered protoss research producers reject research', () => {
  const sim = protossSim();
  const s = sim.fullState();
  const e = s.e;
  const nexus = find(sim, Kind.Nexus);
  const forge = slotOf(spawnUnit(s, Kind.Forge, 0, e.x[nexus]! + fx(200), e.y[nexus]! + fx(128)));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const rejected = sim.step([{ player: 0, cmds: [{ t: 'research', building: eid(e, forge), tech: Tech.GroundWeapons }] }]);

  assert.deepEqual(rejected, [{ player: 0, index: 0, t: 'research', ok: false, reason: 'missing-capability' }]);
});

test('unpowered photon cannons cannot attack or detect', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 90 });
  const s = sim.fullState();
  const e = s.e;
  const cannon = slotOf(spawnUnit(s, Kind.PhotonCannon, 0, fx(400), fx(400)));
  const ling = slotOf(spawnUnit(s, Kind.Zergling, 1, fx(500), fx(400)));
  const dt = slotOf(spawnUnit(s, Kind.DarkTemplar, 1, fx(650), fx(430)));
  const hp = e.hp[ling]!;

  assert.equal(canDetect(s, 0, dt), false);
  for (let i = 0; i < 40; i++) sim.step([]);
  assert.equal(e.hp[ling], hp);

  spawnUnit(s, Kind.Pylon, 0, fx(430), fx(400));
  assert.equal(canDetect(s, 0, dt), true);
  for (let i = 0; i < Units[Kind.PhotonCannon]!.weapon!.cooldown + 1; i++) sim.step([]);
  assert.ok(e.hp[ling]! < hp);
});
