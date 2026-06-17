// A minimal scripted controller: keep producers making workers while affordable
// and supply allows. Faction-driven (race-agnostic) — the seed of the hardcoded
// economy manager from docs/specs/ai-training.md §4 and the demonstrator we'll
// behavior-clone from later. Reads god-view state for now.

import { NONE, Role, Units, eid, type Faction, type State, type Command, type Controller } from '@rts/sim';

/** Build a controller that trains workers for `faction` from idle producers. */
export const createMacroBot = (faction: Faction): Controller => {
  const worker = Units[faction.worker]!;
  return (s: State, player: number): Command[] => {
    const cmds: Command[] = [];
    const e = s.e;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || (e.flags[i]! & Role.Producer) === 0 || e.owner[i] !== player) continue;
      if (e.prodKind[i] !== 0) continue;
      if (s.players.minerals[player]! < worker.minerals) continue;
      if (s.players.supplyUsed[player]! + worker.supply > s.players.supplyMax[player]!) continue;
      cmds.push({ t: 'train', building: eid(e, i), kind: faction.worker });
    }
    return cmds;
  };
};
