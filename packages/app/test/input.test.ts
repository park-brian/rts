import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInput } from '../src/input.ts';
import { ui } from '../src/store.ts';

type Listener = (e: any) => void;

class FakeCanvas {
  listeners = new Map<string, Listener[]>();
  getBoundingClientRect(): { left: number; top: number } { return { left: 0, top: 0 }; }
  setPointerCapture(): void {}
  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  fire(type: string, e: any): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}

const pointer = (pointerId: number, clientX: number, clientY: number, extra: Record<string, unknown> = {}): any =>
  ({ pointerId, clientX, clientY, button: 0, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, ...extra });

const makeGame = (): {
  game: any;
  calls: { tap: number; box: number; minimap: number; desktopTap: number; smart: number; edge: number; clearEdge: number };
} => {
  const calls = { tap: 0, box: 0, minimap: 0, desktopTap: 0, smart: 0, edge: 0, clearEdge: 0 };
  const game: any = {
    box: null,
    camX: 0,
    camY: 0,
    zoom: 1,
    screenToWorld: (x: number, y: number): [number, number] => [x, y],
    clampCamera: () => {},
    minimapPan: () => { calls.minimap++; return false; },
    tap: () => { calls.tap++; },
    desktopSelectTap: () => { calls.desktopTap++; },
    desktopSmartTap: () => { calls.smart++; },
    setEdgePanPointer: () => { calls.edge++; },
    clearEdgePan: () => { calls.clearEdge++; },
    updatePlacementGhost: () => {},
    commitPlacementGhost: () => false,
    cancelPlacementGhost: () => {},
    selectAllByType: () => {},
    boxSelect: () => { calls.box++; },
  };
  return { game, calls };
};

test('single pointer tap emits one tap', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'mobile';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointerup', pointer(1, 20, 20));

  assert.equal(calls.tap, 1);
  assert.equal(calls.box, 0);
});

test('single pointer drag emits box select', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'mobile';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointermove', pointer(1, 60, 60));
  canvas.fire('pointerup', pointer(1, 60, 60));

  assert.equal(calls.tap, 0);
  assert.equal(calls.box, 1);
});

test('build placement drag updates ghost and commits on pointer up', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  const updates: Array<[number, number]> = [];
  let commits = 0;
  game.updatePlacementGhost = (x: number, y: number): void => { updates.push([x, y]); };
  game.commitPlacementGhost = (): boolean => { commits++; return true; };
  attachInput(canvas as any, game);

  ui.controlScheme.value = 'mobile';
  ui.placement.value = 1;
  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointermove', pointer(1, 60, 60));
  canvas.fire('pointerup', pointer(1, 70, 70));
  ui.placement.value = 0;

  assert.deepEqual(updates, [[20, 20], [60, 60], [70, 70]]);
  assert.equal(commits, 1);
  assert.equal(calls.tap, 0);
  assert.equal(calls.box, 0);
});

test('two-finger camera gesture suppresses remaining-finger tap and box', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'mobile';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointerdown', pointer(2, 80, 20));
  canvas.fire('pointermove', pointer(2, 90, 20));
  canvas.fire('pointerup', pointer(2, 90, 20));
  canvas.fire('pointermove', pointer(1, 70, 70));
  canvas.fire('pointerup', pointer(1, 70, 70));

  assert.equal(calls.tap, 0);
  assert.equal(calls.box, 0);
  assert.equal(game.box, null);
});

test('desktop pointer routes left click to selection and right click to smart command', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointerup', pointer(1, 20, 20));
  canvas.fire('pointerdown', pointer(2, 40, 40, { button: 2 }));
  canvas.fire('pointerup', pointer(2, 40, 40, { button: 2 }));

  assert.equal(calls.tap, 0);
  assert.equal(calls.desktopTap, 1);
  assert.equal(calls.smart, 1);
});

test('desktop mouse hover tracks screen-edge panning and clears on leave', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('mousemove', { clientX: 2, clientY: 40 });
  canvas.fire('mouseleave', {});

  assert.equal(calls.edge, 1);
  assert.equal(calls.clearEdge, 1);
});
