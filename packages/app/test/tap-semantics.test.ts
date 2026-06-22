import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderOptionId, ui } from '../src/store.ts';
import {
  Ability, Kind, NEUTRAL, ONE, Tech, TILE, Units, canPlaceStructure, fx, setTechLevel, slotOf, smartCommandCandidates,
  spawnUnit,
} from '../src/sim.ts';
import {
  centerOnEntity, findEntity, findOwnedWorkers, freshGame, screenOf, screenOfStructureFootprintEdge,
  select,
} from '../test-support/harness.ts';

const enabledOptionIds = (options: readonly { id: number; ok: boolean }[]): number[] =>
  options.filter((option) => option.ok).map((option) => option.id);

const fixedPointAt = (g: ReturnType<typeof freshGame>, p: { x: number; y: number }): { x: number; y: number } => ({
  x: ((g.camX + p.x / g.zoom) * ONE) | 0,
  y: ((g.camY + p.y / g.zoom) * ONE) | 0,
});

test('normal tap on an owned building selects it instead of commanding selected workers', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const workers = findOwnedWorkers(g);
  select(g, workers);

  const p = screenOfStructureFootprintEdge(g, cc);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [cc]);
  assert.deepEqual(g.queued, []);
});

test('normal tap on an unfinished own Terran foundation selects it', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const e = s.e;
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, fx(430), fx(400));
  e.built[slotOf(depot)] = 0;
  e.ctimer[slotOf(depot)] = 100;
  select(g, [scv]);
  centerOnEntity(g, depot);

  const p = screenOf(g, depot);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [depot]);
  assert.deepEqual(g.queued, []);
});

test('repair target mode resumes an unfinished own Terran foundation', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const e = s.e;
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, fx(430), fx(400));
  e.built[slotOf(depot)] = 0;
  e.ctimer[slotOf(depot)] = 100;
  select(g, [scv]);
  centerOnEntity(g, depot);
  ui.armedCommand.value = { t: 'target', mode: 'repair' };

  const p = screenOf(g, depot);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'repair', unit: scv, target: depot }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('repair target mode queues damaged repair targets with Shift', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const bunker = spawnUnit(s, Kind.Bunker, 0, fx(500), fx(400));
  s.e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;
  s.players.minerals[0] = 1_000;
  select(g, [scv]);
  centerOnEntity(g, bunker);
  g.fastForward(1);
  ui.armedCommand.value = { t: 'target', mode: 'repair' };

  const p = screenOf(g, bunker);
  g.tap(p.x, p.y, { shift: true, preferredHit: bunker });

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'repair', unit: scv, target: bunker, queue: true }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('attack-move target mode rejects friendly entity taps and stays armed', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const workers = findOwnedWorkers(g);
  select(g, workers);
  ui.armedCommand.value = { t: 'attackMove' };

  const p = screenOf(g, cc);
  g.tap(p.x, p.y);

  assert.deepEqual(new Set(g.selection), new Set(workers));
  assert.deepEqual(g.queued, []);
  assert.deepEqual(ui.armedCommand.value, { t: 'attackMove' });
});

test('attack-move target mode attacks enemies and consumes the command', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(500), fx(400));
  select(g, [marine]);
  centerOnEntity(g, enemy);
  g.fastForward(1);
  ui.armedCommand.value = { t: 'attackMove' };

  const p = screenOf(g, enemy);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [marine]);
  assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('attack-move target mode sends selected mobile units to empty ground', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  select(g, [marine]);
  centerOnEntity(g, marine);
  ui.armedCommand.value = { t: 'attackMove' };

  g.tap(g.viewW / 2 + 80, g.viewH / 2 + 80);

  assert.deepEqual(g.queued, [{
    t: 'amove',
    unit: marine,
    x: ((g.camX + (g.viewW / 2 + 80) / g.zoom) * ONE) | 0,
    y: ((g.camY + (g.viewH / 2 + 80) / g.zoom) * ONE) | 0,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('move target mode sends selected mobile units to points and friendly follow targets', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const leader = spawnUnit(s, Kind.Marine, 0, fx(500), fx(400));
  select(g, [marine]);
  centerOnEntity(g, marine);
  ui.armedCommand.value = { t: 'move' };

  const ground = { x: g.viewW / 2 + 80, y: g.viewH / 2 + 80 };
  g.tap(ground.x, ground.y);

  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: marine,
    ...fixedPointAt(g, ground),
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });

  g.queued = [];
  ui.armedCommand.value = { t: 'move' };
  centerOnEntity(g, leader);
  const target = screenOf(g, leader);
  g.tap(target.x, target.y, { preferredHit: leader, shift: true });

  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: marine,
    ...fixedPointAt(g, target),
    target: leader,
    queue: true,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('production buildings set rally on a normal ground tap', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [cc]);

  g.tap(g.viewW / 2 + 80, g.viewH / 2 + 80);

  assert.equal(g.queued.length, 1);
  assert.deepEqual(g.queued[0], {
    t: 'rally',
    building: cc,
    x: ((g.camX + (g.viewW / 2 + 80) / g.zoom) * ONE) | 0,
    y: ((g.camY + (g.viewH / 2 + 80) / g.zoom) * ONE) | 0,
  });
});

test('build placement ghost previews shared placement and commits on release', () => {
  const g = freshGame();
  const worker = findOwnedWorkers(g)[0]!;
  const s = g.sim.fullState();
  const w = slotOf(worker);
  select(g, [worker]);
  ui.armedCommand.value = { t: 'place', kind: Kind.SupplyDepot };

  let candidate: { x: number; y: number } | null = null;
  for (let ty = 2; ty < g.map.h - 2 && !candidate; ty++) {
    for (let tx = 2; tx < g.map.w - 2; tx++) {
      const x = fx(tx * TILE + TILE / 2);
      const y = fx(ty * TILE + TILE / 2);
      if (canPlaceStructure(s, 0, w, Kind.SupplyDepot, x, y).ok) {
        candidate = { x, y };
        break;
      }
    }
  }
  assert.ok(candidate, 'expected a valid depot placement');
  g.centerOn(candidate.x / ONE, candidate.y / ONE);

  g.updatePlacementGhost(g.viewW / 2, g.viewH / 2);

  assert.ok(g.placementGhost?.ok);
  assert.equal(g.placementGhost?.kind, Kind.SupplyDepot);
  const ghost = g.placementGhost!;

  const committed = g.commitPlacementGhost();

  assert.equal(committed, true);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
  assert.equal(g.placementGhost, null);
  assert.equal(g.queued.length, 1);
  const command = g.queued[0]!;
  assert.equal(command.t, 'build');
  if (command.t !== 'build') throw new Error('expected build command');
  assert.equal(command.unit, worker);
  assert.equal(command.kind, Kind.SupplyDepot);
  assert.equal(command.x, ghost.x);
  assert.equal(command.y, ghost.y);
});

test('normal tap no longer commits build placement blindly', () => {
  const g = freshGame();
  const worker = findOwnedWorkers(g)[0]!;
  select(g, [worker]);
  ui.armedCommand.value = { t: 'place', kind: Kind.SupplyDepot };

  g.tap(g.viewW / 2, g.viewH / 2);

  assert.deepEqual(g.queued, []);
  assert.deepEqual(ui.armedCommand.value, { t: 'place', kind: Kind.SupplyDepot });
});

test('invalid build placement ghost does not commit or exit placement mode', () => {
  const g = freshGame();
  const worker = findOwnedWorkers(g)[0]!;
  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [worker]);
  ui.armedCommand.value = { t: 'place', kind: Kind.SupplyDepot };
  centerOnEntity(g, cc);

  const p = screenOf(g, cc);
  g.updatePlacementGhost(p.x, p.y);

  assert.equal(g.placementGhost?.ok, false);
  assert.equal(g.commitPlacementGhost(), false);
  assert.deepEqual(g.queued, []);
  assert.deepEqual(ui.armedCommand.value, { t: 'place', kind: Kind.SupplyDepot });
});

