import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Role, TECH_CAP, TechDefs } from './data.ts';
import { isActiveAddon } from './addon.ts';
import { isPowered } from './power.ts';
import { requirementsMet } from './requirements.ts';
import { getTechLevel, isTechInProgress, nextTechLevel, techGas, techMinerals } from './tech.ts';
import { isLiftedStructureFlags } from './terran-mobility.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type ResearchCommand = Extract<Command, { t: 'research' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

const validTechId = (tech: number): boolean => Number.isInteger(tech) && tech > 0 && tech < TECH_CAP;

export const validateResearchCommand = (s: State, player: number, command: ResearchCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if ((e.flags[slot]! & Role.Structure) === 0) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('incomplete-producer');
  if (isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
  if (!isActiveAddon(s, slot)) return reject('missing-capability');
  if (!isPowered(s, slot)) return reject('missing-capability');
  if (e.researchKind[slot] !== Kind.None) return reject('queue-full');
  if (!validTechId(command.tech)) return reject('target-not-allowed');
  const def = TechDefs[command.tech];
  if (!def || !def.producers.includes(e.kind[slot]!)) return reject('target-not-allowed');
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  if (isTechInProgress(s, player, command.tech) || getTechLevel(s, player, command.tech) >= def.maxLevel) {
    return reject('target-not-allowed');
  }
  const level = nextTechLevel(s, player, command.tech);
  if (s.players.minerals[player]! < techMinerals(def, level) || s.players.gas[player]! < techGas(def, level)) {
    return reject('not-affordable');
  }
  return { ok: true };
};
