import {
  CARRIER_INTERCEPTOR_CAPACITY, CARRIER_INTERCEPTOR_UPGRADED_CAPACITY, Kind,
  REAVER_SCARAB_CAPACITY, REAVER_SCARAB_UPGRADED_CAPACITY, SPIDER_MINE_CHARGES, Tech,
} from '../data.ts';
import { getTechLevel } from './tech.ts';
import type { State } from '../entity/world.ts';

export type InternalProductDisplay = {
  trainLabel?: string;
  activeLabel?: string;
  optionActiveLabel?: string;
  optionActiveDetail?: string;
  readyLabel?: string;
  readyDetail?: string;
};

export type InternalProductDef = {
  producer: number;
  product: number;
  baseCapacity: number;
  requiresTech?: number;
  capacityTech?: number;
  upgradedCapacity?: number;
  display?: InternalProductDisplay;
};

export const InternalProductDefs: readonly InternalProductDef[] = [
  {
    producer: Kind.Reaver,
    product: Kind.Scarab,
    baseCapacity: REAVER_SCARAB_CAPACITY,
    capacityTech: Tech.ReaverCapacity,
    upgradedCapacity: REAVER_SCARAB_UPGRADED_CAPACITY,
  },
  {
    producer: Kind.Carrier,
    product: Kind.Interceptor,
    baseCapacity: CARRIER_INTERCEPTOR_CAPACITY,
    capacityTech: Tech.CarrierCapacity,
    upgradedCapacity: CARRIER_INTERCEPTOR_UPGRADED_CAPACITY,
  },
  {
    producer: Kind.Vulture,
    product: Kind.SpiderMine,
    baseCapacity: SPIDER_MINE_CHARGES,
    requiresTech: Tech.SpiderMines,
  },
  {
    producer: Kind.NuclearSilo,
    product: Kind.NuclearMissile,
    baseCapacity: 1,
    display: {
      trainLabel: 'Arm Nuke',
      activeLabel: 'Arming',
      optionActiveLabel: 'Arming Nuke',
      optionActiveDetail: 'Arming',
      readyLabel: 'Nuke Ready',
      readyDetail: 'Ready',
    },
  },
] as const;

export const internalProductDef = (producerKind: number, productKind: number): InternalProductDef | undefined =>
  InternalProductDefs.find((def) => def.producer === producerKind && def.product === productKind);

export const internalProductsForProducer = (producerKind: number): readonly InternalProductDef[] =>
  InternalProductDefs.filter((def) => def.producer === producerKind);

const internalProductTechAvailable = (s: State, producer: number, def: InternalProductDef): boolean => {
  if (def.requiresTech === undefined) return true;
  const owner = s.e.owner[producer]!;
  return owner >= 0 && owner < s.teams.length && getTechLevel(s, owner, def.requiresTech) > 0;
};

export const internalProductCapacity = (s: State, producer: number, productKind: number): number => {
  const def = internalProductDef(s.e.kind[producer]!, productKind);
  if (!def) return 0;
  if (!internalProductTechAvailable(s, producer, def)) return 0;
  const owner = s.e.owner[producer]!;
  if (def.capacityTech !== undefined && def.upgradedCapacity !== undefined &&
      owner >= 0 && owner < s.teams.length && getTechLevel(s, owner, def.capacityTech) > 0) {
    return def.upgradedCapacity;
  }
  return def.baseCapacity;
};

export const internalProductReadyCount = (s: State, producer: number, productKind: number): number =>
  Math.min(s.e.specialAmmo[producer]!, internalProductCapacity(s, producer, productKind));

export const hasInternalProductReady = (s: State, producer: number, productKind: number): boolean =>
  internalProductReadyCount(s, producer, productKind) > 0;

export const canQueueInternalProduct = (
  s: State,
  producer: number,
  productKind: number,
  queued = 0,
): boolean => {
  const capacity = internalProductCapacity(s, producer, productKind);
  return capacity > 0 && s.e.specialAmmo[producer]! + queued < capacity;
};

export const consumeInternalProduct = (s: State, producer: number, productKind: number): boolean => {
  if (!hasInternalProductReady(s, producer, productKind)) return false;
  s.e.specialAmmo[producer] = s.e.specialAmmo[producer]! - 1;
  return true;
};

export const storeInternalProduct = (s: State, producer: number, productKind: number): boolean => {
  const capacity = internalProductCapacity(s, producer, productKind);
  if (capacity <= 0 || s.e.specialAmmo[producer]! >= capacity) return false;
  s.e.specialAmmo[producer] = s.e.specialAmmo[producer]! + 1;
  return true;
};

export const completeInternalProduct = (s: State, producer: number, productKind: number): boolean => {
  const capacity = internalProductCapacity(s, producer, productKind);
  if (capacity <= 0) return false;
  s.e.specialAmmo[producer] = Math.min(capacity, s.e.specialAmmo[producer]! + 1);
  return true;
};

export const refillInternalProduct = (s: State, producer: number, productKind: number): void => {
  const capacity = internalProductCapacity(s, producer, productKind);
  if (capacity > 0) s.e.specialAmmo[producer] = Math.max(s.e.specialAmmo[producer]!, capacity);
};
