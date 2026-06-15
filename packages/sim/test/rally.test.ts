import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, slotOf, eid, isAlive, kill, NONE } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { stepWorld } from '../src/tick.ts';
import { Kind, Order, Role, TILE } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const open = (w: number, h: number): MapDef => ({
  name: 'open', w, h, walk: new Uint8Array(w * h).fill(1), build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

/** Find the single produced army unit (a Marine that isn't in `exclude`). */
const findMarine = (e: ReturnType<typeof makeState>['e'], exclude: Set<number>): number => {
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Marine && !exclude.has(i)) return i;
  }
  return -1;
};

test('a built structure has no default rally point', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  const rax = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(12), tc(12)));
  assert.equal(e.rallyX[rax], -1, 'no rally point (sentinel -1)');
  assert.equal(e.rallyTarget[rax], NONE, 'no rally target');
});

test('a ground-point rally makes produced army attack-move to the point', () => {
  const s = makeState(open(40, 40), 1, 1);
  const e = s.e;
  const rax = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(10), tc(20)));
  e.rallyX[rax] = tc(30); e.rallyY[rax] = tc(20); e.rallyTarget[rax] = NONE;
  e.prodKind[rax] = Kind.Marine; e.prodTimer[rax] = 1;

  stepWorld(s, []);

  const m = findMarine(e, new Set());
  assert.ok(m >= 0, 'a marine was produced');
  assert.equal(e.order[m], Order.AttackMove, 'rally is an attack-move, not a plain move');
  assert.equal(e.tx[m], tc(30), 'heads toward the rally point');
});

test('rally onto a unit follows it, and falls back to the next-closest unit when it dies', () => {
  const s = makeState(open(60, 60), 1, 1);
  const e = s.e;
  const rax = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(30), tc(30)));
  const lead = slotOf(spawnUnit(s, Kind.Marine, 0, tc(45), tc(30))); // the unit to follow
  e.order[lead] = Order.Idle;
  e.rallyTarget[rax] = eid(e, lead);
  e.rallyX[rax] = e.x[lead]!; e.rallyY[rax] = e.y[lead]!;

  // Produce one marine: it should head toward the followed unit.
  e.prodKind[rax] = Kind.Marine; e.prodTimer[rax] = 1;
  stepWorld(s, []);
  const first = findMarine(e, new Set([lead]));
  assert.ok(first >= 0, 'a marine was produced');
  assert.equal(e.order[first], Order.AttackMove, 'follows via attack-move');
  assert.ok(Math.abs(e.tx[first]! - e.x[lead]!) < tc(2), 'heads toward the followed unit');

  // The followed unit dies → the rally should re-point to the next-closest unit.
  kill(s, lead);
  e.prodKind[rax] = Kind.Marine; e.prodTimer[rax] = 1;
  stepWorld(s, []);

  assert.ok(isAlive(e, e.rallyTarget[rax]!), 'rally fell back to a live unit');
  const fb = slotOf(e.rallyTarget[rax]!);
  assert.equal(fb, first, 'fallback is the remaining (now-closest) marine');
  assert.equal(e.flags[fb]! & Role.Mobile, Role.Mobile, 'fallback is a mobile unit');
});
