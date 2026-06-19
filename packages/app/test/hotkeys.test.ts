import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchHotkey, resetHotkeys, setHotkey } from '../src/hotkeys.ts';
import { OrderOptionId, ui } from '../src/store.ts';
import { Ability, Kind, Tech, fx, liftedStructureFlags, setTechLevel, slotOf, spawnUnit } from '../src/sim.ts';
import { desktopGame, select, selectFirst } from '../test-support/harness.ts';

test('desktop hotkeys arm commands and can be remapped', () => {
  resetHotkeys();
  const g = desktopGame(77);
  selectFirst(g, Kind.SCV);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.AttackMove)?.arm, { t: 'attackMove' });
  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Harvest)?.arm, {
    t: 'target',
    mode: 'harvest',
  });
  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Repair)?.arm, {
    t: 'target',
    mode: 'repair',
  });

  assert.equal(dispatchHotkey(g, 'KeyA'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'attackMove' });
  assert.equal(dispatchHotkey(g, 'KeyA'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });

  assert.equal(dispatchHotkey(g, 'KeyG'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'target', mode: 'harvest' });
  assert.equal(dispatchHotkey(g, 'KeyG'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });

  assert.equal(dispatchHotkey(g, 'KeyR'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'target', mode: 'repair' });

  ui.armedCommand.value = { t: 'none' };
  setHotkey('attackMove', 'KeyQ');

  assert.equal(dispatchHotkey(g, 'KeyA'), false);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
  assert.equal(dispatchHotkey(g, 'KeyQ'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'attackMove' });
});

test('desktop hold and stop hotkeys queue validated order commands', () => {
  resetHotkeys();
  const g = desktopGame(88);
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  g.selection.clear();
  g.selection.add(marine);
  g.fastForward(0);

  assert.equal(dispatchHotkey(g, 'KeyH'), true);
  assert.deepEqual(g.queued.pop(), { t: 'hold', unit: marine });

  assert.equal(dispatchHotkey(g, 'KeyS'), true);

  assert.deepEqual(g.queued, [{ t: 'stop', unit: marine }]);
  assert.equal(g.sim.fullState().e.alive[slotOf(marine)], 1);
});

test('desktop command-card hotkeys expose train, research, add-on, lift, and land actions', () => {
  resetHotkeys();
  const g = desktopGame(91);
  const s = g.sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 5_000;
  s.players.gas[0] = 5_000;
  s.players.supplyMax[0] = 400;

  const barracks = spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700));
  g.selection.clear();
  g.selection.add(barracks);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.train.find((o) => o.id === Kind.Marine)?.commands, [
    { t: 'train', building: barracks, kind: Kind.Marine },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyM'), true);
  assert.deepEqual(g.queued.pop(), { t: 'train', building: barracks, kind: Kind.Marine });

  const academy = spawnUnit(s, Kind.Academy, 0, fx(900), fx(700));
  g.selection.clear();
  g.selection.add(academy);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.research.find((o) => o.id === Tech.StimPack)?.commands, [
    { t: 'research', building: academy, tech: Tech.StimPack },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyT'), true);
  assert.deepEqual(g.queued.pop(), { t: 'research', building: academy, tech: Tech.StimPack });

  const factory = spawnUnit(s, Kind.Factory, 0, fx(256), fx(256));
  g.selection.clear();
  g.selection.add(factory);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.addon.find((o) => o.id === Kind.MachineShop)?.commands, [
    { t: 'addon', building: factory, kind: Kind.MachineShop },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyM'), true);
  assert.deepEqual(g.queued.pop(), { t: 'addon', building: factory, kind: Kind.MachineShop });

  g.selection.clear();
  g.selection.add(barracks);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Rally)?.arm, { t: 'rally' });
  assert.equal(dispatchHotkey(g, 'KeyY'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'rally' });
  assert.equal(dispatchHotkey(g, 'KeyY'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });

  assert.equal(dispatchHotkey(g, 'KeyL'), true);
  assert.deepEqual(g.queued.pop(), { t: 'lift', building: barracks });

  const slot = slotOf(barracks);
  e.flags[slot] = liftedStructureFlags(Kind.Barracks);
  g.fastForward(0);
  assert.equal(dispatchHotkey(g, 'KeyL'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'land', kind: Kind.Barracks });
});

