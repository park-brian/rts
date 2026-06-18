// Reactive HUD state (Preact signals). The game loop publishes into these; the UI
// reads them. Keeps the framework out of the 60fps render path (canvas) entirely.
import { signal } from '@preact/signals';
import type { CommandRejectReason } from './sim.ts';

export type Mode = 'play' | 'spectate' | 'replay';
export type TargetMode = 'none' | 'harvest' | 'repair';
export type TargetVerb = Exclude<TargetMode, 'none'>;
export type ControlScheme = 'mobile' | 'desktop';
export type CommandOption = { id: number; ok: boolean; reason?: CommandRejectReason; label?: string; detail?: string };
export type SelectionStatus = { label: string; detail: string; progress: number; stats: string[] };
export type ArmedCommand =
  | { t: 'none' }
  | { t: 'place'; kind: number }
  | { t: 'land'; kind: number }
  | { t: 'attackMove' }
  | { t: 'rally' }
  | { t: 'ability'; ability: number }
  | { t: 'target'; mode: TargetVerb };

const initialControlScheme = (): ControlScheme => {
  try {
    return globalThis.localStorage?.getItem('rts.controlScheme') === 'desktop' ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
};

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
  setupOpen: signal(true),
  mathRenderer: signal(false),
  controlScheme: signal<ControlScheme>(initialControlScheme()),
  humanPlayer: signal(0),
  playerRaces: signal<string[]>(['terran', 'terran']),
  selCount: signal(0),
  selKindName: signal(''),
  selStatus: signal<SelectionStatus>({ label: 'No selection', detail: '', progress: 0, stats: [] }),
  controlGroupCounts: signal<number[]>(Array(10).fill(0)),
  selCanBuild: signal(false), // a worker is selected
  selCanRally: signal(false), // a structure is selected
  selBuildKinds: signal<number[]>([]),
  selAddonKinds: signal<number[]>([]),
  selTransformKinds: signal<number[]>([]),
  selTrainKinds: signal<number[]>([]),
  selAbilities: signal<number[]>([]),
  selResearchTechs: signal<number[]>([]),
  selBuildOptions: signal<CommandOption[]>([]),
  selAddonOptions: signal<CommandOption[]>([]),
  selTransformOptions: signal<CommandOption[]>([]),
  selTrainOptions: signal<CommandOption[]>([]),
  selAbilityOptions: signal<CommandOption[]>([]),
  selResearchOptions: signal<CommandOption[]>([]),
  selCanLoad: signal(false),
  selCanUnload: signal(false),
  selCanHarvest: signal(false),
  selCanRepair: signal(false),
  selCanAttackMove: signal(false),
  selCanStop: signal(false),
  selCanBurrow: signal(false),
  selCanUnburrow: signal(false),
  selCanMine: signal(false),
  selCanLift: signal(false),
  selCanLand: signal(false),
  selCanCancel: signal(false),
  armedCommand: signal<ArmedCommand>({ t: 'none' }),
};

export const clearArmedCommand = (): void => {
  ui.armedCommand.value = { t: 'none' };
};

export const isPlacementArmed = (armed: ArmedCommand): armed is Extract<ArmedCommand, { t: 'place' | 'land' }> =>
  armed.t === 'place' || armed.t === 'land';
