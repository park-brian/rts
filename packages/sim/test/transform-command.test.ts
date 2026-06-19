import test from 'node:test';
import assert from 'node:assert/strict';
import { entityTargetMask, transformKindCandidates, transformKindMask } from '../src/action-mask.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';
import { transformSelectionCandidates, transformSelectionOptions } from '../src/command-intent.ts';
import { Kind, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateTransformCommand } from '../src/transform-command.ts';
import { validateCommand } from '../src/validation.ts';
import { slotOf } from '../src/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type TransformCommand = Extract<Command, { t: 'transform' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

const assertTransform = (s: ReturnType<typeof simScenario>['state'], player: number, command: TransformCommand, expected: Expected): void => {
  assert.deepEqual(validateTransformCommand(s, player, command), expected);
  assert.deepEqual(validateCommand(s, player, command), expected);
};

test('transform validation owns actor capability and ownership gates', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 670 });
  const e = s.e;
  const tank = spawn(Kind.SiegeTank, 0, fx(300), fx(300));
  const enemyTank = spawn(Kind.SiegeTank, 1, fx(340), fx(300));
  const contained = spawn(Kind.SiegeTank, 0, fx(380), fx(300));
  const burrowed = spawn(Kind.Hydralisk, 0, fx(420), fx(300));
  const illusion = spawn(Kind.SiegeTank, 0, fx(460), fx(300));
  const disabled = spawn(Kind.SiegeTank, 0, fx(500), fx(300));
  const unfinished = spawn(Kind.SiegeTank, 0, fx(540), fx(300));

  e.container[slotOf(contained)] = spawn(Kind.Dropship, 0, fx(380), fx(340));
  e.burrowed[slotOf(burrowed)] = 1;
  e.illusion[slotOf(illusion)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;

  assertTransform(s, 0, { t: 'transform', unit: tank, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'missing-requirement' });
  assertTransform(s, 0, { t: 'transform', unit: enemyTank, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'wrong-owner' });
  assertTransform(s, 0, { t: 'transform', unit: 999_999, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'stale-entity' });
  assertTransform(s, 0, { t: 'transform', unit: contained, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'missing-capability' });
  assertTransform(s, 0, { t: 'transform', unit: burrowed, kind: Kind.Lurker }, { ok: false, reason: 'missing-capability' });
  assertTransform(s, 0, { t: 'transform', unit: illusion, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'missing-capability' });
  assertTransform(s, 0, { t: 'transform', unit: disabled, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'missing-capability' });
  assertTransform(s, 0, { t: 'transform', unit: unfinished, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'missing-capability' });
});

test('instant transform validation follows tech and transform table legality', () => {
  const { state: s, spawn, grant } = simScenario({ players: 1, seed: 671 });
  const tank = spawn(Kind.SiegeTank, 0, fx(300), fx(300));
  const marine = spawn(Kind.Marine, 0, fx(340), fx(300));

  assertTransform(s, 0, { t: 'transform', unit: marine, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'target-not-allowed' });
  assertTransform(s, 0, { t: 'transform', unit: tank, kind: Kind.SiegeTankSieged }, { ok: false, reason: 'missing-requirement' });
  grant(0, Tech.SiegeTech, 1);
  assertTransform(s, 0, { t: 'transform', unit: tank, kind: Kind.SiegeTankSieged }, { ok: true });
});

test('morph validation owns requirements, queues, affordability, and supply', () => {
  const { state: s, spawn, resources, grant } = simScenario({ players: 1, seed: 672 });
  const e = s.e;
  const hydra = spawn(Kind.Hydralisk, 0, fx(300), fx(300));
  const hydraSlot = slotOf(hydra);
  const command: TransformCommand = { t: 'transform', unit: hydra, kind: Kind.Lurker };

  resources(0, 1_000, 1_000);
  s.players.supplyMax[0] = 200;
  assertTransform(s, 0, command, { ok: false, reason: 'missing-requirement' });

  spawn(Kind.HydraliskDen, 0, fx(360), fx(300));
  assertTransform(s, 0, command, { ok: false, reason: 'missing-requirement' });

  grant(0, Tech.LurkerAspect, 1);
  e.prodKind[hydraSlot] = Kind.Zergling;
  assertTransform(s, 0, command, { ok: false, reason: 'queue-full' });

  e.prodKind[hydraSlot] = Kind.None;
  e.researchKind[hydraSlot] = Tech.Burrow;
  assertTransform(s, 0, command, { ok: false, reason: 'queue-full' });

  e.researchKind[hydraSlot] = Kind.None;
  s.players.minerals[0] = Units[Kind.Lurker]!.minerals - 1;
  assertTransform(s, 0, command, { ok: false, reason: 'not-affordable' });

  resources(0, 1_000, 1_000);
  s.players.supplyUsed[0] = s.players.supplyMax[0];
  assertTransform(s, 0, command, { ok: false, reason: 'supply-blocked' });

  s.players.supplyUsed[0] -= Units[Kind.Lurker]!.supply - Units[Kind.Hydralisk]!.supply;
  assertTransform(s, 0, command, { ok: true });
});

