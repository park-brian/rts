import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MinigameEnv, winRate, netPolicyA } from './minigameEnv.ts';
import { ActorCritic } from './nn.ts';
import { train } from './ppo.ts';
import { SMALL } from '../minigame/params.ts';
import { turtle } from '../minigame/policies.ts';
import { legalActions } from '../minigame/game.ts';
import { initialState, step, outcome } from '../minigame/game.ts';

test('masked PPO learns to beat a scripted opponent it cannot beat untrained', () => {
  const env = new MinigameEnv(SMALL, turtle);
  const untrained = new ActorCritic(env.obsDim, env.nActions, 64);
  const base = winRate(untrained, SMALL, turtle, 200, 5, true);

  const { net } = train(() => new MinigameEnv(SMALL, turtle), {
    steps: 1024, iterations: 35, epochs: 4, minibatch: 256, lr: 3e-3, entCoef: 0.02, hidden: 64, seed: 4,
  });
  const trained = winRate(net, SMALL, turtle, 200, 5, true);

  assert.ok(trained > base + 0.3, `expected learning: untrained ${base.toFixed(2)} -> trained ${trained.toFixed(2)}`);
  assert.ok(trained > 0.7, `expected a strong trained policy, got ${trained.toFixed(2)}`);
});

test('the learned policy only ever issues legal actions', () => {
  const env = new MinigameEnv(SMALL, turtle);
  const net = new ActorCritic(env.obsDim, env.nActions, 64); // even untrained: masking is structural
  const policy = netPolicyA(net, SMALL);
  let s = initialState(SMALL);
  for (let i = 0; i < 50 && outcome(s, SMALL) === null; i++) {
    const a = policy(s, 'a', SMALL);
    const legal = legalActions(s, 'a', SMALL);
    assert.ok(legal.some((b) => b.attack === a.attack && b.defend === a.defend && b.target === a.target && b.build === a.build), 'policy chose an illegal action');
    s = step(s, a, turtle(s, 'b', SMALL), SMALL);
  }
});
