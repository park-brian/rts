import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, slotOf, eid, NEUTRAL } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { stepWorld } from '../src/tick.ts';
import { setupMatch } from '../src/setup.ts';
import { sliceMap } from '../src/map.ts';
import { Kind, Order, Role, TILE, MINE_AMOUNT } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const open = (w: number, h: number): MapDef => ({
  name: 'open', w, h, walk: new Uint8Array(w * h).fill(1), build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

test('a patch is reserved while mined — at most one worker extracts at a time', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12));
  const node = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(12), tc(8)));
  e.cargo[node] = 1_000_000; // effectively inexhaustible
  const ws: number[] = [];
  for (let i = 0; i < 5; i++) {
    const w = slotOf(spawnUnit(s, Kind.SCV, 0, tc(10 + i), tc(7)));
    e.order[w] = Order.Harvest; e.target[w] = eid(e, node);
    ws.push(w);
  }
  let maxConcurrent = 0;
  for (let t = 0; t < 1500; t++) {
    stepWorld(s, []);
    let mining = 0;
    for (const w of ws) if (e.alive[w] === 1 && e.timer[w]! > 0) mining++;
    if (mining > maxConcurrent) maxConcurrent = mining;
  }
  assert.equal(maxConcurrent, 1, 'reservation serializes extraction (rotation)');
  assert.ok(s.players.minerals[0]! > 0, 'minerals still accrue via rotation');
});

test('workers re-route to another patch when theirs depletes', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12));
  const a = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(9), tc(8)));
  const b = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(15), tc(8)));
  e.cargo[a] = 2 * MINE_AMOUNT; // depletes quickly
  e.cargo[b] = 1_000_000;
  const ws: number[] = [];
  for (let i = 0; i < 3; i++) {
    const w = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8 + i), tc(7)));
    e.order[w] = Order.Harvest; e.target[w] = eid(e, a);
    ws.push(w);
  }
  for (let t = 0; t < 1200; t++) stepWorld(s, []);
  assert.equal(e.alive[a], 0, 'the small patch is mined out');
  for (const w of ws) {
    assert.equal(e.order[w], Order.Harvest, 'workers keep harvesting');
    assert.equal(slotOf(e.target[w]!), b, 're-routed to the remaining patch');
  }
});

test('starting workers spread across the mineral line (fewest-miners-first)', () => {
  const s = setupMatch(sliceMap(), 2, 1);
  const e = s.e;
  const targets = new Set<number>();
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && (e.flags[i]! & Role.Worker) !== 0 && e.order[i] === Order.Harvest) {
      targets.add(slotOf(e.target[i]!));
    }
  }
  assert.equal(targets.size, 4, 'four starting workers pick four distinct patches');
});

test('a command center defaults its rally to the mineral line', () => {
  const s = setupMatch(sliceMap(), 2, 1);
  const e = s.e;
  let cc = -1;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.CommandCenter && e.owner[i] === 0) { cc = i; break; }
  assert.ok(cc >= 0);
  assert.ok(e.rallyX[cc]! >= 0, 'rally point is set');
  assert.ok((e.flags[slotOf(e.rallyTarget[cc]!)]! & Role.Resource) !== 0, 'rally target is a resource');
});
