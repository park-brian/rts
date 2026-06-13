// Sim worker: runs the deterministic engine off the main (render) thread and
// publishes each tick into a SharedArrayBuffer via the seqlock in @rts/sim's
// shared.ts. The render thread reads consistent snapshots with no postMessage
// and no per-frame allocation. Commands flow the other way as small messages.
//
// Protocol (main → worker):
//   { type: 'init', sab, perTeam, seed, ticks }  start a match, run `ticks` ticks
//                                                 in real time, publishing each.
//   { type: 'cmds', batch }                       queue a command batch (human input)
// Worker → main:
//   { type: 'ready', tick }    published the first frame (sab is now live)
//   { type: 'done', tick, hash }  finished `ticks`; hash is the authoritative fingerprint
//   { type: 'progress', tick }    occasional heartbeat (for demos/telemetry)

import { Sim, generateMap, FPS, type PlayerCommands } from '@rts/sim';
import { SharedSnapshot, publish } from '@rts/sim';
import { createBotControllers } from './sim.ts';

type InitMsg = { type: 'init'; sab: SharedArrayBuffer; perTeam: number; seed: number; ticks: number };
type CmdMsg = { type: 'cmds'; batch: PlayerCommands[] };
type Msg = InitMsg | CmdMsg;

let sim: Sim | null = null;
let snap: SharedSnapshot | null = null;
let controllers: (ReturnType<typeof createBotControllers>[number] | null)[] = [];
let queued: PlayerCommands[] = [];

const tickOnce = (): void => {
  if (!sim || !snap) return;
  const s = sim.fullState();
  const batch: PlayerCommands[] = [];
  for (let p = 0; p < controllers.length; p++) {
    const ctrl = controllers[p];
    if (ctrl) batch.push({ player: p, cmds: ctrl(s, p) });
  }
  for (const pc of queued) batch.push(pc); // human/main-thread commands
  queued = [];
  sim.step(batch);
  publish(snap, sim.fullState());
};

self.onmessage = (ev: MessageEvent<Msg>) => {
  const msg = ev.data;
  if (msg.type === 'cmds') {
    queued.push(...msg.batch);
    return;
  }
  if (msg.type === 'init') {
    const players = msg.perTeam * 2;
    const map = generateMap(msg.perTeam, msg.seed);
    sim = new Sim({ map, players, seed: msg.seed, vision: false });
    snap = new SharedSnapshot(msg.sab, players);
    // Every player is bot-driven in the worker demo; real integration leaves the
    // human slot null and feeds it via 'cmds'.
    controllers = createBotControllers(players);
    publish(snap, sim.fullState()); // tick 0 visible immediately
    (self as unknown as Worker).postMessage({ type: 'ready', tick: sim.tick });

    // Real-time loop in small macrotask batches so wall-clock advances and the
    // main thread observes concurrent progress (rather than one synchronous burst).
    const target = msg.ticks;
    const stepInterval = 1000 / FPS;
    const loop = (): void => {
      if (!sim) return;
      const start = performance.now();
      // Catch up at most a few ticks per macrotask, but always yield.
      let did = 0;
      while (sim.tick < target && did < 4 && performance.now() - start < stepInterval) {
        tickOnce();
        did++;
      }
      if (sim.tick % FPS === 0) (self as unknown as Worker).postMessage({ type: 'progress', tick: sim.tick });
      if (sim.tick < target) setTimeout(loop, 0);
      else (self as unknown as Worker).postMessage({ type: 'done', tick: sim.tick, hash: sim.hash() });
    };
    setTimeout(loop, 0);
  }
};