test('selected buildings do not publish mobile attack-move or stop commands', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [cc]);

  g.fastForward(0);

  assert.equal(ui.selectionView.value.can.rally, true);
  assert.equal(ui.selectionView.value.can.move, false);
  assert.equal(ui.selectionView.value.can.attackMove, false);
  assert.equal(ui.selectionView.value.can.stop, false);
});

test('selected mobile units publish mobile attack-move commands', () => {
  const g = freshGame();
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  select(g, [marine]);

  g.fastForward(0);

  assert.equal(ui.selectionView.value.can.rally, false);
  assert.equal(ui.selectionView.value.can.move, true);
  assert.equal(ui.selectionView.value.can.attackMove, true);
  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Move)?.arm, { t: 'move' });
});

test('normal tap on an owned gas structure selects it instead of harvesting', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const refinery = spawnUnit(s, Kind.Refinery, 0, fx(620), fx(400));
  select(g, [scv]);
  centerOnEntity(g, refinery);
  g.fastForward(1);

  const p = screenOf(g, refinery);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [refinery]);
  assert.deepEqual(g.queued, []);
});

test('desktop left click selects while desktop right click smart-harvests owned gas', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const refinery = spawnUnit(s, Kind.Refinery, 0, fx(620), fx(400));
  select(g, [scv]);
  centerOnEntity(g, refinery);
  g.fastForward(1);

  const p = screenOf(g, refinery);
  g.desktopSelectTap(p.x, p.y);

  assert.deepEqual([...g.selection], [refinery]);
  assert.deepEqual(g.queued, []);

  select(g, [scv]);
  g.desktopSmartTap(p.x, p.y);

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'harvest', unit: scv, patch: refinery }]);
});

test('desktop right click attacks enemies and moves on empty ground', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(470), fx(400));
  select(g, [marine]);
  centerOnEntity(g, enemy);
  g.fastForward(1);

  const p = screenOf(g, enemy);
  g.desktopSmartTap(p.x, p.y);

  assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy }]);
  g.queued = [];

  g.desktopSmartTap(g.viewW / 2 + 80, g.viewH / 2 + 80);

  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: marine,
    x: ((g.camX + (g.viewW / 2 + 80) / g.zoom) * ONE) | 0,
    y: ((g.camY + (g.viewH / 2 + 80) / g.zoom) * ONE) | 0,
  }]);
});

test('desktop shift right click queues travel, attack, load, repair, and harvest commands', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const leader = spawnUnit(s, Kind.Marine, 0, fx(500), fx(400));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(560), fx(400));
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(460));
  const bunker = spawnUnit(s, Kind.Bunker, 0, fx(620), fx(460));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, fx(660), fx(460));
  e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;
  s.players.minerals[0] = 1_000;
  select(g, [marine]);
  centerOnEntity(g, leader);
  g.fastForward(1);

  const ground = { x: g.viewW / 2 + 80, y: g.viewH / 2 + 80 };
  g.desktopSmartTap(ground.x, ground.y, { shift: true });
  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: marine,
    ...fixedPointAt(g, ground),
    queue: true,
  }]);

  g.queued = [];
  const leaderPoint = screenOf(g, leader);
  g.desktopSmartTap(leaderPoint.x, leaderPoint.y, { shift: true });
  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: marine,
    ...fixedPointAt(g, leaderPoint),
    target: leader,
    queue: true,
  }]);

  g.queued = [];
  const enemyPoint = screenOf(g, enemy);
  g.desktopSmartTap(enemyPoint.x, enemyPoint.y, { shift: true });
  assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy, queue: true }]);

  g.queued = [];
  centerOnEntity(g, bunker);
  const loadPoint = screenOf(g, bunker);
  g.desktopSmartTap(loadPoint.x, loadPoint.y, { shift: true, preferredHit: bunker });
  assert.deepEqual(g.queued, [{ t: 'load', transport: bunker, unit: marine, queue: true }]);

  g.queued = [];
  select(g, [scv]);
  centerOnEntity(g, bunker);
  const repairPoint = screenOf(g, bunker);
  g.desktopSmartTap(repairPoint.x, repairPoint.y, { shift: true, preferredHit: bunker });
  assert.deepEqual(g.queued, [{ t: 'repair', unit: scv, target: bunker, queue: true }]);

  g.queued = [];
  const harvestPoint = screenOf(g, mineral);
  g.desktopSmartTap(harvestPoint.x, harvestPoint.y, { shift: true, preferredHit: mineral });
  assert.deepEqual(g.queued, [{ t: 'harvest', unit: scv, patch: mineral, queue: true }]);
});

