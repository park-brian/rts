// Demo: `node rl/trainMicro.ts`
// Factored masked PPO on microRTS: ONE decision step commands EVERY idle unit at
// once, and each unit's action head is MASKED to that unit's own legal actions
// (a base's legal set != a worker's). This is why masking exists — you emit a
// command per unit in a single pass. Here the agent learns the (multi-unit)
// economy: workers harvest/return while the base produces more workers.

import { MicroRTSEnv } from './micrortsEnv.ts';
import { trainMulti, evalEconomy } from './ppoMulti.ts';
import { ActorCritic } from './nn.ts';

const mc = 150;
const env0 = new MicroRTSEnv(undefined, mc);
console.log(`per-unit action slots: ${env0.perUnitActions} (None / Move / Harvest / Return / Produce x kind / Attack x rel-target)`);
console.log(`unit obs dim ${env0.unitObsDim}, global (critic) obs dim ${env0.globalObsDim}`);

const untrained = new ActorCritic(env0.unitObsDim, env0.perUnitActions, 64, 999);
console.log(`\nuntrained economy (greedy, net resources / game): ${evalEconomy(untrained, new MicroRTSEnv(undefined, mc)).toFixed(1)}`);

console.log(`\ntraining factored PPO (commands all idle units each step, per-unit masks) ...`);
const t0 = Date.now();
const { actor, returns } = trainMulti(() => new MicroRTSEnv(undefined, mc), {
  steps: 512, iterations: 40, minibatch: 128, lr: 1e-3, entCoef: 0.03, hidden: 64, seed: 3,
});
const k = Math.min(15, returns.length);
const early = returns.slice(0, k).reduce((a, b) => a + b, 0) / k;
const late = returns.slice(-k).reduce((a, b) => a + b, 0) / k;
console.log(`done in ${Date.now() - t0} ms over ${returns.length} games | episode return ${early.toFixed(1)} -> ${late.toFixed(1)}`);
console.log(`trained economy (greedy, net resources / game): ${evalEconomy(actor, new MicroRTSEnv(undefined, mc)).toFixed(1)}`);
console.log(`\nThe agent learned to run the harvest loop across multiple units — a single`);
console.log(`forward pass per unit, every unit commanded each step, illegal actions masked.`);
