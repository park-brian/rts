import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_CLOAK_ABILITIES,
  BOT_INTENT_KINDS,
  INTENT_OUTCOME_MEMORY_TICKS,
  PRESSURE_COMMITMENT_TICKS,
  TACTICAL_ABILITY_POLICIES,
  collectBotFacts,
  combatReserve,
  commitTacticalResponders,
  createBot,
  createBotPlanner,
  createBotMemory,
  deriveTacticalIncidents,
  executePressureIntent,
  executeTacticalDefense,
  macroIntentsFromCommands,
  missingStructureKinds,
  rememberIntentOutcomes,
  pressureCommitmentDecision,
  pressureFocus,
  pressureCommitmentTicks,
  proposePressureIntent,
  proposeTacticalDefense,
  rankedTacticalResponders,
  schedulePressureOffense,
  scheduleBotMacro,
  selectTacticalResponders,
  shouldCommitPressure,
  TACTICAL_COMMITMENT_TICKS,
  TACTICAL_INCIDENT_MEMORY_TICKS,
  tacticalIntentResult,
  tacticalResponseBudget,
} from '../src/index.ts';
import {
  botScenario,
  expectBotBuildsLegal,
  expectBotCasts,
  expectCommandType,
  expectNoBotBuild,
  type BotScenario,
} from '../test-support/bot-scenario.ts';
import { createAggressiveMarineBot } from '../test-support/aggressive-bot.ts';
import {
  Sim, sliceMap, spawnUnit, Abilities, Ability, Kind, MAX_QUEUE, Tech, TechDefs, Terran, Protoss, Zerg, Units, Order, attackModeCandidates,
  generateMap,
  Role, TILE, ONE, addonParentKind, addonPosition, cloneState, commandHeadAllowed, commandHeadMask, eid, encodeCommand, entityTargetMask, fx, setTechLevel, NONE, slotOf, tileX,
  tileY, liftStructure, validateCommand, withinRangeSq, type Command, type State,
} from '@rts/sim';

type BotCommand = ReturnType<ReturnType<typeof createBot>>[number];

const commandTypes = (cmds: ReturnType<ReturnType<typeof createBot>>): string[] => cmds.map((c) => c.t);
const findBuild = (cmds: ReturnType<ReturnType<typeof createBot>>, kind: number): Extract<BotCommand, { t: 'build' }> | undefined =>
  cmds.find((c): c is Extract<BotCommand, { t: 'build' }> => c.t === 'build' && c.kind === kind);
const hasBuild = (cmds: ReturnType<ReturnType<typeof createBot>>, kind: number): boolean =>
  findBuild(cmds, kind) !== undefined;
const findCommandBuild = (cmds: Command[], kind: number): Extract<Command, { t: 'build' }> | undefined =>
  cmds.find((c): c is Extract<Command, { t: 'build' }> => c.t === 'build' && c.kind === kind);
const findResearch = (cmds: ReturnType<ReturnType<typeof createBot>>, tech: number): Extract<BotCommand, { t: 'research' }> | undefined =>
  cmds.find((c): c is Extract<BotCommand, { t: 'research' }> => c.t === 'research' && c.tech === tech);
const hasResearch = (cmds: ReturnType<ReturnType<typeof createBot>>, tech: number): boolean =>
  findResearch(cmds, tech) !== undefined;
const findTransform = (cmds: ReturnType<ReturnType<typeof createBot>>, kind: number): Extract<BotCommand, { t: 'transform' }> | undefined =>
  cmds.find((c): c is Extract<BotCommand, { t: 'transform' }> => c.t === 'transform' && c.kind === kind);
const hasTransform = (cmds: ReturnType<ReturnType<typeof createBot>>, kind: number): boolean =>
  findTransform(cmds, kind) !== undefined;

const countAlive = (s: State, player: number, kind: number): number => {
  let count = 0;
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.owner[i] === player && s.e.kind[i] === kind) count++;
  }
  return count;
};

const entityPos = (sim: Sim, id: number): { x: number; y: number } => {
  const e = sim.fullState().e;
  const slot = slotOf(id);
  return { x: e.x[slot]!, y: e.y[slot]! };
};

const findEntity = (sim: Sim, kind: number, owner: number): number => {
  const e = sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return eid(e, i);
  }
  throw new Error(`missing entity kind=${kind} owner=${owner}`);
};

const hasAbility = (cmds: ReturnType<ReturnType<typeof createBot>>, unit: number, ability: number): boolean =>
  cmds.some((c) => c.t === 'ability' && c.unit === unit && c.ability === ability);

const assertPublicSurfaceExposes = (s: State, player: number, command: Command): void => {
  assert.deepEqual(validateCommand(s, player, command), { ok: true });
  const action = encodeCommand(command);
  assert.equal(commandHeadAllowed(commandHeadMask(s, player, action.actor, action), action.head), true);
  switch (command.t) {
    case 'attack':
      assert.equal(entityTargetMask(s, player, command.unit, 'attack', [command.target])[0], 1);
      break;
    case 'move':
      if (command.target !== undefined) {
        assert.equal(entityTargetMask(s, player, command.unit, 'move', [command.target], command)[0], 1);
      }
      break;
    case 'harvest':
      assert.equal(entityTargetMask(s, player, command.unit, 'harvest', [command.patch])[0], 1);
      break;
    case 'repair':
      assert.equal(entityTargetMask(s, player, command.unit, 'repair', [command.target])[0], 1);
      break;
    case 'rally':
      if (command.target !== undefined) {
        assert.equal(entityTargetMask(s, player, command.building, 'rally', [command.target], command)[0], 1);
      }
      break;
    case 'load':
      assert.equal(entityTargetMask(s, player, command.transport, 'load', [command.unit])[0], 1);
      break;
    case 'unload':
      assert.equal(entityTargetMask(s, player, command.transport, 'unload', [command.unit], command)[0], 1);
      break;
    case 'ability':
      if (command.target !== undefined) {
        assert.equal(entityTargetMask(s, player, command.unit, 'ability', [command.target], command)[0], 1);
      }
      break;
    case 'transform':
      if (command.target !== undefined) {
        assert.equal(entityTargetMask(s, player, command.unit, 'transform', [command.target], command)[0], 1);
      }
      break;
  }
};

const grant = (sim: Sim, player: number, tech: number): void => setTechLevel(sim.fullState(), player, tech, 1);
const completeTech = (sim: Sim, player: number, tech: number): void =>
  setTechLevel(sim.fullState(), player, tech, TechDefs[tech]!.maxLevel);
const blockAddonPlacement = (s: State, parent: number, addonKind: number): void => {
  const pos = addonPosition(s, slotOf(parent), addonKind);
  spawnUnit(s, Kind.SupplyDepot, 0, pos.x, pos.y);
};

const seedTerranMarineCore = (scenario: BotScenario, player: number): void => {
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, player));
  const yDir = player === 0 ? 1 : -1;
  scenario.resources(player, 3_000, 0);
  scenario.spawn(Kind.Barracks, player, base.x + fx(160), base.y + fx(96 * yDir));
  for (let i = 0; i < 6; i++) {
    scenario.spawn(Kind.SupplyDepot, player, base.x + fx(-180 + i * 48), base.y + fx(120 * yDir));
  }
};

test('aggressive marine bot builds depots and up to four barracks', () => {
  const bot = createAggressiveMarineBot();
  const barracksScenario = botScenario({ seed: 832, factions: [Terran, Terran] });
  barracksScenario.resources(1, 1_000, 0);
  const barracksCmds = bot(barracksScenario.state, 1);
  const barracks = findCommandBuild(barracksCmds, Kind.Barracks);
  assert.ok(barracks);
  assert.deepEqual(validateCommand(barracksScenario.state, 1, barracks), { ok: true });

  const depotScenario = botScenario({ seed: 833, factions: [Terran, Terran] });
  depotScenario.resources(1, 1_000, 0);
  depotScenario.state.players.supplyUsed[1] = depotScenario.state.players.supplyMax[1]! - 1;
  const depotCmds = bot(depotScenario.state, 1);
  const firstBuild = depotCmds.find((c): c is Extract<Command, { t: 'build' }> => c.t === 'build');
  assert.equal(firstBuild?.kind, Kind.SupplyDepot);
  assert.deepEqual(validateCommand(depotScenario.state, 1, firstBuild!), { ok: true });
});

test('bot tactical ability policy descriptors match sim ability target modes', () => {
  const expectedTactical = [
    Ability.ShieldRecharge,
    Ability.Restoration,
    Ability.Heal,
    Ability.ScannerSweep,
    Ability.Hallucination,
    Ability.Recall,
    Ability.MindControl,
    Ability.YamatoGun,
    Ability.NuclearStrike,
    Ability.InfestCommandCenter,
    Ability.SpawnBroodling,
    Ability.Parasite,
    Ability.Feedback,
    Ability.OpticalFlare,
    Ability.Lockdown,
    Ability.Irradiate,
    Ability.EMPShockwave,
    Ability.PsionicStorm,
    Ability.Plague,
    Ability.Ensnare,
    Ability.Maelstrom,
    Ability.StasisField,
    Ability.DisruptionWeb,
    Ability.DefensiveMatrix,
    Ability.DarkSwarm,
    Ability.Consume,
  ].sort((a, b) => a - b);

  const actualTactical = TACTICAL_ABILITY_POLICIES.map((policy) => {
    const ability = Abilities[policy.ability]!;
    assert.ok(ability, `missing ability ${policy.ability}`);
    assert.equal(policy.minScore >= 0, true, `${ability.name} policy must use a nonnegative threshold`);
    assert.equal(ability.target, 'scorePoint' in policy ? 'point' : 'entity', `${ability.name} policy target shape`);
    return policy.ability;
  }).sort((a, b) => a - b);
  assert.deepEqual(actualTactical, expectedTactical);

  assert.deepEqual(ACTIVE_CLOAK_ABILITIES, [Ability.PersonnelCloaking, Ability.CloakingField]);
  for (const abilityId of ACTIVE_CLOAK_ABILITIES) {
    const ability = Abilities[abilityId]!;
    assert.equal(ability.target, 'self');
    assert.deepEqual(ability.execution, { mode: 'self-toggle', flag: 'cloakActive' });
  }
});

test('bot intent vocabulary covers proactive and reflex directors', () => {
  const kinds = new Set(BOT_INTENT_KINDS);

  for (const kind of [
    'defend-base',
    'get-detection',
    'clear-site',
    'evacuate-workers',
    'train-worker',
    'scout',
    'attack-wave',
    'harass',
    'contain',
    'counterattack',
    'retreat',
  ] as const) {
    assert.equal(kinds.has(kind), true, `missing bot intent kind ${kind}`);
  }
});

test('macro command intent mapping keeps scheduler vocabulary explicit', () => {
  const intents = macroIntentsFromCommands([
    { t: 'build', unit: 1, kind: Kind.CommandCenter, x: fx(100), y: fx(100) },
    { t: 'build', unit: 1, kind: Kind.Barracks, x: fx(120), y: fx(100) },
    { t: 'research', building: 2, tech: Tech.StimPack },
    { t: 'train', building: 3, kind: Kind.SCV },
    { t: 'train', building: 3, kind: Kind.Marine },
    { t: 'rally', building: 3, x: fx(140), y: fx(100) },
  ], Terran);

  assert.deepEqual(intents.map((intent) => intent.kind), [
    'expand',
    'add-production',
    'research-upgrade',
    'train-worker',
    'train-counter',
  ]);
  assert.equal(intents[0]?.targetKind, Kind.CommandCenter);
  assert.equal(intents[1]?.targetKind, Kind.Barracks);
  assert.equal(intents[2]?.targetTech, Tech.StimPack);
  assert.equal(intents[3]?.targetKind, Kind.SCV);
  assert.equal(intents[4]?.targetKind, Kind.Marine);
});

test('macro scheduler returns intents for live macro commands', () => {
  const scenario = botScenario({ seed: 830 });
  const cmds: Command[] = [];
  scenario.resources(0, 1_000, 0);

  const result = scheduleBotMacro(
    scenario.state,
    0,
    Terran,
    cmds,
    collectBotFacts(scenario.state, 0, Terran),
    { workerTarget: 0, barracksTarget: 1 },
  );

  const build = findBuild(cmds, Kind.Barracks);
  assert.ok(build);
  assert.ok(result.intents.some((intent) =>
    intent.kind === 'add-production' && intent.targetKind === Kind.Barracks && intent.x === build.x && intent.y === build.y));
});

const linkAddon = (s: State, parent: number, addon: number): void => {
  const e = s.e;
  e.target[slotOf(parent)] = addon;
  e.target[slotOf(addon)] = parent;
};

const blockBuildTilesAround = (sim: Sim, x: number, y: number, radius: number): void => {
  const map = sim.fullState().map;
  const cx = tileX(x);
  const cy = tileY(y);
  for (let ty = Math.max(0, cy - radius); ty <= Math.min(map.h - 1, cy + radius); ty++) {
    for (let tx = Math.max(0, cx - radius); tx <= Math.min(map.w - 1, cx + radius); tx++) {
      map.build[ty * map.w + tx] = 0;
    }
  }
};

const zergBuildOptions = { barracksTarget: 1, workerTarget: 0 };

const zergBuildScenario = (
  seed: number,
  setup: (scenario: BotScenario, base: { x: number; y: number }, hatchery: number) => void = () => {},
): { base: { x: number; y: number }; hatchery: number; scenario: BotScenario } => {
  const scenario = botScenario({ seed, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  setup(scenario, base, hatchery);
  scenario.resources(0, 1_000, 1_000);
  return { base, hatchery, scenario };
};

const makeLair = (scenario: BotScenario, hatchery: number): void => {
  scenario.state.e.kind[slotOf(hatchery)] = Kind.Lair;
};

const makeHive = (scenario: BotScenario, hatchery: number): void => {
  scenario.state.e.kind[slotOf(hatchery)] = Kind.Hive;
};

const ZERG_POOL_DEN = [Kind.SpawningPool, Kind.HydraliskDen] as const;
const ZERG_GROUND_TECH = [...ZERG_POOL_DEN, Kind.EvolutionChamber] as const;
const ZERG_SPIRE_TECH = [...ZERG_GROUND_TECH, Kind.Spire] as const;
const ZERG_LAIR_TECH = [...ZERG_SPIRE_TECH, Kind.QueensNest] as const;
const ZERG_HIVE_TECH = [...ZERG_LAIR_TECH, Kind.DefilerMound] as const;

const spawnZergTechChain = (scenario: BotScenario, base: { x: number; y: number }, kinds: readonly number[]): void => {
  kinds.forEach((kind, i) => scenario.spawn(kind, 0, base.x + fx(120 + i * 40), base.y));
};

const zergMacroHatcheryScenario = (seed: number): BotScenario => {
  const scenario = botScenario({ seed, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  makeHive(scenario, hatchery);
  spawnZergTechChain(scenario, base, [
    Kind.SpawningPool,
    Kind.HydraliskDen,
    Kind.EvolutionChamber,
    Kind.Spire,
    Kind.QueensNest,
    Kind.NydusCanal,
    Kind.DefilerMound,
    Kind.UltraliskCavern,
  ]);
  scenario.resources(0, 1_200, 1_000);
  return scenario;
};

const riskIndex = (risk: ReturnType<typeof collectBotFacts>['risk'], x: number, y: number): number =>
  tileY(y) * risk.w + tileX(x);
const protectedRegion = (facts: ReturnType<typeof collectBotFacts>, kind: 'base' | 'mineral-line') => {
  const region = facts.protectedRegions.find((r) => r.kind === kind);
  assert.ok(region);
  return region;
};
const enemyProtectedRegion = (facts: ReturnType<typeof collectBotFacts>, kind: 'base' | 'mineral-line') => {
  const region = facts.enemyProtectedRegions.find((r) => r.kind === kind);
  assert.ok(region);
  return region;
};
const enemyOffensiveRegion = (facts: ReturnType<typeof collectBotFacts>, origin: { x: number; y: number }) => {
  let best = facts.enemyProtectedRegions[0];
  let bestDistance = best ? (best.x - origin.x) ** 2 + (best.y - origin.y) ** 2 : Infinity;
  for (const region of facts.enemyProtectedRegions) {
    const distance = (region.x - origin.x) ** 2 + (region.y - origin.y) ** 2;
    if (best && region.value < best.value) continue;
    if (best && region.value === best.value && distance >= bestDistance) continue;
    best = region;
    bestDistance = distance;
  }
  assert.ok(best);
  return best;
};
const baseOnlyThreatPoint = (facts: ReturnType<typeof collectBotFacts>, base: { x: number; y: number }, distance = 160) => {
  const mineralLine = protectedRegion(facts, 'mineral-line');
  const dx = base.x - mineralLine.x;
  const dy = base.y - mineralLine.y;
  const d = Math.hypot(dx, dy) || 1;
  return {
    x: Math.trunc(base.x + (dx / d) * fx(distance)),
    y: Math.trunc(base.y + (dy / d) * fx(distance)),
  };
};

test('live bot planner exposes sorted macro, defense, and pressure intents', () => {
  const scenario = botScenario({ seed: 832 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const threat = baseOnlyThreatPoint(collectBotFacts(s, 0, Terran), base);
  scenario.resources(0, 1_000, 0);
  Array.from({ length: 4 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 12), base.y));
  scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);

  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 1, attackThreshold: 1 })(s, 0);
  const kinds = plan.intents.map((intent) => intent.kind);
  const resultKinds = plan.intentResults.map((record) => record.intent.kind);
  const statuses = plan.intentResults.map((record) => record.result.status);

  assert.equal(plan.commands.length > 0, true);
  assert.deepEqual(kinds.slice(0, 3), ['defend-base', 'counterattack', 'add-production']);
  assert.deepEqual(resultKinds.slice(0, 3), kinds.slice(0, 3));
  assert.deepEqual(statuses.slice(0, 3), ['done', 'done', 'done']);
  assert.equal(plan.intents[0]!.urgency >= plan.intents[1]!.urgency, true);
  assert.equal(plan.intents[1]!.urgency >= plan.intents[2]!.urgency, true);
});

test('live bot planner reports waiting pressure intent before commitment', () => {
  const scenario = botScenario({ seed: 834, factions: [Terran, Terran] });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  scenario.resources(0, 0, 0);
  scenario.spawn(Kind.Marine, 0, base.x + fx(32), base.y);

  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 6 })(s, 0);
  const pressure = plan.intentResults.find((record) => record.intent.kind === 'attack-wave');

  assert.ok(pressure);
  assert.deepEqual(pressure.result, { status: 'waiting', reason: 'insufficient-force' });
  assert.equal(plan.commands.some((cmd) => cmd.t === 'attack' || cmd.t === 'amove'), false);
});

test('tactical intent results distinguish missing detection from missing force', () => {
  assert.deepEqual(
    tacticalIntentResult({ kind: 'get-detection', urgency: 80 }, false),
    { status: 'waiting', reason: 'missing-detection' },
  );
  assert.deepEqual(
    tacticalIntentResult({ kind: 'defend-base', urgency: 80 }, false),
    { status: 'waiting', reason: 'insufficient-force' },
  );
  assert.deepEqual(
    tacticalIntentResult({ kind: 'clear-site', urgency: 80 }, true),
    { status: 'done' },
  );
});

test('bot memory records actionable intent outcome locations', () => {
  const memory = createBotMemory();
  const x = 12 * TILE * ONE;
  const y = 8 * TILE * ONE;
  rememberIntentOutcomes(memory, [
    {
      intent: { kind: 'get-detection', urgency: 90, x, y },
      result: { status: 'waiting', reason: 'missing-detection' },
    },
    {
      intent: { kind: 'expand', urgency: 35, x: x + TILE * ONE, y },
      result: { status: 'blocked', reason: 'occupied-location' },
    },
    {
      intent: { kind: 'attack-wave', urgency: 40, x, y: y + TILE * ONE },
      result: { status: 'waiting', reason: 'insufficient-force' },
    },
  ], 100);

  assert.deepEqual([...memory.suspectedInvisibleThreats.values()], [{ x, y, tick: 100 }]);
  assert.deepEqual([...memory.blockedSites.values()], [{ reason: 'occupied-location', tick: 100 }]);

  rememberIntentOutcomes(memory, [], 100 + INTENT_OUTCOME_MEMORY_TICKS + 1);
  assert.equal(memory.suspectedInvisibleThreats.size, 0);
  assert.equal(memory.blockedSites.size, 0);
});