test('desktop right click keeps smart-command semantics while attack mode is armed', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  select(g, [marine]);
  centerOnEntity(g, marine);
  ui.armedCommand.value = { t: 'attackMove' };

  g.desktopSmartTap(g.viewW / 2 + 80, g.viewH / 2 + 80);

  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: marine,
    x: ((g.camX + (g.viewW / 2 + 80) / g.zoom) * ONE) | 0,
    y: ((g.camY + (g.viewH / 2 + 80) / g.zoom) * ONE) | 0,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('desktop shift armed attack-move queues point travel and target attacks', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(500), fx(400));
  select(g, [marine]);
  centerOnEntity(g, enemy);
  g.fastForward(1);
  ui.armedCommand.value = { t: 'attackMove' };

  const ground = { x: g.viewW / 2 + 80, y: g.viewH / 2 + 80 };
  g.tap(ground.x, ground.y, { shift: true });
  assert.deepEqual(g.queued, [{
    t: 'amove',
    unit: marine,
    ...fixedPointAt(g, ground),
    queue: true,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });

  g.queued = [];
  ui.armedCommand.value = { t: 'attackMove' };
  const enemyPoint = screenOf(g, enemy);
  g.tap(enemyPoint.x, enemyPoint.y, { shift: true });
  assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy, queue: true }]);
});

test('desktop shift armed patrol appends queued patrol travel', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  select(g, [marine]);
  centerOnEntity(g, marine);
  ui.armedCommand.value = { t: 'patrol' };

  const ground = { x: g.viewW / 2 + 72, y: g.viewH / 2 + 64 };
  g.tap(ground.x, ground.y, { shift: true });

  assert.deepEqual(g.queued, [{
    t: 'patrol',
    unit: marine,
    ...fixedPointAt(g, ground),
    queue: true,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('desktop right click follows ordinary friendly units', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const leader = spawnUnit(s, Kind.Marine, 0, fx(500), fx(400));
  select(g, [marine]);
  centerOnEntity(g, leader);
  g.fastForward(1);

  const p = screenOf(g, leader);
  g.desktopSmartTap(p.x, p.y);

  assert.equal(g.queued.length, 1);
  assert.deepEqual(g.queued[0], {
    t: 'move',
    unit: marine,
    x: ((g.camX + p.x / g.zoom) * ONE) | 0,
    y: ((g.camY + p.y / g.zoom) * ONE) | 0,
    target: leader,
  });
});

test('desktop right click repairs before following repairable friendly structures', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, fx(500), fx(400));
  s.e.built[slotOf(depot)] = 0;
  s.e.ctimer[slotOf(depot)] = 100;
  select(g, [scv]);
  centerOnEntity(g, depot);
  g.fastForward(1);

  const p = screenOf(g, depot);
  g.desktopSmartTap(p.x, p.y);

  assert.deepEqual(g.queued, [{ t: 'repair', unit: scv, target: depot }]);
});

test('desktop right click loads units into nearby transports before following them', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const bunker = spawnUnit(s, Kind.Bunker, 0, fx(408), fx(400));
  select(g, [marine]);
  centerOnEntity(g, bunker);
  g.fastForward(1);

  const p = screenOf(g, bunker);
  g.desktopSmartTap(p.x, p.y, { preferredHit: bunker });

  assert.deepEqual(g.queued, [{ t: 'load', transport: bunker, unit: marine }]);
});

test('desktop right click treats bare geysers as ground movement, not harvest targets', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const geyser = spawnUnit(s, Kind.Geyser, NEUTRAL, fx(520), fx(400));
  select(g, [scv]);
  centerOnEntity(g, geyser);
  g.fastForward(1);

  const p = screenOf(g, geyser);
  g.desktopSmartTap(p.x, p.y, { preferredHit: geyser });

  assert.deepEqual(g.queued, [{
    t: 'move',
    unit: scv,
    x: ((g.camX + p.x / g.zoom) * ONE) | 0,
    y: ((g.camY + p.y / g.zoom) * ONE) | 0,
  }]);
});

test('desktop right click attacks hostile gas collectors instead of harvesting them', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const enemyRefinery = spawnUnit(s, Kind.Refinery, 1, fx(520), fx(400));
  select(g, [scv]);
  centerOnEntity(g, enemyRefinery);
  g.fastForward(1);

  const p = screenOf(g, enemyRefinery);
  g.desktopSmartTap(p.x, p.y, { preferredHit: enemyRefinery });

  assert.deepEqual(g.queued, [{ t: 'attack', unit: scv, target: enemyRefinery }]);
});

