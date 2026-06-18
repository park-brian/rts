import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { dispatchHotkey, resetHotkeys, setHotkey } from '../src/hotkeys.ts';
import { ui } from '../src/store.ts';
import { Kind, Tech, eid, fx, liftedStructureFlags, slotOf, spawnUnit } from '../src/sim.ts';

const selectFirst = (g: Game, kind: number): number => {
  const e = g.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === 0) {
      const id = eid(e, i);
      g.selection.clear();
      g.selection.add(id);
      return id;
    }
  }
  throw new Error(`missing kind ${kind}`);
};

test('desktop hotkeys arm commands and can be remapped', () => {
  resetHotkeys();
  const g = new Game('play', 77);
  ui.controlScheme.value = 'desktop';
  ui.mode.value = 'play';
  selectFirst(g, Kind.SCV);
  g.fastForward(0);

  assert.equal(dispatchHotkey(g, 'KeyA'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'attackMove' });

  ui.armedCommand.value = { t: 'none' };
  setHotkey('attackMove', 'KeyQ');

  assert.equal(dispatchHotkey(g, 'KeyA'), false);
  assert.deepEqual(ui.armedCommand.value, { t: 'none' });
  assert.equal(dispatchHotkey(g, 'KeyQ'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'attackMove' });
});

test('desktop stop hotkey queues validated stop commands', () => {
  resetHotkeys();
  const g = new Game('play', 88);
  ui.controlScheme.value = 'desktop';
  ui.mode.value = 'play';
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  g.selection.clear();
  g.selection.add(marine);
  g.fastForward(0);

  assert.equal(dispatchHotkey(g, 'KeyS'), true);

  assert.deepEqual(g.queued, [{ t: 'stop', unit: marine }]);
  assert.equal(g.sim.fullState().e.alive[slotOf(marine)], 1);
});

test('desktop command-card hotkeys expose train, research, add-on, lift, and land actions', () => {
  resetHotkeys();
  const g = new Game('play', 91);
  ui.controlScheme.value = 'desktop';
  ui.mode.value = 'play';
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
  assert.equal(dispatchHotkey(g, 'KeyL'), true);
  assert.deepEqual(g.queued.pop(), { t: 'lift', building: barracks });

  const slot = slotOf(barracks);
  e.flags[slot] = liftedStructureFlags(Kind.Barracks);
  g.fastForward(0);
  assert.equal(dispatchHotkey(g, 'KeyL'), true);
  assert.deepEqual(ui.armedCommand.value, { t: 'land', kind: Kind.Barracks });
});

test('command options execute grouped transforms through the shared option path', () => {
  resetHotkeys();
  const g = new Game('play', 94);
  ui.controlScheme.value = 'desktop';
  ui.mode.value = 'play';
  const s = g.sim.fullState();
  const templarA = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const templarB = spawnUnit(s, Kind.HighTemplar, 0, fx(430), fx(400));
  g.selection.clear();
  g.selection.add(templarA);
  g.selection.add(templarB);
  g.fastForward(0);

  const option = ui.selectionView.value.options.transform.find((o) => o.id === Kind.Archon);
  assert.deepEqual(option?.commands, [
    { t: 'transform', unit: templarA, kind: Kind.Archon, target: templarB },
  ]);
  assert.equal(g.executeOption(option!), true);
  assert.deepEqual(g.queued, [{ t: 'transform', unit: templarA, kind: Kind.Archon, target: templarB }]);
});

test('desktop control groups assign, recall, and add live selections', () => {
  const g = new Game('play', 92);
  const marine = spawnUnit(g.sim.fullState(), Kind.Marine, 0, fx(400), fx(400));
  const firebat = spawnUnit(g.sim.fullState(), Kind.Firebat, 0, fx(430), fx(400));

  g.selection.clear();
  g.selection.add(marine);
  assert.equal(g.assignControlGroup(0), true);
  assert.equal(ui.controlGroupCounts.value[0], 1);

  g.selection.clear();
  g.selection.add(firebat);
  assert.equal(g.assignControlGroup(1), true);
  assert.deepEqual(ui.controlGroupCounts.value.slice(0, 2), [1, 1]);

  assert.equal(g.recallControlGroup(0), true);
  assert.deepEqual([...g.selection], [marine]);

  assert.equal(g.recallControlGroup(1, true), true);
  assert.equal(g.selection.has(marine), true);
  assert.equal(g.selection.has(firebat), true);
});

test('desktop control group counts prune dead members through HUD publishing', () => {
  const g = new Game('play', 93);
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const firebat = spawnUnit(s, Kind.Firebat, 0, fx(430), fx(400));

  g.selection.clear();
  g.selection.add(marine);
  g.selection.add(firebat);
  assert.equal(g.assignControlGroup(0), true);
  assert.equal(ui.controlGroupCounts.value[0], 2);

  s.e.alive[slotOf(marine)] = 0;
  g.fastForward(0);

  assert.equal(ui.controlGroupCounts.value[0], 1);
});
