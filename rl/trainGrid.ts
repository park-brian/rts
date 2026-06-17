// Demo: `node rl/trainGrid.ts`
// GridNet PPO on microRTS: a small CNN over the H×W board emits, in ONE forward
// pass, an action distribution for EVERY cell (= every unit), each masked to that
// cell's legal actions. This is the efficient "command all units at once" policy
// — shared conv weights over the grid — implemented in pure TS with typed arrays
// and hand-written conv backprop (numerically gradient-checked in grid.test.ts).

import { GridEnv } from './gridEnv.ts';
import { GridNet } from './grid.ts';
import { trainGrid, evalGrid } from './ppoGrid.ts';

const env0 = new GridEnv();
console.log(`grid ${env0.H}x${env0.W}, ${env0.channels} feature planes, ${env0.actions} per-cell action slots`);
const untrained = new GridNet(env0.channels, env0.H, env0.W, env0.actions, 16, 999);
console.log(`untrained economy (greedy, net resources/game): ${evalGrid(untrained, new GridEnv()).toFixed(1)}`);

console.log(`\ntraining GridNet PPO (conv encoder -> per-cell masked logits + pooled value) ...`);
const t0 = Date.now();
const { net, returns } = trainGrid(() => new GridEnv(), { steps: 512, iterations: 45, epochs: 4, minibatch: 128, F: 16, lr: 1e-3, entCoef: 0.03, seed: 3 });
const k = Math.min(15, returns.length);
const early = returns.slice(0, k).reduce((a, b) => a + b, 0) / k;
const late = returns.slice(-k).reduce((a, b) => a + b, 0) / k;
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s over ${returns.length} games | episode return ${early.toFixed(1)} -> ${late.toFixed(1)}`);
console.log(`trained economy (greedy, net resources/game): ${evalGrid(net, new GridEnv()).toFixed(1)}`);
console.log(`\nOne CNN forward pass per state produces every cell's action — GridNet, in TS.`);
