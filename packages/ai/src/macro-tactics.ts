import { NONE, type Command, type State } from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { issueDefenseEngagement } from './macro-combat.ts';
import { emergencyWorkerResponders, incidentTarget } from './macro-defense.ts';
import {
  commitTacticalResponders,
  deriveTacticalIncidents,
  rememberTacticalIncidents,
  type BotFacts,
  type BotMemory,
  type TacticalIncident,
} from './macro.ts';

export type TacticalSchedule = {
  incident: TacticalIncident | undefined;
  attackCandidates: number[];
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
  const incident = rememberTacticalIncidents(memory, deriveTacticalIncidents(s, facts), s.tick)[0];
  if (!incident) return { incident, attackCandidates: [...retaskableArmy] };

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

  return {
    incident,
    attackCandidates: retaskableArmy.filter((unit) => !defenderSet.has(unit)),
  };
};
