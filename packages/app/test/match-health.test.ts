import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Kind,
  Sim,
  Terran,
  createMatchStats,
  eid,
  fx,
  recordMatchStatsStep,
  sliceMap,
  spawnUnit,
  type Command,
  type PlayerCommands,
} from '../src/sim.ts';
import { matchHealthRows, resourceBreakdownLine } from '../src/match-health.ts';

test('match health summarizes macro, economy, production, and combat from match stats', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 9201, factions: [Terran, Terran] });
  const s = sim.fullState();
  const stats = createMatchStats(s);
  const e = s.e;
  let commandCenter = -1;
  let worker = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.CommandCenter) commandCenter = i;
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.SCV) worker = i;
  }

  const batch: PlayerCommands[] = [{
    player: 0,
    cmds: [
      { t: 'train', building: eid(e, commandCenter), kind: Kind.Battlecruiser },
      { t: 'amove', unit: eid(e, worker), x: fx(1600), y: fx(1600) },
    ] satisfies Command[],
  }];
  const results = sim.step(batch);
  spawnUnit(s, Kind.SCV, 0, fx(1400), fx(1400));
  spawnUnit(s, Kind.Marine, 0, fx(1440), fx(1400));
  recordMatchStatsStep(stats, s, batch, results);

  const p0 = matchHealthRows(stats).filter((row) => row.player === 0);

  assert.equal(p0.some((row) => row.domain === 'macro' && row.status === 'failing'), true);
  assert.equal(p0.some((row) => row.domain === 'economy' && row.status === 'healthy'), true);
  assert.equal(p0.some((row) => row.domain === 'production' && row.status === 'healthy'), true);
  assert.equal(p0.some((row) => row.domain === 'combat' && row.status === 'healthy'), true);
});

test('resource breakdown summarizes income, conversion, bank, and losses compactly', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 9202, factions: [Terran] });
  const player = createMatchStats(sim.fullState()).players[0]!;

  Object.assign(player, {
    minerals: 120,
    gas: 40,
    mineralsMined: 320,
    gasMined: 80,
    mineralsReturned: 300,
    gasReturned: 60,
    mineralValueCreated: 200,
    gasValueCreated: 40,
    mineralValueLost: 50,
    gasValueLost: 0,
    carriedMineralsLost: 8,
    carriedGasLost: 4,
  });

  assert.equal(
    resourceBreakdownLine(player),
    'mined 320/80 · returned 300/60 · made 200/40 · bank 120/40 · convert 67% · value lost 50/0 · carried lost 8/4',
  );
});