test('desktop smart tap matches shared command intent grammar', () => {
  const g = freshGame();
  ui.controlScheme.value = 'desktop';
  const s = g.sim.fullState();
  const e = s.e;
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(460));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(500), fx(400));
  const leader = spawnUnit(s, Kind.Marine, 0, fx(520), fx(440));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, fx(540), fx(480));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, fx(560), fx(520));
  const bunker = spawnUnit(s, Kind.Bunker, 0, fx(408), fx(400));
  e.built[slotOf(depot)] = 0;
  e.ctimer[slotOf(depot)] = 100;
  g.fastForward(1);

  const cases = [
    { actor: marine, hit: enemy },
    { actor: marine, hit: leader },
    { actor: scv, hit: mineral },
    { actor: scv, hit: depot },
    { actor: marine, hit: bunker },
  ];
  for (const c of cases) {
    select(g, [c.actor]);
    centerOnEntity(g, c.hit);
    const p = screenOf(g, c.hit);
    const point = fixedPointAt(g, p);
    const [expected] = smartCommandCandidates(s, 0, c.actor, { hit: c.hit, ...point }, 'desktop');

    g.queued = [];
    g.desktopSmartTap(p.x, p.y, { preferredHit: c.hit });

    assert.deepEqual(g.queued, expected ? [expected] : [], `desktop smart parity for hit ${c.hit}`);
  }

  select(g, [marine]);
  centerOnEntity(g, marine);
  const p = { x: g.viewW / 2 + 96, y: g.viewH / 2 + 64 };
  const point = fixedPointAt(g, p);
  const [expected] = smartCommandCandidates(s, 0, marine, { hit: -1, ...point }, 'desktop');

  g.queued = [];
  g.desktopSmartTap(p.x, p.y);

  assert.deepEqual(g.queued, expected ? [expected] : []);
});

test('mobile normal tap matches shared command intent when selection does not intercept', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(460));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(500), fx(400));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, fx(540), fx(480));
  g.fastForward(1);

  for (const c of [{ actor: marine, hit: enemy }, { actor: scv, hit: mineral }]) {
    select(g, [c.actor]);
    centerOnEntity(g, c.hit);
    const p = screenOf(g, c.hit);
    const point = fixedPointAt(g, p);
    const [expected] = smartCommandCandidates(s, 0, c.actor, { hit: c.hit, ...point }, 'mobile');

    g.queued = [];
    g.tap(p.x, p.y, { preferredHit: c.hit });

    assert.deepEqual(g.queued, expected ? [expected] : [], `mobile tap parity for hit ${c.hit}`);
  }

  select(g, [marine]);
  centerOnEntity(g, marine);
  const movePoint = { x: g.viewW / 2 + 72, y: g.viewH / 2 + 48 };
  const move = fixedPointAt(g, movePoint);
  const [moveExpected] = smartCommandCandidates(s, 0, marine, { hit: -1, ...move }, 'mobile');

  g.queued = [];
  g.tap(movePoint.x, movePoint.y);

  assert.deepEqual(g.queued, moveExpected ? [moveExpected] : []);

  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [cc]);
  centerOnEntity(g, cc);
  const rallyPoint = { x: g.viewW / 2 + 88, y: g.viewH / 2 + 56 };
  const rally = fixedPointAt(g, rallyPoint);
  const [rallyExpected] = smartCommandCandidates(s, 0, cc, { hit: -1, ...rally }, 'mobile');

  g.queued = [];
  g.tap(rallyPoint.x, rallyPoint.y);

  assert.deepEqual(g.queued, rallyExpected ? [rallyExpected] : []);
});

test('mobile queue mode appends validated travel, attack, repair, and harvest actions', () => {
  const g = freshGame();
  const previousScheme = ui.controlScheme.value;
  ui.controlScheme.value = 'mobile';
  ui.mobileQueueMode.value = true;
  try {
    const s = g.sim.fullState();
    const e = s.e;
    const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
    const enemy = spawnUnit(s, Kind.Zealot, 1, fx(520), fx(400));
    const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(460));
    const bunker = spawnUnit(s, Kind.Bunker, 0, fx(620), fx(460));
    const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, fx(660), fx(460));
    e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;
    s.players.minerals[0] = 1_000;
    select(g, [marine]);
    centerOnEntity(g, marine);
    g.fastForward(1);

    const ground = { x: g.viewW / 2 + 80, y: g.viewH / 2 + 80 };
    g.tap(ground.x, ground.y);
    assert.deepEqual(g.queued, [{
      t: 'move',
      unit: marine,
      ...fixedPointAt(g, ground),
      queue: true,
    }]);

    g.queued = [];
    centerOnEntity(g, enemy);
    const enemyPoint = screenOf(g, enemy);
    g.tap(enemyPoint.x, enemyPoint.y, { preferredHit: enemy });
    assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy, queue: true }]);

    g.queued = [];
    select(g, [scv]);
    centerOnEntity(g, bunker);
    const repairPoint = screenOf(g, bunker);
    ui.armedCommand.value = { t: 'target', mode: 'repair' };
    g.tap(repairPoint.x, repairPoint.y, { preferredHit: bunker });
    assert.deepEqual(g.queued, [{ t: 'repair', unit: scv, target: bunker, queue: true }]);
    assert.deepEqual(ui.armedCommand.value, { t: 'none' });

    g.queued = [];
    const harvestPoint = screenOf(g, mineral);
    g.tap(harvestPoint.x, harvestPoint.y, { preferredHit: mineral });
    assert.deepEqual(g.queued, [{ t: 'harvest', unit: scv, patch: mineral, queue: true }]);

    g.queued = [];
    select(g, [marine]);
    centerOnEntity(g, marine);
    ui.armedCommand.value = { t: 'attackMove' };
    g.tap(ground.x, ground.y);
    assert.deepEqual(g.queued, [{
      t: 'amove',
      unit: marine,
      ...fixedPointAt(g, ground),
      queue: true,
    }]);

    g.queued = [];
    ui.armedCommand.value = { t: 'patrol' };
    g.tap(ground.x, ground.y);
    assert.deepEqual(g.queued, [{
      t: 'patrol',
      unit: marine,
      ...fixedPointAt(g, ground),
      queue: true,
    }]);

    g.queued = [];
    ui.armedCommand.value = { t: 'attackMove' };
    centerOnEntity(g, enemy);
    g.tap(enemyPoint.x, enemyPoint.y, { preferredHit: enemy });
    assert.deepEqual(g.queued, [{ t: 'attack', unit: marine, target: enemy, queue: true }]);
  } finally {
    ui.mobileQueueMode.value = false;
    ui.controlScheme.value = previousScheme;
  }
});

