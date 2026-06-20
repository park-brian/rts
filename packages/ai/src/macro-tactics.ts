import { NONE, type Command, type State } from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { issueDefenseEngagement } from './macro-combat.ts';
import { emergencyWorkerResponders, incidentTarget } from './macro-defense.ts';
import {
  commitTacticalResponders,
  deriveTacticalIncidents,
  rememberedBlockedSiteIncidents,
  rememberTacticalIncidents,
  type TacticalIncident,
} from './macro-incidents.ts';
import type { BotIntent, BotIntentResult } from './macro-intents.ts';
import type { BotFacts } from './macro.ts';
import type { BotMemory } from './macro-memory.ts';
import { combatReserve, type CombatReserve } from './macro-reserve.ts';

export type TacticalSchedule = {
  incident: TacticalIncident | undefined;
  intent: BotIntent | null;
  reserve: CombatReserve;
};

export type TacticalDefenseProposal = {
  incident: TacticalIncident | undefined;
  intent: BotIntent | null;
};

const tacticalIntentKind = (incident: TacticalIncident): BotIntent['kind'] => {
  switch (incident.kind) {
    case 'invisible-damage': return 'get-detection';
    case 'expansion-blocked':
    case 'route-trap':
      return 'clear-site';
    default:
      return 'defend-base';
  }
};

const tacticalIntent = (incident: TacticalIncident): BotIntent => ({
  kind: tacticalIntentKind(incident),
  urgency: Math.min(100, 70 + Math.trunc(incident.severity / 50)),
  targetSlot: incident.enemies?.[0],
  x: incident.x,
  y: incident.y,
  expiresAt: incident.expiresAt,
});

export const tacticalIntentResult = (intent: BotIntent, issued: boolean): BotIntentResult => {
  if (issued) return { status: 'done' };
  return {
    status: 'waiting',
    reason: intent.kind === 'get-detection' ? 'missing-detection' : 'insufficient-force',
  };
};

export const proposeTacticalDefense = (
  s: State,
  facts: BotFacts,
  memory: BotMemory,
): TacticalDefenseProposal => {
  const incident = rememberTacticalIncidents(memory, [
    ...deriveTacticalIncidents(s, facts),
    ...rememberedBlockedSiteIncidents(memory, s.tick),
  ], s.tick)[0];
  return { incident, intent: incident ? tacticalIntent(incident) : null };
};

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
  const { incident, intent } = proposal;
  if (!incident) return { incident, intent: null, reserve: combatReserve([...retaskableArmy]) };

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
    intent,
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
