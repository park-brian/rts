import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ui } from '../src/store.ts';
import { Ability, Kind, ONE, Role, Tech, TILE, canPlaceStructure, eid, fx, setTechLevel, slotOf, spawnUnit } from '../src/sim.ts';

const freshGame = (): Game => {
  const g = new Game('play', 1234);
  g.resize(390, 844);
  const cc = findEntity(g, Kind.CommandCenter, 0);
  centerOnEntity(g, cc);
  g.queued = [];
  ui.placement.value = 0;
  ui.rally.value = false;
  ui.amove.value = false;
  ui.abilityTarget.value = 0;
  ui.targetMode.value = 'none';
  ui.controlScheme.value = 'mobile';
  return g;
};

const findEntity = (g: Game, kind: number, owner: number): number => {
  const e = g.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return eid(e, i);
  }
  throw new Error(`missing entity kind=${kind} owner=${owner}`);
};

const findOwnedWorkers = (g: Game): number[] => {
  const e = g.sim.fullState().e;
  const ids: number[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && (e.flags[i]! & Role.Worker) !== 0) ids.push(eid(e, i));
  }
  return ids;
};

const centerOnEntity = (g: Game, id: number): void => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  g.centerOn(e.x[slot]! / ONE, e.y[slot]! / ONE);
};

const screenOf = (g: Game, id: number): { x: number; y: number } => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  return {
    x: (e.x[slot]! / ONE - g.camX) * g.zoom,
    y: (e.y[slot]! / ONE - g.camY) * g.zoom,
  };
};

const select = (g: Game, ids: number[]): void => {
  g.selection.clear();
  for (const id of ids) g.selection.add(id);
};

test('normal tap on an owned building selects it instead of commanding selected workers', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const workers = findOwnedWorkers(g);
  select(g, workers);

  const p = screenOf(g, cc);
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
  ui.targetMode.value = 'repair';

  const p = screenOf(g, depot);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'repair', unit: scv, target: depot }]);
  assert.equal(ui.targetMode.value, 'none');
});

test('attack-move is an explicit target mode and consumes the next owned-entity tap', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const workers = findOwnedWorkers(g);
  select(g, workers);
  ui.amove.value = true;

  const p = screenOf(g, cc);
  g.tap(p.x, p.y);

  assert.deepEqual(new Set(g.selection), new Set(workers));
  assert.equal(g.queued.length, workers.length);
  assert.ok(g.queued.every((c) => c.t === 'amove'));
  assert.equal(ui.amove.value, false);
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
  ui.placement.value = Kind.SupplyDepot;

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
  assert.equal(ui.placement.value, 0);
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
  ui.placement.value = Kind.SupplyDepot;

  g.tap(g.viewW / 2, g.viewH / 2);

  assert.deepEqual(g.queued, []);
  assert.equal(ui.placement.value, Kind.SupplyDepot);
});

test('invalid build placement ghost does not commit or exit placement mode', () => {
  const g = freshGame();
  const worker = findOwnedWorkers(g)[0]!;
  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [worker]);
  ui.placement.value = Kind.SupplyDepot;
  centerOnEntity(g, cc);

  const p = screenOf(g, cc);
  g.updatePlacementGhost(p.x, p.y);

  assert.equal(g.placementGhost?.ok, false);
  assert.equal(g.commitPlacementGhost(), false);
  assert.deepEqual(g.queued, []);
  assert.equal(ui.placement.value, Kind.SupplyDepot);
});

test('selected buildings do not publish mobile attack-move or stop commands', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [cc]);

  g.fastForward(0);

  assert.equal(ui.selCanRally.value, true);
  assert.equal(ui.selCanAttackMove.value, false);
  assert.equal(ui.selCanStop.value, false);
});

