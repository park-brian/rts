import { Kind, TechDefs, Units } from '../data.ts';
import { internalProductDef, internalProductReadyCount, internalProductsForProducer } from '../internal-products.ts';
import { nextTechLevel, techTime } from '../tech.ts';
import type { State } from './world.ts';

export type EntityProductionWork = {
  t: 'production';
  kind: number;
  label: string;
  detail: string;
  remaining: number;
  total: number;
  queued: number;
};

export type EntityResearchWork = {
  t: 'research';
  tech: number;
  label: string;
  detail: string;
  remaining: number;
  total: number;
};

export type EntityWork =
  | EntityProductionWork
  | EntityResearchWork
  | {
      t: 'internal-ready';
      kind: number;
      label: string;
      detail: string;
      amount: number;
    };

type InternalReadyWork = Extract<EntityWork, { t: 'internal-ready' }>;

export type EntityWorkQueue = {
  active?: EntityWork;
  production?: EntityProductionWork;
  research?: EntityResearchWork;
  internalReady?: InternalReadyWork;
  producerLoad: number;
};

const internalReadyWork = (s: State, slot: number): InternalReadyWork | undefined => {
  const e = s.e;
  for (const def of internalProductsForProducer(e.kind[slot]!)) {
    if (!def.display?.readyLabel) continue;
    const amount = internalProductReadyCount(s, slot, def.product);
    if (amount <= 0) continue;
    return {
      t: 'internal-ready',
      kind: def.product,
      label: def.display.readyLabel,
      detail: def.display.readyDetail ?? 'Ready',
      amount,
    };
  }
  return undefined;
};

export const entityWorkQueue = (s: State, slot: number): EntityWorkQueue => {
  const e = s.e;
  const prod = e.prodKind[slot]!;
  const queued = prod === Kind.None ? 0 : e.prodQueued[slot]!;
  const producerLoad = (prod === Kind.None ? 0 : 1 + queued) * 1_000_000 + e.prodTimer[slot]!;
  const internalReady = internalReadyWork(s, slot);
  const tech = e.researchKind[slot]!;
  const research = tech === Kind.None ? undefined : (() => {
    const def = TechDefs[tech]!;
    const level = nextTechLevel(s, e.owner[slot]!, tech);
    return {
      t: 'research' as const,
      tech,
      label: 'Researching',
      detail: def.name,
      remaining: e.researchTimer[slot]!,
      total: techTime(def, level),
    };
  })();

  if (prod !== Kind.None) {
    const def = Units[prod]!;
    const internal = internalProductDef(e.kind[slot]!, prod);
    const production: EntityProductionWork = {
      t: 'production',
      kind: prod,
      label: internal?.display?.activeLabel ?? (def.buildMethod === 'morph' ? 'Morphing' : 'Training'),
      detail: `${def.name}${queued > 0 ? ` +${queued}` : ''}`,
      remaining: e.prodTimer[slot]!,
      total: def.buildTime,
      queued,
    };
    return {
      active: production,
      production,
      research,
      internalReady,
      producerLoad,
    };
  }

  if (research) {
    return {
      active: research,
      research,
      internalReady,
      producerLoad,
    };
  }

  return { internalReady, producerLoad };
};