test('harvest target mode queues gather targets with Shift', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, fx(620), fx(400));
  select(g, [scv]);
  centerOnEntity(g, mineral);
  g.fastForward(1);
  ui.armedCommand.value = { t: 'target', mode: 'harvest' };

  const p = screenOf(g, mineral);
  g.tap(p.x, p.y, { shift: true, preferredHit: mineral });

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'harvest', unit: scv, patch: mineral, queue: true }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('harvest target mode sends selected workers to an owned gas structure', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const refinery = spawnUnit(s, Kind.Refinery, 0, fx(620), fx(400));
  select(g, [scv]);
  centerOnEntity(g, refinery);
  g.fastForward(1);
  ui.armedCommand.value = { t: 'target', mode: 'harvest' };

  const p = screenOf(g, refinery);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'harvest', unit: scv, patch: refinery }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('normal empty-ground tap moves selected mobile units', () => {
  const g = freshGame();
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  select(g, [marine]);
  centerOnEntity(g, marine);

  g.tap(g.viewW / 2 + 80, g.viewH / 2 + 80);

  assert.equal(g.queued.length, 1);
  assert.deepEqual(g.queued[0], {
    t: 'move',
    unit: marine,
    x: ((g.camX + (g.viewW / 2 + 80) / g.zoom) * ONE) | 0,
    y: ((g.camY + (g.viewH / 2 + 80) / g.zoom) * ONE) | 0,
  });
});

test('explicit rally mode targets owned units instead of selecting them', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const worker = findOwnedWorkers(g)[0]!;
  select(g, [cc]);
  centerOnEntity(g, worker);
  ui.armedCommand.value = { t: 'rally' };

  const p = screenOf(g, worker);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [cc]);
  assert.deepEqual(g.queued, [{
    t: 'rally',
    building: cc,
    x: ((g.camX + p.x / g.zoom) * ONE) | 0,
    y: ((g.camY + p.y / g.zoom) * ONE) | 0,
    target: worker,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('explicit rally mode falls back to point rally for invalid resource targets', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const barracks = spawnUnit(s, Kind.Barracks, 0, fx(400), fx(400));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, fx(520), fx(400));
  select(g, [barracks]);
  centerOnEntity(g, mineral);
  ui.armedCommand.value = { t: 'rally' };

  const p = screenOf(g, mineral);
  g.tap(p.x, p.y, { preferredHit: mineral });

  assert.deepEqual(g.queued, [{
    t: 'rally',
    building: barracks,
    x: ((g.camX + p.x / g.zoom) * ONE) | 0,
    y: ((g.camY + p.y / g.zoom) * ONE) | 0,
  }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('box select prefers units but falls back to buildings when no units are inside', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const p = screenOfStructureFootprintEdge(g, cc);

  g.boxSelect(p.x - 2, p.y - 2, p.x + 2, p.y + 2);

  assert.deepEqual([...g.selection], [cc]);
});

test('self abilities queue for every valid selected caster', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const hurtMarine = spawnUnit(s, Kind.Marine, 0, fx(430), fx(400));
  const firebat = spawnUnit(s, Kind.Firebat, 0, fx(460), fx(400));
  const medic = spawnUnit(s, Kind.Medic, 0, fx(490), fx(400));
  s.e.hp[slotOf(hurtMarine)] = 10;
  setTechLevel(s, 0, Tech.StimPack, 1);
  select(g, [marine, hurtMarine, firebat, medic]);

  g.castSelectedAbility(Ability.StimPack);

  assert.deepEqual(g.queued, [
    { t: 'ability', unit: marine, ability: Ability.StimPack },
    { t: 'ability', unit: firebat, ability: Ability.StimPack },
  ]);
});

test('entity ability target mode consumes owned-entity taps instead of selecting', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, fx(400), fx(400));
  const goliath = spawnUnit(s, Kind.Goliath, 0, fx(430), fx(400));
  s.e.energy[slotOf(vessel)] = 100;
  select(g, [vessel]);
  centerOnEntity(g, goliath);
  ui.armedCommand.value = { t: 'ability', ability: Ability.DefensiveMatrix };

  const p = screenOf(g, goliath);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [vessel]);
  assert.deepEqual(g.queued, [{ t: 'ability', unit: vessel, ability: Ability.DefensiveMatrix, target: goliath }]);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('point ability target mode chooses a valid selected caster', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const far = spawnUnit(s, Kind.HighTemplar, 0, fx(300), fx(400));
  const near = spawnUnit(s, Kind.HighTemplar, 0, fx(420), fx(400));
  s.e.energy[slotOf(far)] = 75;
  s.e.energy[slotOf(near)] = 75;
  setTechLevel(s, 0, Tech.PsionicStorm, 1);
  select(g, [far, near]);
  centerOnEntity(g, near);
  ui.armedCommand.value = { t: 'ability', ability: Ability.PsionicStorm };

  const p = screenOf(g, near);
  g.tap(p.x + 30, p.y);

  assert.equal(g.queued.length, 1);
  assert.equal(g.queued[0]!.t, 'ability');
  assert.equal(g.queued[0]!.unit, near);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('research option queues the first valid selected research producer', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const busy = spawnUnit(s, Kind.Academy, 0, fx(400), fx(400));
  const academy = spawnUnit(s, Kind.Academy, 0, fx(520), fx(400));
  s.e.researchKind[slotOf(busy)] = Tech.U238Shells;
  s.players.minerals[0] = 200;
  s.players.gas[0] = 200;
  select(g, [busy, academy]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.research.find((o) => o.id === Tech.StimPack);
  assert.deepEqual(option?.commands, [{ t: 'research', building: academy, tech: Tech.StimPack }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'research', building: academy, tech: Tech.StimPack }]);
});

test('load order option queues selected loadable units into selected transports', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const dropship = spawnUnit(s, Kind.Dropship, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  select(g, [dropship, marine]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Load);
  assert.deepEqual(option?.commands, [{ t: 'load', transport: dropship, unit: marine }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'load', transport: dropship, unit: marine }]);
});

test('mobile queue mode makes load order options queued', () => {
  const g = freshGame();
  const previousScheme = ui.controlScheme.value;
  ui.controlScheme.value = 'mobile';
  ui.mobileQueueMode.value = true;
  try {
    const s = g.sim.fullState();
    const dropship = spawnUnit(s, Kind.Dropship, 0, fx(400), fx(400));
    const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
    select(g, [dropship, marine]);
    g.fastForward(0);

    const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Load);
    assert.deepEqual(option?.commands, [{ t: 'load', transport: dropship, unit: marine }]);
    assert.equal(g.executeOption(option!), true);

    assert.deepEqual(g.queued, [{ t: 'load', transport: dropship, unit: marine, queue: true }]);
  } finally {
    ui.mobileQueueMode.value = false;
    ui.controlScheme.value = previousScheme;
  }
});

