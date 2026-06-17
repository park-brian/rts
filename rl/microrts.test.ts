import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MicroRTSEnv } from './micrortsEnv.ts';
import { trainMulti, evalEconomy } from './ppoMulti.ts';
import { ActorCritic, maskedSoftmax, sampleFrom } from './nn.ts';
import { makeMap } from '../microrts/setup.ts';
import { idleUnits, legalActions } from '../microrts/game.ts';

test('every idle unit is commanded, with a PER-UNIT mask matching the engine', () => {
  const env = new MicroRTSEnv();
  const obs = env.reset();
  const s = makeMap(); // env.reset() uses makeMap(), so states match
  const idle = idleUnits(s, 0);

  // all (and only) the player-0 idle units appear, in id order coverage
  assert.equal(obs.units.length, idle.length);
  assert.deepEqual(obs.units.map((u) => u.id).sort((a, b) => a - b), idle.map((u) => u.id).sort((a, b) => a - b));

  for (const uo of obs.units) {
    const u = idle.find((z) => z.id === uo.id)!;
    assert.ok(uo.mask[0], 'None must always be legal');
    // number of legal slots equals the engine's legal-action count for THIS unit
    const trueSlots = uo.mask.filter(Boolean).length;
    assert.equal(trueSlots, legalActions(s, u).length, `mask size mismatch for unit ${u.id} (${u.kind})`);
  }

  // the Base and the Worker have DIFFERENT legal sets — the point of per-unit masking
  const masks = obs.units.map((u) => u.mask.join(''));
  assert.equal(new Set(masks).size, obs.units.length, 'distinct units should have distinct masks here');
});

test('sampling and greedy selection never pick a masked-illegal action for any unit', () => {
  const env = new MicroRTSEnv();
  const net = new ActorCritic(env.unitObsDim, env.perUnitActions, 32);
  let obs = env.reset();
  let seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let stepN = 0; stepN < 30; stepN++) {
    const acts = obs.units.map((u) => {
      const f = net.forward(u.obs);
      const slot = sampleFrom(maskedSoftmax(f.logits, u.mask), rnd());
      assert.ok(u.mask[slot], `unit ${u.id} sampled illegal slot ${slot}`);
      return { unitId: u.id, slot };
    });
    const out = env.step(acts);
    if (out.done) obs = env.reset(); else obs = out.obs;
  }
});

test('factored multi-unit PPO learns the economy (net resources go positive)', () => {
  const cfg = { steps: 512, iterations: 40, minibatch: 128, lr: 1e-3, entCoef: 0.03, hidden: 64, seed: 3 } as const;
  const mc = 150;
  const env = new MicroRTSEnv(undefined, mc);
  const untrained = new ActorCritic(env.unitObsDim, env.perUnitActions, 64, 999);
  const base = evalEconomy(untrained, new MicroRTSEnv(undefined, mc));
  const { actor } = trainMulti(() => new MicroRTSEnv(undefined, mc), cfg);
  const trained = evalEconomy(actor, new MicroRTSEnv(undefined, mc));
  assert.ok(trained > base + 4, `expected learning: untrained ${base.toFixed(1)} -> trained ${trained.toFixed(1)}`);
  assert.ok(trained > 2, `expected a net-positive economy, got ${trained.toFixed(1)}`);
});
