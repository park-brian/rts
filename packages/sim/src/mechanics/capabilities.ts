import { Kind, Role, Units, isLarvaSourceKind } from '../data/index.ts';

const ProducerFlags = {
  SupportsWorkerRally: 1 << 0,
  ProducesOnlyWorkers: 1 << 1,
} as const;

const EMPTY_PRODUCTS: readonly number[] = [];

const maxKind = (): number => {
  let max = 0;
  for (const value of Object.values(Kind)) {
    if (typeof value === 'number' && value > max) max = value;
  }
  return max;
};

const MAX_KIND = maxKind();

const productsByKind: Array<readonly number[] | undefined> = new Array(MAX_KIND + 1);
const producerFlagsByKind = new Uint8Array(MAX_KIND + 1);

const isWorkerKind = (kind: number): boolean =>
  ((Units[kind]?.roles ?? 0) & Role.Worker) !== 0;

for (const [key, def] of Object.entries(Units)) {
  if (!def) continue;
  const kind = Number(key);
  const products = def.produces.length > 0 ? def.produces : EMPTY_PRODUCTS;
  productsByKind[kind] = products;

  let flags = 0;
  if (isLarvaSourceKind(kind) || products.some(isWorkerKind)) flags |= ProducerFlags.SupportsWorkerRally;
  if (products.length > 0 && products.every(isWorkerKind)) flags |= ProducerFlags.ProducesOnlyWorkers;
  producerFlagsByKind[kind] = flags;
}

export const producedKindsFor = (producerKind: number): readonly number[] =>
  productsByKind[producerKind] ?? EMPTY_PRODUCTS;

export const canProduceKind = (producerKind: number, productKind: number): boolean =>
  producedKindsFor(producerKind).includes(productKind);

export const producerKindSupportsWorkerRally = (producerKind: number): boolean =>
  (producerFlagsByKind[producerKind] & ProducerFlags.SupportsWorkerRally) !== 0;

export const producerKindDirectlyProducesOnlyWorkers = (producerKind: number): boolean =>
  (producerFlagsByKind[producerKind] & ProducerFlags.ProducesOnlyWorkers) !== 0;