test('unload order option queues contained units around selected transports', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const dropship = spawnUnit(s, Kind.Dropship, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  g.sim.step([{ player: 0, cmds: [{ t: 'load', transport: dropship, unit: marine }] }]);
  g.queued = [];
  select(g, [dropship]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Unload);
  assert.equal(option?.commands?.length, 1);
  assert.equal(g.executeOption(option!), true);

  assert.equal(g.queued.length, 1);
  const c = g.queued[0]!;
  assert.equal(c.t, 'unload');
  if (c.t !== 'unload') throw new Error('expected unload');
  assert.equal(c.transport, dropship);
  assert.equal(c.unit, marine);
});

test('unload order option sends nydus cargo to the remote network exit', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const e = s.e;
  const entrance = spawnUnit(s, Kind.NydusCanal, 0, fx(400), fx(400));
  const exit = spawnUnit(s, Kind.NydusCanal, 0, fx(900), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  g.sim.step([{ player: 0, cmds: [{ t: 'load', transport: entrance, unit: marine }] }]);
  g.queued = [];
  select(g, [entrance]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Unload);
  assert.equal(option?.commands?.length, 1);
  assert.equal(g.executeOption(option!), true);

  assert.equal(g.queued.length, 1);
  const c = g.queued[0]!;
  assert.equal(c.t, 'unload');
  if (c.t !== 'unload') throw new Error('expected unload');
  assert.equal(c.transport, entrance);
  assert.equal(c.unit, marine);
  const ex = e.x[slotOf(exit)]!;
  const ey = e.y[slotOf(exit)]!;
  const dx = c.x - ex;
  const dy = c.y - ey;
  assert.ok(dx * dx + dy * dy <= fx(96) * fx(96));
});

test('mine order option queues mine commands for selected charged vultures', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const vulture = spawnUnit(s, Kind.Vulture, 0, fx(400), fx(400));
  setTechLevel(s, 0, Tech.SpiderMines, 1);
  s.e.specialAmmo[slotOf(vulture)] = 1;
  select(g, [vulture]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Mine);
  assert.deepEqual(option?.commands, [{ t: 'mine', unit: vulture }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'mine', unit: vulture }]);
});

test('selected race workers publish their race build palette', () => {
  const g = freshGame();
  g.restart('play', 2222, 1, ['protoss', 'zerg'], 0);
  g.sim.fullState().players.minerals[0] = 1_000;
  const probe = findEntity(g, Kind.Probe, 0);
  select(g, [probe]);

  g.fastForward(0);

  const buildIds = enabledOptionIds(ui.selectionView.value.options.build);
  assert.ok(buildIds.includes(Kind.Pylon));
  assert.ok(buildIds.includes(Kind.Gateway));
  assert.ok(!buildIds.includes(Kind.SupplyDepot));
});

test('worker command cards expose expansion town halls for all races', () => {
  const cases = [
    ['terran', Kind.SCV, Kind.CommandCenter],
    ['protoss', Kind.Probe, Kind.Nexus],
    ['zerg', Kind.Drone, Kind.Hatchery],
  ] as const;

  cases.forEach(([race, workerKind, townHallKind], index) => {
    const g = freshGame();
    g.restart('play', 2250 + index, 1, [race, 'terran'], 0);
    const s = g.sim.fullState();
    s.players.minerals[0] = Units[townHallKind]!.minerals;
    s.players.gas[0] = Units[townHallKind]!.gas;
    const worker = findEntity(g, workerKind, 0);
    select(g, [worker]);

    g.fastForward(0);

    const option = ui.selectionView.value.options.build.find((o) => o.id === townHallKind);
    assert.equal(option?.ok, true);
    assert.deepEqual(option?.arm, { t: 'place', kind: townHallKind });
  });
});

test('zerg worker command card hides lair-gated buildings until tech exists', () => {
  const g = freshGame();
  g.restart('play', 3333, 1, ['zerg', 'terran'], 0);
  g.sim.fullState().players.minerals[0] = 1_000;
  const drone = findEntity(g, Kind.Drone, 0);
  select(g, [drone]);

  g.fastForward(0);

  let buildIds = enabledOptionIds(ui.selectionView.value.options.build);
  assert.ok(buildIds.includes(Kind.SpawningPool));
  assert.ok(buildIds.includes(Kind.EvolutionChamber));
  assert.ok(!buildIds.includes(Kind.Spire));
  assert.ok(!buildIds.includes(Kind.QueensNest));
  assert.equal(ui.selectionView.value.options.build.find((o) => o.id === Kind.Spire)?.reason, 'missing-requirement');
  assert.equal(ui.selectionView.value.options.addon.length, 0);

  const s = g.sim.fullState();
  spawnUnit(s, Kind.Lair, 0, fx(700), fx(700));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  g.fastForward(0);

  buildIds = enabledOptionIds(ui.selectionView.value.options.build);
  assert.ok(buildIds.includes(Kind.Spire));
  assert.ok(buildIds.includes(Kind.QueensNest));
});