test('bot facts summarize bases, larvae, visible enemies, and local base threats', () => {
  const scenario = botScenario({ seed: 800, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  let facts = collectBotFacts(scenario.state, 0, Zerg);
  const threat = baseOnlyThreatPoint(facts, base);
  const enemy = scenario.spawn(Kind.Marine, 1, threat.x, threat.y);

  facts = collectBotFacts(scenario.state, 0, Zerg);

  assert.equal(facts.primaryBase, slotOf(hatchery));
  assert.ok(facts.bases.includes(slotOf(hatchery)));
  assert.deepEqual(protectedRegion(facts, 'base'), {
    kind: 'base',
    anchor: slotOf(hatchery),
    x: base.x,
    y: base.y,
    radiusTiles: 18,
    value: 100,
  });
  assert.equal(protectedRegion(facts, 'mineral-line').anchor, slotOf(hatchery));
  assert.equal(facts.idleLarvae.length, 3);
  assert.ok(facts.visibleEnemies.includes(slotOf(enemy)));
  assert.deepEqual(facts.baseThreats, [{ base: slotOf(hatchery), enemy: slotOf(enemy) }]);
  assert.ok(facts.protectedRegionThreats.some((threat) => threat.enemy === slotOf(enemy)));
  assert.equal(facts.risk.vision, 'omniscient');
  assert.equal(facts.risk.visible[tileY(base.y) * facts.risk.w + tileX(base.x)]!, 1);
  assert.ok(facts.risk.values[tileY(threat.y) * facts.risk.w + tileX(threat.x)]! > 0);

  const incidents = deriveTacticalIncidents(scenario.state, facts);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0]!.kind, 'base-intrusion');
  assert.equal(incidents[0]!.base, slotOf(hatchery));
  assert.deepEqual(incidents[0]!.enemies, [slotOf(enemy)]);
  assert.ok(incidents[0]!.severity > 100);
});

test('bot tactical incidents classify mineral-line harassment from protected regions', () => {
  const scenario = botScenario({ seed: 806, factions: [Zerg, Terran] });
  let facts = collectBotFacts(scenario.state, 0, Zerg);
  const mineralLine = protectedRegion(facts, 'mineral-line');
  scenario.spawn(Kind.Marine, 1, mineralLine.x, mineralLine.y);

  facts = collectBotFacts(scenario.state, 0, Zerg);
  const incidents = deriveTacticalIncidents(scenario.state, facts);

  assert.equal(incidents[0]!.kind, 'mineral-line-harass');
  assert.equal(incidents[0]!.base, mineralLine.anchor);
  assert.ok(incidents[0]!.severity > 150);
});

test('bot facts expose visible enemy protected regions for proactive pressure', () => {
  const scenario = botScenario({ seed: 807, factions: [Terran, Zerg] });
  const enemyBase = slotOf(scenario.entity(Kind.Hatchery, 1));

  const facts = collectBotFacts(scenario.state, 0, Terran);

  assert.equal(enemyProtectedRegion(facts, 'base').anchor, enemyBase);
  assert.equal(enemyProtectedRegion(facts, 'mineral-line').anchor, enemyBase);
});

test('bot pressure focus avoids visibly lethal economy pressure without freezing', () => {
  const scenario = botScenario({ seed: 818, factions: [Terran, Zerg] });
  const s = scenario.state;
  const depot = slotOf(scenario.entity(Kind.CommandCenter, 0));
  const facts = collectBotFacts(s, 0, Terran);
  const enemyBase = enemyProtectedRegion(facts, 'base');
  const enemyMinerals = enemyProtectedRegion(facts, 'mineral-line');

  facts.risk.values[riskIndex(facts.risk, enemyBase.x, enemyBase.y)] = 60;
  facts.risk.values[riskIndex(facts.risk, enemyMinerals.x, enemyMinerals.y)] = 90;

  const focus = pressureFocus(s, 0, facts, depot);

  assert.ok(focus);
  assert.equal(focus.x, enemyBase.x);
  assert.equal(focus.y, enemyBase.y);
});

test('bot enemy protected regions respect fogged bases and resources', () => {
  const scenario = botScenario({ seed: 808, factions: [Terran, Zerg], vision: true });
  const s = scenario.state;
  const e = s.e;
  const vision = s.vision[0]!;
  const enemyBase = slotOf(scenario.entity(Kind.Hatchery, 1));
  const reveal = (slot: number): void => {
    vision[tileY(e.y[slot]!) * s.map.w + tileX(e.x[slot]!)] = 2;
  };
  vision.fill(0);

  let facts = collectBotFacts(s, 0, Terran);
  assert.deepEqual(facts.enemyProtectedRegions, []);

  reveal(enemyBase);
  facts = collectBotFacts(s, 0, Terran);
  assert.equal(enemyProtectedRegion(facts, 'base').anchor, enemyBase);
  assert.equal(facts.enemyProtectedRegions.some((region) => region.kind === 'mineral-line'), false);

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && (e.flags[i]! & Role.Resource) !== 0 && withinRangeSq(e.x[i]!, e.y[i]!, e.x[enemyBase]!, e.y[enemyBase]!, fx(14 * 32))) {
      reveal(i);
    }
  }
  facts = collectBotFacts(s, 0, Terran);
  assert.equal(enemyProtectedRegion(facts, 'mineral-line').anchor, enemyBase);
});

test('bot risk uses visible-map enemies when fog tracking is active', () => {
  const scenario = botScenario({ seed: 802, factions: [Zerg, Terran], vision: true });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  let facts = collectBotFacts(scenario.state, 0, Zerg);
  const threat = baseOnlyThreatPoint(facts, base);
  const enemy = scenario.spawn(Kind.Marine, 1, threat.x, threat.y);
  const vision = scenario.state.vision[0]!;
  vision.fill(0);
  vision[tileY(base.y) * scenario.state.map.w + tileX(base.x)] = 2;

  facts = collectBotFacts(scenario.state, 0, Zerg);
  assert.equal(facts.risk.vision, 'visible');
  assert.deepEqual(facts.visibleEnemies, []);
  assert.deepEqual(facts.baseThreats, []);
  assert.equal(facts.risk.values[tileY(threat.y) * facts.risk.w + tileX(threat.x)]!, 0);

  vision[tileY(threat.y) * scenario.state.map.w + tileX(threat.x)] = 2;
  facts = collectBotFacts(scenario.state, 0, Zerg);
  assert.deepEqual(facts.visibleEnemies, [slotOf(enemy)]);
  assert.deepEqual(facts.baseThreats, [{ base: slotOf(hatchery), enemy: slotOf(enemy) }]);
  assert.ok(facts.risk.values[tileY(threat.y) * facts.risk.w + tileX(threat.x)]! > 0);

  const cheapFacts = collectBotFacts(scenario.state, 0, Zerg, { risk: 'none' });
  assert.equal(cheapFacts.risk.vision, 'omitted');
  assert.equal(cheapFacts.risk.values.length, 0);
  assert.equal(cheapFacts.risk.antiGround.length, 0);
  assert.equal(cheapFacts.risk.antiAir.length, 0);
  assert.equal(cheapFacts.risk.detection.length, 0);
  assert.equal(deriveTacticalIncidents(scenario.state, cheapFacts)[0]!.severity, 125);
});

test('bot risk map exposes ground, air, and detection layers separately', () => {
  const scenario = botScenario({ seed: 803, factions: [Zerg, Terran] });
  const firebat = scenario.spawn(Kind.Firebat, 1, fx(200), fx(200));
  const valkyrie = scenario.spawn(Kind.Valkyrie, 1, fx(500), fx(200));
  const vessel = scenario.spawn(Kind.ScienceVessel, 1, fx(800), fx(200));

  const facts = collectBotFacts(scenario.state, 0, Zerg);
  const risk = facts.risk;
  const groundIdx = riskIndex(risk, scenario.pos(firebat).x, scenario.pos(firebat).y);
  const airIdx = riskIndex(risk, scenario.pos(valkyrie).x, scenario.pos(valkyrie).y);
  const detectorIdx = riskIndex(risk, scenario.pos(vessel).x, scenario.pos(vessel).y);

  assert.ok(risk.values[groundIdx]! > 0);
  assert.ok(risk.antiGround[groundIdx]! > 0);
  assert.equal(risk.antiAir[groundIdx]!, 0);
  assert.ok(risk.values[airIdx]! > 0);
  assert.ok(risk.antiAir[airIdx]! > 0);
  assert.equal(risk.antiGround[airIdx]!, 0);
  assert.ok(risk.detection[detectorIdx]! > 0);
  assert.equal(risk.values[detectorIdx]!, 0);
});

test('bot base incident severity uses ground threat risk instead of aggregate air-only risk', () => {
  const airScenario = botScenario({ seed: 804, factions: [Zerg, Terran] });
  const airBase = airScenario.entity(Kind.Hatchery, 0);
  const airBasePos = airScenario.pos(airBase);
  const airPoint = baseOnlyThreatPoint(collectBotFacts(airScenario.state, 0, Zerg), airBasePos, 96);
  airScenario.spawn(Kind.Valkyrie, 1, airPoint.x, airPoint.y);

  const airIncident = deriveTacticalIncidents(
    airScenario.state,
    collectBotFacts(airScenario.state, 0, Zerg),
  )[0]!;
  assert.equal(airIncident.severity, 125);

  const groundScenario = botScenario({ seed: 805, factions: [Zerg, Terran] });
  const groundBase = groundScenario.entity(Kind.Hatchery, 0);
  const groundBasePos = groundScenario.pos(groundBase);
  const groundPoint = baseOnlyThreatPoint(collectBotFacts(groundScenario.state, 0, Zerg), groundBasePos, 96);
  groundScenario.spawn(Kind.Marine, 1, groundPoint.x, groundPoint.y);

  const groundIncident = deriveTacticalIncidents(
    groundScenario.state,
    collectBotFacts(groundScenario.state, 0, Zerg),
  )[0]!;
  assert.ok(groundIncident.severity > airIncident.severity);
});

test('bot facts count completed and pending structures for rebuild planning', () => {
  const { scenario, base } = zergBuildScenario(801);
  const drone = scenario.spawn(Kind.Drone, 0, base.x - fx(32), base.y);
  scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
  scenario.state.e.buildKind[slotOf(drone)] = Kind.HydraliskDen;

  const facts = collectBotFacts(scenario.state, 0, Zerg);

  assert.deepEqual(missingStructureKinds(facts, [Kind.SpawningPool, Kind.HydraliskDen]), []);
  assert.deepEqual(missingStructureKinds(facts, [Kind.EvolutionChamber]), [Kind.EvolutionChamber]);
});

test('bot tactical incidents classify bypass, static, and containment threats', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [Kind.NydusCanal, 'nydus-breach'],
    [Kind.Dropship, 'transport-drop'],
    [Kind.PhotonCannon, 'static-threat-zone'],
    [Kind.SiegeTankSieged, 'siege-containment'],
  ];

  cases.forEach(([threatKind, expected], i) => {
    const scenario = botScenario({ seed: 810 + i });
    const commandCenter = scenario.entity(Kind.CommandCenter, 0);
    const base = scenario.pos(commandCenter);
    scenario.spawn(threatKind, 1, base.x + fx(48), base.y);

    const facts = collectBotFacts(scenario.state, 0, Terran);
    const incidents = deriveTacticalIncidents(scenario.state, facts);

    assert.equal(incidents[0]!.kind, expected);
    assert.equal(incidents[0]!.base, slotOf(commandCenter));
  });
});

test('bot ranks responders by tactical incident fit', () => {
  const scenario = botScenario({ seed: 811 });
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  const base = scenario.pos(commandCenter);
  const firebat = scenario.spawn(Kind.Firebat, 0, base.x + fx(20), base.y);
  const goliath = scenario.spawn(Kind.Goliath, 0, base.x + fx(80), base.y);
  const drop = scenario.spawn(Kind.Dropship, 1, base.x + fx(48), base.y);

  const facts = collectBotFacts(scenario.state, 0, Terran);
  const incident = deriveTacticalIncidents(scenario.state, facts)[0]!;
  const responders = rankedTacticalResponders(
    scenario.state,
    [slotOf(firebat), slotOf(goliath)],
    incident,
    slotOf(drop),
  );

  assert.equal(incident.kind, 'transport-drop');
  assert.equal(responders[0], slotOf(goliath));
});

test('bot budgets tactical responders by incident severity', () => {
  const low = tacticalResponseBudget({ kind: 'base-intrusion', severity: 125, x: 0, y: 0 }, 12);
  const drop = tacticalResponseBudget({ kind: 'transport-drop', severity: 275, x: 0, y: 0 }, 12);
  const nydus = tacticalResponseBudget({ kind: 'nydus-breach', severity: 325, x: 0, y: 0 }, 12);

  assert.equal(low, 2);
  assert.ok(drop > low);
  assert.ok(nydus > drop);
  assert.equal(tacticalResponseBudget({ kind: 'nydus-breach', severity: 2_000, x: 0, y: 0 }, 99), 10);
  assert.equal(tacticalResponseBudget({ kind: 'base-intrusion', severity: 125, x: 0, y: 0 }, 0), 0);
});

test('bot selects only a bounded ranked squad for small incidents', () => {
  const scenario = botScenario({ seed: 813 });
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  const base = scenario.pos(commandCenter);
  const threat = baseOnlyThreatPoint(collectBotFacts(scenario.state, 0, Terran), base);
  const marines = Array.from({ length: 6 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);

  const facts = collectBotFacts(scenario.state, 0, Terran);
  const incident = deriveTacticalIncidents(scenario.state, facts)[0]!;
  const responders = selectTacticalResponders(
    scenario.state,
    marines.map(slotOf),
    incident,
    slotOf(enemy),
  );

  assert.equal(incident.kind, 'base-intrusion');
  assert.equal(responders.length, 2);
  assert.deepEqual(responders, marines.slice(0, 2).map(slotOf));
});

test('bot tactical defense proposal separates incident choice from command execution', () => {
  const scenario = botScenario({ seed: 829 });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const threat = baseOnlyThreatPoint(collectBotFacts(scenario.state, 0, Terran), base);
  const marines = Array.from({ length: 4 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);
  const memory = createBotMemory();
  const cmds: Command[] = [];
  const facts = collectBotFacts(scenario.state, 0, Terran);

  const proposal = proposeTacticalDefense(scenario.state, facts, memory);

  assert.equal(proposal.incident?.kind, 'base-intrusion');
  assert.equal(proposal.intent?.kind, 'defend-base');
  assert.equal(cmds.length, 0);
  assert.equal(memory.tacticalCommitments.size, 0);

  const result = executeTacticalDefense(
    scenario.state,
    0,
    cmds,
    facts,
    memory,
    proposal,
    marines.map(slotOf),
    [],
    NONE,
  );
  const attacks = cmds.filter((cmd): cmd is Extract<BotCommand, { t: 'attack' }> =>
    cmd.t === 'attack' && cmd.target === enemy);

  assert.equal(result.incident, proposal.incident);
  assert.equal(result.intent, proposal.intent);
  assert.equal(result.reserve.defenseActive, true);
  assert.deepEqual(attacks.map((cmd) => cmd.unit), marines.slice(0, 2));
  assert.equal(memory.tacticalCommitments.size, 1);
});

test('bot pulls nearby workers as emergency defenders only when army response is short', () => {
  const scenario = botScenario({ seed: 814, factions: [Zerg, Terran] });
  const facts = collectBotFacts(scenario.state, 0, Zerg);
  const mineralLine = protectedRegion(facts, 'mineral-line');
  const enemy = scenario.spawn(Kind.Marine, 1, mineralLine.x, mineralLine.y);
  const workerSlots = new Set(facts.workers);

  const cmds = scenario.run(Zerg, 0, { barracksTarget: 0, attackThreshold: 99 });
  const workerAttacks = cmds.filter((cmd) =>
    cmd.t === 'attack' && cmd.target === enemy && workerSlots.has(slotOf(cmd.unit)));

  assert.ok(workerAttacks.length > 0);
});

test('bot does not double-book the reserved builder as an emergency defender', () => {
  const scenario = botScenario({ seed: 817, factions: [Terran, Zerg] });
  const initialFacts = collectBotFacts(scenario.state, 0, Terran);
  const mineralLine = protectedRegion(initialFacts, 'mineral-line');
  scenario.resources(0, 1_000, 0);
  const enemy = scenario.spawn(Kind.Zergling, 1, mineralLine.x, mineralLine.y);

  const cmds = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 1, attackThreshold: 99 });
  const build = findBuild(cmds, Kind.Barracks);
  assert.ok(build);
  const workerAttacks = cmds.filter((cmd): cmd is Extract<BotCommand, { t: 'attack' }> =>
    cmd.t === 'attack' && cmd.target === enemy);

  assert.ok(workerAttacks.length > 0);
  assert.equal(workerAttacks.some((cmd) => cmd.unit === build.unit), false);
});

