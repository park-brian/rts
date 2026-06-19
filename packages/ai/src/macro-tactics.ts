import { NONE, type Command, type State } from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { issueDefenseEngagement } from './macro-combat.ts';
import { emergencyWorkerResponders, incidentTarget } from './macro-defense.ts';
import {
  commitTacticalResponders,
  deriveTacticalIncidents,
  rememberTacticalIncidents,
  type TacticalIncident,
} from './macro-incidents.ts';
import type { BotFacts } from './macro.ts';
import type { BotMemory } from './macro-memory.ts';
import { combatReserve, type CombatReserve } from './macro-reserve.ts';

export type TacticalSchedule = {
  incident: TacticalIncident | undefined;
  reserve: CombatReserve;
};

export type TacticalDefenseProposal = {
  incident: TacticalIncident | undefined;
};

export const proposeTacticalDefense = (
  s: State,
  facts: BotFacts,
  memory: BotMemory,
): TacticalDefenseProposal => ({
  incident: rememberTacticalIncidents(memory, deriveTacticalIncidents(s, facts), s.tick)[0],
});

export const executeTacticalDefense = (
  s: State,
  player: number,
  cmds: Command[],
  facts: BotFacts,
  memory: BotMemory,
  proposal: TacticalDefenseProposal,
  retaskableArmy: number[],
  casters: number[],
  reservedBuilder: number,
): TacticalSchedule => {
  const { incident } = proposal;
  if (!incident) return { incident, reserve: combatReserve([...retaskableArmy]) };

  const e = s.e;
  const threat = incidentTarget(s, incident);
  const focusX = threat !== NONE ? e.x[threat]! : incident.x;
  const focusY = threat !== NONE ? e.y[threat]! : incident.y;
  if (threat !== NONE) castTacticalAbilities(s, player, cmds, casters, focusX, focusY);

  const defenders = commitTacticalResponders(s, memory, retaskableArmy, incident, threat, s.tick);
  defenders.push(...emergencyWorkerResponders(s, facts.workers, incident, defenders.length, reservedBuilder));
  const defenderSet = new Set(defenders);
  for (const unit of defenders) {
    issueDefenseEngagement(s, cmds, unit, { x: focusX, y: focusY, target: threat });
  }
  const available = retaskableArmy.filter((unit) => !defenderSet.has(unit));

  return {
    incident,
    reserve: combatReserve(available, available.length, true),
  };
};

export const scheduleTacticalDefense = (
  s: State,
  player: number,
  cmds: Command[],
  facts: BotFacts,
  memory: BotMemory,
  retaskableArmy: number[],
  casters: number[],
  reservedBuilder: number,
): TacticalSchedule => {
  const proposal = proposeTacticalDefense(s, facts, memory);
  return executeTacticalDefense(s, player, cmds, facts, memory, proposal, retaskableArmy, casters, reservedBuilder);
};
