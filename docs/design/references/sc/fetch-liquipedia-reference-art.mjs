import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://liquipedia.net/starcraft/';
const COMMONS = 'https://liquipedia.net';
const USER_AGENT = 'rts-sprite-reference-research/1.0 (local design research; contact: none)';

const targets = [
  // Terran units
  unit('terran', 'SCV', 'SCV', 'squat hex worker body, side treads, front claw/arms'),
  unit('terran', 'Marine', 'Marine', 'helmet, two pauldrons, rifle bar'),
  unit('terran', 'Firebat', 'Firebat', 'helmet, heavy pauldrons, twin short flamers'),
  unit('terran', 'Medic', 'Medic', 'rounded helmet, medical pack/halo, no weapon'),
  unit('terran', 'Ghost', 'Ghost', 'slim helmet/cloak wedge, long rifle line'),
  unit('terran', 'Vulture', 'Vulture', 'long hover-bike wedge, rear fins, front cannon'),
  unit('terran', 'Siege Tank', 'Siege_Tank', 'two tread blocks, central turret, forward barrel'),
  unit('terran', 'Siege Tank (Siege Mode)', 'Siege_Tank', 'braced treads, deployed stabilizers, long cannon'),
  unit('terran', 'Goliath', 'Goliath', 'box torso, two legs, twin missile pods/cannons'),
  unit('terran', 'Wraith', 'Wraith', 'narrow fighter body, swept wings, tail prongs'),
  unit('terran', 'Dropship', 'Dropship', 'boxy transport fuselage, side pods, rear ramp shape'),
  unit('terran', 'Science Vessel', 'Science_Vessel', 'round sensor hull, side pods, detector dish/core'),
  unit('terran', 'Valkyrie', 'Valkyrie', 'wide missile frigate, multiple side launch pods'),
  unit('terran', 'Battlecruiser', 'Battlecruiser', 'huge long capital hull, broad shoulders, nose bridge'),
  unit('terran', 'Spider Mine', 'Spider_Mine', 'small triangular mine, three prongs, central light'),
  unit('terran', 'Nuclear Missile', 'Nuclear_Missile', 'long missile silhouette, fins, warning core'),

  // Protoss units
  unit('protoss', 'Probe', 'Probe', 'small diamond drone, orbit nodes, center core'),
  unit('protoss', 'Zealot', 'Zealot', 'armored torso, two psi-blade arcs'),
  unit('protoss', 'Dragoon', 'Dragoon', 'rounded walker shell, four legs, central core'),
  unit('protoss', 'High Templar', 'High_Templar', 'robed small caster shape, large psi halo'),
  unit('protoss', 'Dark Templar', 'Dark_Templar', 'angular cloaked body, single warp blade crescent'),
  unit('protoss', 'Archon', 'Archon', 'large energy sphere/body, twin arm flares'),
  unit('protoss', 'Dark Archon', 'Dark_Archon', 'darker energy sphere/body, crescent shell arcs'),
  unit('protoss', 'Reaver', 'Reaver', 'heavy beetle/robot shell, rear body, scarab mouth'),
  unit('protoss', 'Scarab', 'Scarab', 'tiny glowing orb/projectile'),
  unit('protoss', 'Observer', 'Observer', 'tiny cloaked eye/drone, lens core, side fins'),
  unit('protoss', 'Shuttle', 'Shuttle_(Unit)', 'oval transport body, two side nacelles'),
  unit('protoss', 'Scout', 'Scout', 'fighter body, curved wings, center cockpit'),
  unit('protoss', 'Carrier', 'Carrier', 'large crescent capital hull, interceptor bays'),
  unit('protoss', 'Interceptor', 'Interceptor', 'tiny diamond fighter, single core'),
  unit('protoss', 'Arbiter', 'Arbiter', 'round crescent saucer, stasis core, cloak aura shape'),
  unit('protoss', 'Corsair', 'Corsair', 'thin crescent fighter, split wing tips'),

  // Zerg units
  unit('zerg', 'Larva', 'Larva_(Unit)', 'small curled grub, head dot, segmented body'),
  unit('zerg', 'Egg', 'Egg', 'oval cocoon, vein seams, glowing slit'),
  unit('zerg', 'Drone', 'Drone', 'beetle worker body, small mandibles, rear abdomen'),
  unit('zerg', 'Overlord', 'Overlord', 'large floating sac, eye nodes, tentacles'),
  unit('zerg', 'Zergling', 'Zergling', 'small clawed beast, head, scythe forelimbs'),
  unit('zerg', 'Hydralisk', 'Hydralisk', 'cobra head crest, ribbed neck, tail base'),
  unit('zerg', 'Lurker', 'Lurker', 'buried low spined body, long lateral spikes'),
  unit('zerg', 'Mutalisk', 'Mutalisk', 'bat wings, narrow body, tail'),
  unit('zerg', 'Scourge', 'Scourge', 'tiny winged suicide body, split tail'),
  unit('zerg', 'Guardian', 'Guardian', 'heavy flying crab, wide wings, long abdomen'),
  unit('zerg', 'Devourer', 'Devourer', 'bulky flying carapace, maw/front horn, wings'),
  unit('zerg', 'Queen', 'Queen_(Unit)', 'floating insect body, long tail, side wings'),
  unit('zerg', 'Defiler', 'Defiler', 'low caster body, tentacles, hunched carapace'),
  unit('zerg', 'Ultralisk', 'Ultralisk', 'massive horned body, huge tusks/scythes'),
  unit('zerg', 'Infested Terran', 'Infested_Terran', 'small humanoid blob, swollen explosive core'),
  unit('zerg', 'Broodling', 'Broodling', 'tiny clawed creature, simpler than zergling'),

  // Terran buildings
  building('terran', 'Command Center', 'Command_Center'),
  building('terran', 'Supply Depot', 'Supply_Depot'),
  building('terran', 'Refinery', 'Refinery'),
  building('terran', 'Barracks', 'Barracks'),
  building('terran', 'Engineering Bay', 'Engineering_Bay'),
  building('terran', 'Bunker', 'Bunker'),
  building('terran', 'Academy', 'Academy'),
  building('terran', 'Missile Turret', 'Missile_Turret'),
  building('terran', 'Factory', 'Factory'),
  building('terran', 'Machine Shop', 'Machine_Shop'),
  building('terran', 'Starport', 'Starport'),
  building('terran', 'Control Tower', 'Control_Tower'),
  building('terran', 'Armory', 'Armory'),
  building('terran', 'Science Facility', 'Science_Facility'),
  building('terran', 'Physics Lab', 'Physics_Lab'),
  building('terran', 'Covert Ops', 'Covert_Ops'),
  building('terran', 'Comsat Station', 'Comsat_Station'),
  building('terran', 'Nuclear Silo', 'Nuclear_Silo'),

  // Protoss buildings
  building('protoss', 'Nexus', 'Nexus'),
  building('protoss', 'Pylon', 'Pylon'),
  building('protoss', 'Assimilator', 'Assimilator'),
  building('protoss', 'Gateway', 'Gateway'),
  building('protoss', 'Forge', 'Forge'),
  building('protoss', 'Photon Cannon', 'Photon_Cannon'),
  building('protoss', 'Cybernetics Core', 'Cybernetics_Core'),
  building('protoss', 'Shield Battery', 'Shield_Battery'),
  building('protoss', 'Robotics Facility', 'Robotics_Facility'),
  building('protoss', 'Stargate', 'Stargate'),
  building('protoss', 'Citadel of Adun', 'Citadel_of_Adun'),
  building('protoss', 'Templar Archives', 'Templar_Archives'),
  building('protoss', 'Robotics Support Bay', 'Robotics_Support_Bay'),
  building('protoss', 'Observatory', 'Observatory'),
  building('protoss', 'Fleet Beacon', 'Fleet_Beacon'),
  building('protoss', 'Arbiter Tribunal', 'Arbiter_Tribunal'),

  // Zerg buildings
  building('zerg', 'Hatchery', 'Hatchery'),
  building('zerg', 'Lair', 'Lair'),
  building('zerg', 'Hive', 'Hive'),
  building('zerg', 'Creep Colony', 'Creep_Colony'),
  building('zerg', 'Sunken Colony', 'Sunken_Colony'),
  building('zerg', 'Spore Colony', 'Spore_Colony'),
  building('zerg', 'Spawning Pool', 'Spawning_Pool'),
  building('zerg', 'Evolution Chamber', 'Evolution_Chamber'),
  building('zerg', 'Hydralisk Den', 'Hydralisk_Den'),
  building('zerg', 'Extractor', 'Extractor'),
  building('zerg', 'Spire', 'Spire'),
  building('zerg', 'Greater Spire', 'Greater_Spire'),
  building('zerg', "Queen's Nest", "Queen's_Nest"),
  building('zerg', 'Nydus Canal', 'Nydus_Canal'),
  building('zerg', 'Ultralisk Cavern', 'Ultralisk_Cavern'),
  building('zerg', 'Defiler Mound', 'Defiler_Mound'),

  // Neutral/resources
  neutral(
    'Mineral Field',
    'Resources#Minerals',
    'faceted blue crystal cluster',
    'https://liquipedia.net/commons/images/d/d4/Resources-Minerals.JPG',
  ),
  neutral(
    'Vespene Geyser',
    'Resources#Vespene_Gas',
    'green gas vent and crater',
    'https://liquipedia.net/commons/images/d/df/Resources-Gas.JPG',
  ),
];

