import assert from 'node:assert/strict';
import { createBot } from '../src/bot.ts';
import {
  validateCommand,
  type Faction,
} from '@rts/sim';
import { simScenario, type SimScenario } from '../../sim/test-support/scenario.ts';

export type BotCommands = ReturnType<ReturnType<typeof createBot>>;
export type BotCommand = BotCommands[number];

type BotScenarioOptions = {
  factions?: Faction[];
  players?: number;
  seed: number;
  vision?: boolean;
};

type BotOptions = Parameters<typeof createBot>[1];

export type BotScenario = SimScenario & {
  run(faction: Faction, player?: number, options?: BotOptions): BotCommands;
};

export const botScenario = ({ factions, players = 2, seed, vision }: BotScenarioOptions): BotScenario => {
  const base = simScenario({ factions, players, seed, ...(vision !== undefined ? { vision } : {}) });

  return {
    ...base,
    run(faction: Faction, player = 0, options?: BotOptions): BotCommands {
      return createBot(faction, options)(base.state, player);
    },
  };
};

export const expectBotCasts = (cmds: BotCommands, unit: number, ability: number): void => {
  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === unit && c.ability === ability));
};

export const findBotBuild = (cmds: BotCommands, kind: number): Extract<BotCommand, { t: 'build' }> | undefined =>
  cmds.find((c): c is Extract<BotCommand, { t: 'build' }> => c.t === 'build' && c.kind === kind);

export const expectBotBuildsLegal = (
  scenario: BotScenario,
  faction: Faction,
  kind: number,
  options?: BotOptions,
  player = 0,
): Extract<BotCommand, { t: 'build' }> => {
  const build = findBotBuild(scenario.run(faction, player, options), kind);
  assert.ok(build);
  assert.deepEqual(validateCommand(scenario.state, player, build), { ok: true });
  return build;
};

export const expectCommandType = (cmds: BotCommands, type: BotCommands[number]['t']): void => {
  assert.ok(cmds.some((c) => c.t === type));
};

export const expectNoBotBuild = (
  scenario: BotScenario,
  faction: Faction,
  kind: number,
  options?: BotOptions,
  player = 0,
): void => {
  assert.equal(findBotBuild(scenario.run(faction, player, options), kind), undefined);
};
