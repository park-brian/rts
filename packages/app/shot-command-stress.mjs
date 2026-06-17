// Stress-test the command console with an intentionally overloaded command set.
// Usage: node shot-command-stress.mjs
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const distDir = resolve('dist');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

const KIND = {
  CommandCenter: 2, SCV: 3, SupplyDepot: 4, Barracks: 5, Marine: 6, Refinery: 8,
  Firebat: 9, Medic: 10, Ghost: 11, Vulture: 12, SiegeTank: 13, Goliath: 15,
  Wraith: 16, Dropship: 17, ScienceVessel: 18, Valkyrie: 19, Battlecruiser: 20,
  EngineeringBay: 23, Bunker: 24, Academy: 25, MissileTurret: 26, Factory: 27,
  MachineShop: 28, Starport: 29, ControlTower: 30, Armory: 31, ScienceFacility: 32,
  PhysicsLab: 33, CovertOps: 34, ComsatStation: 35, NuclearSilo: 36,
  Probe: 50, Zealot: 51, Dragoon: 52, HighTemplar: 53, DarkTemplar: 54, Archon: 55,
  DarkArchon: 56, Reaver: 57, Observer: 59, Shuttle: 60, Scout: 61, Carrier: 62,
  Arbiter: 64, Corsair: 65, Nexus: 66, Pylon: 67, Gateway: 69, Forge: 70,
  PhotonCannon: 71, CyberneticsCore: 72, ShieldBattery: 73, RoboticsFacility: 74,
  Stargate: 75, CitadelOfAdun: 76, TemplarArchives: 77, RoboticsSupportBay: 78,
  Observatory: 79, FleetBeacon: 80, ArbiterTribunal: 81,
  Drone: 102, Overlord: 103, Zergling: 104, Hydralisk: 105, Lurker: 106,
  Mutalisk: 107, Scourge: 108, Guardian: 109, Devourer: 110, Queen: 111,
  Defiler: 112, Ultralisk: 113, Hatchery: 116, Lair: 117, Hive: 118,
  CreepColony: 119, SpawningPool: 122, EvolutionChamber: 123, HydraliskDen: 124,
  Spire: 126, QueensNest: 128, UltraliskCavern: 130, DefilerMound: 131,
};

const TECH = [
  1, 2, 3, 4, 6, 7, 8, 10, 11, 16, 18, 19,
  40, 41, 42, 46, 49, 52, 55, 56,
  80, 82, 83, 84, 88, 91, 92, 94, 95,
];
const ABILITIES = Array.from({ length: 29 }, (_, i) => i + 1);