test('bot keeps valid tactical commitments stable until they expire', () => {
  const scenario = botScenario({ seed: 815 });
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  const base = scenario.pos(commandCenter);
  const threat = baseOnlyThreatPoint(collectBotFacts(scenario.state, 0, Terran), base);
  const marines = Array.from({ length: 4 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);
  const memory = createBotMemory();

  const facts = collectBotFacts(scenario.state, 0, Terran);
  const incident = deriveTacticalIncidents(scenario.state, facts)[0]!;
  const first = commitTacticalResponders(
    scenario.state,
    memory,
    marines.map(slotOf),
    incident,
    slotOf(enemy),
    0,
  );
  const closer = scenario.spawn(Kind.Marine, 0, base.x + fx(4), base.y);
  const candidates = [slotOf(closer), ...marines.map(slotOf)];
  const stable = commitTacticalResponders(scenario.state, memory, candidates, incident, slotOf(enemy), 1);
  const refreshed = commitTacticalResponders(
    scenario.state,
    memory,
    candidates,
    incident,
    slotOf(enemy),
    TACTICAL_COMMITMENT_TICKS + 2,
  );

  assert.deepEqual(first, marines.slice(0, 2).map(slotOf));
  assert.deepEqual(stable, first);
  assert.equal(refreshed[0], slotOf(closer));
});

test('bot does not pull every army unit for a small base intrusion', () => {
  const scenario = botScenario({ seed: 814 });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const threat = baseOnlyThreatPoint(collectBotFacts(scenario.state, 0, Terran), base);
  const marines = Array.from({ length: 6 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);

  const cmds = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const attacks = cmds.filter((c): c is Extract<BotCommand, { t: 'attack' }> =>
    c.t === 'attack' && c.target === enemy);

  assert.equal(attacks.length, 2);
  assert.deepEqual(attacks.map((c) => c.unit), marines.slice(0, 2));
});

test('bot attacks with uncommitted army while a small defense squad responds', () => {
  const scenario = botScenario({ seed: 816 });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const threat = baseOnlyThreatPoint(collectBotFacts(scenario.state, 0, Terran), base);
  const marines = Array.from({ length: 6 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(scenario.state, 0, Terran), base);

  const cmds = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 4 });
  const defense = cmds.filter((c): c is Extract<BotCommand, { t: 'attack' }> =>
    c.t === 'attack' && c.target === enemy);
  const offense = cmds.filter((c): c is Extract<BotCommand, { t: 'amove' }> =>
    c.t === 'amove' && c.x === enemyRegion.x && c.y === enemyRegion.y);

  assert.equal(defense.length, 2);
  assert.equal(offense.length, 4);
  assert.deepEqual(defense.map((c) => c.unit), marines.slice(0, 2));
  assert.deepEqual(offense.map((c) => c.unit), marines.slice(2));
});

test('bot commitment pressure eventually sends an under-threshold army', () => {
  const scenario = botScenario({ seed: 818 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), base);
  const marines = Array.from({ length: 3 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const bot = createBot(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 12 });
  const isOffense = (cmd: BotCommand): cmd is Extract<BotCommand, { t: 'amove' }> =>
    cmd.t === 'amove' && cmd.x === enemyRegion.x && cmd.y === enemyRegion.y;

  assert.equal(bot(s, 0).some(isOffense), false);
  s.tick += PRESSURE_COMMITMENT_TICKS + 1;
  const offense = bot(s, 0).filter(isOffense);

  assert.deepEqual(offense.map((c) => c.unit), marines);
});

test('bot commitment pressure eventually sends a lone combat unit', () => {
  const scenario = botScenario({ seed: 828 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), base);
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  const bot = createBot(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 12 });
  const isOffense = (cmd: BotCommand): cmd is Extract<BotCommand, { t: 'amove' }> =>
    cmd.t === 'amove' && cmd.x === enemyRegion.x && cmd.y === enemyRegion.y;

  assert.equal(bot(s, 0).some(isOffense), false);
  s.tick += PRESSURE_COMMITMENT_TICKS + 1;
  const offense = bot(s, 0).filter(isOffense);

  assert.deepEqual(offense.map((c) => c.unit), [marine]);
});

test('bot commitment pressure waits less as army approaches the attack threshold', () => {
  const scenario = botScenario({ seed: 829 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const threshold = 12;
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), base);
  const marines = Array.from({ length: threshold - 1 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const bot = createBot(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: threshold });
  const isOffense = (cmd: BotCommand): cmd is Extract<BotCommand, { t: 'amove' }> =>
    cmd.t === 'amove' && cmd.x === enemyRegion.x && cmd.y === enemyRegion.y;

  assert.equal(pressureCommitmentTicks(marines.length, threshold) < PRESSURE_COMMITMENT_TICKS, true);
  assert.equal(bot(s, 0).some(isOffense), false);
  s.tick += pressureCommitmentTicks(marines.length, threshold);
  const offense = bot(s, 0).filter(isOffense);

  assert.deepEqual(offense.map((c) => c.unit), marines);
});

test('bot commitment pressure does not forget waiting during temporary zero-force windows', () => {
  const memory = createBotMemory();
  const threshold = 12;

  assert.equal(shouldCommitPressure(memory, 10, 0, threshold), false);
  assert.equal(memory.offenseWaitSince, -1);
  assert.equal(shouldCommitPressure(memory, 20, 3, threshold), false);
  assert.equal(memory.offenseWaitSince, 20);

  const wait = pressureCommitmentTicks(3, threshold);
  assert.equal(shouldCommitPressure(memory, 20 + Math.trunc(wait / 2), 0, threshold), false);
  assert.equal(shouldCommitPressure(memory, 20 + wait, 3, threshold), true);
});

test('bot pressure commitment exposes forced least-bad decisions', () => {
  const memory = createBotMemory();
  const threshold = 12;

  assert.deepEqual(
    pressureCommitmentDecision(memory, 10, 0, threshold),
    { status: 'idle', waitTicks: Infinity, waitedTicks: 0, forced: false },
  );
  assert.deepEqual(
    pressureCommitmentDecision(memory, 20, threshold, threshold),
    { status: 'commit', waitTicks: 0, waitedTicks: 0, forced: false },
  );

  const wait = pressureCommitmentTicks(3, threshold);
  assert.equal(pressureCommitmentDecision(memory, 30, 3, threshold).status, 'waiting');
  assert.deepEqual(
    pressureCommitmentDecision(memory, 30 + wait, 3, threshold),
    { status: 'commit', waitTicks: wait, waitedTicks: wait, forced: true },
  );
});

test('bot pressure scheduler exposes forced commitment results', () => {
  const scenario = botScenario({ seed: 821 });
  const s = scenario.state;
  const depot = slotOf(scenario.entity(Kind.CommandCenter, 0));
  const base = scenario.pos(depot);
  const facts = collectBotFacts(s, 0, Terran);
  const enemyRegion = enemyOffensiveRegion(facts, base);
  const marines = Array.from({ length: 3 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const memory = createBotMemory();
  const threshold = 12;
  const wait = pressureCommitmentTicks(marines.length, threshold);
  const cmds: Command[] = [];

  assert.equal(pressureCommitmentDecision(memory, s.tick, marines.length, threshold).status, 'waiting');
  s.tick += wait;
  const result = schedulePressureOffense(
    s,
    0,
    Terran,
    cmds,
    facts,
    memory,
    depot,
    combatReserve(marines.map(slotOf)),
    [],
    { minerals: 0, gas: 0 },
    NONE,
    () => null,
    {
      attackThreshold: threshold,
      strategicOnly: false,
      builderUsed: true,
    },
  );
  const offense = cmds.filter((cmd): cmd is Extract<BotCommand, { t: 'amove' }> =>
    cmd.t === 'amove' && cmd.x === enemyRegion.x && cmd.y === enemyRegion.y);

  assert.equal(result.decision.status, 'commit');
  assert.equal(result.decision.forced, true);
  assert.equal(result.issued, true);
  assert.equal(result.intent?.kind, 'harass');
  assert.equal(result.focus?.x, enemyRegion.x);
  assert.equal(result.focus?.y, enemyRegion.y);
  assert.deepEqual(offense.map((cmd) => cmd.unit), marines);
});

test('bot pressure scheduler classifies ready pressure as attack wave', () => {
  const scenario = botScenario({ seed: 823 });
  const s = scenario.state;
  const depot = slotOf(scenario.entity(Kind.CommandCenter, 0));
  const base = scenario.pos(depot);
  const facts = collectBotFacts(s, 0, Terran);
  const marines = Array.from({ length: 2 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));

  const result = schedulePressureOffense(
    s,
    0,
    Terran,
    [],
    facts,
    createBotMemory(),
    depot,
    combatReserve(marines.map(slotOf)),
    [],
    { minerals: 0, gas: 0 },
    NONE,
    () => null,
    {
      attackThreshold: 1,
      strategicOnly: false,
      builderUsed: true,
    },
  );

  assert.equal(result.decision.forced, false);
  assert.equal(result.intent?.kind, 'attack-wave');
  assert.equal(result.issued, true);
});

test('bot pressure proposal separates intent choice from command execution', () => {
  const scenario = botScenario({ seed: 824 });
  const s = scenario.state;
  const depot = slotOf(scenario.entity(Kind.CommandCenter, 0));
  const base = scenario.pos(depot);
  const facts = collectBotFacts(s, 0, Terran);
  const enemyRegion = enemyOffensiveRegion(facts, base);
  const marines = Array.from({ length: 2 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const reserve = combatReserve(marines.map(slotOf));
  const memory = createBotMemory();
  const cmds: Command[] = [];

  const proposal = proposePressureIntent(
    s,
    0,
    Terran,
    facts,
    memory,
    depot,
    reserve,
    { attackThreshold: 1, strategicOnly: false },
  );

  assert.equal(proposal.intent?.kind, 'attack-wave');
  assert.equal(proposal.focus?.x, enemyRegion.x);
  assert.equal(proposal.focus?.y, enemyRegion.y);
  assert.equal(cmds.length, 0);

  const result = executePressureIntent(
    s,
    0,
    cmds,
    memory,
    proposal,
    [],
    { minerals: 0, gas: 0 },
    NONE,
    () => null,
    { strategicOnly: false, builderUsed: true },
  );
  const offense = cmds.filter((cmd): cmd is Extract<BotCommand, { t: 'amove' }> =>
    cmd.t === 'amove' && cmd.x === enemyRegion.x && cmd.y === enemyRegion.y);

  assert.equal(result.intent?.kind, 'attack-wave');
  assert.equal(result.issued, true);
  assert.deepEqual(offense.map((cmd) => cmd.unit), marines);
});

test('bot commitment pressure spends only units not reserved for defense', () => {
  const scenario = botScenario({ seed: 819 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const threat = baseOnlyThreatPoint(collectBotFacts(s, 0, Terran), base);
  const marines = Array.from({ length: 4 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), base);
  const bot = createBot(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 12 });

  bot(s, 0);
  s.tick += PRESSURE_COMMITMENT_TICKS + 1;
  const cmds = bot(s, 0);
  const defense = cmds.filter((c): c is Extract<BotCommand, { t: 'attack' }> =>
    c.t === 'attack' && c.target === enemy);
  const offense = cmds.filter((c): c is Extract<BotCommand, { t: 'amove' }> =>
    c.t === 'amove' && c.x === enemyRegion.x && c.y === enemyRegion.y);

  assert.deepEqual(defense.map((c) => c.unit), marines.slice(0, 2));
  assert.deepEqual(offense.map((c) => c.unit), marines.slice(2));
});

test('bot pressure scheduler classifies defense-time pressure as counterattack', () => {
  const scenario = botScenario({ seed: 822 });
  const s = scenario.state;
  const depot = slotOf(scenario.entity(Kind.CommandCenter, 0));
  const base = scenario.pos(depot);
  const facts = collectBotFacts(s, 0, Terran);
  const enemyRegion = enemyOffensiveRegion(facts, base);
  const marines = Array.from({ length: 2 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 10), base.y));
  const cmds: Command[] = [];

  const result = schedulePressureOffense(
    s,
    0,
    Terran,
    cmds,
    facts,
    createBotMemory(),
    depot,
    combatReserve(marines.map(slotOf), marines.length, true),
    [],
    { minerals: 0, gas: 0 },
    NONE,
    () => null,
    {
      attackThreshold: 1,
      strategicOnly: true,
      builderUsed: true,
    },
  );
  const offense = cmds.filter((cmd): cmd is Extract<BotCommand, { t: 'amove' }> =>
    cmd.t === 'amove' && cmd.x === enemyRegion.x && cmd.y === enemyRegion.y);

  assert.equal(result.intent?.kind, 'counterattack');
  assert.equal(result.issued, true);
  assert.deepEqual(offense.map((cmd) => cmd.unit), marines);
});

test('bot counter-pressures public enemy starts while defenders handle a fogged base incident', () => {
  const scenario = botScenario({ seed: 820, factions: [Terran, Zerg], vision: true });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marines = Array.from({ length: 4 }, (_, i) =>
    scenario.spawn(Kind.Marine, 0, base.x + fx(20 + i * 20), base.y));
  const enemy = scenario.spawn(Kind.Zealot, 1, base.x + fx(96), base.y);
  s.vision[0]!.fill(0);
  s.vision[0]![tileY(base.y) * s.map.w + tileX(base.x)] = 2;
  s.vision[0]![tileY(s.e.y[slotOf(enemy)]!) * s.map.w + tileX(s.e.x[slotOf(enemy)]!)] = 2;

  const cmds = createBot(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })(s, 0);
  const publicStart = s.map.starts[1]!;
  const offense = cmds.filter((c): c is Extract<BotCommand, { t: 'amove' }> =>
    c.t === 'amove' && c.x === fx(publicStart.x * TILE + (TILE >> 1)) && c.y === fx(publicStart.y * TILE + (TILE >> 1)));
  const defense = cmds.filter((c): c is Extract<BotCommand, { t: 'attack' }> =>
    c.t === 'attack' && c.target === enemy);
  const defenders = new Set(defense.map((c) => c.unit));

  assert.ok(defense.length > 0);
  assert.ok(offense.length > 0);
  assert.equal(defense.every((c) => marines.includes(c.unit)), true);
  assert.equal(offense.every((c) => marines.includes(c.unit) && !defenders.has(c.unit)), true);
});

test('bot stays active against four-rax marine pressure', () => {
  const scenario = botScenario({ seed: 831, factions: [Terran, Terran] });
  const sim = scenario.sim;
  const s = scenario.state;
  seedTerranMarineCore(scenario, 0);
  seedTerranMarineCore(scenario, 1);
  const standard = createBot(Terran, { workerTarget: 10, barracksTarget: 1, attackThreshold: 6 });
  const pressure = createAggressiveMarineBot();
  let ownCombatCommandTicks = 0;
  let pressureCombatCommandTicks = 0;
  let invalidCommands = 0;

  for (let i = 0; i < 1_200 && !s.result.over; i++) {
    const own = standard(s, 0);
    const enemy = pressure(s, 1);
    if (own.some((cmd) => cmd.t === 'attack' || cmd.t === 'amove')) ownCombatCommandTicks++;
    if (enemy.some((cmd) => cmd.t === 'attack')) pressureCombatCommandTicks++;

    const results = sim.step([
      { player: 0, cmds: own },
      { player: 1, cmds: enemy },
    ]);
    invalidCommands += results.filter((result) => !result.ok).length;
  }

  assert.equal(invalidCommands, 0);
  assert.ok(pressureCombatCommandTicks > 50, 'pressure bot must keep attacking');
  assert.ok(countAlive(s, 1, Kind.Barracks) >= 4, 'pressure bot must grow to four barracks');
  assert.ok(countAlive(s, 1, Kind.Marine) > 0, 'pressure bot must sustain marine production');
  assert.ok(ownCombatCommandTicks > 0, 'standard bot must not freeze under marine pressure');
  assert.ok(countAlive(s, 0, Kind.CommandCenter) > 0, 'standard bot should keep its starting base alive');
});

test('bot keeps defending remembered incidents after vision drops', () => {
  const scenario = botScenario({ seed: 812, vision: true });
  const s = scenario.state;
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  const base = scenario.pos(commandCenter);
  const threat = baseOnlyThreatPoint(collectBotFacts(s, 0, Terran), base);
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  const enemy = scenario.spawn(Kind.Zealot, 1, threat.x, threat.y);
  const vision = s.vision[0]!;
  const reveal = (id: number, value: number): void => {
    const slot = slotOf(id);
    vision[tileY(s.e.y[slot]!) * s.map.w + tileX(s.e.x[slot]!)] = value;
  };
  vision.fill(0);
  reveal(commandCenter, 2);
  reveal(enemy, 2);

  const bot = createBot(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const visibleDefense = bot(s, 0)
    .find((c): c is Extract<BotCommand, { t: 'attack' }> =>
      c.t === 'attack' && c.unit === marine && c.target === enemy);
  assert.ok(visibleDefense);

  reveal(enemy, 0);
  s.tick++;
  const rememberedDefense = bot(s, 0)
    .find((c): c is Extract<BotCommand, { t: 'amove' }> => c.t === 'amove' && c.unit === marine);
  assert.ok(rememberedDefense);
  assert.equal(rememberedDefense.x, base.x);
  assert.equal(rememberedDefense.y, base.y);

  s.tick += TACTICAL_INCIDENT_MEMORY_TICKS;
  assert.equal(bot(s, 0).some((c) => c.t === 'amove' && c.unit === marine), false);
});

test('bot uses Stim when committing idle bio to defend', () => {
  const scenario = botScenario({ seed: 40 });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  scenario.spawn(Kind.Marine, 1, base.x + fx(50), base.y);
  scenario.grant(0, Tech.StimPack);

  const cmds = scenario.run(Terran);

  expectBotCasts(cmds, marine, Ability.StimPack);
  expectCommandType(cmds, 'attack');
});

test('bot defense attack commands match shared target attack intent', () => {
  const scenario = botScenario({ seed: 4001 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  const enemy = scenario.spawn(Kind.Zealot, 1, base.x + fx(64), base.y);

  const command = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0 })
    .find((c): c is Extract<BotCommand, { t: 'attack' }> => c.t === 'attack' && c.unit === marine && c.target === enemy);

  const targetSlot = slotOf(enemy);
  assert.deepEqual(command ? [command] : [], attackModeCandidates(s, 0, marine, {
    hit: enemy,
    x: s.e.x[targetSlot]!,
    y: s.e.y[targetSlot]!,
  }));
  assert.ok(command);
  assertPublicSurfaceExposes(s, 0, command);
});

test('bot defends threatened expansions through tactical incidents', () => {
  const scenario = botScenario({ seed: 4004 });
  const home = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, home.x + fx(20), home.y);
  const expansion = scenario.spawn(Kind.CommandCenter, 0, home.x + fx(720), home.y);
  const enemy = scenario.spawn(Kind.Zealot, 1, home.x + fx(760), home.y);
  const e = scenario.state.e;
  const enemySlot = slotOf(enemy);
  const expansionSlot = slotOf(expansion);
  const baseThreatRadius = fx(18 * 32);

  const command = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 })
    .find((c): c is Extract<BotCommand, { t: 'attack' }> =>
      c.t === 'attack' && c.unit === marine && c.target === enemy);

  assert.ok(command);
  assert.equal(withinRangeSq(e.x[enemySlot]!, e.y[enemySlot]!, home.x, home.y, baseThreatRadius), false);
  assert.equal(
    withinRangeSq(e.x[enemySlot]!, e.y[enemySlot]!, e.x[expansionSlot]!, e.y[expansionSlot]!, baseThreatRadius),
    true,
  );
  assertPublicSurfaceExposes(scenario.state, 0, command);
});

test('bot attack waves use public point attack-move intent', () => {
  const scenario = botScenario({ seed: 4002 });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), base);

  const command = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })
    .find((c): c is Extract<BotCommand, { t: 'amove' }> => c.t === 'amove' && c.unit === marine);
  const expected = attackModeCandidates(s, 0, marine, { hit: -1, x: enemyRegion.x, y: enemyRegion.y });

  assert.deepEqual(command ? [command] : [], expected);
  assert.ok(command);
  assertPublicSurfaceExposes(s, 0, command);
});

test('bot attack waves retask rally-following combat units', () => {
  const scenario = botScenario({ seed: 4003 });
  const s = scenario.state;
  const e = s.e;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  const followerTarget = scenario.spawn(Kind.SCV, 0, base.x + fx(48), base.y);
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), base);
  const marineSlot = slotOf(marine);
  e.order[marineSlot] = Order.AttackMove;
  e.intentTarget[marineSlot] = followerTarget;
  e.combatTarget[marineSlot] = NONE;
  e.target[marineSlot] = NONE;

  const command = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })
    .find((c): c is Extract<BotCommand, { t: 'amove' }> => c.t === 'amove' && c.unit === marine);
  const expected = attackModeCandidates(s, 0, marine, { hit: -1, x: enemyRegion.x, y: enemyRegion.y });

  assert.deepEqual(command ? [command] : [], expected);
  assert.ok(command);
  assertPublicSurfaceExposes(s, 0, command);
});

test('bot fog pressure falls back to public enemy starts without hidden target leakage', () => {
  const scenario = botScenario({ seed: 4006, factions: [Terran, Zerg], vision: true });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  const hiddenEnemy = scenario.spawn(Kind.Zergling, 1, base.x + fx(240), base.y);
  s.vision[0]!.fill(0);

  const command = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })
    .find((c): c is Extract<BotCommand, { t: 'amove' }> => c.t === 'amove' && c.unit === marine);
  const publicStart = s.map.starts[1]!;

  assert.ok(command);
  assert.equal(command.x, fx(publicStart.x * TILE + (TILE >> 1)));
  assert.equal(command.y, fx(publicStart.y * TILE + (TILE >> 1)));
  assert.notEqual(command.x, s.e.x[slotOf(hiddenEnemy)]!);
  assert.notEqual(command.y, s.e.y[slotOf(hiddenEnemy)]!);
  assertPublicSurfaceExposes(s, 0, command);
});

