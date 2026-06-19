import test from 'node:test';
import assert from 'node:assert/strict';
import type { Command, PlayerCommands } from '../src/commands.ts';
import { Kind, Tech } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { eid, isAlive, slotOf } from '../src/entity/world.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { setTechLevel } from '../src/tech.ts';

const next = (x: number): number => (Math.imul(x, 1664525) + 1013904223) >>> 0;

const setup = (): Sim => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 1501, vision: true });
  const s = sim.fullState();
  s.players.minerals.fill(5_000);
  s.players.gas.fill(5_000);
  s.players.supplyMax.fill(200);
  for (let p = 0; p < 2; p++) {
    setTechLevel(s, p, Tech.SpiderMines, 1);
    setTechLevel(s, p, Tech.StimPack, 1);
    const baseX = fx(300 + p * 500);
    spawnUnit(s, Kind.Marine, p, baseX, fx(300));
    spawnUnit(s, Kind.SCV, p, baseX + fx(40), fx(300));
    const vulture = slotOf(spawnUnit(s, Kind.Vulture, p, baseX + fx(80), fx(300)));
    s.e.specialAmmo[vulture] = 3;
    spawnUnit(s, Kind.Barracks, p, baseX, fx(380));
    spawnUnit(s, Kind.Mineral, 255, baseX + fx(120), fx(300));
  }
  return sim;
};

const idsFor = (sim: Sim): number[] => {
  const e = sim.fullState().e;
  const ids: number[] = [];
  for (let i = 0; i < e.hi; i++) if (isAlive(e, eid(e, i))) ids.push(eid(e, i));
  return ids;
};

const commandAt = (sim: Sim, player: number, seed: number): Command => {
  const ids = idsFor(sim);
  const pick = (salt: number): number => ids[(seed + salt) % Math.max(1, ids.length)] ?? 0x7fff_0000;
  const actor = pick(3);
  const target = pick(11);
  const x = fx(80 + (seed % 20) * 32);
  const y = fx(96 + ((seed >>> 5) % 20) * 32);
  switch (seed % 14) {
    case 0: return { t: 'move', unit: actor, x, y };
    case 1: return { t: 'amove', unit: actor, x, y };
    case 2: return { t: 'attack', unit: actor, target };
    case 3: return { t: 'harvest', unit: actor, patch: target };
    case 4: return { t: 'repair', unit: actor, target };
    case 5: return { t: 'rally', building: actor, x, y, target };
    case 6: return { t: 'burrow', unit: actor, active: (seed & 1) === 0 };
    case 7: return { t: 'mine', unit: actor };
    case 8: return { t: 'train', building: actor, kind: Kind.Marine };
    case 9: return { t: 'build', unit: actor, kind: Kind.SupplyDepot, x, y };
    case 10: return { t: 'ability', unit: actor, ability: 1, target, x, y };
    case 11: return { t: 'load', transport: actor, unit: target };
    case 12: return { t: 'unload', transport: actor, unit: target, x, y };
    default: return { t: 'stop', unit: actor };
  }
};

const runFuzz = (): { hash: number; summary: string } => {
  const sim = setup();
  let seed = 0x5151_abcd;
  const summary: string[] = [];
  for (let tick = 0; tick < 96; tick++) {
    const batch: PlayerCommands[] = [];
    for (let player = 0; player < 2; player++) {
      const cmds: Command[] = [];
      for (let i = 0; i < 4; i++) {
        seed = next(seed);
        cmds.push(commandAt(sim, player, seed));
      }
      batch.push({ player, cmds });
    }
    const results = sim.step(batch);
    let ok = 0;
    let rejected = 0;
    for (const result of results) result.ok ? ok++ : rejected++;
    summary.push(`${ok}/${rejected}`);
  }
  return { hash: sim.hash(), summary: summary.join(',') };
};

test('seeded abusive command stream is deterministic and does not throw', () => {
  const a = runFuzz();
  const b = runFuzz();
  assert.deepEqual(b, a);
  assert.ok(a.hash > 0);
});
