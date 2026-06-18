import assert from 'node:assert/strict';
import { createBot } from '../src/bot.ts';
import {
  Sim,
  eid,
  setTechLevel,
  sliceMap,
  slotOf,
  spawnUnit,
  type Faction,
  type State,
} from '@rts/sim';

export type BotCommands = ReturnType<ReturnType<typeof createBot>>;

type BotScenarioOptions = {
  factions?: Faction[];
  players?: number;
  seed: number;
};

type BotOptions = Parameters<typeof createBot>[1];

export type BotScenario = {
  readonly sim: Sim;
  readonly state: State;
  entity(kind: number, owner: number): number;
  grant(player: number, tech: number): void;
  pos(id: number): { x: number; y: number };
  resources(player: number, minerals: number, gas?: number): void;
  run(faction: Faction, player?: number, options?: BotOptions): BotCommands;
  spawn(kind: number, owner: number, x: number, y: number): number;
};

export const botScenario = ({ factions, players = 2, seed }: BotScenarioOptions): BotScenario => {
  const sim = new Sim({ map: sliceMap(), players, seed, ...(factions ? { factions } : {}) });
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
    grant(player: number, tech: number): void {
      setTechLevel(state, player, tech, 1);
    },
    pos(id: number): { x: number; y: number } {
      const slot = slotOf(id);
      return { x: state.e.x[slot]!, y: state.e.y[slot]! };
    },
    resources(player: number, minerals: number, gas = 0): void {
      state.players.minerals[player] = minerals;
      state.players.gas[player] = gas;
    },
    run(faction: Faction, player = 0, options?: BotOptions): BotCommands {
      return createBot(faction, options)(state, player);
    },
    spawn(kind: number, owner: number, x: number, y: number): number {
      return spawnUnit(state, kind, owner, x, y);
    },
  };
};

export const expectBotCasts = (cmds: BotCommands, unit: number, ability: number): void => {
  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === unit && c.ability === ability));
};

export const expectCommandType = (cmds: BotCommands, type: BotCommands[number]['t']): void => {
  assert.ok(cmds.some((c) => c.t === type));
};
