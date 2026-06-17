import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = resolve(repo, 'packages/app/src/art/generated-sprites.ts');

// The generated runtime file preserves inner element/class/data-* metadata but
// strips review-only comments and sheet-local styles. Root placement metadata is
// emitted separately in GENERATED_SVG_SPRITE_META so future renderers can fit and
// anchor sprites without reparsing the design HTML.
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

const attrMap = (tag) => Object.fromEntries(
  [...tag.matchAll(/([:\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
);

const nums = (s) => s.trim().split(/\s+/).map(Number);

const metaOf = (attrs, fallback = {}) => {
  const meta = {};
  const anchor = attrs['data-anchor'] ?? fallback.anchor;
  const visibleBox = attrs['data-visible-box'] ?? fallback.visibleBox;
  const footprint = attrs['data-footprint'] ?? fallback.footprint;
  const forward = attrs['data-forward'] ?? fallback.forward;
  const fit = attrs['data-fit'] ?? fallback.fit;
  const scaleRole = attrs['data-scale-role'] ?? fallback.scaleRole;
  const bwapiPixelBounds = attrs['data-bwapi-pixel-bounds'] ?? fallback.bwapiPixelBounds;
  if (anchor) meta.anchor = nums(anchor);
  if (visibleBox) meta.visibleBox = nums(visibleBox);
  if (footprint) meta.footprint = nums(footprint);
  if (forward) meta.forward = nums(forward);
  if (fit) meta.fit = fit;
  if (scaleRole) meta.scaleRole = scaleRole;
  if (bwapiPixelBounds) meta.bwapiPixelBounds = nums(bwapiPixelBounds);
  return meta;
};

const add = (sprites, metas, name, svg, meta = {}) => {
  const key = KEY.get(name.trim());
  if (!key) throw new Error(`No sprite key for ${name}`);
  sprites[key] = innerOfSvg(svg);
  metas[key] = meta;
};

const read = (path) => readFileSync(resolve(here, path), 'utf8');

const fromStaticHtml = (sprites, path) => {
  const html = read(path);
  const re = /(<svg class="sprite"[^>]*aria-label="([^"]+)"[^>]*>)([\s\S]*?)<\/svg>/g;
  for (const m of html.matchAll(re)) add(sprites, metas, m[2], m[3], metaOf(attrMap(m[1])));
};

const fromJsObjectSheet = (sprites, path) => {
  const html = read(path);
  const re = /name:\s*'([^']+)'[\s\S]*?box:\s*'([^']+)'[\s\S]*?svg:\s*`([\s\S]*?)`/g;
  for (const m of html.matchAll(re)) {
    add(sprites, metas, m[1], m[3], metaOf({}, {
      anchor: '32 32',
      visibleBox: m[2],
      forward: '0 -1',
      fit: 'visible-box',
      scaleRole: 'unit-radius',
    }));
  }
};

const fromJsTupleSheet = (sprites, path) => {
  const html = read(path);
  const re = /\[\s*(['"])(.*?)\1\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*`([\s\S]*?)`\s*\]/g;
  for (const m of html.matchAll(re)) {
    add(sprites, metas, m[2], m[5], metaOf({}, {
      anchor: '32 32',
      visibleBox: m[4],
      footprint: m[3],
      forward: '0 -1',
      fit: 'visible-box',
      scaleRole: 'building-footprint',
    }));
  }
};

const fromTerranBuildingSvgs = (sprites) => {
  const dir = resolve(here, 'svgs/terran/buildings');
  const nameOf = (file) => file.replace(/\.svg$/, '').split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.svg')) continue;
    const svg = readFileSync(resolve(dir, file), 'utf8');
    const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
    add(sprites, metas, nameOf(file), svg, metaOf(attrMap(root)));
  }
};

const sprites = {};
const metas = {};
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
  'export type GeneratedSpriteMeta = {',
  '  anchor?: number[];',
  '  visibleBox?: number[];',
  '  footprint?: number[];',
  '  forward?: number[];',
  '  fit?: string;',
  '  scaleRole?: string;',
  '  bwapiPixelBounds?: number[];',
  '};',
  '',
  'export const GENERATED_SVG_SPRITES: Record<string, string> = {',
  ...keys.map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(sprites[key])},`),
  '};',
  '',
  'export const GENERATED_SVG_SPRITE_META: Record<string, GeneratedSpriteMeta> = {',
  ...keys.map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(metas[key] ?? {})},`),
  '};',
  '',
].join('\n');
writeFileSync(out, body);
console.log(`wrote ${keys.length} sprites -> ${out}`);
