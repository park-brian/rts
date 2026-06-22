// Reactive HUD state (Preact signals). The game loop publishes into these; the UI
// reads them. Keeps the framework out of the 60fps render path (canvas) entirely.
import { signal } from '@preact/signals';
import type { Command, CommandRejectReason } from './sim.ts';

export type Mode = 'play' | 'spectate' | 'replay';
export type TargetMode = 'none' | 'harvest' | 'repair';
export type TargetVerb = Exclude<TargetMode, 'none'>;
export type ControlScheme = 'mobile' | 'desktop';
export const OrderOptionId = {
  Rally: 1,
  Harvest: 2,
  Repair: 3,
  AttackMove: 4,
  Stop: 5,
  Burrow: 6,
  Unburrow: 7,
  Mine: 8,
  Lift: 9,
  Land: 10,
  Cancel: 11,
  Load: 12,
  Unload: 13,
  Hold: 14,
  Patrol: 15,
  Move: 16,
} as const;
export type CommandOption = {
  id: number;
  ok: boolean;
  reason?: CommandRejectReason;
  label?: string;
  detail?: string;
  commands?: Command[];
  arm?: ArmedCommand;
};
export type SelectionStatus = { label: string; detail: string; progress: number; stats: string[] };
export type SelectionSubgroup = { kind: number; name: string; count: number; active: boolean };
export type SelectionView = {
  count: number;
  kindName: string;
  status: SelectionStatus;
  subgroups: SelectionSubgroup[];
  can: {
    build: boolean;
    rally: boolean;
    load: boolean;
    unload: boolean;
    harvest: boolean;
    repair: boolean;
    move: boolean;
    attackMove: boolean;
    hold: boolean;
    patrol: boolean;
    stop: boolean;
    burrow: boolean;
    unburrow: boolean;
    mine: boolean;
    lift: boolean;
    land: boolean;
    cancel: boolean;
  };
  options: {
    build: CommandOption[];
    addon: CommandOption[];
    transform: CommandOption[];
    train: CommandOption[];
    ability: CommandOption[];
    research: CommandOption[];
    order: CommandOption[];
  };
};
export type ArmedCommand =
  | { t: 'none' }
  | { t: 'place'; kind: number }
  | { t: 'land'; kind: number }
  | { t: 'move' }
  | { t: 'attackMove' }
  | { t: 'patrol' }
  | { t: 'rally' }
  | { t: 'ability'; ability: number }
  | { t: 'target'; mode: TargetVerb };

export const EMPTY_SELECTION_STATUS: SelectionStatus = { label: 'No selection', detail: '', progress: 0, stats: [] };
export const EMPTY_SELECTION_VIEW: SelectionView = {
  count: 0,
  kindName: '',
  status: EMPTY_SELECTION_STATUS,
  subgroups: [],
  can: {
    build: false,
    rally: false,
    load: false,
    unload: false,
    harvest: false,
    repair: false,
    move: false,
    attackMove: false,
    hold: false,
    patrol: false,
    stop: false,
    burrow: false,
    unburrow: false,
    mine: false,
    lift: false,
    land: false,
    cancel: false,
  },
  options: {
    build: [],
    addon: [],
    transform: [],
    train: [],
    ability: [],
    research: [],
    order: [],
  },
};

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
  mathRenderer: signal(true),
  fullVision: signal(false),
  controlScheme: signal<ControlScheme>(initialControlScheme()),
  mobileQueueMode: signal(false),
  humanPlayer: signal(0),
  playerRaces: signal<string[]>(['terran', 'terran']),
  playerTeams: signal<number[]>([0, 1]),
  playerEnabled: signal<boolean[]>([true, true]),
  selectionView: signal<SelectionView>(EMPTY_SELECTION_VIEW),
  controlGroupCounts: signal<number[]>(Array(10).fill(0)),
  armedCommand: signal<ArmedCommand>({ t: 'none' }),
};

export const clearArmedCommand = (): void => {
  ui.armedCommand.value = { t: 'none' };
};

export const isPlacementArmed = (armed: ArmedCommand): armed is Extract<ArmedCommand, { t: 'place' | 'land' }> =>
  armed.t === 'place' || armed.t === 'land';

export const sameArmedCommand = (a: ArmedCommand, b: ArmedCommand): boolean => {
  if (a.t !== b.t) return false;
  if (a.t === 'place' && b.t === 'place') return a.kind === b.kind;
  if (a.t === 'land' && b.t === 'land') return a.kind === b.kind;
  if (a.t === 'ability' && b.t === 'ability') return a.ability === b.ability;
  if (a.t === 'target' && b.t === 'target') return a.mode === b.mode;
  return true;
};

export const shouldToggleArmedCommand = (armed: ArmedCommand, current: ArmedCommand): boolean =>
  armed.t !== 'place' && armed.t !== 'land' && sameArmedCommand(armed, current);