test('merge validation owns partner target legality', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 673 });
  const e = s.e;
  const a = spawn(Kind.HighTemplar, 0, fx(300), fx(300));
  const b = spawn(Kind.HighTemplar, 0, fx(330), fx(300));
  const far = spawn(Kind.HighTemplar, 0, fx(500), fx(300));
  const enemy = spawn(Kind.HighTemplar, 1, fx(332), fx(300));
  const contained = spawn(Kind.HighTemplar, 0, fx(334), fx(300));
  e.container[slotOf(contained)] = spawn(Kind.Shuttle, 0, fx(334), fx(340));

  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon }, { ok: true });
  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon, target: b }, { ok: true });
  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon, target: a }, { ok: false, reason: 'target-not-allowed' });
  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon, target: far }, { ok: false, reason: 'target-not-allowed' });
  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon, target: enemy }, { ok: false, reason: 'target-not-allowed' });
  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon, target: contained }, { ok: false, reason: 'target-not-allowed' });
  assertTransform(s, 0, { t: 'transform', unit: a, kind: Kind.Archon, target: 999_999 }, { ok: false, reason: 'target-not-allowed' });
});

test('transform masks and command-card selection follow transform validation', () => {
  const { state: s, spawn, resources, grant } = simScenario({ players: 1, seed: 674 });
  const hydra = spawn(Kind.Hydralisk, 0, fx(300), fx(300));
  const templarA = spawn(Kind.HighTemplar, 0, fx(360), fx(300));
  const templarB = spawn(Kind.HighTemplar, 0, fx(390), fx(300));
  spawn(Kind.HydraliskDen, 0, fx(430), fx(300));
  resources(0, 1_000, 1_000);
  s.players.supplyMax[0] = 200;

  let hydraTransforms = transformKindCandidates(s, hydra);
  let hydraMask = transformKindMask(s, 0, hydra, hydraTransforms);
  assert.deepEqual([...hydraMask], hydraTransforms.map((kind) =>
    validateCommand(s, 0, { t: 'transform', unit: hydra, kind }).ok ? 1 : 0));
  assert.deepEqual([...hydraMask], [0]);

  grant(0, Tech.LurkerAspect, 1);
  hydraTransforms = transformKindCandidates(s, hydra);
  hydraMask = transformKindMask(s, 0, hydra, hydraTransforms);
  assert.deepEqual([...hydraMask], hydraTransforms.map((kind) =>
    validateCommand(s, 0, { t: 'transform', unit: hydra, kind }).ok ? 1 : 0));
  assert.deepEqual([...hydraMask], [1]);

  const targetMask = entityTargetMask(s, 0, templarA, 'transform', [templarB, hydra], { kind: Kind.Archon });
  assert.deepEqual([...targetMask], [1, 0]);
  assert.deepEqual([...targetMask], [templarB, hydra].map((target) =>
    validateCommand(s, 0, { t: 'transform', unit: templarA, kind: Kind.Archon, target }).ok ? 1 : 0));

  assert.deepEqual(transformSelectionCandidates(s, 0, [hydra, templarA, templarB], Kind.Archon), [
    { t: 'transform', unit: templarA, kind: Kind.Archon, target: templarB },
  ]);
  assert.deepEqual(transformSelectionOptions(s, 0, [hydra]).find((o) => o.id === Kind.Lurker), {
    id: Kind.Lurker,
    ok: true,
    representative: hydra,
    commands: [{ t: 'transform', unit: hydra, kind: Kind.Lurker }],
  });
});