test('bot fog pressure chooses the nearest public enemy start on multi-start maps', () => {
  const map = generateMap(2, 4007);
  const scenario = botScenario({
    seed: 4007,
    map,
    players: 4,
    factions: [Terran, Terran, Zerg, Zerg],
    vision: true,
  });
  const s = scenario.state;
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const marine = scenario.spawn(Kind.Marine, 0, base.x + fx(20), base.y);
  s.vision[0]!.fill(0);

  const ownTeam = s.teams[0]!;
  let expectedX = 0;
  let expectedY = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < map.starts.length; i++) {
    if (map.teams[i] === ownTeam) continue;
    const start = map.starts[i]!;
    const x = fx(start.x * TILE + (TILE >> 1));
    const y = fx(start.y * TILE + (TILE >> 1));
    const d = (x - base.x) ** 2 + (y - base.y) ** 2;
    if (d >= bestDistance) continue;
    expectedX = x;
    expectedY = y;
    bestDistance = d;
  }

  const command = scenario.run(Terran, 0, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })
    .find((c): c is Extract<BotCommand, { t: 'amove' }> => c.t === 'amove' && c.unit === marine);

  assert.ok(command);
  assert.equal(command.x, expectedX);
  assert.equal(command.y, expectedY);
  assertPublicSurfaceExposes(s, 0, command);
});

test('bot sieges tanks when an enemy is in useful siege range', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 401 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const tank = spawnUnit(s, Kind.SiegeTank, 0, base.x, base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(190), base.y);
  grant(sim, 0, Tech.SiegeTech);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === tank && c.kind === Kind.SiegeTankSieged));
});

test('bot lays spider mines from charged vultures near ground threats', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 405 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vulture = spawnUnit(s, Kind.Vulture, 0, base.x, base.y);
  s.e.specialAmmo[slotOf(vulture)] = 3;
  spawnUnit(s, Kind.Zealot, 1, base.x + fx(40), base.y);
  grant(sim, 0, Tech.SpiderMines);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'mine' && c.unit === vulture));
});

test('bot burrows lurkers before using their attack', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 403 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(420), fx(400));
  spawnUnit(s, Kind.Marine, 1, fx(470), fx(400));

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'burrow' && c.unit === lurker && c.active));
});

test('bot attacks with already burrowed lurkers', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 404 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(420), fx(400));
  s.e.burrowed[slotOf(lurker)] = 1;
  const marine = spawnUnit(s, Kind.Marine, 1, fx(470), fx(400));

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'attack' && c.unit === lurker && c.target === marine));
});

test('bot starts hatchery to lair morph when zerg tech and resources are legal', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 406, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const hatchery = findEntity(sim, Kind.Hatchery, 0);
  const base = entityPos(sim, hatchery);
  spawnUnit(s, Kind.SpawningPool, 0, base.x + fx(120), base.y);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === hatchery && c.kind === Kind.Lair));
});

test('bot keeps using a completed lair as the zerg base anchor', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 407, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const hatchery = findEntity(sim, Kind.Hatchery, 0);
  s.e.kind[slotOf(hatchery)] = Kind.Lair;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'train' && c.kind === Kind.Drone));
});

test('zerg bot places a legal hydralisk den after a completed spawning pool', () => {
  const { scenario } = zergBuildScenario(452, (scenario, base) => {
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.HydraliskDen, zergBuildOptions);
});

test('zerg bot rebuilds a missing hydralisk den before later tech structures', () => {
  const { scenario } = zergBuildScenario(451, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
    scenario.spawn(Kind.EvolutionChamber, 0, base.x + fx(160), base.y);
    scenario.spawn(Kind.Spire, 0, base.x + fx(200), base.y);
    scenario.spawn(Kind.QueensNest, 0, base.x + fx(240), base.y);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.HydraliskDen, zergBuildOptions);
});

test('zerg bot respects hydralisk den prerequisite, placement, duplicates, and budget', () => {
  const { scenario: missingPool } = zergBuildScenario(453);
  expectNoBotBuild(missingPool, Zerg, Kind.HydraliskDen, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(454, (scenario, base) => {
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.HydraliskDen, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(455, (scenario, base) => {
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
    scenario.spawn(Kind.HydraliskDen, 0, base.x + fx(160), base.y);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.HydraliskDen, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(456, (scenario, base) => {
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.HydraliskDen;
  expectNoBotBuild(pending, Zerg, Kind.HydraliskDen, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(457, (scenario, base) => {
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
  });
  broke.resources(0, 1_000, Units[Kind.HydraliskDen]!.gas - 1);
  expectNoBotBuild(broke, Zerg, Kind.HydraliskDen, zergBuildOptions);
});

test('zerg bot places a legal evolution chamber after a completed hydralisk den', () => {
  const { scenario } = zergBuildScenario(458, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_POOL_DEN);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.EvolutionChamber, zergBuildOptions);
});

test('zerg bot respects evolution chamber macro order, placement, duplicates, and budget', () => {
  const { scenario: missingDen } = zergBuildScenario(459, (scenario, base) => {
    scenario.spawn(Kind.SpawningPool, 0, base.x + fx(120), base.y);
  });
  expectNoBotBuild(missingDen, Zerg, Kind.EvolutionChamber, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(460, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_POOL_DEN);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.EvolutionChamber, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(461, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_GROUND_TECH);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.EvolutionChamber, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(462, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_POOL_DEN);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.EvolutionChamber;
  expectNoBotBuild(pending, Zerg, Kind.EvolutionChamber, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(463, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_POOL_DEN);
  });
  broke.resources(0, Units[Kind.EvolutionChamber]!.minerals - 1, 1_000);
  expectNoBotBuild(broke, Zerg, Kind.EvolutionChamber, zergBuildOptions);
});

test('zerg bot places a legal spire after a completed lair', () => {
  const { scenario } = zergBuildScenario(464, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_GROUND_TECH);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.Spire, zergBuildOptions);
});

test('zerg bot respects spire prerequisite, placement, duplicates, and budget', () => {
  const { scenario: missingLair } = zergBuildScenario(465, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_GROUND_TECH);
  });
  expectNoBotBuild(missingLair, Zerg, Kind.Spire, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(466, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_GROUND_TECH);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.Spire, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(467, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_SPIRE_TECH);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.Spire, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(468, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_GROUND_TECH);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.Spire;
  expectNoBotBuild(pending, Zerg, Kind.Spire, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(469, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_GROUND_TECH);
  });
  broke.resources(0, 1_000, Units[Kind.Spire]!.gas - 1);
  expectNoBotBuild(broke, Zerg, Kind.Spire, zergBuildOptions);
});

test('zerg bot places a legal queen nest after a completed lair', () => {
  const { scenario } = zergBuildScenario(470, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_SPIRE_TECH);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.QueensNest, zergBuildOptions);
});

test('zerg bot respects queen nest prerequisite, placement, duplicates, and budget', () => {
  const { scenario: missingLair } = zergBuildScenario(471, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_SPIRE_TECH);
  });
  expectNoBotBuild(missingLair, Zerg, Kind.QueensNest, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(472, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_SPIRE_TECH);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.QueensNest, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(473, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.QueensNest, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(474, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_SPIRE_TECH);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.QueensNest;
  expectNoBotBuild(pending, Zerg, Kind.QueensNest, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(475, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_SPIRE_TECH);
  });
  broke.resources(0, 1_000, Units[Kind.QueensNest]!.gas - 1);
  expectNoBotBuild(broke, Zerg, Kind.QueensNest, zergBuildOptions);
});

test('zerg bot places a legal nydus canal after a completed lair', () => {
  const { scenario } = zergBuildScenario(494, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.NydusCanal, zergBuildOptions);
});

test('zerg bot respects nydus canal prerequisite, placement, duplicates, and budget', () => {
  const { scenario: missingLair } = zergBuildScenario(495, (scenario, base) => {
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  expectNoBotBuild(missingLair, Zerg, Kind.NydusCanal, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(496, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.NydusCanal, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(497, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, [...ZERG_LAIR_TECH, Kind.NydusCanal]);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.NydusCanal, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(498, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.NydusCanal;
  expectNoBotBuild(pending, Zerg, Kind.NydusCanal, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(499, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  broke.resources(0, Units[Kind.NydusCanal]!.minerals - 1, 1_000);
  expectNoBotBuild(broke, Zerg, Kind.NydusCanal, zergBuildOptions);
});

const zergNydusEndpointOptions = { barracksTarget: 1, workerTarget: 0, attackThreshold: 1 };

const readyZergNydusEndpointScenario = (seed: number): { scenario: BotScenario; target: number; home: { x: number; y: number } } => {
  const scenario = botScenario({ seed, factions: [Zerg, Terran] });
  const s = scenario.state;
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const home = scenario.pos(hatchery);
  makeLair(scenario, hatchery);
  const worker = slotOf(scenario.entity(Kind.Drone, 0));
  s.e.order[worker] = Order.Harvest;
  spawnZergTechChain(scenario, home, ZERG_SPIRE_TECH);
  scenario.spawn(Kind.GreaterSpire, 0, home.x + fx(230), home.y);
  scenario.spawn(Kind.QueensNest, 0, home.x + fx(260), home.y);
  scenario.spawn(Kind.NydusCanal, 0, home.x + fx(300), home.y);
  scenario.spawn(Kind.DefilerMound, 0, home.x + fx(340), home.y);
  scenario.spawn(Kind.UltraliskCavern, 0, home.x + fx(380), home.y);
  scenario.spawn(Kind.CreepColony, 0, fx(1_320), fx(700));
  scenario.spawn(Kind.Zergling, 0, home.x + fx(32), home.y);
  const target = scenario.spawn(Kind.CommandCenter, 1, fx(1_420), fx(700));
  scenario.resources(0, 1_000, 1_000);
  return { scenario, target, home };
};

test('zerg bot queues a second nydus endpoint near the offensive focus on owned creep', () => {
  const { scenario, home } = readyZergNydusEndpointScenario(500);
  const s = scenario.state;
  const focus = enemyOffensiveRegion(collectBotFacts(s, 0, Zerg), home);

  const build = expectBotBuildsLegal(scenario, Zerg, Kind.NydusCanal, zergNydusEndpointOptions);
  assert.ok(
    (build.x - focus.x) ** 2 + (build.y - focus.y) ** 2 <
    (home.x - focus.x) ** 2 + (home.y - focus.y) ** 2,
  );
});

test('zerg bot extends a completed nydus network to a new attack focus', () => {
  const { scenario, home } = readyZergNydusEndpointScenario(505);
  const s = scenario.state;
  const focus = enemyOffensiveRegion(collectBotFacts(s, 0, Zerg), home);
  scenario.spawn(Kind.NydusCanal, 0, home.x + fx(420), home.y + fx(96));

  const build = expectBotBuildsLegal(scenario, Zerg, Kind.NydusCanal, zergNydusEndpointOptions);
  assert.ok(
    (build.x - focus.x) ** 2 + (build.y - focus.y) ** 2 <
    (home.x - focus.x) ** 2 + (home.y - focus.y) ** 2,
  );
});

test('zerg bot respects nydus endpoint local network, duplicate, pending, and budget limits', () => {
  const noEntrance = readyZergNydusEndpointScenario(501);
  const noEntranceState = noEntrance.scenario.state;
  for (let i = 0; i < noEntranceState.e.hi; i++) {
    if (noEntranceState.e.alive[i] === 1 && noEntranceState.e.owner[i] === 0 && noEntranceState.e.kind[i] === Kind.NydusCanal) {
      noEntranceState.e.built[i] = 0;
    }
  }

  expectNoBotBuild(noEntrance.scenario, Zerg, Kind.NydusCanal, zergNydusEndpointOptions);

  const duplicate = readyZergNydusEndpointScenario(502);
  const duplicateFocus = enemyOffensiveRegion(collectBotFacts(duplicate.scenario.state, 0, Zerg), duplicate.home);
  duplicate.scenario.spawn(Kind.NydusCanal, 0, duplicateFocus.x - fx(48), duplicateFocus.y);

  expectNoBotBuild(duplicate.scenario, Zerg, Kind.NydusCanal, zergNydusEndpointOptions);

  const pending = readyZergNydusEndpointScenario(503);
  const pendingState = pending.scenario.state;
  const pendingWorker = slotOf(pending.scenario.entity(Kind.Drone, 0));
  pendingState.e.buildKind[pendingWorker] = Kind.NydusCanal;

  expectNoBotBuild(pending.scenario, Zerg, Kind.NydusCanal, zergNydusEndpointOptions);

  const broke = readyZergNydusEndpointScenario(504);
  broke.scenario.resources(0, Units[Kind.NydusCanal]!.minerals - 1, 1_000);

  expectNoBotBuild(broke.scenario, Zerg, Kind.NydusCanal, zergNydusEndpointOptions);
});

test('zerg bot adds macro hatcheries when larva-starved with a mineral bank', () => {
  const scenario = zergMacroHatcheryScenario(506);

  const build = expectBotBuildsLegal(scenario, Zerg, Kind.Hatchery, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 });

  assert.equal(build.kind, Kind.Hatchery);
});

test('zerg bot does not add macro hatcheries while one is already pending', () => {
  const scenario = zergMacroHatcheryScenario(507);
  const drone = scenario.entity(Kind.Drone, 0);
  scenario.state.e.buildKind[slotOf(drone)] = Kind.Hatchery;

  assert.equal(hasBuild(createBot(Zerg, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0), Kind.Hatchery), false);
});

test('zerg bot does not add macro hatcheries while idle larvae remain', () => {
  const scenario = zergMacroHatcheryScenario(508);
  const s = scenario.state;
  s.players.supplyUsed[0] = s.players.supplyMax[0]!;

  assert.equal(hasBuild(createBot(Zerg, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(s, 0), Kind.Hatchery), false);
});

test('terran bot adds core production capacity when mineral-banked past its target', () => {
  const scenario = botScenario({ seed: 509, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  scenario.spawn(Kind.Barracks, 0, base.x + fx(120), base.y);
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  expectBotBuildsLegal(scenario, Terran, Kind.Barracks, { barracksTarget: 1, workerTarget: 0, attackThreshold: 99 });
});

const idleWorkers = (scenario: BotScenario, player: number, kind: number): void => {
  const e = scenario.state.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === kind) e.order[i] = Order.Idle;
  }
};

test('live bot planner reports resource-starved supply build outcomes', () => {
  const scenario = botScenario({ seed: 531, factions: [Terran, Zerg] });
  scenario.resources(0, Units[Kind.SupplyDepot]!.minerals - 1, 0);
  scenario.state.players.supplyUsed[0] = scenario.state.players.supplyMax[0]!;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.SupplyDepot &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports no-builder supply build outcomes', () => {
  const scenario = botScenario({ seed: 532, factions: [Terran, Zerg] });
  idleWorkers(scenario, 0, Kind.SCV);
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyUsed[0] = scenario.state.players.supplyMax[0]!;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.SupplyDepot &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-builder'));
});

test('live bot planner reports resource-starved army-structure outcomes', () => {
  const scenario = botScenario({ seed: 533, factions: [Terran, Zerg] });
  scenario.resources(0, Units[Kind.Barracks]!.minerals - 1, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 1, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.Barracks &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports no-builder army-structure outcomes', () => {
  const scenario = botScenario({ seed: 534, factions: [Terran, Zerg] });
  idleWorkers(scenario, 0, Kind.SCV);
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 1, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.Barracks &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-builder'));
});

test('live bot planner reports missing-prerequisite tech-structure outcomes', () => {
  const scenario = botScenario({ seed: 535, factions: [Protoss, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.Nexus, 0));
  scenario.spawn(Kind.Pylon, 0, base.x + fx(120), base.y);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Protoss, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'rebuild-tech' &&
    record.intent.targetKind === Kind.CyberneticsCore &&
    record.result.status === 'waiting' &&
    record.result.reason === 'missing-prerequisite'));
});

test('live bot planner reports resource-starved tech-structure outcomes', () => {
  const scenario = botScenario({ seed: 536, factions: [Protoss, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.Nexus, 0));
  scenario.spawn(Kind.Pylon, 0, base.x + fx(120), base.y);
  scenario.spawn(Kind.Gateway, 0, base.x + fx(160), base.y);
  scenario.resources(0, Units[Kind.CyberneticsCore]!.minerals - 1, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Protoss, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'rebuild-tech' &&
    record.intent.targetKind === Kind.CyberneticsCore &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports unavailable placement without blocked-site memory', () => {
  const scenario = botScenario({ seed: 537, factions: [Protoss, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.Nexus, 0));
  scenario.spawn(Kind.Gateway, 0, base.x + fx(160), base.y);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Protoss, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'rebuild-tech' &&
    record.intent.targetKind === Kind.CyberneticsCore &&
    record.result.status === 'waiting' &&
    record.result.reason === 'placement-unavailable'));
});

test('live bot planner reports missing-prerequisite zerg morph outcomes', () => {
  const scenario = botScenario({ seed: 538, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  scenario.state.e.kind[slotOf(hatchery)] = Kind.Lair;
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Zerg, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'rebuild-tech' &&
    record.intent.targetKind === Kind.Hive &&
    record.result.status === 'waiting' &&
    record.result.reason === 'missing-prerequisite'));
});

test('live bot planner reports resource-starved zerg morph outcomes', () => {
  const scenario = botScenario({ seed: 539, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  scenario.state.e.kind[slotOf(hatchery)] = Kind.Lair;
  scenario.spawn(Kind.QueensNest, 0, base.x + fx(180), base.y);
  scenario.resources(0, 1_000, Units[Kind.Hive]!.gas - 1);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Zerg, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'rebuild-tech' &&
    record.intent.targetKind === Kind.Hive &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports occupied zerg morph producer outcomes', () => {
  const scenario = botScenario({ seed: 540, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  const lair = slotOf(hatchery);
  scenario.state.e.kind[lair] = Kind.Lair;
  scenario.state.e.prodKind[lair] = Kind.Drone;
  scenario.spawn(Kind.QueensNest, 0, base.x + fx(180), base.y);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Zerg, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'rebuild-tech' &&
    record.intent.targetKind === Kind.Hive &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-production-capacity'));
});

test('live bot planner reports missing lurker morph tech outcomes', () => {
  const scenario = botScenario({ seed: 541, factions: [Zerg, Terran] });
  const hatchery = scenario.entity(Kind.Hatchery, 0);
  const base = scenario.pos(hatchery);
  scenario.state.e.kind[slotOf(hatchery)] = Kind.Hive;
  scenario.spawn(Kind.HydraliskDen, 0, base.x + fx(120), base.y);
  scenario.spawn(Kind.Hydralisk, 0, base.x + fx(32), base.y);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Zerg, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-counter' &&
    record.intent.targetKind === Kind.Lurker &&
    record.result.status === 'waiting' &&
    record.result.reason === 'missing-prerequisite'));
});

test('live bot planner reports resource-starved worker training outcomes', () => {
  const scenario = botScenario({ seed: 521, factions: [Terran, Zerg] });
  scenario.resources(0, Units[Kind.SCV]!.minerals - 1, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 99, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-worker' &&
    record.intent.targetKind === Kind.SCV &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports supply-blocked worker training outcomes', () => {
  const scenario = botScenario({ seed: 522, factions: [Terran, Zerg] });
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyUsed[0] = scenario.state.players.supplyMax[0]!;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 99, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-worker' &&
    record.intent.targetKind === Kind.SCV &&
    record.result.status === 'waiting' &&
    record.result.reason === 'supply-blocked'));
});

test('live bot planner reports occupied worker producer outcomes', () => {
  const scenario = botScenario({ seed: 523, factions: [Terran, Zerg] });
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;
  scenario.state.e.prodKind[slotOf(commandCenter)] = Kind.SCV;
  scenario.state.e.prodQueued[slotOf(commandCenter)] = MAX_QUEUE - 1;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 99, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-worker' &&
    record.intent.targetKind === Kind.SCV &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-production-capacity'));
});

test('live bot planner reports missing-prerequisite research outcomes', () => {
  const scenario = botScenario({ seed: 524, factions: [Terran, Zerg] });
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'research-upgrade' &&
    record.intent.targetTech === Tech.StimPack &&
    record.result.status === 'waiting' &&
    record.result.reason === 'missing-prerequisite'));
});

test('live bot planner reports resource-starved research outcomes', () => {
  const scenario = botScenario({ seed: 525, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  scenario.spawn(Kind.Academy, 0, base.x + fx(120), base.y);
  scenario.resources(0, 0, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'research-upgrade' &&
    record.intent.targetTech === Tech.StimPack &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports occupied research producer outcomes', () => {
  const scenario = botScenario({ seed: 526, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const academy = scenario.spawn(Kind.Academy, 0, base.x + fx(120), base.y);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;
  scenario.state.e.researchKind[slotOf(academy)] = Tech.U238Shells;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'research-upgrade' &&
    record.intent.targetTech === Tech.StimPack &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-production-capacity'));
});

test('live bot planner reports missing-prerequisite add-on outcomes', () => {
  const scenario = botScenario({ seed: 527, factions: [Terran, Zerg] });
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.ComsatStation &&
    record.result.status === 'waiting' &&
    record.result.reason === 'missing-prerequisite'));
});

test('live bot planner reports resource-starved add-on outcomes', () => {
  const scenario = botScenario({ seed: 528, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  scenario.spawn(Kind.Academy, 0, base.x + fx(120), base.y);
  scenario.resources(0, 0, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.ComsatStation &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports occupied add-on slot outcomes', () => {
  const scenario = botScenario({ seed: 529, factions: [Terran, Zerg] });
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  const commandCenterSlot = slotOf(commandCenter);
  const pos = addonPosition(scenario.state, commandCenterSlot, Kind.ComsatStation);
  const comsat = scenario.spawn(Kind.ComsatStation, 0, pos.x, pos.y);
  linkAddon(scenario.state, commandCenter, comsat);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.ComsatStation &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-production-capacity'));
});

test('live bot planner reports blocked add-on placement outcomes', () => {
  const scenario = botScenario({ seed: 530, factions: [Terran, Zerg] });
  const commandCenter = scenario.entity(Kind.CommandCenter, 0);
  const base = scenario.pos(commandCenter);
  const pos = addonPosition(scenario.state, slotOf(commandCenter), Kind.ComsatStation);
  scenario.spawn(Kind.Academy, 0, base.x + fx(120), base.y);
  scenario.spawn(Kind.SupplyDepot, 0, pos.x, pos.y);
  scenario.resources(0, 1_000, 1_000);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'add-production' &&
    record.intent.targetKind === Kind.ComsatStation &&
    record.result.status === 'blocked' &&
    record.result.reason === 'occupied-location'));
});

test('live bot planner reports resource-starved army training outcomes', () => {
  const scenario = botScenario({ seed: 517, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  scenario.spawn(Kind.Barracks, 0, base.x + fx(120), base.y);
  scenario.resources(0, Units[Kind.Marine]!.minerals - 1, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-counter' &&
    record.intent.targetKind === Kind.Marine &&
    record.result.status === 'waiting' &&
    record.result.reason === 'resource-starved'));
});

test('live bot planner reports supply-blocked army training outcomes', () => {
  const scenario = botScenario({ seed: 518, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  scenario.spawn(Kind.Barracks, 0, base.x + fx(120), base.y);
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyUsed[0] = scenario.state.players.supplyMax[0]!;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-counter' &&
    record.intent.targetKind === Kind.Marine &&
    record.result.status === 'waiting' &&
    record.result.reason === 'supply-blocked'));
});

test('live bot planner reports occupied army producer outcomes', () => {
  const scenario = botScenario({ seed: 519, factions: [Terran, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const barracks = scenario.spawn(Kind.Barracks, 0, base.x + fx(120), base.y);
  scenario.resources(0, Units[Kind.Marine]!.minerals, 0);
  scenario.state.players.supplyMax[0] = 1_000;
  scenario.state.e.prodKind[slotOf(barracks)] = Kind.Marine;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-counter' &&
    record.intent.targetKind === Kind.Marine &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-production-capacity'));
});

test('live bot planner reports missing army producer outcomes', () => {
  const scenario = botScenario({ seed: 520, factions: [Terran, Zerg] });
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  const plan = createBotPlanner(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0);

  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'train-counter' &&
    record.intent.targetKind === Kind.Marine &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-producer'));
});

test('protoss bot adds gateway capacity after higher-priority tech and spending are blocked', () => {
  const scenario = botScenario({ seed: 510, factions: [Protoss, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.Nexus, 0));
  scenario.spawn(Kind.Pylon, 0, base.x + fx(120), base.y);
  scenario.spawn(Kind.Gateway, 0, base.x + fx(160), base.y);
  scenario.spawn(Kind.CyberneticsCore, 0, base.x + fx(200), base.y);
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  expectBotBuildsLegal(scenario, Protoss, Kind.Gateway, { barracksTarget: 1, workerTarget: 0, attackThreshold: 99 });
});

test('core production anti-float respects disabled army-structure targets', () => {
  const scenario = botScenario({ seed: 511, factions: [Terran, Zerg] });
  scenario.resources(0, 1_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  assert.equal(hasBuild(createBot(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0), Kind.Barracks), false);
});

const bankedExpansionScenario = (seed: number): BotScenario => {
  const scenario = botScenario({
    seed,
    map: generateMap(1, seed, { preset: 'teamPlateaus' }),
    factions: [Terran, Zerg],
  });
  scenario.resources(0, 1_200, 0);
  scenario.state.players.supplyMax[0] = 1_000;
  return scenario;
};

const playerNatural = (scenario: BotScenario): NonNullable<typeof scenario.state.map.bases>[number] => {
  const natural = scenario.state.map.bases?.find((base) => base.kind === 'natural' && base.team === 0);
  assert.ok(natural);
  return natural;
};

test('terran bot expands to the nearest open base site when mineral-banked', () => {
  const scenario = bankedExpansionScenario(512);
  const natural = playerNatural(scenario);

  const build = expectBotBuildsLegal(scenario, Terran, Kind.CommandCenter, {
    barracksTarget: 0,
    workerTarget: 0,
    attackThreshold: 99,
  });

  assert.equal(tileX(build.x), natural.x);
  assert.equal(tileY(build.y), natural.y);
});

test('terran bot skips remembered blocked expansion sites', () => {
  const scenario = botScenario({
    seed: 514,
    players: 4,
    map: generateMap(2, 514, { preset: 'teamPlateaus' }),
    factions: [Terran, Zerg, Protoss, Zerg],
  });
  scenario.resources(0, 1_200, 0);
  scenario.state.players.supplyMax[0] = 1_000;
  const natural = playerNatural(scenario);
  const memory = createBotMemory();
  rememberIntentOutcomes(memory, [{
    intent: {
      kind: 'expand',
      urgency: 35,
      x: fx(natural.x * TILE + TILE / 2),
      y: fx(natural.y * TILE + TILE / 2),
    },
    result: { status: 'blocked', reason: 'occupied-location' },
  }], scenario.state.tick);

  const cmds: Command[] = [];
  scheduleBotMacro(
    scenario.state,
    0,
    Terran,
    cmds,
    collectBotFacts(scenario.state, 0, Terran),
    { barracksTarget: 0, workerTarget: 0 },
    memory,
  );

  const build = findCommandBuild(cmds, Kind.CommandCenter);
  assert.ok(build);
  assertPublicSurfaceExposes(scenario.state, 0, build);
  assert.notEqual(tileX(build.x), natural.x);
});

test('live bot planner reports blocked expansion placement outcomes', () => {
  const scenario = bankedExpansionScenario(515);
  const natural = playerNatural(scenario);
  blockBuildTilesAround(
    scenario.sim,
    fx(natural.x * TILE + TILE / 2),
    fx(natural.y * TILE + TILE / 2),
    8,
  );

  const plan = createBotPlanner(Terran, {
    barracksTarget: 0,
    workerTarget: 0,
    attackThreshold: 99,
  })(scenario.state, 0);

  assert.equal(hasBuild(plan.commands, Kind.CommandCenter), false);
  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'expand' &&
    record.intent.targetKind === Kind.CommandCenter &&
    record.result.status === 'blocked' &&
    record.result.reason === 'occupied-location'));
});

test('live bot planner reports waiting expansion outcomes when no builder exists', () => {
  const scenario = bankedExpansionScenario(516);
  const e = scenario.state.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.SCV) e.alive[i] = 0;
  }

  const plan = createBotPlanner(Terran, {
    barracksTarget: 0,
    workerTarget: 0,
    attackThreshold: 99,
  })(scenario.state, 0);

  assert.equal(hasBuild(plan.commands, Kind.CommandCenter), false);
  assert.ok(plan.intentResults.some((record) =>
    record.intent.kind === 'expand' &&
    record.intent.targetKind === Kind.CommandCenter &&
    record.result.status === 'waiting' &&
    record.result.reason === 'no-builder'));
});

test('terran bot does not duplicate an already occupied expansion site', () => {
  const scenario = bankedExpansionScenario(513);
  const natural = playerNatural(scenario);
  scenario.spawn(
    Kind.CommandCenter,
    0,
    fx(natural.x * TILE + TILE / 2),
    fx(natural.y * TILE + TILE / 2),
  );

  assert.equal(
    hasBuild(createBot(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0), Kind.CommandCenter),
    false,
  );
});

const playerIsland = (scenario: BotScenario): NonNullable<typeof scenario.state.map.bases>[number] => {
  const island = scenario.state.map.bases?.find((base) => base.kind === 'island');
  assert.ok(island);
  return island;
};

test('terran bot lands lifted command centers on open island expansions', () => {
  const scenario = botScenario({
    seed: 514,
    map: generateMap(1, 514, { preset: 'islandExpansions' }),
    factions: [Terran, Zerg],
  });
  const base = scenario.pos(scenario.entity(Kind.CommandCenter, 0));
  const island = playerIsland(scenario);
  const extra = slotOf(scenario.spawn(Kind.CommandCenter, 0, base.x + fx(160), base.y));
  liftStructure(scenario.state, extra);

  const command = scenario.run(Terran, 0, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })
    .find((c): c is Extract<BotCommand, { t: 'land' }> => c.t === 'land');

  assert.ok(command);
  assert.equal(tileX(command.x), island.x);
  assert.equal(tileY(command.y), island.y);
  assertPublicSurfaceExposes(scenario.state, 0, command);
});

test('terran bot does not send workers to build unreachable island expansions', () => {
  const scenario = botScenario({
    seed: 515,
    map: generateMap(1, 515, { preset: 'islandExpansions' }),
    factions: [Terran, Zerg],
  });
  scenario.resources(0, 2_000, 0);
  scenario.state.players.supplyMax[0] = 1_000;

  assert.equal(
    hasBuild(createBot(Terran, { barracksTarget: 0, workerTarget: 0, attackThreshold: 99 })(scenario.state, 0), Kind.CommandCenter),
    false,
  );
});

test('zerg bot places a legal defiler mound after a completed hive', () => {
  const { scenario } = zergBuildScenario(482, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.DefilerMound, zergBuildOptions);
});

test('zerg bot respects defiler mound prerequisite, placement, duplicates, and budget', () => {
  const { scenario: missingHive } = zergBuildScenario(483, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  expectNoBotBuild(missingHive, Zerg, Kind.DefilerMound, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(484, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.DefilerMound, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(485, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_HIVE_TECH);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.DefilerMound, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(486, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.DefilerMound;
  expectNoBotBuild(pending, Zerg, Kind.DefilerMound, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(487, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_LAIR_TECH);
  });
  broke.resources(0, 1_000, Units[Kind.DefilerMound]!.gas - 1);
  expectNoBotBuild(broke, Zerg, Kind.DefilerMound, zergBuildOptions);
});

test('zerg bot places a legal ultralisk cavern after completed hive tech', () => {
  const { scenario } = zergBuildScenario(488, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_HIVE_TECH);
  });

  expectBotBuildsLegal(scenario, Zerg, Kind.UltraliskCavern, zergBuildOptions);
});

test('zerg bot respects ultralisk cavern prerequisite, placement, duplicates, and budget', () => {
  const { scenario: missingHive } = zergBuildScenario(489, (scenario, base, hatchery) => {
    makeLair(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_HIVE_TECH);
  });
  expectNoBotBuild(missingHive, Zerg, Kind.UltraliskCavern, zergBuildOptions);

  const { scenario: blocked, base: blockedBase } = zergBuildScenario(490, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_HIVE_TECH);
  });
  blockBuildTilesAround(blocked.sim, blockedBase.x, blockedBase.y, 18);
  expectNoBotBuild(blocked, Zerg, Kind.UltraliskCavern, zergBuildOptions);

  const { scenario: duplicate } = zergBuildScenario(491, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, [...ZERG_HIVE_TECH, Kind.UltraliskCavern]);
  });
  expectNoBotBuild(duplicate, Zerg, Kind.UltraliskCavern, zergBuildOptions);

  const { scenario: pending, base: pendingBase } = zergBuildScenario(492, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_HIVE_TECH);
  });
  const worker = slotOf(pending.spawn(Kind.Drone, 0, pendingBase.x - fx(32), pendingBase.y));
  pending.state.e.buildKind[worker] = Kind.UltraliskCavern;
  expectNoBotBuild(pending, Zerg, Kind.UltraliskCavern, zergBuildOptions);

  const { scenario: broke } = zergBuildScenario(493, (scenario, base, hatchery) => {
    makeHive(scenario, hatchery);
    spawnZergTechChain(scenario, base, ZERG_HIVE_TECH);
  });
  broke.resources(0, 1_000, Units[Kind.UltraliskCavern]!.gas - 1);
  expectNoBotBuild(broke, Zerg, Kind.UltraliskCavern, zergBuildOptions);
});

test('zerg bot morphs a legal hive from a completed lair after queen nest', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 470, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const lair = findEntity(sim, Kind.Hatchery, 0);
  const lairSlot = slotOf(lair);
  const base = entityPos(sim, lair);
  s.e.kind[lairSlot] = Kind.Lair;
  spawnUnit(s, Kind.QueensNest, 0, base.x + fx(180), base.y);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg, { workerTarget: 0 })(s, 0);
  const morph = findTransform(cmds, Kind.Hive);

  assert.ok(morph);
  assert.equal(morph.unit, lair);
  assert.deepEqual(validateCommand(s, 0, morph), { ok: true });
});

test('zerg bot respects hive prerequisite, duplicates, pending morph, queue, and budget', () => {
  const missingNest = new Sim({ map: sliceMap(), players: 2, seed: 471, factions: [Zerg, Terran] });
  const missingState = missingNest.fullState();
  const missingLair = slotOf(findEntity(missingNest, Kind.Hatchery, 0));
  missingState.e.kind[missingLair] = Kind.Lair;
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(missingState, 0), Kind.Hive), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 472, factions: [Zerg, Terran] });
  const duplicateState = duplicate.fullState();
  const duplicateLair = slotOf(findEntity(duplicate, Kind.Hatchery, 0));
  const duplicateBase = entityPos(duplicate, eid(duplicateState.e, duplicateLair));
  duplicateState.e.kind[duplicateLair] = Kind.Lair;
  spawnUnit(duplicateState, Kind.QueensNest, 0, duplicateBase.x + fx(180), duplicateBase.y);
  spawnUnit(duplicateState, Kind.Hive, 0, duplicateBase.x + fx(260), duplicateBase.y);
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(duplicateState, 0), Kind.Hive), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 473, factions: [Zerg, Terran] });
  const pendingState = pending.fullState();
  const pendingLair = slotOf(findEntity(pending, Kind.Hatchery, 0));
  const pendingBase = entityPos(pending, eid(pendingState.e, pendingLair));
  pendingState.e.kind[pendingLair] = Kind.Lair;
  spawnUnit(pendingState, Kind.QueensNest, 0, pendingBase.x + fx(180), pendingBase.y);
  const pendingHive = slotOf(spawnUnit(pendingState, Kind.Hive, 0, pendingBase.x + fx(260), pendingBase.y));
  pendingState.e.built[pendingHive] = 0;
  pendingState.e.morphFromKind[pendingHive] = Kind.Lair;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(pendingState, 0), Kind.Hive), false);

  const queued = new Sim({ map: sliceMap(), players: 2, seed: 474, factions: [Zerg, Terran] });
  const queuedState = queued.fullState();
  const queuedLair = slotOf(findEntity(queued, Kind.Hatchery, 0));
  const queuedBase = entityPos(queued, eid(queuedState.e, queuedLair));
  queuedState.e.kind[queuedLair] = Kind.Lair;
  queuedState.e.prodKind[queuedLair] = Kind.Drone;
  spawnUnit(queuedState, Kind.QueensNest, 0, queuedBase.x + fx(180), queuedBase.y);
  queuedState.players.minerals[0] = 1_000;
  queuedState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(queuedState, 0), Kind.Hive), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 475, factions: [Zerg, Terran] });
  const brokeState = broke.fullState();
  const brokeLair = slotOf(findEntity(broke, Kind.Hatchery, 0));
  const brokeBase = entityPos(broke, eid(brokeState.e, brokeLair));
  brokeState.e.kind[brokeLair] = Kind.Lair;
  spawnUnit(brokeState, Kind.QueensNest, 0, brokeBase.x + fx(180), brokeBase.y);
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = Units[Kind.Hive]!.gas - 1;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(brokeState, 0), Kind.Hive), false);
});