let server;
let targetUrl = process.env.URL;
if (!targetUrl) {
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = resolve(distDir, requested);
    const rel = relative(distDir, file);
    if (rel.startsWith('..') || rel === '' || existsSync(file) === false || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime.get(extname(file)) ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(resolveListen => server.listen(8101, '127.0.0.1', resolveListen));
  targetUrl = 'http://127.0.0.1:8101/';
}

mkdirSync('shots', { recursive: true });

const option = (id, label, i) => ({
  id,
  label,
  ok: i % 5 !== 4,
  reason: i % 5 === 4 ? (i % 2 ? 'missing-requirement' : 'not-affordable') : undefined,
  detail: i % 5 === 4 ? undefined : (i % 3 === 0 ? 'Ready' : undefined),
});

const injectStressState = async (page, scheme) => {
  await page.evaluate(({ KIND, TECH, ABILITIES, scheme }) => {
    const g = window.__game;
    const ui = window.__ui;
    g.update = () => {};
    ui.setupOpen.value = false;
    ui.mode.value = 'play';
    ui.controlScheme.value = scheme;
    ui.minerals.value = 3000;
    ui.gas.value = 3000;
    ui.supplyUsed.value = 180;
    ui.supplyMax.value = 200;
    ui.seconds.value = 999;
    ui.selCount.value = 48;
    ui.selKindName.value = 'All-Race Death Ball';
    ui.selStatus.value = {
      label: 'Mixed force',
      detail: 'all commands',
      progress: 0.52,
      stats: ['HP 200/200', 'Sh 150/150', 'En 250', 'G/A 24 R8', 'Air 20 R9', 'Arm 3+3', 'Cargo 6/8', 'Kills 12'],
    };
    ui.controlGroupCounts.value = [12, 8, 24, 0, 5, 2, 36, 0, 4, 1];
    ui.selTrainOptions.value = [
      [KIND.SCV, 'SCV'], [KIND.Marine, 'Marine'], [KIND.Firebat, 'Firebat'], [KIND.Medic, 'Medic'],
      [KIND.Ghost, 'Ghost'], [KIND.Vulture, 'Vulture'], [KIND.SiegeTank, 'Tank'], [KIND.Goliath, 'Goliath'],
      [KIND.Wraith, 'Wraith'], [KIND.Dropship, 'Dropship'], [KIND.ScienceVessel, 'Vessel'], [KIND.Battlecruiser, 'BC'],
      [KIND.Zealot, 'Zealot'], [KIND.Dragoon, 'Dragoon'], [KIND.HighTemplar, 'Templar'], [KIND.Carrier, 'Carrier'],
      [KIND.Zergling, 'Ling'], [KIND.Hydralisk, 'Hydra'], [KIND.Mutalisk, 'Muta'], [KIND.Ultralisk, 'Ultra'],
    ].map(([id, label], i) => ({ id, label, ok: i % 6 !== 5, reason: i % 6 === 5 ? 'queue-full' : undefined }));
    ui.selAddonOptions.value = [
      [KIND.ComsatStation, 'Comsat'], [KIND.NuclearSilo, 'Silo'], [KIND.MachineShop, 'Shop'], [KIND.ControlTower, 'Tower'],
    ].map(([id, label], i) => ({ id, label, ok: i !== 2, reason: i === 2 ? 'placement-blocked' : undefined }));
    ui.selTransformOptions.value = [
      [KIND.Archon, 'Archon'], [KIND.DarkArchon, 'Dark Archon'], [KIND.Lurker, 'Lurker'], [KIND.Lair, 'Lair'], [KIND.Hive, 'Hive'],
    ].map(([id, label]) => ({ id, label, ok: true }));
    ui.selBuildOptions.value = [
      [KIND.SupplyDepot, 'Depot'], [KIND.Barracks, 'Rax'], [KIND.Refinery, 'Refinery'], [KIND.EngineeringBay, 'Eng Bay'],
      [KIND.Bunker, 'Bunker'], [KIND.Factory, 'Factory'], [KIND.Starport, 'Starport'], [KIND.Armory, 'Armory'],
      [KIND.Nexus, 'Nexus'], [KIND.Pylon, 'Pylon'], [KIND.Gateway, 'Gateway'], [KIND.Forge, 'Forge'],
      [KIND.RoboticsFacility, 'Robotics'], [KIND.Stargate, 'Stargate'], [KIND.Hatchery, 'Hatchery'], [KIND.CreepColony, 'Colony'],
      [KIND.SpawningPool, 'Pool'], [KIND.EvolutionChamber, 'Evo'], [KIND.HydraliskDen, 'Hydra Den'], [KIND.Spire, 'Spire'],
    ].map(([id, label], i) => ({ id, label, ok: i % 7 !== 6, reason: i % 7 === 6 ? 'missing-requirement' : undefined }));
    ui.selResearchOptions.value = TECH.map((id, i) => ({
      id,
      ok: i % 4 !== 3,
      reason: i % 4 === 3 ? 'not-affordable' : undefined,
    }));
    ui.selAbilityOptions.value = ABILITIES.map((id, i) => ({
      id,
      ok: i % 6 !== 4,
      reason: i % 6 === 4 ? 'not-enough-energy' : undefined,
      detail: i % 8 === 7 ? 'No Nuke' : undefined,
    }));
    ui.selCanBuild.value = true;
    ui.selCanRally.value = true;
    ui.selCanHarvest.value = true;
    ui.selCanRepair.value = true;
    ui.selCanLoad.value = true;
    ui.selCanUnload.value = true;
    ui.selCanBurrow.value = true;
    ui.selCanUnburrow.value = true;
    ui.selCanMine.value = true;
    ui.selCanLift.value = true;
    ui.selCanLand.value = true;
    ui.selCanCancel.value = true;
    ui.selCanAttackMove.value = true;
    ui.selCanStop.value = true;
  }, { KIND, TECH, ABILITIES, scheme });
  await page.waitForTimeout(100);
};

const layoutReport = async (page) => page.evaluate(() => {
  const table = document.querySelector('[data-command-table="true"]');
  const cells = [...document.querySelectorAll('[data-command-cell], [data-command-table="true"] > div')];
  const tableRect = table?.getBoundingClientRect();
  let overlaps = 0;
  const rects = cells.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) overlaps++;
    }
  }
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    table: tableRect ? `${Math.round(tableRect.width)}x${Math.round(tableRect.height)}` : 'missing',
    cells: rects.length,
    overlaps,
    tableOverflows: table ? table.scrollWidth > table.clientWidth + 1 || table.scrollHeight > table.clientHeight + 1 : true,
    bodyScrolls: document.documentElement.scrollHeight > window.innerHeight + 1 || document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const cases = [
    { name: 'desktop-wide', scheme: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'desktop-narrow', scheme: 'desktop', viewport: { width: 840, height: 700 } },
    { name: 'desktop-tight', scheme: 'desktop', viewport: { width: 640, height: 700 } },
    { name: 'phone', scheme: 'mobile', device: devices['iPhone 12'] },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext({
      ...(c.device ?? { viewport: c.viewport, deviceScaleFactor: 1 }),
    });
    await ctx.addInitScript((scheme) => localStorage.setItem('rts.controlScheme', scheme), c.scheme);
    const page = await ctx.newPage();
    await page.goto(targetUrl, { waitUntil: 'load' });
    await page.waitForFunction('!!window.__game && !!window.__ui');
    await injectStressState(page, c.scheme);
    await page.screenshot({ path: `shots/command-stress-${c.name}.png` });
    await page.getByRole('button', { name: /More/ }).click();
    await page.waitForTimeout(60);
    await page.screenshot({ path: `shots/command-stress-${c.name}-page2.png` });
    console.log(c.name, await layoutReport(page));
    await ctx.close();
  }
  console.log('screenshots -> packages/app/shots/command-stress-*.png');
} finally {
  await browser.close();
  await new Promise(resolveClose => server ? server.close(resolveClose) : resolveClose());
}