test('zerg structure morph commands are only offered once prerequisites and resources exist', () => {
  const g = freshGame();
  g.restart('play', 4444, 1, ['zerg', 'terran'], 0);
  const hatchery = findEntity(g, Kind.Hatchery, 0);
  select(g, [hatchery]);

  g.fastForward(0);

  assert.ok(!enabledOptionIds(ui.selectionView.value.options.transform).includes(Kind.Lair));

  const s = g.sim.fullState();
  const h = slotOf(hatchery);
  spawnUnit(s, Kind.SpawningPool, 0, s.e.x[h]! + fx(160), s.e.y[h]!);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  g.fastForward(0);

  assert.ok(enabledOptionIds(ui.selectionView.value.options.transform).includes(Kind.Lair));

  const option = ui.selectionView.value.options.transform.find((o) => o.id === Kind.Lair);
  assert.deepEqual(option?.commands, [{ t: 'transform', unit: hatchery, kind: Kind.Lair }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'transform', unit: hatchery, kind: Kind.Lair }]);
});

test('selected zerg structure morphs publish morphing label and cancel only', () => {
  const g = freshGame();
  g.restart('play', 4545, 1, ['zerg', 'terran'], 0);
  g.controllers = [null, null];
  const s = g.sim.fullState();
  const hatchery = findEntity(g, Kind.Hatchery, 0);
  const h = slotOf(hatchery);
  spawnUnit(s, Kind.SpawningPool, 0, s.e.x[h]! + fx(160), s.e.y[h]!);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const started = g.sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hatchery, kind: Kind.Lair }] }]);
  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  select(g, [hatchery]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.kindName, 'Morphing Lair');
  assert.equal(ui.selectionView.value.can.cancel, true);
  assert.equal(ui.selectionView.value.can.rally, false);
  assert.equal(ui.selectionView.value.can.stop, false);
  assert.equal(ui.selectionView.value.options.train.length, 0);
  assert.equal(ui.selectionView.value.options.research.length, 0);
  assert.equal(ui.selectionView.value.options.transform.length, 0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Cancel);
  assert.deepEqual(option?.commands, [{ t: 'cancelBuild', building: hatchery }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'cancelBuild', building: hatchery }]);
});

test('selected protoss warp-ins publish warping label and cancel only', () => {
  const g = freshGame();
  g.restart('play', 4646, 1, ['protoss', 'terran'], 0);
  const s = g.sim.fullState();
  const e = s.e;
  const gateway = spawnUnit(s, Kind.Gateway, 0, fx(500), fx(500));
  const slot = slotOf(gateway);
  e.built[slot] = 0;
  e.ctimer[slot] = 100;
  e.buildCostMinerals[slot] = 150;
  select(g, [gateway]);

  g.fastForward(0);

  assert.equal(ui.selectionView.value.kindName, 'Warping Gateway');
  assert.equal(ui.selectionView.value.can.cancel, true);
  assert.equal(ui.selectionView.value.can.rally, false);
  assert.equal(ui.selectionView.value.can.stop, false);
  assert.equal(ui.selectionView.value.options.train.length, 0);
  assert.equal(ui.selectionView.value.options.research.length, 0);
  assert.equal(ui.selectionView.value.options.transform.length, 0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Cancel);
  assert.deepEqual(option?.commands, [{ t: 'cancelBuild', building: gateway }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'cancelBuild', building: gateway }]);
});

test('group-selected templars queue paired merge commands', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const a = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const b = spawnUnit(s, Kind.HighTemplar, 0, fx(432), fx(400));
  const c = spawnUnit(s, Kind.HighTemplar, 0, fx(520), fx(400));
  const d = spawnUnit(s, Kind.HighTemplar, 0, fx(552), fx(400));
  select(g, [a, b, c, d]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.transform.find((o) => o.id === Kind.Archon);
  assert.deepEqual(option?.commands, [
    { t: 'transform', unit: a, kind: Kind.Archon, target: b },
    { t: 'transform', unit: c, kind: Kind.Archon, target: d },
  ]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [
    { t: 'transform', unit: a, kind: Kind.Archon, target: b },
    { t: 'transform', unit: c, kind: Kind.Archon, target: d },
  ]);
});

test('selected protoss merge summons are inert and not cancellable', () => {
  const g = freshGame();
  g.restart('play', 5656, 1, ['protoss', 'terran'], 0);
  g.controllers = [null, null];
  const s = g.sim.fullState();
  const a = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const b = spawnUnit(s, Kind.HighTemplar, 0, fx(432), fx(400));

  const started = g.sim.step([{ player: 0, cmds: [{ t: 'transform', unit: a, kind: Kind.Archon, target: b }] }]);
  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  select(g, [a]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.kindName, 'Summoning Archon');
  assert.equal(ui.selectionView.value.can.cancel, false);
  assert.equal(ui.selectionView.value.can.attackMove, false);
  assert.equal(ui.selectionView.value.can.stop, false);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Cancel);
  assert.equal(option, undefined);

  assert.deepEqual(g.queued, []);
});

test('selected carriers publish interceptor build commands', () => {
  const g = freshGame();
  const carrier = spawnUnit(g.sim.fullState(), Kind.Carrier, 0, fx(400), fx(400));
  select(g, [carrier]);

  g.fastForward(0);

  assert.ok(enabledOptionIds(ui.selectionView.value.options.train).includes(Kind.Interceptor));
});

