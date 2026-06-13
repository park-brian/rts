// Reactive HUD state (Preact signals). The game loop publishes into these; the UI
// reads them. Keeps the framework out of the 60fps render path (canvas) entirely.
import { signal } from '@preact/signals';

export type Mode = 'play' | 'spectate' | 'replay';

export const ui = {
  minerals: signal(0),
  gas: signal(0),
  supplyUsed: signal(0),
  supplyMax: signal(0),
  seconds: signal(0),
  mode: signal<Mode>('play'),
  perTeam: signal(1),
  over: signal(false),
  winner: signal(-1),
  // replay viewer
  replayTick: signal(0),
  replayTotal: signal(0),
  replaySpeed: signal(1),
  paused: signal(false),
  hasReplay: signal(false), // a finished game is available to watch
  selCount: signal(0),
  selKindName: signal(''),
  selCanBuild: signal(false), // a worker is selected
  selProducer: signal(0), // producer kind if a producer is selected (else 0)
  placement: signal(0), // build-placement kind in progress (0 = none)
  amove: signal(false), // attack-move targeting armed
  rally: signal(false), // set-rally-point targeting armed
};
