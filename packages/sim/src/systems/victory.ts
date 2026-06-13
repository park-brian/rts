// Victory: a team is eliminated when it has no structures left. The game is over
// when at most one team remains; the survivor (if any) is the winner.

import type { State } from '../world.ts';
import { Role } from '../data.ts';

export const victory = (s: State): void => {
  if (s.result.over) return;
  const e = s.e;
  const n = s.teams.length;
  const alive = new Uint8Array(n);
  let aliveTeams = 0;
  let last = -1;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || (e.flags[i]! & Role.Structure) === 0) continue;
    const owner = e.owner[i]!;
    if (owner >= n) continue;
    const team = s.teams[owner]!;
    if (alive[team] === 0) {
      alive[team] = 1;
      aliveTeams++;
      last = team;
    }
  }

  if (s.startTeams >= 2 && aliveTeams <= 1) {
    s.result.over = true;
    s.result.winner = aliveTeams === 1 ? last : -1;
  }
};
