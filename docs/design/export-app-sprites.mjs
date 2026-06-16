import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = resolve(repo, 'packages/app/src/art/generated-sprites.ts');

const KEY = new Map(Object.entries({
  SCV: 'scv',
  Marine: 'marine',
  Firebat: 'firebat',
  Medic: 'medic',
  Ghost: 'ghost',
  Vulture: 'vulture',
  'Siege Tank': 'siegeTank',
  'Siege Tank Siege Mode': 'siegeMode',
  Goliath: 'goliath',
  Wraith: 'wraith',
  Dropship: 'dropship',
  'Science Vessel': 'scienceVessel',
  Valkyrie: 'valkyrie',
  Battlecruiser: 'battlecruiser',
  'Spider Mine': 'spiderMine',
  'Nuclear Missile': 'nuclearMissile',
  Academy: 'academy',
  Armory: 'armory',
  Barracks: 'barracks',
  Bunker: 'bunker',
  'Command Center': 'commandCenter',
  'Comsat Station': 'comsatStation',
  'Control Tower': 'controlTower',
  'Covert Ops': 'covertOps',
  'Engineering Bay': 'engineeringBay',
  Factory: 'factory',
  'Machine Shop': 'machineShop',
  'Missile Turret': 'missileTurret',
  'Nuclear Silo': 'nuclearSilo',
  'Physics Lab': 'physicsLab',
  Refinery: 'refinery',
  'Science Facility': 'scienceFacility',
  Starport: 'starport',
  'Supply Depot': 'supplyDepot',
  Probe: 'probe',
  Zealot: 'zealot',
  Dragoon: 'dragoon',
  'High Templar': 'highTemplar',
  'Dark Templar': 'darkTemplar',
  Archon: 'archon',
  'Dark Archon': 'darkArchon',
  Reaver: 'reaver',
  Scarab: 'scarab',
  Observer: 'observer',
  Shuttle: 'shuttle',
  Scout: 'scout',
  Carrier: 'carrier',
  Interceptor: 'interceptor',
  Arbiter: 'arbiter',
  Corsair: 'corsair',
  Nexus: 'nexus',
  Pylon: 'pylon',
  Assimilator: 'assimilator',
  Gateway: 'gateway',
  Forge: 'forge',
  'Photon Cannon': 'photonCannon',
  'Cybernetics Core': 'cyberneticsCore',
  'Shield Battery': 'shieldBattery',
  'Robotics Facility': 'roboticsFacility',
  Stargate: 'stargate',
  'Citadel of Adun': 'citadelOfAdun',
  'Templar Archives': 'templarArchives',
  'Robotics Support Bay': 'roboticsSupportBay',
  Observatory: 'observatory',
  'Fleet Beacon': 'fleetBeacon',
  'Arbiter Tribunal': 'arbiterTribunal',
  Larva: 'larva',
  Egg: 'egg',
  Drone: 'drone',
  Overlord: 'overlord',
  Zergling: 'zergling',
  Hydralisk: 'hydralisk',
  Lurker: 'lurker',
  Mutalisk: 'mutalisk',
  Scourge: 'scourge',
  Guardian: 'guardian',
  Devourer: 'devourer',
  Queen: 'queen',
  Defiler: 'defiler',
  Ultralisk: 'ultralisk',
  'Infested Terran': 'infestedTerran',
  Broodling: 'broodling',
  Hatchery: 'hatchery',
  Lair: 'lair',
  Hive: 'hive',
  'Creep Colony': 'creepColony',
  'Sunken Colony': 'sunkenColony',
  'Spore Colony': 'sporeColony',
  'Spawning Pool': 'spawningPool',
  'Evolution Chamber': 'evolutionChamber',
  'Hydralisk Den': 'hydraliskDen',
  Extractor: 'extractor',
  Spire: 'spire',
  'Greater Spire': 'greaterSpire',
  "Queen's Nest": 'queensNest',
  'Queens Nest': 'queensNest',
  'Nydus Canal': 'nydusCanal',
  'Ultralisk Cavern': 'ultraliskCavern',
  'Defiler Mound': 'defilerMound',
}));

const clean = (s) => s
  .replace(/<\?xml[^>]*>\s*/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const innerOfSvg = (svg) => {
  const m = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  return clean(m ? m[1] : svg);
};

const add = (sprites, name, svg) => {
  const key = KEY.get(name.trim());
  if (!key) throw new Error(`No sprite key for ${name}`);
  sprites[key] = innerOfSvg(svg);
};

const read = (path) => readFileSync(resolve(here, path), 'utf8');

const fromStaticHtml = (sprites, path) => {
  const html = read(path);
  const re = /<svg class="sprite"[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/g;
  for (const m of html.matchAll(re)) add(sprites, m[1], m[2]);
};

const fromJsObjectSheet = (sprites, path) => {
  const html = read(path);
  const re = /name:\s*'([^']+)'[\s\S]*?svg:\s*`([\s\S]*?)`/g;
  for (const m of html.matchAll(re)) add(sprites, m[1], m[2]);
};

const fromJsTupleSheet = (sprites, path) => {
  const html = read(path);
  const re = /\[\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*`([\s\S]*?)`\s*\]/g;
  for (const m of html.matchAll(re)) add(sprites, m[1], m[2]);
};

const fromTerranBuildingSvgs = (sprites) => {
  const dir = resolve(here, 'svgs/terran/buildings');
  const nameOf = (file) => file.replace(/\.svg$/, '').split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.svg')) continue;
    add(sprites, nameOf(file), readFileSync(resolve(dir, file), 'utf8'));
  }
};

const sprites = {};
fromStaticHtml(sprites, 'terran-sprite-sheet.html');
fromTerranBuildingSvgs(sprites);
fromJsObjectSheet(sprites, 'protoss/protoss-sprite-sheet.html');
fromJsTupleSheet(sprites, 'protoss/protoss-building-sprite-sheet.html');
fromJsObjectSheet(sprites, 'zerg/zerg-sprite-sheet.html');
fromJsTupleSheet(sprites, 'zerg/zerg-building-sprite-sheet.html');

mkdirSync(dirname(out), { recursive: true });
const keys = Object.keys(sprites).sort();
const body = [
  '// Generated by docs/design/export-app-sprites.mjs from the design SVG sheets.',
  '// Edit the source sheets, then rerun the exporter.',
  '',
  'export const GENERATED_SVG_SPRITES: Record<string, string> = {',
  ...keys.map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(sprites[key])},`),
  '};',
  '',
].join('\n');
writeFileSync(out, body);
console.log(`wrote ${keys.length} sprites -> ${out}`);
