import {
  Sim,
  eid,
  setTechLevel,
  sliceMap,
  slotOf,
  spawnUnit,
  type Faction,
  type MapDef,
  type State,
} from '../src/index.ts';

export type SimScenarioOptions = {
  factions?: Faction[];
  map?: MapDef;
  players?: number;
  record?: boolean;
  seed: number;
  vision?: boolean;
};

export type SimScenario = {
  readonly sim: Sim;
  readonly state: State;
  entity(kind: number, owner: number): number;
  grant(player: number, tech: number, level?: number): void;
  pos(id: number): { x: number; y: number };
  resources(player: number, minerals: number, gas?: number): void;
  spawn(kind: number, owner: number, x: number, y: number): number;
};

export const simScenario = ({
  factions,
  map = sliceMap(),
  players = 2,
  record,
  seed,
  vision,
}: SimScenarioOptions): SimScenario => {
  const sim = new Sim({
    map,
    players,
    seed,
    ...(factions ? { factions } : {}),
    ...(record !== undefined ? { record } : {}),
    ...(vision !== undefined ? { vision } : {}),
  });
  const state = sim.fullState();

  return {
    sim,
    state,
    entity(kind: number, owner: number): number {
      const e = state.e;
      for (let i = 0; i < e.hi; i++) {
        if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return eid(e, i);
      }
      throw new Error(`missing entity kind=${kind} owner=${owner}`);
    },
    grant(player: number, tech: number, level = 1): void {
      setTechLevel(state, player, tech, level);
    },
    pos(id: number): { x: number; y: number } {
      const slot = slotOf(id);
      return { x: state.e.x[slot]!, y: state.e.y[slot]! };
    },
    resources(player: number, minerals: number, gas = 0): void {
      state.players.minerals[player] = minerals;
      state.players.gas[player] = gas;
    },
    spawn(kind: number, owner: number, x: number, y: number): number {
      return spawnUnit(state, kind, owner, x, y);
    },
  };
};