test('zerg bot morphs a legal greater spire from a completed spire after hive', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 476, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.Hatchery, 0));
  spawnUnit(s, Kind.Hive, 0, base.x + fx(180), base.y);
  const spire = spawnUnit(s, Kind.Spire, 0, base.x + fx(260), base.y);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg, { workerTarget: 0 })(s, 0);
  const morph = findTransform(cmds, Kind.GreaterSpire);

  assert.ok(morph);
  assert.equal(morph.unit, spire);
  assert.deepEqual(validateCommand(s, 0, morph), { ok: true });
});

test('zerg bot respects greater spire prerequisite, duplicates, pending morph, queue, and budget', () => {
  const missingHive = new Sim({ map: sliceMap(), players: 2, seed: 477, factions: [Zerg, Terran] });
  const missingState = missingHive.fullState();
  const missingBase = entityPos(missingHive, findEntity(missingHive, Kind.Hatchery, 0));
  spawnUnit(missingState, Kind.Spire, 0, missingBase.x + fx(260), missingBase.y);
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(missingState, 0), Kind.GreaterSpire), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 478, factions: [Zerg, Terran] });
  const duplicateState = duplicate.fullState();
  const duplicateBase = entityPos(duplicate, findEntity(duplicate, Kind.Hatchery, 0));
  spawnUnit(duplicateState, Kind.Hive, 0, duplicateBase.x + fx(180), duplicateBase.y);
  spawnUnit(duplicateState, Kind.Spire, 0, duplicateBase.x + fx(260), duplicateBase.y);
  spawnUnit(duplicateState, Kind.GreaterSpire, 0, duplicateBase.x + fx(320), duplicateBase.y);
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(duplicateState, 0), Kind.GreaterSpire), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 479, factions: [Zerg, Terran] });
  const pendingState = pending.fullState();
  const pendingBase = entityPos(pending, findEntity(pending, Kind.Hatchery, 0));
  spawnUnit(pendingState, Kind.Hive, 0, pendingBase.x + fx(180), pendingBase.y);
  spawnUnit(pendingState, Kind.Spire, 0, pendingBase.x + fx(260), pendingBase.y);
  const pendingGreater = slotOf(spawnUnit(pendingState, Kind.GreaterSpire, 0, pendingBase.x + fx(320), pendingBase.y));
  pendingState.e.built[pendingGreater] = 0;
  pendingState.e.morphFromKind[pendingGreater] = Kind.Spire;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(pendingState, 0), Kind.GreaterSpire), false);

  const queued = new Sim({ map: sliceMap(), players: 2, seed: 480, factions: [Zerg, Terran] });
  const queuedState = queued.fullState();
  const queuedBase = entityPos(queued, findEntity(queued, Kind.Hatchery, 0));
  spawnUnit(queuedState, Kind.Hive, 0, queuedBase.x + fx(180), queuedBase.y);
  const queuedSpire = slotOf(spawnUnit(queuedState, Kind.Spire, 0, queuedBase.x + fx(260), queuedBase.y));
  queuedState.e.prodKind[queuedSpire] = Kind.Mutalisk;
  queuedState.players.minerals[0] = 1_000;
  queuedState.players.gas[0] = 1_000;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(queuedState, 0), Kind.GreaterSpire), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 481, factions: [Zerg, Terran] });
  const brokeState = broke.fullState();
  const brokeBase = entityPos(broke, findEntity(broke, Kind.Hatchery, 0));
  spawnUnit(brokeState, Kind.Hive, 0, brokeBase.x + fx(180), brokeBase.y);
  spawnUnit(brokeState, Kind.Spire, 0, brokeBase.x + fx(260), brokeBase.y);
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = Units[Kind.GreaterSpire]!.gas - 1;

  assert.equal(hasTransform(createBot(Zerg, { workerTarget: 0 })(brokeState, 0), Kind.GreaterSpire), false);
});

