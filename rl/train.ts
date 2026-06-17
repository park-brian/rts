// Demo: `node rl/train.ts`
// Trains the masked PPO on the minigame macro game against a scripted opponent
// and reports win-rate before vs after, plus generalization to the other
// archetypes. This is the project's Stage-2 (PPO fine-tune) recipe, in pure TS:
// invalid-action masking + GAE + clipped surrogate + entropy + advantage
// normalization + Adam + grad-norm clipping.

import { MinigameEnv, winRate } from './minigameEnv.ts';
import { ActorCritic } from './nn.ts';
import { train } from './ppo.ts';
import { SMALL } from '../minigame/params.ts';
import { greedy, macro, turtle, cheese, harasser } from '../minigame/policies.ts';

const ARCHES = [['greedy', greedy], ['macro', macro], ['turtle', turtle], ['cheese', cheese], ['harasser', harasser]] as const;
const TEACHER = turtle;

const env0 = new MinigameEnv(SMALL, TEACHER);
const untrained = new ActorCritic(env0.obsDim, env0.nActions, 64);

console.log(`obs dim ${env0.obsDim}, action space ${env0.nActions} (masked to legal each step)`);
console.log(`\ntraining PPO as player A vs 'turtle' on SMALL ...`);
const t0 = Date.now();
const { net, returns } = train(() => new MinigameEnv(SMALL, TEACHER), {
  steps: 1024, iterations: 40, epochs: 4, minibatch: 256, lr: 3e-3, entCoef: 0.02, hidden: 64, seed: 4,
});
const early = returns.slice(0, 100).reduce((a, b) => a + b, 0) / 100;
const late = returns.slice(-100).reduce((a, b) => a + b, 0) / 100;
console.log(`done in ${Date.now() - t0} ms | mean episode return ${early.toFixed(2)} -> ${late.toFixed(2)}`);

console.log(`\nwin-rate vs the teacher (turtle):`);
console.log(`  untrained (greedy eval): ${winRate(untrained, SMALL, TEACHER, 300, 5, true).toFixed(2)}`);
console.log(`  trained   (greedy eval): ${winRate(net, SMALL, TEACHER, 300, 5, true).toFixed(2)}`);

console.log(`\ngeneralization — trained policy (greedy eval) vs every archetype:`);
for (const [name, opp] of ARCHES) {
  console.log(`  vs ${name.padEnd(9)} ${winRate(net, SMALL, opp, 300, 11, true).toFixed(2)}`);
}
console.log(`\n(masking is applied at sampling AND in the loss, so the policy never`);
console.log(` considers an illegal action — the Gym-µRTS recipe, here in pure TS.)`);
