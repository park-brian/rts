import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  Kind, ONE, TILE, bodyBounds, eid, fx, makeState, slotOf, spawnUnit, structureFootprint,
  type MapDef, type State,
} from '../src/sim.ts';

type HarnessGame = Game & { canSeeEntity: (slot: number) => boolean };

const blankMap = (): MapDef => {
  const w = 64;
  const h = 64;
  const n = w * h;
  return {
    name: 'selection geometry',
    w,
    h,
    walk: new Uint8Array(n).fill(1),
    build: new Uint8Array(n).fill(1),
    elev: new Uint8Array(n),
    starts: [{ x: 8, y: 8 }],
    resources: [],
    teams: [0],
    bases: [],
  };
};

const harness = (): { g: HarnessGame; s: State } => {
  const s = makeState(blankMap(), 1, 1);
  const g = Object.create(Game.prototype) as HarnessGame;
  g.sim = { fullState: () => s } as Game['sim'];
  g.human = 0;
  g.camX = 0;
  g.camY = 0;
  g.zoom = 1;
  g.viewW = 800;
  g.viewH = 600;
  g.selection = new Set<number>();
  g.canSeeEntity = () => true;
  return { g, s };
};

const screenWorld = (g: Game, x: number, y: number): { x: number; y: number } => ({
  x: (x - g.camX) * g.zoom,
  y: (y - g.camY) * g.zoom,
});

test('math footprint structure edges are selectable by click and drag box', () => {
  const { g, s } = harness();
  const e = s.e;
  const cc = spawnUnit(s, Kind.CommandCenter, 0, fx(400), fx(400));
  const slot = slotOf(cc);
  const fp = structureFootprint(Kind.CommandCenter, e.x[slot]!, e.y[slot]!);
  const left = fp.x0 * TILE;
  const right = (fp.x1 + 1) * TILE;
  const bottom = (fp.y1 + 1) * TILE;
  const midY = (fp.y0 * TILE + bottom) / 2;
  const midX = (left + right) / 2;

  assert.equal(g.hitTest(left + 0.5, midY), cc);
  assert.equal(g.hitTest(right - 0.5, midY), cc);
  assert.equal(g.hitTest(midX, bottom - 0.5), cc);
  assert.equal(g.hitTest(right + 1, midY), -1);

  const edge = screenWorld(g, right - 0.5, midY);
  g.boxSelect(edge.x - 1, edge.y - 1, edge.x + 1, edge.y + 1);

  assert.deepEqual([...g.selection], [cc]);
});

test('math body bounds, not the detached health bar, define mobile unit hit tests', () => {
  const { g, s } = harness();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const slot = slotOf(marine);
  const x = e.x[slot]! / ONE;
  const y = e.y[slot]! / ONE;
  const b = bodyBounds(Kind.Marine);

  assert.equal(g.hitTest(x, y + b.down / ONE - 0.5), marine);
  assert.equal(g.hitTest(x, y - b.up / ONE + 0.5), marine);
  assert.equal(g.hitTest(x, y - b.up / ONE - 6), -1);
});

test('desktop select tap can keep the pointer-down hit after a unit moves', () => {
  const { g, s } = harness();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const slot = slotOf(marine);
  const p = screenWorld(g, e.x[slot]! / ONE, e.y[slot]! / ONE);
  const preferredHit = g.hitTest(e.x[slot]! / ONE, e.y[slot]! / ONE);
  e.x[slot] = fx(520);
  e.y[slot] = fx(520);

  assert.equal(g.hitTest(g.camX + p.x / g.zoom, g.camY + p.y / g.zoom), -1);

  g.desktopSelectTap(p.x, p.y, { preferredHit });

  assert.deepEqual([...g.selection], [marine]);
  assert.equal(eid(e, slot), marine);
});
