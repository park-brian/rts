import { Abilities, Kind, Role, TechDefs, Units, hasAnyWeapon, isLarvaSourceKind, workerBuildKindsFor, type BuildMethod } from '../data/index.ts';

const ProducerFlags = {
  SupportsWorkerRally: 1 << 0,
  ProducesOnlyWorkers: 1 << 1,
} as const;

const EMPTY_PRODUCTS: readonly number[] = [];
const EMPTY_TECHS: readonly number[] = [];
const EMPTY_ABILITIES: readonly number[] = [];
const EMPTY_BUILDS: readonly number[] = [];
const BASE_DEPOT_KINDS = [Kind.CommandCenter, Kind.Nexus, Kind.Hatchery, Kind.Lair, Kind.Hive] as const;
const SMALL_STATIC_DEFENSE_KINDS = [Kind.MissileTurret, Kind.PhotonCannon, Kind.SporeColony] as const;

const maxKind = (): number => {
  let max = 0;
  for (const value of Object.values(Kind)) {
    if (typeof value === 'number' && value > max) max = value;
  }
  return max;
};

const MAX_KIND = maxKind();

const productsByKind: Array<readonly number[] | undefined> = new Array(MAX_KIND + 1);
const researchTechsByKind: Array<number[] | undefined> = new Array(MAX_KIND + 1);
const abilitiesByKind: Array<readonly number[] | undefined> = new Array(MAX_KIND + 1);
const workerBuildsByKind: Array<readonly number[] | undefined> = new Array(MAX_KIND + 1);
const buildMethodByKind: Array<BuildMethod | undefined> = new Array(MAX_KIND + 1);
const producerFlagsByKind = new Uint8Array(MAX_KIND + 1);
const baseDepotByKind = new Uint8Array(MAX_KIND + 1);
const directWeaponByKind = new Uint8Array(MAX_KIND + 1);
const smallStaticDefenseByKind = new Uint8Array(MAX_KIND + 1);
const transportByKind = new Uint8Array(MAX_KIND + 1);

const isWorkerKind = (kind: number): boolean =>
  ((Units[kind]?.roles ?? 0) & Role.Worker) !== 0;

for (const [key, def] of Object.entries(Units)) {
  if (!def) continue;
  const kind = Number(key);
  const products = def.produces.length > 0 ? def.produces : EMPTY_PRODUCTS;
  productsByKind[kind] = products;
  buildMethodByKind[kind] = def.buildMethod;
  abilitiesByKind[kind] = def.abilities.length > 0 ? def.abilities : EMPTY_ABILITIES;
  if (hasAnyWeapon(def)) directWeaponByKind[kind] = 1;
  if (def.cargoCapacity > 0) transportByKind[kind] = 1;
  if (isWorkerKind(kind)) workerBuildsByKind[kind] = workerBuildKindsFor(def.race);

  let flags = 0;
  if (isLarvaSourceKind(kind) || products.some(isWorkerKind)) flags |= ProducerFlags.SupportsWorkerRally;
  if (products.length > 0 && products.every(isWorkerKind)) flags |= ProducerFlags.ProducesOnlyWorkers;
  producerFlagsByKind[kind] = flags;
}

for (const [key, def] of Object.entries(TechDefs)) {
  const tech = Number(key);
  for (const producer of def.producers) {
    let techs = researchTechsByKind[producer];
    if (!techs) {
      techs = [];
      researchTechsByKind[producer] = techs;
    }
    techs.push(tech);
  }
}

for (const techs of researchTechsByKind) techs?.sort((a, b) => a - b);

for (const kind of BASE_DEPOT_KINDS) baseDepotByKind[kind] = 1;

for (const kind of SMALL_STATIC_DEFENSE_KINDS) {
  const def = Units[kind];
  if (def && def.footprintW <= 2 && def.footprintH <= 2) smallStaticDefenseByKind[kind] = 1;
}

export const producedKindsFor = (producerKind: number): readonly number[] =>
  productsByKind[producerKind] ?? EMPTY_PRODUCTS;

export const canProduceKind = (producerKind: number, productKind: number): boolean =>
  producedKindsFor(producerKind).includes(productKind);

export const buildMethodForKind = (kind: number): BuildMethod | undefined =>
  buildMethodByKind[kind];

export const isLarvaProductKind = (kind: number): boolean =>
  buildMethodForKind(kind) === 'larva';

export const isBaseDepotKind = (kind: number): boolean =>
  baseDepotByKind[kind] === 1;

export const isSmallStaticDefenseKind = (kind: number): boolean =>
  smallStaticDefenseByKind[kind] === 1;

export const kindHasDirectWeapon = (kind: number): boolean =>
  directWeaponByKind[kind] === 1;

export const kindHasCargoCapacity = (kind: number): boolean =>
  transportByKind[kind] === 1;

export const researchTechsFor = (producerKind: number): readonly number[] =>
  researchTechsByKind[producerKind] ?? EMPTY_TECHS;

export const canResearchTech = (producerKind: number, tech: number): boolean =>
  researchTechsFor(producerKind).includes(tech);

export const abilitiesFor = (kind: number): readonly number[] =>
  abilitiesByKind[kind] ?? EMPTY_ABILITIES;

export const canUseAbilityKind = (kind: number, ability: number): boolean =>
  abilitiesFor(kind).includes(ability) && (Abilities[ability]?.casters.includes(kind) ?? false);

export const kindHasAbilities = (kind: number): boolean =>
  abilitiesFor(kind).length > 0;

export const workerBuildKindsForWorkerKind = (workerKind: number): readonly number[] =>
  workerBuildsByKind[workerKind] ?? EMPTY_BUILDS;

export const canWorkerBuildKind = (workerKind: number, structureKind: number): boolean => {
  const worker = Units[workerKind];
  const structure = Units[structureKind];
  if (!worker || !structure || worker.race !== structure.race) return false;
  return workerBuildKindsForWorkerKind(workerKind).includes(structureKind);
};

export const producerKindSupportsWorkerRally = (producerKind: number): boolean =>
  (producerFlagsByKind[producerKind] & ProducerFlags.SupportsWorkerRally) !== 0;

export const producerKindDirectlyProducesOnlyWorkers = (producerKind: number): boolean =>
  (producerFlagsByKind[producerKind] & ProducerFlags.ProducesOnlyWorkers) !== 0;
