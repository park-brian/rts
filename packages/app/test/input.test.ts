import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInput } from '../src/input.ts';
import { dispatchHotkey, resetHotkeys } from '../src/hotkeys.ts';
import { ui } from '../src/store.ts';
import { Kind, fx, spawnUnit } from '../src/sim.ts';
import { centerOnEntity, desktopGame, screenOf, select } from '../test-support/harness.ts';

type Listener = (e: any) => void;

class FakeCanvas {
  listeners = new Map<string, Listener[]>();
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 800, height: 600 };
  }
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
  ui.armedCommand.value = { t: 'none' };
  const calls = { tap: 0, box: 0, minimap: 0, desktopTap: 0, smart: 0, edge: 0, clearEdge: 0 };
  const game: any = {
    box: null,
    camX: 0,
    camY: 0,
    zoom: 1,
    viewW: 800,
    viewH: 600,
    screenToWorld: (x: number, y: number): [number, number] => [x, y],
    hitTest: () => -1,
    clampCamera: () => {},
    minimapPan: () => { calls.minimap++; return false; },
    tap: () => { calls.tap++; },
    desktopSelectTap: () => { calls.desktopTap++; },
    desktopSmartTap: () => { calls.smart++; },
    setEdgePanPointer: () => { calls.edge++; },
    setEdgePanPointerInRect: () => { calls.edge++; },
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
  ui.armedCommand.value = { t: 'place', kind: 1 };
  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointermove', pointer(1, 60, 60));
  canvas.fire('pointerup', pointer(1, 70, 70));
  ui.armedCommand.value = { t: 'none' };

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
  let prevented = 0;
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointerup', pointer(1, 20, 20));
  canvas.fire('pointerdown', pointer(2, 40, 40, { button: 2, preventDefault: () => { prevented++; } }));
  canvas.fire('pointerup', pointer(2, 40, 40, { button: 2 }));
  canvas.fire('contextmenu', { preventDefault: () => { prevented++; } });

  assert.equal(calls.tap, 0);
  assert.equal(calls.desktopTap, 1);
  assert.equal(calls.smart, 1);
  assert.equal(prevented, 2);
});

test('desktop armed left click routes to command tap instead of selection', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'desktop';
  ui.armedCommand.value = { t: 'attackMove' };
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointerup', pointer(1, 20, 20));

  assert.equal(calls.tap, 1);
  assert.equal(calls.desktopTap, 0);
  assert.equal(calls.smart, 0);
});

test('desktop attack hotkey arms a shared attack command on the next left click', () => {
  resetHotkeys();
  const canvas = new FakeCanvas();
  const g = desktopGame(105);
  g.resize(800, 600);
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(500), fx(400));
  let desktopSelectTaps = 0;
  let smartTaps = 0;
  const game = g as any;
  const desktopSelectTap = game.desktopSelectTap.bind(game);
  const desktopSmartTap = game.desktopSmartTap.bind(game);
  game.desktopSelectTap = (...args: any[]) => { desktopSelectTaps++; return desktopSelectTap(...args); };
  game.desktopSmartTap = (...args: any[]) => { smartTaps++; return desktopSmartTap(...args); };
  select(g, [marine]);
  centerOnEntity(g, enemy);
  g.fastForward(1);
  attachInput(canvas as any, game);

  assert.equal(dispatchHotkey(g, 'KeyA'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'attackMove' });
  const p = screenOf(g, enemy);
  canvas.fire('pointerdown', pointer(1, p.x, p.y));
  canvas.fire('pointerup', pointer(1, p.x, p.y));

  assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy }]);
  assert.equal(desktopSelectTaps, 0);
  assert.equal(smartTaps, 0);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('desktop armed right click still routes to smart command', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  ui.controlScheme.value = 'desktop';
  ui.armedCommand.value = { t: 'attackMove' };
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20, { button: 2 }));
  canvas.fire('pointerup', pointer(1, 20, 20, { button: 2 }));

  assert.equal(calls.tap, 0);
  assert.equal(calls.desktopTap, 0);
  assert.equal(calls.smart, 1);
});

test('desktop shift reaches smart and armed command taps', () => {
  const canvas = new FakeCanvas();
  const { game } = makeGame();
  const seen: Array<{ path: string; shift?: boolean }> = [];
  game.desktopSmartTap = (_x: number, _y: number, opts: { shift?: boolean }): void => {
    seen.push({ path: 'smart', shift: opts.shift });
  };
  game.tap = (_x: number, _y: number, opts: { shift?: boolean }): void => {
    seen.push({ path: 'tap', shift: opts.shift });
  };
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20, { button: 2, shiftKey: true }));
  canvas.fire('pointerup', pointer(1, 20, 20, { button: 2, shiftKey: true }));
  ui.armedCommand.value = { t: 'attackMove' };
  canvas.fire('pointerdown', pointer(2, 40, 40, { shiftKey: true }));
  canvas.fire('pointerup', pointer(2, 40, 40, { shiftKey: true }));

  assert.deepEqual(seen, [
    { path: 'smart', shift: true },
    { path: 'tap', shift: true },
  ]);
});

test('desktop tap carries pointer-down hit through pointer-up for moving targets', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  let hits = 0;
  let preferred = -1;
  game.hitTest = (): number => hits++ === 0 ? 77 : -1;
  game.desktopSelectTap = (_x: number, _y: number, opts: { preferredHit?: number }): void => {
    calls.desktopTap++;
    preferred = opts.preferredHit ?? -1;
  };
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 20, 20));
  canvas.fire('pointerup', pointer(1, 20, 20));

  assert.equal(calls.desktopTap, 1);
  assert.equal(preferred, 77);
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

test('desktop wheel zoom keeps the cursor world point anchored', () => {
  const canvas = new FakeCanvas();
  const { game } = makeGame();
  const cursor = { x: 400, y: 300 };
  let prevented = 0;
  game.camX = 100;
  game.camY = 200;
  game.screenToWorld = (x: number, y: number): [number, number] => [game.camX + x / game.zoom, game.camY + y / game.zoom];
  const [worldX, worldY] = game.screenToWorld(cursor.x, cursor.y);
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('wheel', { clientX: cursor.x, clientY: cursor.y, deltaY: -1, preventDefault: () => { prevented++; } });

  assert.equal(prevented, 1);
  assert.equal(game.zoom, 1.1);
  assert.ok(Math.abs(game.camX - (worldX - cursor.x / game.zoom)) < 1e-9);
  assert.ok(Math.abs(game.camY - (worldY - cursor.y / game.zoom)) < 1e-9);
});

test('desktop middle button drags the camera instead of selecting', () => {
  const canvas = new FakeCanvas();
  const { game, calls } = makeGame();
  let prevented = 0;
  ui.controlScheme.value = 'desktop';
  attachInput(canvas as any, game);

  canvas.fire('pointerdown', pointer(1, 80, 80, { button: 1, preventDefault: () => { prevented++; } }));
  canvas.fire('pointermove', pointer(1, 110, 120, { button: 1 }));
  canvas.fire('pointerup', pointer(1, 110, 120, { button: 1 }));
  canvas.fire('auxclick', { button: 1, preventDefault: () => { prevented++; } });

  assert.equal(game.camX, -30);
  assert.equal(game.camY, -40);
  assert.equal(prevented, 2);
  assert.equal(calls.desktopTap, 0);
  assert.equal(calls.smart, 0);
  assert.equal(calls.box, 0);
});