test('bot morphs hydralisks into lurkers through shared transform validation', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 408, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const hatchery = findEntity(sim, Kind.Hatchery, 0);
  const base = entityPos(sim, hatchery);
  spawnUnit(s, Kind.HydraliskDen, 0, base.x + fx(120), base.y);
  const hydra = spawnUnit(s, Kind.Hydralisk, 0, base.x + fx(32), base.y);
  grant(sim, 0, Tech.LurkerAspect);
  sim.step();
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === hydra && c.kind === Kind.Lurker));
});

test('bot queues a legal machine shop on an idle completed factory', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 409, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const factory = spawnUnit(s, Kind.Factory, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === factory && c.kind === Kind.MachineShop);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot does not duplicate or unaffordably queue machine shop add-ons', () => {
  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 410, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const factory = slotOf(spawnUnit(dupState, Kind.Factory, 0, fx(1_200), fx(1_200)));
  const shop = slotOf(spawnUnit(dupState, Kind.MachineShop, 0, fx(1_280), fx(1_200)));
  dupE.target[factory] = eid(dupE, shop);
  dupE.target[shop] = eid(dupE, factory);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.MachineShop), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 411, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Factory, 0, fx(1_200), fx(1_200));
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.MachineShop), false);
});

test('bot queues a legal comsat station on an idle completed command center', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 412, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const commandCenter = findEntity(sim, Kind.CommandCenter, 0);
  const base = entityPos(sim, commandCenter);
  spawnUnit(s, Kind.Academy, 0, base.x - fx(160), base.y);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === commandCenter && c.kind === Kind.ComsatStation);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects comsat add-on prerequisites, duplicates, and gas budget', () => {
  const missingAcademy = new Sim({ map: sliceMap(), players: 2, seed: 413, factions: [Terran, Zerg] });
  const missingState = missingAcademy.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(missingState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ComsatStation), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 414, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const commandCenter = slotOf(findEntity(duplicate, Kind.CommandCenter, 0));
  const base = entityPos(duplicate, eid(dupE, commandCenter));
  spawnUnit(dupState, Kind.Academy, 0, base.x - fx(160), base.y);
  const comsat = slotOf(spawnUnit(dupState, Kind.ComsatStation, 0, base.x + fx(80), base.y));
  dupE.target[commandCenter] = eid(dupE, comsat);
  dupE.target[comsat] = eid(dupE, commandCenter);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ComsatStation), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 415, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  const brokeBase = entityPos(broke, findEntity(broke, Kind.CommandCenter, 0));
  spawnUnit(brokeState, Kind.Academy, 0, brokeBase.x - fx(160), brokeBase.y);
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ComsatStation), false);
});

test('bot queues a legal control tower on an idle completed starport', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 416, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const starport = spawnUnit(s, Kind.Starport, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === starport && c.kind === Kind.ControlTower);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects control tower parent, duplicates, and gas budget', () => {
  const missingParent = new Sim({ map: sliceMap(), players: 2, seed: 417, factions: [Terran, Zerg] });
  const missingState = missingParent.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(missingState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ControlTower), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 418, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const starport = slotOf(spawnUnit(dupState, Kind.Starport, 0, fx(1_200), fx(1_200)));
  const tower = slotOf(spawnUnit(dupState, Kind.ControlTower, 0, fx(1_280), fx(1_200)));
  dupE.target[starport] = eid(dupE, tower);
  dupE.target[tower] = eid(dupE, starport);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ControlTower), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 419, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Starport, 0, fx(1_200), fx(1_200));
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ControlTower), false);
});

test('bot queues a legal physics lab for science facilities on the air tech path', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 422, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const facility = spawnUnit(s, Kind.ScienceFacility, 0, fx(1_200), fx(1_200));
  const towerParent = spawnUnit(s, Kind.Starport, 0, fx(900), fx(1_200));
  const tower = spawnUnit(s, Kind.ControlTower, 0, fx(980), fx(1_200));
  linkAddon(s, towerParent, tower);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === facility && c.kind === Kind.PhysicsLab);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot queues a legal covert ops for science facilities off the air tech path', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 423, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const facility = spawnUnit(s, Kind.ScienceFacility, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === facility && c.kind === Kind.CovertOps);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects science facility add-on parent, duplicates, and gas budget', () => {
  const missingParent = new Sim({ map: sliceMap(), players: 2, seed: 424, factions: [Terran, Zerg] });
  const missingState = missingParent.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  const missingCommands = createBot(Terran)(missingState, 0);
  assert.equal(missingCommands.some((c) => c.t === 'addon' && (c.kind === Kind.PhysicsLab || c.kind === Kind.CovertOps)), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 425, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const facility = slotOf(spawnUnit(dupState, Kind.ScienceFacility, 0, fx(1_200), fx(1_200)));
  const covertOps = slotOf(spawnUnit(dupState, Kind.CovertOps, 0, fx(1_280), fx(1_200)));
  dupE.target[facility] = eid(dupE, covertOps);
  dupE.target[covertOps] = eid(dupE, facility);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  const duplicateCommands = createBot(Terran)(dupState, 0);
  assert.equal(duplicateCommands.some((c) => c.t === 'addon' && (c.kind === Kind.PhysicsLab || c.kind === Kind.CovertOps)), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 426, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.ScienceFacility, 0, fx(1_200), fx(1_200));
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  const brokeCommands = createBot(Terran)(brokeState, 0);
  assert.equal(brokeCommands.some((c) => c.t === 'addon' && (c.kind === Kind.PhysicsLab || c.kind === Kind.CovertOps)), false);
});

test('bot queues a legal nuclear silo after covert ops', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 427, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const commandCenter = findEntity(sim, Kind.CommandCenter, 0);
  const base = entityPos(sim, commandCenter);
  const facility = spawnUnit(s, Kind.ScienceFacility, 0, base.x - fx(240), base.y);
  const covertOps = spawnUnit(s, Kind.CovertOps, 0, base.x - fx(160), base.y);
  linkAddon(s, facility, covertOps);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === commandCenter && c.kind === Kind.NuclearSilo);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects nuclear silo prerequisites, add-on conflicts, and budget', () => {
  const missingCovertOps = new Sim({ map: sliceMap(), players: 2, seed: 428, factions: [Terran, Zerg] });
  const missingState = missingCovertOps.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(missingState, 0).some((c) => c.t === 'addon' && c.kind === Kind.NuclearSilo), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 429, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const commandCenter = slotOf(findEntity(duplicate, Kind.CommandCenter, 0));
  const base = entityPos(duplicate, eid(dupE, commandCenter));
  const facility = spawnUnit(dupState, Kind.ScienceFacility, 0, base.x - fx(240), base.y);
  const covertOps = spawnUnit(dupState, Kind.CovertOps, 0, base.x - fx(160), base.y);
  linkAddon(dupState, facility, covertOps);
  const comsat = slotOf(spawnUnit(dupState, Kind.ComsatStation, 0, base.x + fx(80), base.y));
  dupE.target[commandCenter] = eid(dupE, comsat);
  dupE.target[comsat] = eid(dupE, commandCenter);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.NuclearSilo), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 430, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  const brokeBase = entityPos(broke, findEntity(broke, Kind.CommandCenter, 0));
  const brokeFacility = spawnUnit(brokeState, Kind.ScienceFacility, 0, brokeBase.x - fx(240), brokeBase.y);
  const brokeCovertOps = spawnUnit(brokeState, Kind.CovertOps, 0, brokeBase.x - fx(160), brokeBase.y);
  linkAddon(brokeState, brokeFacility, brokeCovertOps);
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.NuclearSilo), false);
});

test('terran bot reserves add-on parents before same-chain research', () => {
  const bot = createBot(Terran, { barracksTarget: 0, workerTarget: 0 });
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 1118, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  spawnUnit(s, Kind.ScienceFacility, 0, base.x - fx(240), base.y);
  s.players.minerals[0] = 2_000;
  s.players.gas[0] = 2_000;

  const cmds = bot(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.kind === Kind.CovertOps);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
  assert.equal(hasResearch(cmds, Tech.EMPShockwave), false);
  assert.equal(hasResearch(cmds, Tech.Irradiate), false);
  assert.equal(hasResearch(cmds, Tech.TitanReactor), false);
});

test('protoss bot places gateways from completed pylon power anchors', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 420, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1 })(s, 0);
  const build = cmds.find((c) => c.t === 'build' && c.kind === Kind.Gateway);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot avoids unpowered gateway placements', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 421, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  const pylon = slotOf(spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  s.e.built[pylon] = 0;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1 })(s, 0);

  assert.equal(cmds.some((c) => c.t === 'build' && c.kind === Kind.Gateway), false);
});

test('protoss bot places a legal cybernetics core after a completed gateway', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 431, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.CyberneticsCore);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot rebuilds a missing cybernetics core before later tech structures', () => {
  const scenario = botScenario({ seed: 430, factions: [Protoss, Zerg] });
  const base = scenario.pos(scenario.entity(Kind.Nexus, 0));
  scenario.spawn(Kind.Pylon, 0, base.x + fx(120), base.y);
  scenario.spawn(Kind.Gateway, 0, base.x + fx(160), base.y);
  scenario.spawn(Kind.RoboticsFacility, 0, base.x + fx(200), base.y);
  scenario.spawn(Kind.RoboticsSupportBay, 0, base.x + fx(240), base.y);
  scenario.spawn(Kind.Observatory, 0, base.x + fx(280), base.y);
  scenario.spawn(Kind.Stargate, 0, base.x + fx(320), base.y);
  scenario.resources(0, 1_000, 1_000);

  expectBotBuildsLegal(scenario, Protoss, Kind.CyberneticsCore, { barracksTarget: 1, workerTarget: 0 });
});

test('protoss bot respects cybernetics core prerequisite, power, and budget', () => {
  const missingGateway = new Sim({ map: sliceMap(), players: 2, seed: 432, factions: [Protoss, Zerg] });
  const missingState = missingGateway.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 0, workerTarget: 0 })(missingState, 0), Kind.CyberneticsCore), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 433, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.CyberneticsCore), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 434, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  brokeState.players.minerals[0] = Units[Kind.CyberneticsCore]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.CyberneticsCore), false);
});

test('protoss bot places a legal robotics facility after a completed cybernetics core', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 435, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.RoboticsFacility);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects robotics facility prerequisite, power, duplicates, and budget', () => {
  const missingCore = new Sim({ map: sliceMap(), players: 2, seed: 436, factions: [Protoss, Zerg] });
  const missingState = missingCore.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.RoboticsFacility), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 437, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.RoboticsFacility), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 438, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.RoboticsFacility), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 439, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  brokeState.players.minerals[0] = Units[Kind.RoboticsFacility]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.RoboticsFacility), false);
});

test('protoss bot places a legal robotics support bay after a completed robotics facility', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 458, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.RoboticsSupportBay);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects robotics support bay prerequisite, power, duplicates, pending, and budget', () => {
  const missingRobotics = new Sim({ map: sliceMap(), players: 2, seed: 459, factions: [Protoss, Zerg] });
  const missingState = missingRobotics.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.RoboticsSupportBay), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 460, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.RoboticsSupportBay), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 461, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.RoboticsSupportBay), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 462, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.RoboticsSupportBay;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.RoboticsSupportBay), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 463, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  brokeState.players.minerals[0] = Units[Kind.RoboticsSupportBay]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.RoboticsSupportBay), false);
});

test('protoss bot places a legal observatory after a completed robotics facility', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 464, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(s, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.Observatory);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects observatory prerequisite, power, duplicates, pending, and budget', () => {
  const missingRobotics = new Sim({ map: sliceMap(), players: 2, seed: 465, factions: [Protoss, Zerg] });
  const missingState = missingRobotics.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(missingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.Observatory), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 466, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(unpoweredState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.Observatory), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 467, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(duplicateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.Observatory), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 468, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(pendingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.Observatory;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.Observatory), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 469, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(brokeState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  brokeState.players.minerals[0] = Units[Kind.Observatory]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.Observatory), false);
});

test('protoss bot places a legal stargate after a completed cybernetics core', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 440, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(s, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(s, Kind.Observatory, 0, fx(1_400), fx(1_440));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.Stargate);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects stargate prerequisite, power, duplicates, and budget', () => {
  const missingCore = new Sim({ map: sliceMap(), players: 2, seed: 441, factions: [Protoss, Zerg] });
  const missingState = missingCore.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.Stargate), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 442, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.Stargate), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 443, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(duplicateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(duplicateState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.Stargate), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 444, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(pendingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(pendingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.Stargate;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.Stargate), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 445, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(brokeState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(brokeState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  brokeState.players.minerals[0] = Units[Kind.Stargate]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.Stargate), false);
});