test('command card publishes disabled train and ability reasons', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  s.players.minerals[0] = 0;
  select(g, [cc]);
  g.fastForward(0);

  assert.ok(!enabledOptionIds(ui.selectionView.value.options.train).includes(Kind.SCV));
  assert.equal(ui.selectionView.value.options.train.find((o) => o.id === Kind.SCV)?.reason, 'not-affordable');
  assert.equal(ui.selectionView.value.options.train.find((o) => o.id === Kind.SCV)?.commands, undefined);

  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(500), fx(500));
  const slot = slotOf(templar);
  s.e.energy[slot] = 200;
  select(g, [templar]);
  g.fastForward(0);

  assert.ok(!enabledOptionIds(ui.selectionView.value.options.ability).includes(Ability.PsionicStorm));
  assert.equal(ui.selectionView.value.options.ability.find((o) => o.id === Ability.PsionicStorm)?.reason, 'missing-requirement');

  setTechLevel(s, 0, Tech.PsionicStorm, 1);
  g.fastForward(0);

  assert.ok(enabledOptionIds(ui.selectionView.value.options.ability).includes(Ability.PsionicStorm));
});

test('nuclear command card surfaces silo missile state', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const commandCenter = findEntity(g, Kind.CommandCenter, 0);
  const silo = spawnUnit(s, Kind.NuclearSilo, 0, fx(500), fx(500));
  const siloSlot = slotOf(silo);
  s.e.target[slotOf(commandCenter)] = silo;
  s.e.target[siloSlot] = commandCenter;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  select(g, [silo]);
  g.fastForward(0);

  let option = ui.selectionView.value.options.train.find((o) => o.id === Kind.NuclearMissile);
  assert.equal(option?.ok, true);
  assert.equal(option?.label, 'Arm Nuke');

  s.e.prodKind[siloSlot] = Kind.NuclearMissile;
  s.e.prodTimer[siloSlot] = 100;
  g.fastForward(0);

  option = ui.selectionView.value.options.train.find((o) => o.id === Kind.NuclearMissile);
  assert.equal(option?.ok, false);
  assert.equal(option?.label, 'Arming Nuke');
  assert.equal(option?.detail, 'Arming');

  s.e.prodKind[siloSlot] = Kind.None;
  s.e.prodTimer[siloSlot] = 0;
  s.e.specialAmmo[siloSlot] = 1;
  g.fastForward(0);

  option = ui.selectionView.value.options.train.find((o) => o.id === Kind.NuclearMissile);
  assert.equal(option?.ok, false);
  assert.equal(option?.label, 'Nuke Ready');
  assert.equal(option?.detail, 'Ready');

  const ghost = spawnUnit(s, Kind.Ghost, 0, fx(520), fx(520));
  s.e.specialAmmo[siloSlot] = 0;
  select(g, [ghost]);
  g.fastForward(0);

  const ability = ui.selectionView.value.options.ability.find((o) => o.id === Ability.NuclearStrike);
  assert.equal(ability?.ok, false);
  assert.equal(ability?.detail, 'No Nuke');
});

test('selection summary identifies known own hallucinations without real worker utility commands', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(500), fx(500));
  s.e.illusion[slotOf(scv)] = 1;
  select(g, [scv]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.kindName, 'Hallucination SCV');
  assert.equal(ui.selectionView.value.options.build.length, 0);
  assert.equal(ui.selectionView.value.can.harvest, false);
  assert.equal(ui.selectionView.value.can.repair, false);
});

test('selection summary hides real production commands for known own hallucinations', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(500), fx(500));
  s.e.illusion[slotOf(carrier)] = 1;
  select(g, [carrier]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.kindName, 'Hallucination Carrier');
  assert.equal(ui.selectionView.value.options.train.length, 0);
});

test('selection status publishes compact progress and upgraded combat stats', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const barracks = spawnUnit(s, Kind.Barracks, 0, fx(520), fx(520));
  const slot = slotOf(barracks);
  s.e.prodKind[slot] = Kind.Marine;
  s.e.prodTimer[slot] = Math.floor(Units[Kind.Marine]!.buildTime / 2);
  s.e.prodQueued[slot] = 1;
  setTechLevel(s, 0, Tech.InfantryWeapons, 1);
  setTechLevel(s, 0, Tech.InfantryArmor, 1);
  select(g, [barracks]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.status.label, 'Training');
  assert.equal(ui.selectionView.value.status.detail, 'Marine +1');
  assert.ok(ui.selectionView.value.status.progress > 0.45 && ui.selectionView.value.status.progress < 0.55);
  assert.ok(ui.selectionView.value.status.stats.includes('HP 1000/1000'));
  assert.equal(ui.selectionView.value.can.rally, true);
  assert.ok(ui.selectionView.value.options.train.some((option) => option.id === Kind.Marine));

  const marine = spawnUnit(s, Kind.Marine, 0, fx(560), fx(520));
  select(g, [marine]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.status.label, 'Idle');
  assert.ok(ui.selectionView.value.status.stats.includes('Arm 0+1'));
  assert.ok(ui.selectionView.value.status.stats.includes('G/A 6+1 R4 CD15'));
});

test('selected zerg combat morphs present as cancellable cocoons', () => {
  const g = freshGame();
  g.restart('play', 5555, 1, ['zerg', 'terran'], 0);
  g.controllers = [null, null];
  const s = g.sim.fullState();
  const hydra = spawnUnit(s, Kind.Hydralisk, 0, fx(500), fx(500));
  spawnUnit(s, Kind.HydraliskDen, 0, fx(650), fx(500));
  setTechLevel(s, 0, Tech.LurkerAspect, 1);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const started = g.sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hydra, kind: Kind.Lurker }] }]);
  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  select(g, [hydra]);
  g.fastForward(0);

  assert.equal(ui.selectionView.value.kindName, 'Morphing Lurker');
  assert.equal(ui.selectionView.value.can.cancel, true);
  assert.equal(ui.selectionView.value.can.attackMove, false);
  assert.equal(ui.selectionView.value.can.stop, false);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Cancel);
  assert.deepEqual(option?.commands, [{ t: 'cancelBuild', building: hydra }]);
  assert.equal(g.executeOption(option!), true);

  assert.deepEqual(g.queued, [{ t: 'cancelBuild', building: hydra }]);
  g.fastForward(1);
  assert.equal(s.e.kind[slotOf(hydra)], Kind.Hydralisk);
});
