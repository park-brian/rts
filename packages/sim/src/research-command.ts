import type { Command } from './commands.ts';
import { Role, TECH_CAP, TechDefs } from './data.ts';
import { requirementsMet } from './requirements.ts';
import { getTechLevel, isTechInProgress, nextTechLevel, techGas, techMinerals } from './tech.ts';
import type { State } from './entity/world.ts';
import {
  canPay,
  canUseProducer,
  hasActiveResearch,
  reject,
  type CommandValidation,
} from './command-validation.ts';

type ResearchCommand = Extract<Command, { t: 'research' }>;

const validTechId = (tech: number): boolean => Number.isInteger(tech) && tech > 0 && tech < TECH_CAP;

export const validateResearchCommand = (s: State, player: number, command: ResearchCommand): CommandValidation => {
  const e = s.e;
  const producer = canUseProducer(s, player, command.building, {
    role: Role.Structure,
    requireBuilt: true,
    rejectLifted: true,
    requireActiveAddon: true,
    requirePowered: true,
  });
  if (!producer.ok) return producer;
  const { slot } = producer;
  if (hasActiveResearch(s, slot)) return reject('queue-full');
  if (!validTechId(command.tech)) return reject('target-not-allowed');
  const def = TechDefs[command.tech];
  if (!def || !def.producers.includes(e.kind[slot]!)) return reject('target-not-allowed');
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  if (isTechInProgress(s, player, command.tech) || getTechLevel(s, player, command.tech) >= def.maxLevel) {
    return reject('target-not-allowed');
  }
  const level = nextTechLevel(s, player, command.tech);
  const payment = canPay(s, player, { minerals: techMinerals(def, level), gas: techGas(def, level) });
  if (!payment.ok) return payment;
  return { ok: true };
};
