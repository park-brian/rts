import {
  Kind, TechDefs, Units, internalProductDef, internalProductsForProducer,
  nextTechLevel, techTime, type State,
} from './sim.ts';

export type EntityWork =
  | {
      t: 'production';
      kind: number;
      label: string;
      detail: string;
      remaining: number;
      total: number;
      queued: number;
    }
  | {
      t: 'research';
      tech: number;
      label: string;
      detail: string;
      remaining: number;
      total: number;
    }
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
  internalReady?: InternalReadyWork;
  producerLoad: number;
};

const internalReadyWork = (s: State, slot: number): InternalReadyWork | undefined => {
  const e = s.e;
  if (e.specialAmmo[slot]! <= 0) return undefined;
  for (const def of internalProductsForProducer(e.kind[slot]!)) {
    if (!def.display?.readyLabel) continue;
    return {
      t: 'internal-ready',
      kind: def.product,
      label: def.display.readyLabel,
      detail: def.display.readyDetail ?? 'Ready',
      amount: e.specialAmmo[slot]!,
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

  if (prod !== Kind.None) {
    const def = Units[prod]!;
    const internal = internalProductDef(e.kind[slot]!, prod);
    return {
      active: {
        t: 'production',
        kind: prod,
        label: internal?.display?.activeLabel ?? (def.buildMethod === 'morph' ? 'Morphing' : 'Training'),
        detail: `${def.name}${queued > 0 ? ` +${queued}` : ''}`,
        remaining: e.prodTimer[slot]!,
        total: def.buildTime,
        queued,
      },
      internalReady,
      producerLoad,
    };
  }

  const tech = e.researchKind[slot]!;
  if (tech !== Kind.None) {
    const def = TechDefs[tech]!;
    const level = nextTechLevel(s, e.owner[slot]!, tech);
    return {
      active: {
        t: 'research',
        tech,
        label: 'Researching',
        detail: def.name,
        remaining: e.researchTimer[slot]!,
        total: techTime(def, level),
      },
      internalReady,
      producerLoad,
    };
  }

  return { internalReady, producerLoad };
};