test('selected mobile units publish mobile attack-move commands', () => {
  const g = freshGame();
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  select(g, [marine]);

  g.fastForward(0);

  assert.equal(ui.selCanRally.value, false);
  assert.equal(ui.selCanAttackMove.value, true);
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

test('harvest target mode sends selected workers to an owned gas structure', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const refinery = spawnUnit(s, Kind.Refinery, 0, fx(620), fx(400));
  select(g, [scv]);
  centerOnEntity(g, refinery);
  g.fastForward(1);
  ui.targetMode.value = 'harvest';

  const p = screenOf(g, refinery);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [scv]);
  assert.deepEqual(g.queued, [{ t: 'harvest', unit: scv, patch: refinery }]);
  assert.equal(ui.targetMode.value, 'none');
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
  ui.rally.value = true;

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
  assert.equal(ui.rally.value, false);
});

test('box select prefers units but falls back to buildings when no units are inside', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const p = screenOf(g, cc);

  g.boxSelect(p.x - 2, p.y - 2, p.x + 2, p.y + 2);

  assert.deepEqual([...g.selection], [cc]);
});

test('self abilities queue for every valid selected caster', () => {
  const g = freshGame();
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  setTechLevel(g.sim.fullState(), 0, Tech.StimPack, 1);
  select(g, [marine]);

  g.castSelectedAbility(Ability.StimPack);

  assert.deepEqual(g.queued, [{ t: 'ability', unit: marine, ability: Ability.StimPack }]);
});

test('entity ability target mode consumes owned-entity taps instead of selecting', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, fx(400), fx(400));
  const goliath = spawnUnit(s, Kind.Goliath, 0, fx(430), fx(400));
  s.e.energy[slotOf(vessel)] = 100;
  select(g, [vessel]);
  centerOnEntity(g, goliath);
  ui.abilityTarget.value = Ability.DefensiveMatrix;

  const p = screenOf(g, goliath);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [vessel]);
  assert.deepEqual(g.queued, [{ t: 'ability', unit: vessel, ability: Ability.DefensiveMatrix, target: goliath }]);
  assert.equal(ui.abilityTarget.value, 0);
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
  ui.abilityTarget.value = Ability.PsionicStorm;

  const p = screenOf(g, near);
  g.tap(p.x + 30, p.y);

  assert.equal(g.queued.length, 1);
  assert.equal(g.queued[0]!.t, 'ability');
  assert.equal(g.queued[0]!.unit, near);
  assert.equal(ui.abilityTarget.value, 0);
});

test('researchSelected queues the first valid selected research producer', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const academy = spawnUnit(s, Kind.Academy, 0, fx(400), fx(400));
  s.players.minerals[0] = 200;
  s.players.gas[0] = 200;
  select(g, [academy]);

  g.researchSelected(Tech.StimPack);

  assert.deepEqual(g.queued, [{ t: 'research', building: academy, tech: Tech.StimPack }]);
});

test('loadSelected queues selected loadable units into selected transports', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const dropship = spawnUnit(s, Kind.Dropship, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  select(g, [dropship, marine]);

  g.loadSelected();

  assert.deepEqual(g.queued, [{ t: 'load', transport: dropship, unit: marine }]);
});

test('unloadSelected queues contained units around selected transports', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const dropship = spawnUnit(s, Kind.Dropship, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  g.sim.step([{ player: 0, cmds: [{ t: 'load', transport: dropship, unit: marine }] }]);
  g.queued = [];
  select(g, [dropship]);

  g.unloadSelected();

  assert.equal(g.queued.length, 1);
  const c = g.queued[0]!;
  assert.equal(c.t, 'unload');
  if (c.t !== 'unload') throw new Error('expected unload');
  assert.equal(c.transport, dropship);
  assert.equal(c.unit, marine);
});

