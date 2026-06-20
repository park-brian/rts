import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { COMMAND_TYPES } from '../src/sim.ts';

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

test('desktop console exposes control group chips without sharing command space', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const ControlGroups = \(p: \{ game: Game; compact\?: boolean \}\)/);
  assert.match(ui, /p\.compact \? 'repeat\(5, minmax\(0, 1fr\)\)' : 'repeat\(10, minmax\(0, 1fr\)\)'/);
  assert.match(ui, /p\.game\.assignControlGroup\(index\)/);
  assert.match(ui, /p\.game\.recallControlGroup\(index, e\.shiftKey\)/);
  assert.match(ui, /e\.ctrlKey \|\| e\.metaKey/);
  assert.match(ui, /<SelectionPanel game=\{g\} compact=\{metrics\.compactSelection\} \/>/);
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
  assert.match(ui, /p\.game\.restart\(mode,\s*seed,\s*perTeam,\s*races,\s*human,\s*mapSpec,\s*teams\)/);
  assert.match(ui, /setupTeams\(ui\.playerTeams\.value,\s*ui\.perTeam\.value \* 2\)/);
  assert.match(ui, /setController = \(slot: number, controller: 'human' \| 'ai'\)/);
  assert.match(ui, /value=\{mode === 'play' && human === slot \? 'human' : 'ai'\}/);
  assert.match(ui, /<option value="human">Human<\/option>/);
  assert.match(ui, /generatedMapName\(mapSpec\)/);
  assert.match(ui, /const MapPreview = \(p: \{ map: MapDef \}\)/);
  assert.match(ui, /mapFromSpec\(mapSpec\)/);
  assert.match(ui, /<MapPreview map=\{previewMap\} \/>/);
  assert.match(ui, /<option value=\{team\}>Team \{team \+ 1\}<\/option>/);
  assert.match(ui, /<details open[\s\S]*>Map<\/summary>/);
  assert.match(game, /mapSpec:\s*MapSpec = mapSpecFor\(1,\s*1\)/);
  assert.match(game, /replayFromCurrent\(this\.sim,\s*this\.mapSpec\)/);
  assert.match(session, /createPlaySession = \([\s\S]*mapSpec:\s*MapSpec/);
  assert.match(session, /mapFromSpec\(mapSpec\)/);
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

test('renderer draws queued travel waypoints from sim descriptors', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');

  assert.match(render2d, /queuedTravelWaypoints/);
  assert.match(render2d, /drawQueuedTravelWaypoints\(ctx, game\)/);
  assert.match(render2d, /attack-move/);
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
