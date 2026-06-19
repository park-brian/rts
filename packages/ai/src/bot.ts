// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import { NONE, type Command, type Controller, type Faction, type State } from '@rts/sim';
import { schedulePressureOffense } from './macro-offense.ts';
import { findSpot } from './macro-placement.ts';
import { scheduleBotMacro } from './macro-scheduler.ts';
import { scheduleTacticalDefense } from './macro-tactics.ts';
import {
  collectBotFacts,
  createBotMemory,
  type BotMemory,
} from './macro.ts';

export type BotConfig = {
  workerTarget?: number; // omit to auto-derive from the base's mineral-patch count
  barracksTarget: number;
  attackThreshold: number; // army size that triggers an attack wave
};

const DEFAULT: Omit<BotConfig, 'workerTarget'> = { barracksTarget: 3, attackThreshold: 12 };

export const createBot = (faction: Faction, cfg: Partial<BotConfig> = {}): Controller => {
  const c = { ...DEFAULT, ...cfg };
  const memories = new Map<number, BotMemory>();
  const memoryFor = (player: number): BotMemory => {
    let memory = memories.get(player);
    if (!memory) {
      memory = createBotMemory();
      memories.set(player, memory);
    }
    return memory;
  };
  const prepareMemory = (player: number, tick: number): BotMemory => {
    let memory = memoryFor(player);
    if (tick < memory.lastTick) {
      memory = createBotMemory();
      memories.set(player, memory);
    }
    memory.lastTick = tick;
    return memory;
  };

  return (s: State, p: number): Command[] => {
    const cmds: Command[] = [];

    const facts = collectBotFacts(s, p, faction, { risk: 'none' });
    const depot = facts.primaryBase;
    if (depot === NONE) return cmds; // no base: nothing to do

    const macro = scheduleBotMacro(s, p, faction, cmds, facts, c);

    // 5) Defense: tactical incidents protect every owned base, not only the initial depot.
    const memory = prepareMemory(p, s.tick);
    const { incident, attackCandidates } = scheduleTacticalDefense(
      s,
      p,
      cmds,
      facts,
      memory,
      macro.retaskableArmy,
      macro.casters,
      macro.builderUsed ? macro.builder : NONE,
    );

    // 6) Offense: pressure the enemy's most valuable exposed region.
    schedulePressureOffense(
      s,
      p,
      faction,
      cmds,
      facts,
      memory,
      depot,
      attackCandidates,
      macro.casters,
      macro.budget,
      macro.builder,
      findSpot,
      {
        attackThreshold: c.attackThreshold,
        force: incident ? attackCandidates.length : macro.army,
        strategicOnly: incident !== undefined,
        builderUsed: macro.builderUsed,
      },
    );

    return cmds;
  };
};
