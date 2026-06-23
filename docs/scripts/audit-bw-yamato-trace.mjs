import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const SCHEMA = 'rts.bwapi.yamato-timing.v1';
const REQUIRED_EVENTS = ['scenario-start', 'command-issued', 'energy-spent', 'scenario-end'];
const REQUIRED_SCENARIOS = [
  'baseline',
  'stop_after_energy_spent',
  'move_after_energy_spent',
  'caster_killed_after_energy_spent',
  'target_killed_after_energy_spent',
];
const rawArgs = process.argv.slice(2);
const requireComplete = rawArgs.includes('--require-complete');
const args = rawArgs.filter((arg) => !arg.startsWith('--'));

if (args.length === 0) {
  console.error('Usage: node docs/scripts/audit-bw-yamato-trace.mjs [--require-complete] <trace.jsonl> [...]');
  process.exit(1);
}

let failed = false;

const readEvents = (path) => {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${error.message}`);
    }
  });
};

const groupByScenario = (events) => {
  const scenarios = new Map();
  for (const event of events) {
    if (event.schema !== SCHEMA) throw new Error(`event has schema ${event.schema ?? '(missing)'}, expected ${SCHEMA}`);
    if (typeof event.scenario !== 'string' || event.scenario.length === 0) throw new Error('event missing scenario');
    if (!Number.isInteger(event.frame) || event.frame < 0) throw new Error(`event ${event.event ?? '(missing)'} has invalid frame`);
    if (typeof event.event !== 'string' || event.event.length === 0) throw new Error('event missing event name');
    if (!scenarios.has(event.scenario)) scenarios.set(event.scenario, []);
    scenarios.get(event.scenario).push(event);
  }
  for (const scenario of scenarios.keys()) {
    if (!REQUIRED_SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
  }
  if (requireComplete) {
    const missing = REQUIRED_SCENARIOS.filter((scenario) => !scenarios.has(scenario));
    if (missing.length) throw new Error(`missing required scenario(s): ${missing.join(', ')}`);
  }
  return scenarios;
};

const summarizeScenario = (scenario, events) => {
  const byEvent = new Map(events.map((event) => [event.event, event]));
  for (const name of REQUIRED_EVENTS) {
    if (!byEvent.has(name)) throw new Error(`${scenario}: missing required event ${name}`);
  }
  const issued = byEvent.get('command-issued');
  const energy = byEvent.get('energy-spent');
  const damaged = byEvent.get('target-damaged');
  const end = byEvent.get('scenario-end');
  if (issued.commandAccepted !== true) throw new Error(`${scenario}: command-issued did not record commandAccepted=true`);
  if (energy.frame < issued.frame) throw new Error(`${scenario}: energy-spent occurs before command-issued`);
  if (damaged && damaged.frame < issued.frame) throw new Error(`${scenario}: target-damaged occurs before command-issued`);
  if (end.frame < issued.frame) throw new Error(`${scenario}: scenario-end occurs before command-issued`);

  return {
    scenario,
    commandIssuedFrame: issued.frame,
    energySpentFrame: energy.frame,
    targetDamagedFrame: damaged?.frame ?? null,
    energySpendDelay: energy.frame - issued.frame,
    damageDelay: damaged ? damaged.frame - issued.frame : null,
    damageResolved: Boolean(damaged),
  };
};

for (const path of args) {
  try {
    if (!existsSync(path)) throw new Error(`${path}: file not found`);
    const events = readEvents(path);
    if (events.length === 0) throw new Error(`${path}: no events`);
    const scenarios = groupByScenario(events);
    const summaries = [...scenarios].map(([scenario, scenarioEvents]) => summarizeScenario(scenario, scenarioEvents));
    console.log(`${basename(path)}: ${events.length} events, ${summaries.length} scenario(s)`);
    for (const summary of summaries) {
      console.log(`- ${summary.scenario}: energy +${summary.energySpendDelay}f, damage ${summary.damageResolved ? `+${summary.damageDelay}f` : 'not resolved'}`);
    }
  } catch (error) {
    failed = true;
    console.error(error.message);
  }
}

if (failed) process.exit(1);