test('desktop train options queue the least-loaded selected producer', () => {
  resetHotkeys();
  const g = desktopGame(98);
  const s = g.sim.fullState();
  s.players.minerals[0] = 5_000;
  s.players.gas[0] = 5_000;
  s.players.supplyMax[0] = 400;

  const busy = spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700));
  const idle = spawnUnit(s, Kind.Barracks, 0, fx(900), fx(700));
  const busySlot = slotOf(busy);
  s.e.prodKind[busySlot] = Kind.Marine;
  s.e.prodTimer[busySlot] = 100;
  select(g, [busy, idle]);
  g.fastForward(0);

  assert.deepEqual(ui.selectionView.value.options.train.find((o) => o.id === Kind.Marine)?.commands, [
    { t: 'train', building: idle, kind: Kind.Marine },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyM'), true);
  assert.deepEqual(g.queued.pop(), { t: 'train', building: idle, kind: Kind.Marine });
});

test('desktop add-on options queue the first valid selected producer', () => {
  resetHotkeys();
  const g = desktopGame(99);
  const s = g.sim.fullState();
  s.players.minerals[0] = 5_000;
  s.players.gas[0] = 5_000;

  const busy = spawnUnit(s, Kind.Factory, 0, fx(700), fx(700));
  const idle = spawnUnit(s, Kind.Factory, 0, fx(900), fx(700));
  s.e.target[slotOf(busy)] = busy;
  select(g, [busy, idle]);
  g.fastForward(0);

  assert.deepEqual(ui.selectionView.value.options.addon.find((o) => o.id === Kind.MachineShop)?.commands, [
    { t: 'addon', building: idle, kind: Kind.MachineShop },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyM'), true);
  assert.deepEqual(g.queued.pop(), { t: 'addon', building: idle, kind: Kind.MachineShop });
});

test('desktop cancel hotkey executes cancellable morph option before deselect', () => {
  resetHotkeys();
  const g = desktopGame(96);
  const s = g.sim.fullState();
  g.controllers = [null, null];
  const hatchery = spawnUnit(s, Kind.Hatchery, 0, fx(700), fx(700));
  spawnUnit(s, Kind.SpawningPool, 0, fx(860), fx(700));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const started = g.sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hatchery, kind: Kind.Lair }] }]);
  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  select(g, [hatchery]);
  g.fastForward(0);

  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Cancel)?.commands, [
    { t: 'cancelBuild', building: hatchery },
  ]);
  assert.equal(dispatchHotkey(g, 'Escape'), true);
  assert.deepEqual(g.queued, [{ t: 'cancelBuild', building: hatchery }]);
  assert.deepEqual([...g.selection], [hatchery]);
});