function unit(race, name, page, silhouette) {
  return { type: 'unit', race, name, page, silhouette };
}

function building(race, name, page) {
  return { type: 'building', race, name, page, silhouette: 'building footprint and race-specific production silhouette' };
}

function neutral(name, page, silhouette, imageUrl = null) {
  return { type: 'neutral', race: 'neutral', name, page, silhouette, imageUrl };
}

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/['()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function download(url, out) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await mkdir(dirname(out), { recursive: true });
  await pipeline(res.body, createWriteStream(out));
}

function htmlAttr(html, attr) {
  const re = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
  return html.match(re)?.[1]?.replaceAll('&amp;', '&');
}

function pageImage(html) {
  const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
  if (og && !og.includes('SearchEngineOptimization/resources/images/')) return normalizeUrl(og);

  const infobox = html.match(/<div class="infobox-image-wrapper">([\s\S]*?)<\/div><div><div class="infobox-header/i)?.[1];
  if (!infobox) return null;
  const src = htmlAttr(infobox, 'src');
  if (!src) return null;
  return normalizeUrl(src);
}

function normalizeUrl(url) {
  const clean = url.replaceAll('&amp;', '&');
  if (clean.startsWith('http')) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  if (clean.startsWith('/')) return `${COMMONS}${clean}`;
  return new URL(clean, COMMONS).toString();
}

function extensionFrom(url) {
  const path = new URL(url).pathname;
  const ext = extname(path).toLowerCase();
  return ext || '.jpg';
}

async function main() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'Liquipedia StarCraft Brood War Wiki',
    purpose: 'Reference-only silhouette research for original SVG sprite authoring.',
    warning: 'Downloaded media is not game art and should not be shipped or committed without license review.',
    items: [],
  };

  for (const target of targets) {
    const pageUrl = `${BASE}${target.page.split('#').map((part) => encodeURIComponent(part).replaceAll('%2F', '/')).join('#')}`;
    const itemSlug = slug(target.name);
    const dir = join(ROOT, target.race, target.type, itemSlug);
    const entry = {
      ...target,
      pageUrl,
      imageUrl: null,
      localPath: null,
      ok: false,
      error: null,
    };

    try {
      const html = await fetchText(pageUrl);
      const imageUrl = target.imageUrl ?? pageImage(html);
      if (!imageUrl) throw new Error('No infobox/og image found');

      const ext = extensionFrom(imageUrl);
      const out = join(dir, `liquipedia-${itemSlug}${ext}`);
      await download(imageUrl, out);
      entry.imageUrl = imageUrl;
      entry.localPath = out.slice(ROOT.length + 1).replaceAll('\\', '/');
      entry.ok = true;
      console.log(`ok   ${target.race}/${target.type}/${target.name}`);
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
      console.warn(`miss ${target.race}/${target.type}/${target.name}: ${entry.error}`);
    }

    manifest.items.push(entry);
    await sleep(250);
  }

  await writeFile(join(ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const ok = manifest.items.filter((i) => i.ok).length;
  const miss = manifest.items.length - ok;
  console.log(`\nDownloaded ${ok}/${manifest.items.length}; missing ${miss}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