test('protoss bot places a legal fleet beacon after a completed stargate', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 470, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(s, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(s, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(s, Kind.Stargate, 0, fx(1_440), fx(1_480));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.FleetBeacon);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects fleet beacon prerequisite, power, duplicates, pending, and budget', () => {
  const missingStargate = new Sim({ map: sliceMap(), players: 2, seed: 471, factions: [Protoss, Zerg] });
  const missingState = missingStargate.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(missingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(missingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(missingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.FleetBeacon), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 472, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(unpoweredState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(unpoweredState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(unpoweredState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.FleetBeacon), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 473, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(duplicateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(duplicateState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(duplicateState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.FleetBeacon), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 474, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(pendingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(pendingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(pendingState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.FleetBeacon;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.FleetBeacon), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 475, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(brokeState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(brokeState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(brokeState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  brokeState.players.minerals[0] = Units[Kind.FleetBeacon]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.FleetBeacon), false);
});

test('protoss bot places a legal citadel of adun after a completed cybernetics core', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 446, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(s, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(s, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(s, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(s, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.CitadelOfAdun);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects citadel prerequisite, power, duplicates, and budget', () => {
  const missingCore = new Sim({ map: sliceMap(), players: 2, seed: 447, factions: [Protoss, Zerg] });
  const missingState = missingCore.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(missingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(missingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(missingState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(missingState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.CitadelOfAdun), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 448, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(unpoweredState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(unpoweredState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(unpoweredState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(unpoweredState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.CitadelOfAdun), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 449, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(duplicateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(duplicateState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(duplicateState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(duplicateState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.CitadelOfAdun), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 450, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(pendingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(pendingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(pendingState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(pendingState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.CitadelOfAdun;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.CitadelOfAdun), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 451, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(brokeState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(brokeState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(brokeState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(brokeState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  brokeState.players.minerals[0] = Units[Kind.CitadelOfAdun]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.CitadelOfAdun), false);
});

test('protoss bot places a legal templar archives after a completed citadel of adun', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 452, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(s, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(s, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(s, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(s, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(s, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.TemplarArchives);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects templar archives prerequisite, power, duplicates, pending, and budget', () => {
  const missingCitadel = new Sim({ map: sliceMap(), players: 2, seed: 453, factions: [Protoss, Zerg] });
  const missingState = missingCitadel.fullState();
  spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(missingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(missingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(missingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(missingState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(missingState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingState, 0), Kind.TemplarArchives), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 454, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(unpoweredState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(unpoweredState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(unpoweredState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(unpoweredState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(unpoweredState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.TemplarArchives), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 455, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(duplicateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(duplicateState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(duplicateState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(duplicateState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(duplicateState, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.TemplarArchives), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 456, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(pendingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(pendingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(pendingState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(pendingState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(pendingState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.TemplarArchives;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.TemplarArchives), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 457, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(brokeState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(brokeState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(brokeState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(brokeState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(brokeState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  brokeState.players.minerals[0] = Units[Kind.TemplarArchives]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.TemplarArchives), false);
});

test('protoss bot places a legal arbiter tribunal after stargate and templar archives', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 476, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(s, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(s, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(s, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(s, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(s, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(s, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(s, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(s, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(s, 0);
  const build = findBuild(cmds, Kind.ArbiterTribunal);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot respects arbiter tribunal prerequisites, power, duplicates, pending, and budget', () => {
  const missingStargate = new Sim({ map: sliceMap(), players: 2, seed: 477, factions: [Protoss, Zerg] });
  const missingStargateState = missingStargate.fullState();
  spawnUnit(missingStargateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingStargateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingStargateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(missingStargateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(missingStargateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(missingStargateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(missingStargateState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(missingStargateState, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  missingStargateState.players.minerals[0] = 1_000;
  missingStargateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingStargateState, 0), Kind.ArbiterTribunal), false);

  const missingArchives = new Sim({ map: sliceMap(), players: 2, seed: 478, factions: [Protoss, Zerg] });
  const missingArchivesState = missingArchives.fullState();
  spawnUnit(missingArchivesState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(missingArchivesState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(missingArchivesState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(missingArchivesState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(missingArchivesState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(missingArchivesState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(missingArchivesState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(missingArchivesState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(missingArchivesState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  missingArchivesState.players.minerals[0] = 1_000;
  missingArchivesState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(missingArchivesState, 0), Kind.ArbiterTribunal), false);

  const unpowered = new Sim({ map: sliceMap(), players: 2, seed: 479, factions: [Protoss, Zerg] });
  const unpoweredState = unpowered.fullState();
  const pylon = slotOf(spawnUnit(unpoweredState, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  unpoweredState.e.built[pylon] = 0;
  spawnUnit(unpoweredState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(unpoweredState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(unpoweredState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(unpoweredState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(unpoweredState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(unpoweredState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(unpoweredState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(unpoweredState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(unpoweredState, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  unpoweredState.players.minerals[0] = 1_000;
  unpoweredState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(unpoweredState, 0), Kind.ArbiterTribunal), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 480, factions: [Protoss, Zerg] });
  const duplicateState = duplicate.fullState();
  spawnUnit(duplicateState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(duplicateState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(duplicateState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(duplicateState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(duplicateState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(duplicateState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(duplicateState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(duplicateState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(duplicateState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(duplicateState, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  spawnUnit(duplicateState, Kind.ArbiterTribunal, 0, fx(1_600), fx(1_640));
  duplicateState.players.minerals[0] = 1_000;
  duplicateState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(duplicateState, 0), Kind.ArbiterTribunal), false);

  const pending = new Sim({ map: sliceMap(), players: 2, seed: 481, factions: [Protoss, Zerg] });
  const pendingState = pending.fullState();
  spawnUnit(pendingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(pendingState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(pendingState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(pendingState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(pendingState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(pendingState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(pendingState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(pendingState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(pendingState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(pendingState, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  const worker = slotOf(spawnUnit(pendingState, Kind.Probe, 0, fx(1_160), fx(1_160)));
  pendingState.e.buildKind[worker] = Kind.ArbiterTribunal;
  pendingState.players.minerals[0] = 1_000;
  pendingState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(pendingState, 0), Kind.ArbiterTribunal), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 482, factions: [Protoss, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Pylon, 0, fx(1_200), fx(1_200));
  spawnUnit(brokeState, Kind.Gateway, 0, fx(1_240), fx(1_280));
  spawnUnit(brokeState, Kind.CyberneticsCore, 0, fx(1_280), fx(1_320));
  spawnUnit(brokeState, Kind.RoboticsFacility, 0, fx(1_320), fx(1_360));
  spawnUnit(brokeState, Kind.RoboticsSupportBay, 0, fx(1_360), fx(1_400));
  spawnUnit(brokeState, Kind.Observatory, 0, fx(1_400), fx(1_440));
  spawnUnit(brokeState, Kind.Stargate, 0, fx(1_440), fx(1_480));
  spawnUnit(brokeState, Kind.FleetBeacon, 0, fx(1_480), fx(1_520));
  spawnUnit(brokeState, Kind.CitadelOfAdun, 0, fx(1_520), fx(1_560));
  spawnUnit(brokeState, Kind.TemplarArchives, 0, fx(1_560), fx(1_600));
  brokeState.players.minerals[0] = Units[Kind.ArbiterTribunal]!.minerals - 1;
  brokeState.players.gas[0] = 1_000;

  assert.equal(hasBuild(createBot(Protoss, { barracksTarget: 1, workerTarget: 0 })(brokeState, 0), Kind.ArbiterTribunal), false);
});

const readyProtossResearchScenario = (
  seed: number,
  producerKind: number,
  completedBefore: readonly number[] = [],
  prerequisiteKinds: readonly number[] = [],
): { sim: Sim; producer: number; pylon: number } => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  const pylon = spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  for (let i = 0; i < prerequisiteKinds.length; i++) {
    spawnUnit(s, prerequisiteKinds[i]!, 0, fx(1_160 + i * 40), fx(1_260));
  }
  const producer = spawnUnit(s, producerKind, 0, fx(1_260), fx(1_220));
  s.players.minerals[0] = 5_000;
  s.players.gas[0] = 5_000;
  for (const tech of completedBefore) completeTech(sim, 0, tech);
  return { sim, producer, pylon };
};

const readyZergResearchScenario = (
  seed: number,
  producerKind: number,
  completedBefore: readonly number[] = [],
  prerequisiteKinds: readonly number[] = [],
): { sim: Sim; producer: number } => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.Hatchery, 0));
  const pool = spawnUnit(s, Kind.SpawningPool, 0, base.x + fx(120), base.y);
  for (let i = 0; i < prerequisiteKinds.length; i++) {
    const kind = prerequisiteKinds[i]!;
    if (kind === Kind.SpawningPool) continue;
    spawnUnit(s, kind, 0, base.x + fx(200 + i * 40), base.y + fx(40));
  }
  const producer = producerKind === Kind.Hatchery
    ? findEntity(sim, Kind.Hatchery, 0)
    : producerKind === Kind.SpawningPool
    ? pool
    : spawnUnit(s, producerKind, 0, base.x + fx(160), base.y);
  s.players.minerals[0] = 5_000;
  s.players.gas[0] = 5_000;
  for (const tech of completedBefore) completeTech(sim, 0, tech);
  return { sim, producer };
};

const readyTerranResearchScenario = (
  seed: number,
  producerKind: number,
  completedBefore: readonly number[] = [],
): { sim: Sim; producer: number } => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  let producer: number;
  const parentKind = addonParentKind(producerKind);
  if (parentKind !== Kind.None) {
    const parent = spawnUnit(s, parentKind, 0, base.x + fx(180), base.y);
    producer = spawnUnit(s, producerKind, 0, base.x + fx(260), base.y);
    linkAddon(s, parent, producer);
  } else {
    producer = spawnUnit(s, producerKind, 0, base.x + fx(180), base.y);
  }
  if (producerKind === Kind.ScienceFacility) blockAddonPlacement(s, producer, Kind.CovertOps);
  s.players.minerals[0] = 2_000;
  s.players.gas[0] = 2_000;
  for (const tech of completedBefore) completeTech(sim, 0, tech);
  return { sim, producer };
};

const testTerranResearchMacro = ({
  tech,
  producerKind,
  firstSeed,
  completedBefore = [],
}: {
  tech: number;
  producerKind: number;
  firstSeed: number;
  completedBefore?: readonly number[];
}): void => {
  const bot = createBot(Terran, { barracksTarget: 0, workerTarget: 0 });
  const techName = TechDefs[tech]!.name;
  const producerName = Units[producerKind]!.name;
  const ready = (seed: number): ReturnType<typeof readyTerranResearchScenario> =>
    readyTerranResearchScenario(seed, producerKind, completedBefore);

  test(`terran bot researches ${techName} from a completed ${producerName}`, () => {
    const { sim } = ready(firstSeed);
    const s = sim.fullState();

    const cmds = bot(s, 0);
    const research = findResearch(cmds, tech);

    assert.ok(research);
    assert.deepEqual(validateCommand(s, 0, research), { ok: true });
  });

  test(`terran bot respects ${techName} producer, duplicate, queue, and budget gates`, () => {
    const missingProducer = new Sim({ map: sliceMap(), players: 2, seed: firstSeed + 1, factions: [Terran, Zerg] });
    const missingState = missingProducer.fullState();
    missingState.players.minerals[0] = 2_000;
    missingState.players.gas[0] = 2_000;
    for (const prerequisite of completedBefore) completeTech(missingProducer, 0, prerequisite);

    assert.equal(hasResearch(bot(missingState, 0), tech), false);

    const incomplete = ready(firstSeed + 2);
    const incompleteState = incomplete.sim.fullState();
    incompleteState.e.built[slotOf(incomplete.producer)] = 0;

    assert.equal(hasResearch(bot(incompleteState, 0), tech), false);

    const completed = ready(firstSeed + 3);
    completeTech(completed.sim, 0, tech);

    assert.equal(hasResearch(bot(completed.sim.fullState(), 0), tech), false);

    const inProgress = ready(firstSeed + 4);
    const inProgressState = inProgress.sim.fullState();
    inProgressState.e.researchKind[slotOf(inProgress.producer)] = tech;
    inProgressState.e.researchTimer[slotOf(inProgress.producer)] = 10;

    assert.equal(hasResearch(bot(inProgressState, 0), tech), false);

    const busy = ready(firstSeed + 5);
    const busyState = busy.sim.fullState();
    busyState.e.researchKind[slotOf(busy.producer)] = tech === Tech.StimPack ? Tech.U238Shells : Tech.StimPack;
    busyState.e.researchTimer[slotOf(busy.producer)] = 10;

    assert.equal(hasResearch(bot(busyState, 0), tech), false);

    const broke = ready(firstSeed + 6);
    const brokeState = broke.sim.fullState();
    brokeState.players.minerals[0] = TechDefs[tech]!.minerals[0]! - 1;
    brokeState.players.gas[0] = 2_000;

    assert.equal(hasResearch(bot(brokeState, 0), tech), false);

    const gasBroke = ready(firstSeed + 7);
    const gasBrokeState = gasBroke.sim.fullState();
    gasBrokeState.players.minerals[0] = 2_000;
    gasBrokeState.players.gas[0] = TechDefs[tech]!.gas[0]! - 1;

    assert.equal(hasResearch(bot(gasBrokeState, 0), tech), false);
  });
};

const terranResearchCases = [
  { tech: Tech.StimPack, producerKind: Kind.Academy },
  { tech: Tech.U238Shells, producerKind: Kind.Academy, completedBefore: [Tech.StimPack] },
  { tech: Tech.Restoration, producerKind: Kind.Academy, completedBefore: [Tech.StimPack, Tech.U238Shells] },
  { tech: Tech.OpticalFlare, producerKind: Kind.Academy, completedBefore: [Tech.StimPack, Tech.U238Shells, Tech.Restoration] },
  { tech: Tech.CaduceusReactor, producerKind: Kind.Academy, completedBefore: [Tech.StimPack, Tech.U238Shells, Tech.Restoration, Tech.OpticalFlare] },
  { tech: Tech.SpiderMines, producerKind: Kind.MachineShop },
  { tech: Tech.SiegeTech, producerKind: Kind.MachineShop, completedBefore: [Tech.SpiderMines] },
  { tech: Tech.CharonBoosters, producerKind: Kind.MachineShop, completedBefore: [Tech.SpiderMines, Tech.SiegeTech] },
  { tech: Tech.IonThrusters, producerKind: Kind.MachineShop, completedBefore: [Tech.SpiderMines, Tech.SiegeTech, Tech.CharonBoosters] },
  { tech: Tech.PersonnelCloaking, producerKind: Kind.CovertOps },
  { tech: Tech.Lockdown, producerKind: Kind.CovertOps, completedBefore: [Tech.PersonnelCloaking] },
  { tech: Tech.OcularImplants, producerKind: Kind.CovertOps, completedBefore: [Tech.PersonnelCloaking, Tech.Lockdown] },
  { tech: Tech.MoebiusReactor, producerKind: Kind.CovertOps, completedBefore: [Tech.PersonnelCloaking, Tech.Lockdown, Tech.OcularImplants] },
  { tech: Tech.CloakingField, producerKind: Kind.ControlTower },
  { tech: Tech.ApolloReactor, producerKind: Kind.ControlTower, completedBefore: [Tech.CloakingField] },
  { tech: Tech.YamatoCannon, producerKind: Kind.PhysicsLab },
  { tech: Tech.ColossusReactor, producerKind: Kind.PhysicsLab, completedBefore: [Tech.YamatoCannon] },
  { tech: Tech.EMPShockwave, producerKind: Kind.ScienceFacility },
  { tech: Tech.Irradiate, producerKind: Kind.ScienceFacility, completedBefore: [Tech.EMPShockwave] },
  { tech: Tech.TitanReactor, producerKind: Kind.ScienceFacility, completedBefore: [Tech.EMPShockwave, Tech.Irradiate] },
  { tech: Tech.InfantryWeapons, producerKind: Kind.EngineeringBay },
  { tech: Tech.InfantryArmor, producerKind: Kind.EngineeringBay, completedBefore: [Tech.InfantryWeapons] },
  { tech: Tech.VehicleWeapons, producerKind: Kind.Armory },
  { tech: Tech.VehiclePlating, producerKind: Kind.Armory, completedBefore: [Tech.VehicleWeapons] },
  { tech: Tech.ShipWeapons, producerKind: Kind.Armory, completedBefore: [Tech.VehicleWeapons, Tech.VehiclePlating] },
  { tech: Tech.ShipPlating, producerKind: Kind.Armory, completedBefore: [Tech.VehicleWeapons, Tech.VehiclePlating, Tech.ShipWeapons] },
] as const;

for (let i = 0; i < terranResearchCases.length; i++) {
  testTerranResearchMacro({ ...terranResearchCases[i]!, firstSeed: 600 + i * 8 });
}

type ResearchMacroCase = {
  tech: number;
  producerKind: number;
  prerequisiteKinds?: readonly number[];
};

const busyTechFor = (tech: number): number => {
  const def = TechDefs[tech]!;
  const producer = def.producers[0]!;
  const other = Object.keys(TechDefs)
    .map(Number)
    .find((candidate) => candidate !== tech && TechDefs[candidate]!.producers.includes(producer));
  return other ?? Tech.StimPack;
};

const completedResearchBefore = (
  cases: readonly ResearchMacroCase[],
  index: number,
): number[] => cases.slice(0, index).map((item) => item.tech);

const testZergResearchMacro = (
  item: ResearchMacroCase,
  firstSeed: number,
  completedBefore: readonly number[],
): void => {
  const { tech, producerKind, prerequisiteKinds = [] } = item;
  const bot = createBot(Zerg, { barracksTarget: 0, workerTarget: 0 });
  const label = TechDefs[tech]!.name;
  const producerLabel = Units[producerKind]!.name;
  const ready = (seed: number): ReturnType<typeof readyZergResearchScenario> =>
    readyZergResearchScenario(seed, producerKind, completedBefore, prerequisiteKinds);

  test(`zerg bot researches ${label} from a completed ${producerLabel}`, () => {
    const { sim } = ready(firstSeed);
    const s = sim.fullState();

    const cmds = bot(s, 0);
    const research = findResearch(cmds, tech);

    assert.ok(research);
    assert.deepEqual(validateCommand(s, 0, research), { ok: true });
  });

  test(`zerg bot respects ${label} producer, duplicate, queue, and budget gates`, () => {
    const missingProducer = new Sim({ map: sliceMap(), players: 2, seed: firstSeed + 1, factions: [Zerg, Terran] });
    const missingState = missingProducer.fullState();
    const base = entityPos(missingProducer, findEntity(missingProducer, Kind.Hatchery, 0));
    for (let i = 0; i < prerequisiteKinds.length; i++) {
      spawnUnit(missingState, prerequisiteKinds[i]!, 0, base.x + fx(200 + i * 40), base.y + fx(40));
    }
    missingState.players.minerals[0] = 5_000;
    missingState.players.gas[0] = 5_000;
    for (const prerequisite of completedBefore) completeTech(missingProducer, 0, prerequisite);

    if (producerKind !== Kind.Hatchery) {
      assert.equal(hasResearch(bot(missingState, 0), tech), false);
    }

    const incomplete = ready(firstSeed + 2);
    const incompleteState = incomplete.sim.fullState();
    incompleteState.e.built[slotOf(incomplete.producer)] = 0;

    assert.equal(hasResearch(bot(incompleteState, 0), tech), false);

    const completed = ready(firstSeed + 3);
    completeTech(completed.sim, 0, tech);

    assert.equal(hasResearch(bot(completed.sim.fullState(), 0), tech), false);

    const inProgress = ready(firstSeed + 4);
    const inProgressState = inProgress.sim.fullState();
    inProgressState.e.researchKind[slotOf(inProgress.producer)] = tech;
    inProgressState.e.researchTimer[slotOf(inProgress.producer)] = 10;

    assert.equal(hasResearch(bot(inProgressState, 0), tech), false);

    const busy = ready(firstSeed + 5);
    const busyState = busy.sim.fullState();
    busyState.e.researchKind[slotOf(busy.producer)] = busyTechFor(tech);
    busyState.e.researchTimer[slotOf(busy.producer)] = 10;

    assert.equal(hasResearch(bot(busyState, 0), tech), false);

    const broke = ready(firstSeed + 6);
    const brokeState = broke.sim.fullState();
    brokeState.players.minerals[0] = TechDefs[tech]!.minerals[0]! - 1;
    brokeState.players.gas[0] = 5_000;

    assert.equal(hasResearch(bot(brokeState, 0), tech), false);

    const gasBroke = ready(firstSeed + 7);
    const gasBrokeState = gasBroke.sim.fullState();
    gasBrokeState.players.minerals[0] = 5_000;
    gasBrokeState.players.gas[0] = TechDefs[tech]!.gas[0]! - 1;

    assert.equal(hasResearch(bot(gasBrokeState, 0), tech), false);
  });
};

const zergResearchCases = [
  { tech: Tech.Burrow, producerKind: Kind.Hatchery },
  { tech: Tech.MetabolicBoost, producerKind: Kind.SpawningPool },
  { tech: Tech.LurkerAspect, producerKind: Kind.HydraliskDen },
  { tech: Tech.GroovedSpines, producerKind: Kind.HydraliskDen },
  { tech: Tech.MuscularAugments, producerKind: Kind.HydraliskDen },
  { tech: Tech.PneumatizedCarapace, producerKind: Kind.Lair },
  { tech: Tech.VentralSacs, producerKind: Kind.Lair },
  { tech: Tech.Antennae, producerKind: Kind.Lair },
  { tech: Tech.MeleeAttacks, producerKind: Kind.EvolutionChamber },
  { tech: Tech.MissileAttacks, producerKind: Kind.EvolutionChamber },
  { tech: Tech.Carapace, producerKind: Kind.EvolutionChamber },
  { tech: Tech.FlyerAttacks, producerKind: Kind.Spire },
  { tech: Tech.FlyerCarapace, producerKind: Kind.Spire },
  { tech: Tech.GameteMeiosis, producerKind: Kind.QueensNest },
  { tech: Tech.Ensnare, producerKind: Kind.QueensNest },
  { tech: Tech.SpawnBroodling, producerKind: Kind.QueensNest },
  { tech: Tech.Plague, producerKind: Kind.DefilerMound },
  { tech: Tech.Consume, producerKind: Kind.DefilerMound },
  { tech: Tech.MetasynapticNode, producerKind: Kind.DefilerMound },
  { tech: Tech.AnabolicSynthesis, producerKind: Kind.UltraliskCavern },
  { tech: Tech.ChitinousPlating, producerKind: Kind.UltraliskCavern },
  { tech: Tech.AdrenalGlands, producerKind: Kind.SpawningPool, prerequisiteKinds: [Kind.Hive] },
] as const;

for (let i = 0; i < zergResearchCases.length; i++) {
  testZergResearchMacro(zergResearchCases[i]!, 506 + i * 8, completedResearchBefore(zergResearchCases, i));
}

test('zerg bot waits for lurker aspect before grooved spines', () => {
  const { sim } = readyZergResearchScenario(522, Kind.HydraliskDen, [Tech.Burrow, Tech.MetabolicBoost]);
  const cmds = createBot(Zerg, { barracksTarget: 0, workerTarget: 0 })(sim.fullState(), 0);

  assert.equal(hasResearch(cmds, Tech.GroovedSpines), false);
  assert.equal(hasResearch(cmds, Tech.LurkerAspect), true);
});

test('zerg bot waits for lurker aspect and grooved spines before muscular augments', () => {
  const missingBoth = readyZergResearchScenario(531, Kind.HydraliskDen, [Tech.Burrow, Tech.MetabolicBoost]);
  const missingBothCmds = createBot(Zerg, { barracksTarget: 0, workerTarget: 0 })(missingBoth.sim.fullState(), 0);

  assert.equal(hasResearch(missingBothCmds, Tech.MuscularAugments), false);
  assert.equal(hasResearch(missingBothCmds, Tech.LurkerAspect), true);

  const missingGrooved = readyZergResearchScenario(532, Kind.HydraliskDen, [Tech.Burrow, Tech.MetabolicBoost, Tech.LurkerAspect]);
  const missingGroovedCmds = createBot(Zerg, { barracksTarget: 0, workerTarget: 0 })(missingGrooved.sim.fullState(), 0);

  assert.equal(hasResearch(missingGroovedCmds, Tech.MuscularAugments), false);
  assert.equal(hasResearch(missingGroovedCmds, Tech.GroovedSpines), true);
});

const testProtossResearchMacro = (
  item: ResearchMacroCase,
  firstSeed: number,
  completedBefore: readonly number[],
): void => {
  const { tech, producerKind, prerequisiteKinds = [] } = item;
  const bot = createBot(Protoss, { barracksTarget: 0, workerTarget: 0 });
  const label = TechDefs[tech]!.name;
  const producerLabel = Units[producerKind]!.name;
  const ready = (seed: number): ReturnType<typeof readyProtossResearchScenario> =>
    readyProtossResearchScenario(seed, producerKind, completedBefore, prerequisiteKinds);

  test(`protoss bot researches ${label} from a completed powered ${producerLabel}`, () => {
    const { sim } = ready(firstSeed);
    const s = sim.fullState();

    const cmds = bot(s, 0);
    const research = findResearch(cmds, tech);

    assert.ok(research);
    assert.deepEqual(validateCommand(s, 0, research), { ok: true });
  });

  test(`protoss bot respects ${label} producer, power, duplicate, queue, and budget gates`, () => {
    const missingProducer = new Sim({ map: sliceMap(), players: 2, seed: firstSeed + 1, factions: [Protoss, Zerg] });
    const missingState = missingProducer.fullState();
    spawnUnit(missingState, Kind.Pylon, 0, fx(1_200), fx(1_200));
    for (let i = 0; i < prerequisiteKinds.length; i++) {
      spawnUnit(missingState, prerequisiteKinds[i]!, 0, fx(1_160 + i * 40), fx(1_260));
    }
    missingState.players.minerals[0] = 5_000;
    missingState.players.gas[0] = 5_000;
    for (const prerequisite of completedBefore) completeTech(missingProducer, 0, prerequisite);

    assert.equal(hasResearch(bot(missingState, 0), tech), false);

    const unpowered = ready(firstSeed + 2);
    const unpoweredState = unpowered.sim.fullState();
    unpoweredState.e.built[slotOf(unpowered.pylon)] = 0;

    assert.equal(hasResearch(bot(unpoweredState, 0), tech), false);

    const incomplete = ready(firstSeed + 3);
    const incompleteState = incomplete.sim.fullState();
    incompleteState.e.built[slotOf(incomplete.producer)] = 0;

    assert.equal(hasResearch(bot(incompleteState, 0), tech), false);

    const completed = ready(firstSeed + 4);
    completeTech(completed.sim, 0, tech);

    assert.equal(hasResearch(bot(completed.sim.fullState(), 0), tech), false);

    const inProgress = ready(firstSeed + 5);
    const inProgressState = inProgress.sim.fullState();
    inProgressState.e.researchKind[slotOf(inProgress.producer)] = tech;
    inProgressState.e.researchTimer[slotOf(inProgress.producer)] = 10;

    assert.equal(hasResearch(bot(inProgressState, 0), tech), false);

    const busy = ready(firstSeed + 6);
    const busyState = busy.sim.fullState();
    busyState.e.researchKind[slotOf(busy.producer)] = busyTechFor(tech);
    busyState.e.researchTimer[slotOf(busy.producer)] = 10;

    assert.equal(hasResearch(bot(busyState, 0), tech), false);

    const broke = ready(firstSeed + 7);
    const brokeState = broke.sim.fullState();
    brokeState.players.minerals[0] = TechDefs[tech]!.minerals[0]! - 1;
    brokeState.players.gas[0] = 5_000;

    assert.equal(hasResearch(bot(brokeState, 0), tech), false);
  });
};

const protossResearchCases = [
  { tech: Tech.SingularityCharge, producerKind: Kind.CyberneticsCore },
  { tech: Tech.GroundWeapons, producerKind: Kind.Forge },
  { tech: Tech.GroundArmor, producerKind: Kind.Forge },
  { tech: Tech.PlasmaShields, producerKind: Kind.Forge },
  { tech: Tech.AirWeapons, producerKind: Kind.CyberneticsCore },
  { tech: Tech.AirArmor, producerKind: Kind.CyberneticsCore },
  { tech: Tech.LegEnhancements, producerKind: Kind.CitadelOfAdun },
  { tech: Tech.PsionicStorm, producerKind: Kind.TemplarArchives },
  { tech: Tech.Hallucination, producerKind: Kind.TemplarArchives },
  { tech: Tech.KhaydarinAmulet, producerKind: Kind.TemplarArchives },
  { tech: Tech.Maelstrom, producerKind: Kind.TemplarArchives },
  { tech: Tech.MindControl, producerKind: Kind.TemplarArchives },
  { tech: Tech.ArgusTalisman, producerKind: Kind.TemplarArchives },
  { tech: Tech.StasisField, producerKind: Kind.ArbiterTribunal },
  { tech: Tech.Recall, producerKind: Kind.ArbiterTribunal },
  { tech: Tech.KhaydarinCore, producerKind: Kind.ArbiterTribunal },
  { tech: Tech.GraviticDrive, producerKind: Kind.RoboticsSupportBay },
  { tech: Tech.ReaverCapacity, producerKind: Kind.RoboticsSupportBay },
  { tech: Tech.ScarabDamage, producerKind: Kind.RoboticsSupportBay },
  { tech: Tech.SensorArray, producerKind: Kind.Observatory },
  { tech: Tech.GraviticBoosters, producerKind: Kind.Observatory },
  { tech: Tech.GraviticThrusters, producerKind: Kind.FleetBeacon },
  { tech: Tech.CarrierCapacity, producerKind: Kind.FleetBeacon },
  { tech: Tech.ApialSensors, producerKind: Kind.FleetBeacon },
  { tech: Tech.ArgusJewel, producerKind: Kind.FleetBeacon },
  { tech: Tech.DisruptionWeb, producerKind: Kind.FleetBeacon },
] as const;

for (let i = 0; i < protossResearchCases.length; i++) {
  testProtossResearchMacro(protossResearchCases[i]!, 483 + i * 8, completedResearchBefore(protossResearchCases, i));
}

test('bot unsieges tanks when the focus is inside minimum range', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 402 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const tank = spawnUnit(s, Kind.SiegeTankSieged, 0, base.x, base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(20), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === tank && c.kind === Kind.SiegeTank));
});

test('bot does not Stim badly wounded units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 41 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const marine = spawnUnit(s, Kind.Marine, 0, base.x + fx(20), base.y);
  s.e.hp[slotOf(marine)] = 20;
  spawnUnit(s, Kind.Marine, 1, base.x + fx(50), base.y);
  const bot = createBot(Terran);

  const cmds = bot(s, 0);

  assert.ok(!cmds.some((c) => c.t === 'ability' && c.unit === marine && c.ability === Ability.StimPack));
});

test('bot casts EMP on valuable shield and energy clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 42 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x - fx(120), base.y);
  s.e.energy[slotOf(vessel)] = 100;
  grant(sim, 0, Tech.EMPShockwave);
  spawnUnit(s, Kind.Zealot, 1, base.x + fx(30), base.y);
  const templar = spawnUnit(s, Kind.HighTemplar, 1, base.x + fx(38), base.y);
  s.e.energy[slotOf(templar)] = 75;
  const bot = createBot(Terran);

  const cmds = bot(s, 0);

  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === vessel && c.ability === Ability.EMPShockwave));
});

test('bot preserves tactical policy priority for multi-spell casters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 421 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x - fx(120), base.y);
  const goliath = spawnUnit(s, Kind.Goliath, 0, base.x + fx(20), base.y);
  s.e.energy[slotOf(vessel)] = 100;
  s.e.hp[slotOf(goliath)] = 50;
  grant(sim, 0, Tech.EMPShockwave);
  spawnUnit(s, Kind.Vulture, 1, base.x + fx(60), base.y);
  const templar = spawnUnit(s, Kind.HighTemplar, 1, base.x + fx(38), base.y);
  s.e.energy[slotOf(templar)] = 75;

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, vessel, Ability.EMPShockwave));
  assert.ok(!hasAbility(cmds, vessel, Ability.DefensiveMatrix));
});

test('bot casts Storm on enemy clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 43 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(250), fx(400));
  s.e.energy[slotOf(templar)] = 75;
  grant(sim, 0, Tech.PsionicStorm);
  spawnUnit(s, Kind.Medic, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Medic, 1, fx(438), fx(400));
  const bot = createBot(Protoss, { attackThreshold: 99 });

  const cmds = bot(s, 0);

  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === templar && c.ability === Ability.PsionicStorm));
});

test('bot casts Hallucination on valuable friendly combat units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 60 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(390), fx(400));
  const archon = spawnUnit(s, Kind.Archon, 0, fx(420), fx(400));
  s.e.energy[slotOf(templar)] = 100;
  spawnUnit(s, Kind.Ultralisk, 1, fx(450), fx(400));
  grant(sim, 0, Tech.Hallucination);

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, templar, Ability.Hallucination));
  assert.ok(cmds.some((c) => c.t === 'ability' && c.target === archon));
});

test('bot avoids Storm when friendly fire dominates the target area', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 44 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(250), fx(400));
  s.e.energy[slotOf(templar)] = 75;
  grant(sim, 0, Tech.PsionicStorm);
  spawnUnit(s, Kind.Medic, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Medic, 0, fx(432), fx(400));
  spawnUnit(s, Kind.Medic, 0, fx(436), fx(400));
  const bot = createBot(Protoss, { attackThreshold: 99 });

  const cmds = bot(s, 0);

  assert.ok(!cmds.some((c) => c.t === 'ability' && c.ability === Ability.PsionicStorm));
});

test('bot casts Defensive Matrix on a threatened damaged ally', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 45 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x - fx(80), base.y);
  const goliath = spawnUnit(s, Kind.Goliath, 0, base.x + fx(20), base.y);
  s.e.energy[slotOf(vessel)] = 100;
  s.e.hp[slotOf(goliath)] = 50;
  spawnUnit(s, Kind.Vulture, 1, base.x + fx(60), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, vessel, Ability.DefensiveMatrix));
});

test('bot uses Medic support abilities for wounded and disabled allies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 55 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const medic = spawnUnit(s, Kind.Medic, 0, base.x + fx(10), base.y);
  const marine = spawnUnit(s, Kind.Marine, 0, base.x + fx(24), base.y);
  s.e.hp[slotOf(marine)] = 20;
  s.e.energy[slotOf(medic)] = 50;
  spawnUnit(s, Kind.Marine, 1, base.x + fx(50), base.y);

  let cmds = createBot(Terran)(s, 0);
  assert.ok(hasAbility(cmds, medic, Ability.Heal));

  s.e.hp[slotOf(marine)] = 40;
  s.e.lockdownTimer[slotOf(marine)] = 100;
  grant(sim, 0, Tech.Restoration);
  cmds = createBot(Terran)(s, 0);
  assert.ok(hasAbility(cmds, medic, Ability.Restoration));
});

test('bot uses Optical Flare on valuable enemy vision units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 56 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const medic = spawnUnit(s, Kind.Medic, 0, base.x, base.y);
  s.e.energy[slotOf(medic)] = 75;
  spawnUnit(s, Kind.ScienceVessel, 1, base.x + fx(50), base.y);
  grant(sim, 0, Tech.OpticalFlare);

  const cmds = createBot(Terran)(s, 0);
  assert.ok(hasAbility(cmds, medic, Ability.OpticalFlare));
});

test('bot casts Irradiate on biological clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 46 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x + fx(180), base.y);
  s.e.energy[slotOf(vessel)] = 75;
  grant(sim, 0, Tech.Irradiate);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(230), base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(238), base.y);

  const cmds = createBot(Terran, { attackThreshold: 0 })(s, 0);

  assert.ok(hasAbility(cmds, vessel, Ability.Irradiate));
});

test('bot casts Lockdown on valuable mechanical enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 47 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const ghost = spawnUnit(s, Kind.Ghost, 0, base.x - fx(60), base.y);
  s.e.energy[slotOf(ghost)] = 100;
  grant(sim, 0, Tech.Lockdown);
  spawnUnit(s, Kind.Goliath, 1, base.x + fx(30), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, ghost, Ability.Lockdown));
});

test('bot casts Yamato on high-value targets', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 48 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const bc = spawnUnit(s, Kind.Battlecruiser, 0, base.x - fx(80), base.y);
  s.e.energy[slotOf(bc)] = 150;
  grant(sim, 0, Tech.YamatoCannon);
  spawnUnit(s, Kind.Ultralisk, 1, base.x + fx(60), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, bc, Ability.YamatoGun));
});

test('bot launches nukes at high-value enemy clusters when a missile is ready', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 481 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const ghost = spawnUnit(s, Kind.Ghost, 0, base.x + fx(240), base.y);
  const commandCenter = findEntity(sim, Kind.CommandCenter, 0);
  const silo = spawnUnit(s, Kind.NuclearSilo, 0, base.x + fx(80), base.y);
  linkAddon(s, commandCenter, silo);
  s.e.specialAmmo[slotOf(silo)] = 1;
  spawnUnit(s, Kind.CommandCenter, 1, base.x + fx(500), base.y);
  spawnUnit(s, Kind.SupplyDepot, 1, base.x + fx(520), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, ghost, Ability.NuclearStrike));
});

test('bot does not launch nukes without ready missile ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 482 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const ghost = spawnUnit(s, Kind.Ghost, 0, base.x, base.y);
  spawnUnit(s, Kind.CommandCenter, 1, base.x + fx(260), base.y);
  spawnUnit(s, Kind.SupplyDepot, 1, base.x + fx(280), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(!hasAbility(cmds, ghost, Ability.NuclearStrike));
});

test('bot casts Feedback on energy-heavy enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 49 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(360), fx(400));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 1, fx(430), fx(400));
  s.e.energy[slotOf(archon)] = 50;
  s.e.energy[slotOf(vessel)] = 100;

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, archon, Ability.Feedback));
});

test('bot casts Mind Control on high-value enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 57 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(360), fx(400));
  s.e.energy[slotOf(archon)] = 150;
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  grant(sim, 0, Tech.MindControl);

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, archon, Ability.MindControl));
});

test('bot recalls distant friendly combat clusters into an Arbiter fight', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 58 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const arbiter = spawnUnit(s, Kind.Arbiter, 0, fx(420), fx(400));
  s.e.energy[slotOf(arbiter)] = 150;
  spawnUnit(s, Kind.Zealot, 0, fx(100), fx(100));
  spawnUnit(s, Kind.Zealot, 0, fx(108), fx(100));
  spawnUnit(s, Kind.Zealot, 0, fx(116), fx(100));
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  grant(sim, 0, Tech.Recall);

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, arbiter, Ability.Recall));
});

test('bot recharges damaged Protoss shields with Shield Batteries', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 581 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  spawnUnit(s, Kind.Pylon, 0, fx(360), fx(400));
  const battery = spawnUnit(s, Kind.ShieldBattery, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 0, fx(430), fx(400));
  s.e.energy[slotOf(battery)] = 50;
  s.e.shield[slotOf(zealot)] = 20;
  spawnUnit(s, Kind.Ultralisk, 1, fx(450), fx(400));

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, battery, Ability.ShieldRecharge));
});

test('bot casts Protoss area control abilities on clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 50 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(360), fx(400));
  const arbiter = spawnUnit(s, Kind.Arbiter, 0, fx(365), fx(410));
  const corsair = spawnUnit(s, Kind.Corsair, 0, fx(370), fx(390));
  s.e.energy[slotOf(archon)] = 100;
  s.e.energy[slotOf(arbiter)] = 100;
  s.e.energy[slotOf(corsair)] = 125;
  grant(sim, 0, Tech.Maelstrom);
  grant(sim, 0, Tech.StasisField);
  grant(sim, 0, Tech.DisruptionWeb);
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Ultralisk, 1, fx(438), fx(400));

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, archon, Ability.Maelstrom));
  assert.ok(hasAbility(cmds, arbiter, Ability.StasisField));
  assert.ok(hasAbility(cmds, corsair, Ability.DisruptionWeb));
});

test('bot casts Queen abilities on legal targets and clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 51 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const queenA = spawnUnit(s, Kind.Queen, 0, fx(360), fx(400));
  const queenB = spawnUnit(s, Kind.Queen, 0, fx(365), fx(410));
  s.e.energy[slotOf(queenA)] = 150;
  s.e.energy[slotOf(queenB)] = 75;
  grant(sim, 0, Tech.SpawnBroodling);
  grant(sim, 0, Tech.Ensnare);
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Mutalisk, 1, fx(440), fx(410));
  spawnUnit(s, Kind.Mutalisk, 1, fx(448), fx(410));

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, queenA, Ability.SpawnBroodling));
  assert.ok(hasAbility(cmds, queenB, Ability.Ensnare));
});

test('bot parasites high-value visible enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 59 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const queen = spawnUnit(s, Kind.Queen, 0, fx(360), fx(400));
  s.e.energy[slotOf(queen)] = 75;
  spawnUnit(s, Kind.ScienceVessel, 1, fx(430), fx(400));

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, queen, Ability.Parasite));
});

test('bot infests badly damaged Terran command centers', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 61 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const queen = spawnUnit(s, Kind.Queen, 0, fx(420), fx(400));
  const cc = spawnUnit(s, Kind.CommandCenter, 1, fx(445), fx(400));
  s.e.hp[slotOf(cc)] = 500;

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, queen, Ability.InfestCommandCenter));
});

test('bot casts Defiler plague, consume, and dark swarm when appropriate', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 52 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(100), fx(100));
  const plagueDefiler = spawnUnit(s, Kind.Defiler, 0, fx(500), fx(400));
  const consumeDefiler = spawnUnit(s, Kind.Defiler, 0, fx(540), fx(410));
  const swarmDefiler = spawnUnit(s, Kind.Defiler, 0, fx(650), fx(390));
  s.e.energy[slotOf(plagueDefiler)] = 150;
  s.e.energy[slotOf(consumeDefiler)] = 20;
  s.e.energy[slotOf(swarmDefiler)] = 100;
  grant(sim, 0, Tech.Plague);
  grant(sim, 0, Tech.Consume);
  spawnUnit(s, Kind.Broodling, 0, fx(540), fx(410));
  spawnUnit(s, Kind.Zergling, 0, fx(600), fx(400));
  spawnUnit(s, Kind.Ultralisk, 1, fx(610), fx(400));
  spawnUnit(s, Kind.Ultralisk, 1, fx(618), fx(400));
  spawnUnit(s, Kind.Marine, 1, fx(606), fx(408));
  spawnUnit(s, Kind.Marine, 1, fx(614), fx(408));
  spawnUnit(s, Kind.Marine, 1, fx(120), fx(100));

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, plagueDefiler, Ability.Plague));
  assert.ok(hasAbility(cmds, consumeDefiler, Ability.Consume));
  assert.ok(hasAbility(cmds, swarmDefiler, Ability.DarkSwarm));
});

test('bot scans undetected cloaked enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 53 });
  const s = sim.fullState();
  const commandCenter = findEntity(sim, Kind.CommandCenter, 0);
  const base = entityPos(sim, commandCenter);
  const comsat = spawnUnit(s, Kind.ComsatStation, 0, base.x + fx(80), base.y);
  linkAddon(s, commandCenter, comsat);
  s.e.energy[slotOf(comsat)] = 50;
  spawnUnit(s, Kind.DarkTemplar, 1, base.x + fx(40), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, comsat, Ability.ScannerSweep));
});

test('bot cloaks wraiths when entering a fight', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 54 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const wraith = spawnUnit(s, Kind.Wraith, 0, base.x + fx(20), base.y);
  s.e.energy[slotOf(wraith)] = 50;
  grant(sim, 0, Tech.CloakingField);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(60), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, wraith, Ability.CloakingField));
});

test('bot uses a same-team nydus network to shortcut attack waves', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 83 });
  const s = sim.fullState();
  const e = s.e;
  const home = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const enemyRegion = enemyOffensiveRegion(collectBotFacts(s, 0, Terran), home);
  const entrance = slotOf(spawnUnit(s, Kind.NydusCanal, 0, home.x + fx(48), home.y));
  const exit = slotOf(spawnUnit(s, Kind.NydusCanal, 0, enemyRegion.x - fx(48), enemyRegion.y));
  const marine = spawnUnit(s, Kind.Marine, 0, home.x + fx(56), home.y);

  const cmds = createBot(Terran, { attackThreshold: 1 })(s, 0);

  const load = cmds.find((c): c is Extract<BotCommand, { t: 'load' }> =>
    c.t === 'load' && c.transport === eid(e, entrance) && c.unit === marine);
  const unload = cmds.find((c): c is Extract<BotCommand, { t: 'unload' }> =>
    c.t === 'unload' && c.transport === eid(e, entrance) && c.unit === marine);
  assert.ok(load);
  assert.ok(unload);
  assertPublicSurfaceExposes(s, 0, load);

  const loadedBranch = Sim.fromState(cloneState(s));
  loadedBranch.step([{ player: 0, cmds: [load] }]);
  assertPublicSurfaceExposes(loadedBranch.fullState(), 0, unload);

  sim.step([{ player: 0, cmds }]);
  assert.equal(e.container[slotOf(marine)], NONE);
  assert.ok(Math.abs(e.x[slotOf(marine)]! - e.x[exit]!) <= fx(96));
});

test('bot commits scourge against nearby air threats', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 84 });
  const s = sim.fullState();
  const hatchery = spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const base = entityPos(sim, hatchery);
  const scourge = spawnUnit(s, Kind.Scourge, 0, base.x + fx(20), base.y);
  const wraith = spawnUnit(s, Kind.Wraith, 1, base.x + fx(24), base.y);

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'attack' && c.unit === scourge && c.target === wraith));
});
