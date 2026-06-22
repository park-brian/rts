import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  Abilities, COMMAND_MASK_POLICY, COMMAND_TYPES, Kind, REPLAY_VERSION, Tech, TechDefs, Units, abilitiesFor, addonKindsForParent,
  decodeAction, encodeCommand, fx, liftedStructureFlags, makeState, parseReplay, producedKindsFor, researchTechsFor, setTechLevel,
  sliceMap, slotOf, spawnUnit, validateCommand, workerBuildKindsForWorkerKind, type Command, type CommandType, type State,
} from '../src/sim.ts';
import { transformTargetsFor } from '../../sim/src/mechanics/transforms.ts';
import { selectionCapabilities } from '../src/selection-capabilities.ts';
import { OrderOptionId, type ArmedCommand, type CommandOption } from '../src/store.ts';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

test('game canvas is laid out between reserved top and bottom chrome', () => {
  const html = readFileSync(resolve(appRoot, 'index.html'), 'utf8');

  assert.match(html, /#game, #overlay\s*{[^}]*top:\s*var\(--top-chrome\);/s);
  assert.match(html, /#game, #overlay\s*{[^}]*height:\s*calc\(100dvh - var\(--top-chrome\) - var\(--bottom-chrome\)\);/s);
  assert.doesNotMatch(html, /#game, #overlay\s*{[^}]*height:\s*auto;/s);
  assert.match(html, /--top-chrome:/);
  assert.match(html, /--bottom-chrome:/);
});

test('hud bars are solid separate chrome, not glass overlays', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /background:\s*'#0b0e13'/);
  assert.match(ui, /borderBottom:\s*'1px solid #1e2733'/);
  assert.match(ui, /borderTop:\s*'1px solid #1e2733'/);
  assert.doesNotMatch(ui, /backdropFilter/);
  assert.doesNotMatch(ui, /rgba\(11,\s*14,\s*19/);
});

test('command console uses a fixed-cell table with no horizontal scroll lane', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const desktopBottomChrome = \(width: number\): number =>/);
  assert.match(ui, /root\.style\.setProperty\('--bottom-chrome', bottom\)/);
  assert.match(ui, /data-command-table="true"/);
  assert.match(ui, /gridTemplateColumns:\s*`repeat\(\$\{p\.metrics\.columns\}, minmax\(0, 1fr\)\)`/);
  assert.match(ui, /gridAutoRows:\s*`\$\{p\.metrics\.cellHeight\}px`/);
  assert.match(ui, /<Btn command label="More"/);
  assert.match(ui, /build:\s*'Build Orders'/);
  assert.doesNotMatch(ui, /overflowX:\s*'auto'/);
  assert.doesNotMatch(ui, /scrollbarWidth:\s*'thin'/);
  assert.doesNotMatch(ui, /`Build \$\{short/);
});

test('mobile chrome exposes a compact queued-travel toggle', () => {
  const store = readFileSync(resolve(appRoot, 'src', 'store.ts'), 'utf8');
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(store, /mobileQueueMode:\s*signal\(false\)/);
  assert.match(ui, /ui\.controlScheme\.value === 'mobile' &&/);
  assert.match(ui, /label="Queue" active=\{ui\.mobileQueueMode\.value\}/);
  assert.match(ui, /ui\.mobileQueueMode\.value = !ui\.mobileQueueMode\.value/);
});

test('mobile command chrome stays compact and reserves game space', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const mobileBottomChrome = \(width: number\): number => \(width < 370 \? 120 : 124\)/);
  assert.match(ui, /const rows = desktop \? \(width < 760 \? 4 : width < 1080 \? 3 : 2\) : 2/);
  assert.match(ui, /const cellHeight = desktop \? 36 : 42/);
  assert.match(ui, /: width < 370 \? 84 : 96/);
  assert.match(ui, /gridTemplateColumns:\s*`\$\{metrics\.selectionWidth\}px minmax\(0, 1fr\)`/);
  assert.match(ui, /<SelectionPanel game=\{g\} compact \/>[\s\S]*<CommandTable sections=\{sections\} metrics=\{metrics\} \/>/);
  const mobileBranch = ui.slice(
    ui.indexOf("<div style={{ ...bar, bottom: '0', gap: '8px'"),
    ui.indexOf('const MatchStatsPanel'),
  );
  assert.ok(mobileBranch.length > 0, 'expected mobile hotbar branch');
  assert.doesNotMatch(mobileBranch, /<MinimapPanel/);
});

test('desktop console keeps minimap, selection, and hotkey-labeled commands in StarCraft order', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');
  const desktopOrder = /\{metrics\.showMinimap && <MinimapPanel game=\{g\} \/>\}[\s\S]*<SelectionPanel game=\{g\} compact=\{metrics\.compactSelection\} \/>[\s\S]*<CommandTable sections=\{sections\} metrics=\{metrics\} \/>/;

  assert.match(ui, /const showMinimap = desktop && width >= 680/);
  assert.match(ui, /\$\{metrics\.minimapWidth\}px \$\{metrics\.selectionWidth\}px minmax\(0, 1fr\)/);
  assert.match(ui, desktopOrder);
  assert.match(ui, /ui\.controlScheme\.value === 'desktop' && p\.hotkeyAction && !p\.reason/);
  assert.match(ui, /\{hotkeyLabelForAction\(p\.hotkeyAction\)\}/);
});

test('desktop console exposes control group chips without sharing command space', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const ControlGroups = \(p: \{ game: Game; compact\?: boolean \}\)/);
  assert.match(ui, /p\.compact \? 'repeat\(5, minmax\(0, 1fr\)\)' : 'repeat\(10, minmax\(0, 1fr\)\)'/);
  assert.match(ui, /p\.game\.assignControlGroup\(index\)/);
  assert.match(ui, /p\.game\.recallControlGroup\(index, e\.shiftKey\)/);
  assert.match(ui, /e\.ctrlKey \|\| e\.metaKey/);
  assert.match(ui, /<SelectionPanel game=\{g\} compact=\{metrics\.compactSelection\} \/>/);
});

test('selection panel exposes mixed-selection subgroup chips', () => {
  const store = readFileSync(resolve(appRoot, 'src', 'store.ts'), 'utf8');
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');
  const input = readFileSync(resolve(appRoot, 'src', 'input.ts'), 'utf8');

  assert.match(store, /export type SelectionSubgroup/);
  assert.match(ui, /selection\.subgroups\.length > 1/);
  assert.match(ui, /selectSelectionSubgroup\(subgroup\.kind\)/);
  assert.match(input, /event\.code === 'Tab'/);
  assert.match(input, /cycleSelectionSubgroup\(event\.shiftKey \? -1 : 1\)/);
});

test('command card consumes every shared selection option group through executeOption', () => {
  const store = readFileSync(resolve(appRoot, 'src', 'store.ts'), 'utf8');
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  for (const group of ['train', 'addon', 'transform', 'build', 'research', 'ability']) {
    assert.match(ui, new RegExp(`selection\\.options\\.${group}`), `missing ${group} command option group`);
  }
  assert.match(ui, /selection\.options\.order\.find\(\(o\) => o\.id === id\)/);
  const orderIdBlock = store.match(/export const OrderOptionId = \{(?<body>[\s\S]*?)\} as const;/)?.groups?.body ?? '';
  const orderIds = [...orderIdBlock.matchAll(/^\s+([A-Za-z]+):\s+\d+,/gm)].map((match) => match[1]!);
  assert.ok(orderIds.length > 0, 'expected OrderOptionId entries');
  for (const id of orderIds) {
    assert.match(ui, new RegExp(`addOrderButton\\(OrderOptionId\\.${id},`), `missing rendered order option ${id}`);
  }
  assert.match(ui, /const executeOption = \(option: CommandOption\): void =>/);
  assert.match(ui, /g\.executeOption\(option\)/);
});

test('player command surface accounts for every sim command type', () => {
  const selection = readFileSync(resolve(appRoot, 'src', 'selection-capabilities.ts'), 'utf8');
  const tap = readFileSync(resolve(appRoot, 'src', 'tap-selection-controller.ts'), 'utf8');
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');
  type CommandSurfaceProbe = { selection: RegExp; ui?: RegExp; tap?: RegExp };
  const surface: Record<(typeof COMMAND_TYPES)[number], CommandSurfaceProbe> = {
    train: { selection: /trainSelectionOptions/, ui: /selection\.options\.train/ },
    research: { selection: /researchSelectionOptions/, ui: /selection\.options\.research/ },
    build: { selection: /workerBuildSelectionOptions/, ui: /selection\.options\.build/ },
    addon: { selection: /addonSelectionOptions/, ui: /selection\.options\.addon/ },
    lift: { selection: /OrderOptionId\.Lift/, ui: /addOrderButton\(OrderOptionId\.Lift,/ },
    land: { selection: /OrderOptionId\.Land/, ui: /addOrderButton\(OrderOptionId\.Land,/ },
    transform: { selection: /transformSelectionOptions/, ui: /selection\.options\.transform/ },
    burrow: { selection: /OrderOptionId\.Burrow[\s\S]*OrderOptionId\.Unburrow/, ui: /OrderOptionId\.Burrow[\s\S]*OrderOptionId\.Unburrow/ },
    mine: { selection: /OrderOptionId\.Mine/, ui: /addOrderButton\(OrderOptionId\.Mine,/ },
    load: { selection: /OrderOptionId\.Load/, ui: /addOrderButton\(OrderOptionId\.Load,/ },
    unload: { selection: /OrderOptionId\.Unload/, ui: /addOrderButton\(OrderOptionId\.Unload,/ },
    cancelBuild: { selection: /OrderOptionId\.Cancel/, ui: /addOrderButton\(OrderOptionId\.Cancel,/ },
    move: { selection: /OrderOptionId\.Move/, ui: /addOrderButton\(OrderOptionId\.Move,/ },
    attack: { selection: /OrderOptionId\.AttackMove/, tap: /attackModeCandidates/ },
    amove: { selection: /OrderOptionId\.AttackMove/, ui: /addOrderButton\(OrderOptionId\.AttackMove,/ },
    ability: { selection: /abilitySelectionOptions/, ui: /selection\.options\.ability/ },
    harvest: { selection: /OrderOptionId\.Harvest/, ui: /addOrderButton\(OrderOptionId\.Harvest,/ },
    repair: { selection: /OrderOptionId\.Repair/, ui: /addOrderButton\(OrderOptionId\.Repair,/ },
    rally: { selection: /OrderOptionId\.Rally/, ui: /addOrderButton\(OrderOptionId\.Rally,/ },
    hold: { selection: /OrderOptionId\.Hold/, ui: /addOrderButton\(OrderOptionId\.Hold,/ },
    patrol: { selection: /OrderOptionId\.Patrol/, ui: /addOrderButton\(OrderOptionId\.Patrol,/ },
    stop: { selection: /OrderOptionId\.Stop/, ui: /addOrderButton\(OrderOptionId\.Stop,/ },
  };

  assert.deepEqual(Object.keys(surface).sort(), [...COMMAND_TYPES].sort());
  for (const [command, probes] of Object.entries(surface)) {
    assert.match(selection, probes.selection, `missing selection surface for ${command}`);
    if (probes.ui) assert.match(ui, probes.ui, `missing command-card surface for ${command}`);
    if (probes.tap) assert.match(tap, probes.tap, `missing tap-command surface for ${command}`);
  }
});

const commandTypeForArm = (arm: ArmedCommand): CommandType => {
  switch (arm.t) {
    case 'place': return 'build';
    case 'land': return 'land';
    case 'move': return 'move';
    case 'attackMove': return 'amove';
    case 'patrol': return 'patrol';
    case 'rally': return 'rally';
    case 'ability': return 'ability';
    case 'target': return arm.mode;
    case 'none': throw new Error('none is not a command-card action');
  }
};

type RuntimeOptionEntry = {
  group: keyof ReturnType<typeof selectionCapabilities>['options'];
  option: CommandOption;
};

const enabledOptionEntries = (view: ReturnType<typeof selectionCapabilities>): RuntimeOptionEntry[] =>
  Object.entries(view.options).flatMap(([group, options]) =>
    options.filter((option) => option.ok).map((option) => ({
      group: group as RuntimeOptionEntry['group'],
      option,
    })),
  );

const commandCardFixture = (): { state: State; views: ReturnType<typeof selectionCapabilities>[] } => {
  const s = makeState(sliceMap(), 2, 9711);
  const e = s.e;
  s.players.minerals[0] = 10_000;
  s.players.gas[0] = 10_000;
  s.players.supplyMax[0] = 200;

  const scv = spawnUnit(s, Kind.SCV, 0, fx(360), fx(360));
  const cc = spawnUnit(s, Kind.CommandCenter, 0, fx(480), fx(360));
  const barracks = spawnUnit(s, Kind.Barracks, 0, fx(620), fx(360));
  const factory = spawnUnit(s, Kind.Factory, 0, fx(820), fx(360));
  const academy = spawnUnit(s, Kind.Academy, 0, fx(980), fx(360));
  const tank = spawnUnit(s, Kind.SiegeTank, 0, fx(360), fx(520));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(460), fx(520));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(560), fx(520));
  const vulture = spawnUnit(s, Kind.Vulture, 0, fx(660), fx(520));
  const dropshipForLoad = spawnUnit(s, Kind.Dropship, 0, fx(760), fx(520));
  const loadCargo = spawnUnit(s, Kind.Firebat, 0, fx(780), fx(520));
  const dropshipForUnload = spawnUnit(s, Kind.Dropship, 0, fx(900), fx(520));
  const unloadCargo = spawnUnit(s, Kind.Firebat, 0, fx(920), fx(520));
  const liftedCc = spawnUnit(s, Kind.CommandCenter, 0, fx(1_080), fx(520));
  const foundation = spawnUnit(s, Kind.SupplyDepot, 0, fx(1_220), fx(520));
  const zergling = spawnUnit(s, Kind.Zergling, 0, fx(360), fx(680));
  const burrowed = spawnUnit(s, Kind.Zergling, 0, fx(420), fx(680));

  setTechLevel(s, 0, Tech.SiegeTech, 1);
  setTechLevel(s, 0, Tech.StimPack, 1);
  setTechLevel(s, 0, Tech.PsionicStorm, 1);
  setTechLevel(s, 0, Tech.SpiderMines, 1);
  setTechLevel(s, 0, Tech.Burrow, 1);
  e.energy[slotOf(templar)] = 75;
  e.specialAmmo[slotOf(vulture)] = 1;
  e.container[slotOf(unloadCargo)] = dropshipForUnload;
  e.x[slotOf(unloadCargo)] = e.x[slotOf(dropshipForUnload)]!;
  e.y[slotOf(unloadCargo)] = e.y[slotOf(dropshipForUnload)]!;
  e.flags[slotOf(liftedCc)] = liftedStructureFlags(Kind.CommandCenter);
  e.built[slotOf(foundation)] = 0;
  e.ctimer[slotOf(foundation)] = 100;
  e.buildCostMinerals[slotOf(foundation)] = Units[Kind.SupplyDepot]!.minerals;
  e.burrowed[slotOf(burrowed)] = 1;

  const publish = (ids: number[]): ReturnType<typeof selectionCapabilities> =>
    selectionCapabilities(s, 0, ids, () => true);

  return { state: s, views: [
    publish([scv]),
    publish([cc]),
    publish([barracks]),
    publish([factory]),
    publish([academy]),
    publish([tank]),
    publish([marine]),
    publish([templar]),
    publish([vulture]),
    publish([dropshipForLoad, loadCargo]),
    publish([dropshipForUnload]),
    publish([liftedCc]),
    publish([foundation]),
    publish([zergling, burrowed]),
  ] };
};

test('selection capability command options round-trip through shared command surfaces', () => {
  const fixture = commandCardFixture();
  const entries = fixture.views.flatMap(enabledOptionEntries);
  const commands: Command[] = [];
  const coveredGroups = new Set<RuntimeOptionEntry['group']>();
  const coveredOrderIds = new Set<number>();
  const coveredCommandTypes = new Set<CommandType>();

  for (const { group, option } of entries) {
    coveredGroups.add(group);
    if (group === 'order') coveredOrderIds.add(option.id);
    for (const command of option.commands ?? []) {
      assert.equal(validateCommand(fixture.state, 0, command).ok, true, 'command-card option must validate');
      commands.push(command);
      coveredCommandTypes.add(command.t);
    }
    if (option.arm) {
      const commandType = commandTypeForArm(option.arm);
      coveredCommandTypes.add(commandType);
      assert.ok(COMMAND_TYPES.includes(commandType), `armed option ${option.arm.t} must map to a public command type`);
      assert.ok(COMMAND_MASK_POLICY[commandType], `armed option ${option.arm.t} must have action-mask policy`);
    }
  }

  assert.deepEqual([...coveredGroups].sort(), ['ability', 'addon', 'build', 'order', 'research', 'train', 'transform']);
  assert.deepEqual([...coveredOrderIds].sort((a, b) => a - b), Object.values(OrderOptionId).sort((a, b) => a - b));

  const expectedCommandCardTypes: CommandType[] = [
    'addon', 'amove', 'ability', 'build', 'burrow', 'cancelBuild', 'harvest', 'hold', 'land', 'lift', 'load', 'mine',
    'move', 'patrol', 'rally', 'repair', 'research', 'stop', 'train', 'transform', 'unload',
  ];
  assert.deepEqual([...coveredCommandTypes].sort(), expectedCommandCardTypes.sort());

  for (const command of commands) {
    assert.deepEqual(decodeAction(encodeCommand(command)), command, `action mask round-trip ${command.t}`);
  }
  const replay = parseReplay(JSON.stringify({
    version: REPLAY_VERSION,
    map: { kind: 'slice' },
    players: 2,
    seed: 1,
    frames: [[{ player: 0, cmds: commands }]],
  }));
  assert.deepEqual(replay.frames[0]?.[0]?.cmds, commands);
});

test('data-defined capabilities flow through shared option groups', () => {
  const capabilities = readFileSync(resolve(appRoot, '..', 'sim', 'src', 'mechanics', 'capabilities.ts'), 'utf8');
  const addons = readFileSync(resolve(appRoot, '..', 'sim', 'src', 'mechanics', 'addons.ts'), 'utf8');
  const transforms = readFileSync(resolve(appRoot, '..', 'sim', 'src', 'mechanics', 'transforms.ts'), 'utf8');
  const capabilitySources = [capabilities, addons, transforms].join('\\n');
  const intent = readFileSync(resolve(appRoot, '..', 'sim', 'src', 'commands', 'intent.ts'), 'utf8');
  const selection = readFileSync(resolve(appRoot, 'src', 'selection-capabilities.ts'), 'utf8');
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');
  const kindIds = Object.keys(Units).map(Number);
  const countKinds = (optionsFor: (kind: number) => readonly number[]): number =>
    kindIds.filter((kind) => optionsFor(kind).length > 0).length;
  const uniqueAbilityCasters = new Set(Object.values(Abilities).flatMap((ability) => ability.casters));
  const uniqueResearchProducers = new Set(Object.values(TechDefs).flatMap((tech) => tech.producers));

  assert.equal(countKinds(abilitiesFor), uniqueAbilityCasters.size, 'ability caster index should cover every data caster');
  assert.equal(countKinds(researchTechsFor), uniqueResearchProducers.size, 'research producer index should cover every tech producer');

  const groups = [
    {
      name: 'build',
      dataCount: countKinds(workerBuildKindsForWorkerKind),
      capability: /workerBuildKindsForWorkerKind/,
      intent: /workerBuildKindsForWorkerKind/,
      selection: /workerBuildSelectionOptions\(s, player,/,
      ui: /selection\.options\.build/,
    },
    {
      name: 'train',
      dataCount: countKinds(producedKindsFor),
      capability: /producedKindsFor/,
      intent: /producedKindsFor/,
      selection: /trainSelectionOptions\(s, player,/,
      ui: /selection\.options\.train/,
    },
    {
      name: 'research',
      dataCount: countKinds(researchTechsFor),
      capability: /researchTechsFor/,
      intent: /researchTechsFor/,
      selection: /researchSelectionOptions\(s, player,/,
      ui: /selection\.options\.research/,
    },
    {
      name: 'ability',
      dataCount: countKinds(abilitiesFor),
      capability: /abilitiesFor/,
      intent: /abilitiesFor/,
      selection: /abilitySelectionOptions\(s, player,/,
      ui: /selection\.options\.ability/,
    },
    {
      name: 'addon',
      dataCount: countKinds(addonKindsForParent),
      capability: /addonKindsForParent/,
      intent: /addonKindsForParent/,
      selection: /addonSelectionOptions\(s, player,/,
      ui: /selection\.options\.addon/,
    },
    {
      name: 'transform',
      dataCount: countKinds(transformTargetsFor),
      capability: /transformTargetsFor/,
      intent: /transformTargetsFor/,
      selection: /transformSelectionOptions\(s, player,/,
      ui: /selection\.options\.transform/,
    },
  ];

  for (const group of groups) {
    assert.ok(group.dataCount > 0, `expected ${group.name} data capabilities`);
    assert.match(capabilitySources, group.capability, `missing ${group.name} capability index`);
    assert.match(intent, group.intent, `missing ${group.name} shared option source`);
    assert.match(selection, group.selection, `missing ${group.name} selection option publication`);
    assert.match(ui, group.ui, `missing ${group.name} command-card rendering`);
  }
});

test('post-match stats panel exposes command mix and reject reasons', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const countLine = <K extends string,>/);
  assert.match(ui, /COMMAND_TYPES/);
  assert.match(ui, /player\.commandsByType/);
  assert.match(ui, /player\.rejectsByReason/);
  assert.match(ui, /matchHealthRows\(stats\)/);
  assert.match(ui, /p\.game\.botExpertReport\(\)/);
  assert.match(ui, /botReport\.phaseAssessments/);
  assert.match(ui, /botReport\.competenceGates/);
  assert.match(ui, /botReport\.obligationPressures/);
  assert.match(ui, /Expert Pressure/);
  assert.match(ui, /pressureLabel\(pressure\)/);
  assert.match(ui, /phaseAssessmentLine\(assessments\)/);
  assert.match(ui, /playerHealthRows\(player\.player,\s*health,\s*botHealth\)/);
  assert.match(ui, /Strategic Health/);
  assert.match(ui, /Competence Gates/);
  assert.match(ui, /HEALTH_LABEL\[row\.status\]/);
  assert.match(ui, /P\{player\.player \+ 1\} command mix/);
  assert.match(ui, /rejects \{rejectLine\(player\.rejectsByReason\)\}/);
});

test('setup modal exposes procedural map recipe controls', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');
  const game = readFileSync(resolve(appRoot, 'src', 'game.ts'), 'utf8');
  const session = readFileSync(resolve(appRoot, 'src', 'game-session.ts'), 'utf8');

  assert.match(ui, /MAP_PRESETS\.map/);
  assert.match(ui, /MIDFIELD_MODULES\.map/);
  assert.match(ui, /setSeedText\(String\(randomSeed\(\)\)\)/);
  assert.match(ui, /p\.game\.restart\(mode,\s*seed,\s*perTeam,\s*races,\s*human,\s*mapSpec,\s*teams,\s*enabledRows,\s*fullVision\)/);
  assert.match(ui, /setupTeams\(ui\.playerTeams\.value,\s*ui\.perTeam\.value \* 2\)/);
  assert.match(ui, /setupEnabled\(ui\.playerEnabled\.value,\s*ui\.perTeam\.value \* 2\)/);
  assert.match(ui, /const enabledRows = setupEnabled\(enabled, players\)/);
  assert.match(ui, /At least two players must be active/);
  assert.match(ui, /<input type="checkbox" checked=\{on\} disabled=\{locked\}/);
  assert.match(ui, /setController = \(slot: number, controller: 'human' \| 'ai'\)/);
  assert.match(ui, /value=\{mode === 'play' && human === slot \? 'human' : 'ai'\}/);
  assert.match(ui, /<option value="human">Human<\/option>/);
  assert.match(ui, /generatedMapName\(mapSpec\)/);
  assert.match(ui, /const MapPreview = \(p: \{ map: MapDef \}\)/);
  assert.match(ui, /mapFromSpec\(mapSpec\)/);
  assert.match(ui, /<MapPreview map=\{previewMap\} \/>/);
  assert.match(ui, /<option value=\{team\}>Team \{team \+ 1\}<\/option>/);
  assert.match(ui, /<details open[\s\S]*>Map<\/summary>/);
  assert.match(ui, /<summary[\s\S]*>Debug<\/summary>/);
  assert.match(ui, /label="Math" active=\{ui\.mathRenderer\.value\}/);
  assert.match(ui, /label="Sprite" active=\{!ui\.mathRenderer\.value\}/);
  assert.match(ui, /checked=\{fullVision\}/);
  assert.match(ui, /Full vision/);
  assert.match(ui, /label="Watch AI" active=\{mode === 'spectate'\}/);
  assert.match(game, /mapSpec:\s*MapSpec = mapSpecFor\(1,\s*1\)/);
  assert.match(game, /replayFromCurrent\(this\.sim,\s*this\.mapSpec\)/);
  assert.match(session, /createPlaySession = \([\s\S]*mapSpec:\s*MapSpec/);
  assert.match(session, /mapFromSpec\(mapSpec\)/);
  assert.match(session, /startSlots = activeSetupSlots\(playerEnabled\)/);
  assert.match(session, /vision:\s*!fullVision/);
  assert.match(session, /startSlots: replay\.startSlots/);
});

test('math renderer exposes a subtle build-tile grid for placement audits', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');
  const store = readFileSync(resolve(appRoot, 'src', 'store.ts'), 'utf8');

  assert.match(store, /mathRenderer:\s*signal\(true\)/);
  assert.match(render2d, /Math mode is the canonical gameplay-geometry view/);
  assert.match(render2d, /rgba\(125,\s*170,\s*210,\s*0\.10\)/);
  assert.match(render2d, /for \(let x = 0; x <= m\.w \* TILE; x \+= TILE\)/);
  assert.match(render2d, /for \(let y = 0; y <= m\.h \* TILE; y \+= TILE\)/);
  assert.match(render2d, /drawEntityLabel\(ctx,\s*game,\s*def\.shortName/);
  assert.match(render2d, /drawFacingDot\(ctx,\s*game/);
  assert.match(render2d, /drawAttackLinks\(ctx,\s*game\)/);
  assert.match(render2d, /recentlyFiredTarget\(s,\s*i\)/);
  assert.match(render2d, /upgradedCooldown\(s,\s*slot,\s*weapon\.cooldown\)/);
  assert.match(render2d, /a\.kind === 'harvest'/);
  assert.match(render2d, /if \(!a\.active\) \{/);
  assert.match(render2d, /ctx\.globalAlpha = 1;\s*continue;/);
});

test('math renderer draws selected weapon and detector range overlays from sim helpers', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');
  const sim = readFileSync(resolve(appRoot, '..', 'sim', 'src', 'index.ts'), 'utf8');

  assert.match(sim, /export \{ effectiveSight \} from '\.\/mechanics\/status\.ts'/);
  assert.match(render2d, /drawSelectedRangeOverlays/);
  assert.match(render2d, /upgradedRange\(s, slot, weapon\)/);
  assert.match(render2d, /isDetectorKind\(e\.kind\[slot\]!\)/);
  assert.match(render2d, /effectiveSight\(s, e, slot, def\.sight\)/);
  assert.match(render2d, /strokeExpandedHull/);
});
test('renderer draws queued travel waypoints from sim descriptors', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');

  assert.match(render2d, /queuedTravelWaypoints/);
  assert.match(render2d, /drawQueuedTravelWaypoints\(ctx, game\)/);
  assert.match(render2d, /attack-move/);
});

test('renderers draw last-known enemy affordances from app visibility memory', () => {
  const visibility = readFileSync(resolve(appRoot, 'src', 'visibility-affordances.ts'), 'utf8');
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');
  const gl = readFileSync(resolve(appRoot, 'src', 'gl', 'renderer.ts'), 'utf8');

  assert.match(visibility, /export const lastKnownEnemies/);
  assert.match(render2d, /drawLastKnownEnemies/);
  assert.match(render2d, /lastKnownEnemies\(game, lastKnownScratch\)/);
  assert.match(gl, /private lastKnownEnemies\(game: Game\): void/);
  assert.match(gl, /lastKnownEnemies\(game, this\.lastKnownScratch\)/);
});

test('renderers draw persistent spell fields from sim descriptors', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');
  const gl = readFileSync(resolve(appRoot, 'src', 'gl', 'renderer.ts'), 'utf8');

  assert.match(render2d, /fieldAffordances/);
  assert.match(render2d, /drawEffectFields\(ctx, game\)/);
  assert.match(gl, /fieldAffordances/);
  assert.match(gl, /effectFields\(game\)/);
});

test('GL renderer draws weapon projectile presentation from sim descriptors', () => {
  const gl = readFileSync(resolve(appRoot, 'src', 'gl', 'renderer.ts'), 'utf8');
  const particles = readFileSync(resolve(appRoot, 'src', 'gl', 'particles.ts'), 'utf8');

  assert.match(gl, /weaponForTarget/);
  assert.match(gl, /e\.combatTarget\[slot\]/);
  assert.match(gl, /weapon\?\.presentation/);
  assert.match(gl, /emitProjectileVolley/);
  assert.match(particles, /emitProjectileVolley/);
});
