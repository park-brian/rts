// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import { NONE, type Command, type Controller, type Faction, type State } from '@rts/sim';
import { executePressureIntent, proposePressureIntent } from './macro-offense.ts';
import { findSpot } from './macro-placement.ts';
import { combatReserve } from './macro-reserve.ts';
import { scheduleBotMacro } from './macro-scheduler.ts';
import { executeTacticalDefense, proposeTacticalDefense } from './macro-tactics.ts';
import { createBotMemory, type BotMemory } from './macro-memory.ts';
import { collectBotFacts } from './macro.ts';

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
    const defenseProposal = proposeTacticalDefense(s, facts, memory);
    const { incident, reserve } = executeTacticalDefense(
      s,
      p,
      cmds,
      facts,
      memory,
      defenseProposal,
      macro.retaskableArmy,
      macro.casters,
      macro.builderUsed ? macro.builder : NONE,
    );
    const pressureReserve = combatReserve(
      reserve.units,
      incident ? reserve.commitmentForce : macro.army,
      reserve.defenseActive,
    );

    // 6) Offense: propose pressure intent first, then let execution spend the remaining batch budget.
    const pressureProposal = proposePressureIntent(
      s,
      p,
      faction,
      facts,
      memory,
      depot,
      pressureReserve,
      {
        attackThreshold: c.attackThreshold,
        strategicOnly: incident !== undefined,
      },
    );
    executePressureIntent(
      s,
      p,
      cmds,
      memory,
      pressureProposal,
      macro.casters,
      macro.budget,
      macro.builder,
      findSpot,
      {
        strategicOnly: incident !== undefined,
        builderUsed: macro.builderUsed,
      },
    );

    return cmds;
  };
};