test('desktop load and unload hotkeys execute shared order options', () => {
  resetHotkeys();
  const g = desktopGame(97);
  const s = g.sim.fullState();
  const dropship = spawnUnit(s, Kind.Dropship, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  select(g, [dropship, marine]);
  g.fastForward(0);

  assert.deepEqual(ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Load)?.commands, [
    { t: 'load', transport: dropship, unit: marine },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyL'), true);
  assert.deepEqual(g.queued.pop(), { t: 'load', transport: dropship, unit: marine });

  g.sim.step([{ player: 0, cmds: [{ t: 'load', transport: dropship, unit: marine }] }]);
  select(g, [dropship]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.order.find((o) => o.id === OrderOptionId.Unload);
  assert.equal(option?.commands?.[0]?.t, 'unload');
  assert.equal(dispatchHotkey(g, 'KeyU'), true);
  assert.equal(g.queued.at(-1)?.t, 'unload');
});

test('desktop command-card hotkeys execute build and ability options through shared descriptors', () => {
  resetHotkeys();
  const g = desktopGame(95);
  const s = g.sim.fullState();
  s.players.minerals[0] = 5_000;
  s.players.gas[0] = 5_000;

  const scv = selectFirst(g, Kind.SCV);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.build.find((o) => o.id === Kind.SupplyDepot)?.arm, {
    t: 'place',
    kind: Kind.SupplyDepot,
  });
  assert.equal(dispatchHotkey(g, 'KeyS'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'place', kind: Kind.SupplyDepot });
  assert.equal(g.sim.fullState().e.alive[slotOf(scv)], 1);

  ui.armedCommand.value = { t: 'none' };
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  setTechLevel(s, 0, Tech.StimPack, 1);
  select(g, [marine]);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.ability.find((o) => o.id === Ability.StimPack)?.commands, [
    { t: 'ability', unit: marine, ability: Ability.StimPack },
  ]);
  assert.equal(dispatchHotkey(g, 'KeyT'), true);
  assert.deepEqual(g.queued.pop(), { t: 'ability', unit: marine, ability: Ability.StimPack });

  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(460), fx(400));
  s.e.energy[slotOf(templar)] = 75;
  setTechLevel(s, 0, Tech.PsionicStorm, 1);
  select(g, [templar]);
  g.fastForward(0);
  assert.deepEqual(ui.selectionView.value.options.ability.find((o) => o.id === Ability.PsionicStorm)?.arm, {
    t: 'ability',
    ability: Ability.PsionicStorm,
  });
  assert.equal(dispatchHotkey(g, 'KeyT'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'ability', ability: Ability.PsionicStorm });
  assert.equal(dispatchHotkey(g, 'KeyT'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
});

test('command options execute grouped transforms through the shared option path', () => {
  resetHotkeys();
  const g = desktopGame(94);
  const s = g.sim.fullState();
  const templarA = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const templarB = spawnUnit(s, Kind.HighTemplar, 0, fx(430), fx(400));
  select(g, [templarA, templarB]);
  g.fastForward(0);

  const option = ui.selectionView.value.options.transform.find((o) => o.id === Kind.Archon);
  assert.deepEqual(option?.commands, [
    { t: 'transform', unit: templarA, kind: Kind.Archon, target: templarB },
  ]);
  assert.equal(g.executeOption(option!), true);
  assert.deepEqual(g.queued, [{ t: 'transform', unit: templarA, kind: Kind.Archon, target: templarB }]);
});

test('desktop control groups assign, recall, and add live selections', () => {
  const g = desktopGame(92);
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  const firebat = spawnUnit(g.sim.fullState(), Kind.Firebat, 0, fx(430), fx(400));

  select(g, [marine]);
  assert.equal(g.assignControlGroup(0), true);
  assert.equal(ui.controlGroupCounts.value[0], 1);

  select(g, [firebat]);
  assert.equal(g.assignControlGroup(1), true);
  assert.deepEqual(ui.controlGroupCounts.value.slice(0, 2), [1, 1]);

  assert.equal(g.recallControlGroup(0), true);
  assert.deepEqual([...g.selection], [marine]);

  assert.equal(g.recallControlGroup(1, true), true);
  assert.equal(g.selection.has(marine), true);
  assert.equal(g.selection.has(firebat), true);
});

test('desktop control group counts prune dead members through HUD publishing', () => {
  const g = desktopGame(93);
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const firebat = spawnUnit(s, Kind.Firebat, 0, fx(430), fx(400));

  select(g, [marine, firebat]);
  assert.equal(g.assignControlGroup(0), true);
  assert.equal(ui.controlGroupCounts.value[0], 2);

  s.e.alive[slotOf(marine)] = 0;
  g.fastForward(0);

  assert.equal(ui.controlGroupCounts.value[0], 1);
});