test('unloadSelected sends nydus cargo to the remote network exit', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const e = s.e;
  const entrance = spawnUnit(s, Kind.NydusCanal, 0, fx(400), fx(400));
  const exit = spawnUnit(s, Kind.NydusCanal, 0, fx(900), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  g.sim.step([{ player: 0, cmds: [{ t: 'load', transport: entrance, unit: marine }] }]);
  g.queued = [];
  select(g, [entrance]);

  g.unloadSelected();

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

test('mineSelected queues mine commands for selected charged vultures', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const vulture = spawnUnit(s, Kind.Vulture, 0, fx(400), fx(400));
  setTechLevel(s, 0, Tech.SpiderMines, 1);
  s.e.specialAmmo[slotOf(vulture)] = 1;
  select(g, [vulture]);

  g.mineSelected();

  assert.deepEqual(g.queued, [{ t: 'mine', unit: vulture }]);
});

test('selected race workers publish their race build palette', () => {
  const g = freshGame();
  g.restart('play', 2222, 1, ['protoss', 'zerg'], 0);
  const probe = findEntity(g, Kind.Probe, 0);
  select(g, [probe]);

  g.fastForward(0);

  assert.ok(ui.selBuildKinds.value.includes(Kind.Pylon));
  assert.ok(ui.selBuildKinds.value.includes(Kind.Gateway));
  assert.ok(!ui.selBuildKinds.value.includes(Kind.SupplyDepot));
});

test('zerg worker command card hides lair-gated buildings until tech exists', () => {
  const g = freshGame();
  g.restart('play', 3333, 1, ['zerg', 'terran'], 0);
  const drone = findEntity(g, Kind.Drone, 0);
  select(g, [drone]);

  g.fastForward(0);

  assert.ok(ui.selBuildKinds.value.includes(Kind.SpawningPool));
  assert.ok(ui.selBuildKinds.value.includes(Kind.EvolutionChamber));
  assert.ok(!ui.selBuildKinds.value.includes(Kind.Spire));
  assert.ok(!ui.selBuildKinds.value.includes(Kind.QueensNest));

  const s = g.sim.fullState();
  spawnUnit(s, Kind.Lair, 0, fx(700), fx(700));
  g.fastForward(0);

  assert.ok(ui.selBuildKinds.value.includes(Kind.Spire));
  assert.ok(ui.selBuildKinds.value.includes(Kind.QueensNest));
});

test('zerg structure morph commands are only offered once prerequisites and resources exist', () => {
  const g = freshGame();
  g.restart('play', 4444, 1, ['zerg', 'terran'], 0);
  const hatchery = findEntity(g, Kind.Hatchery, 0);
  select(g, [hatchery]);

  g.fastForward(0);

  assert.ok(!ui.selTransformKinds.value.includes(Kind.Lair));

  const s = g.sim.fullState();
  const h = slotOf(hatchery);
  spawnUnit(s, Kind.SpawningPool, 0, s.e.x[h]! + fx(160), s.e.y[h]!);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  g.fastForward(0);

  assert.ok(ui.selTransformKinds.value.includes(Kind.Lair));

  g.transformSelected(Kind.Lair);

  assert.deepEqual(g.queued, [{ t: 'transform', unit: hatchery, kind: Kind.Lair }]);
});

test('group-selected templars queue paired merge commands', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const a = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const b = spawnUnit(s, Kind.HighTemplar, 0, fx(432), fx(400));
  const c = spawnUnit(s, Kind.HighTemplar, 0, fx(520), fx(400));
  const d = spawnUnit(s, Kind.HighTemplar, 0, fx(552), fx(400));
  select(g, [a, b, c, d]);

  g.transformSelected(Kind.Archon);

  assert.deepEqual(g.queued, [
    { t: 'transform', unit: a, kind: Kind.Archon, target: b },
    { t: 'transform', unit: c, kind: Kind.Archon, target: d },
  ]);
});

test('selected carriers publish interceptor build commands', () => {
  const g = freshGame();
  const carrier = spawnUnit(g.sim.fullState(), Kind.Carrier, 0, fx(400), fx(400));
  select(g, [carrier]);

  g.fastForward(0);

  assert.ok(ui.selTrainKinds.value.includes(Kind.Interceptor));
});
