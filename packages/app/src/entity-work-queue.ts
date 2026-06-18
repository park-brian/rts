import { Kind, TechDefs, Units, nextTechLevel, techTime, type State } from './sim.ts';

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

export const entityWorkQueue = (s: State, slot: number): EntityWorkQueue => {
  const e = s.e;
  const prod = e.prodKind[slot]!;
  const queued = prod === Kind.None ? 0 : e.prodQueued[slot]!;
  const producerLoad = (prod === Kind.None ? 0 : 1 + queued) * 1_000_000 + e.prodTimer[slot]!;
  const internalReady: InternalReadyWork | undefined = e.kind[slot] === Kind.NuclearSilo && e.specialAmmo[slot]! > 0
    ? { t: 'internal-ready', kind: Kind.NuclearMissile, label: 'Nuke Ready', detail: 'Ready', amount: e.specialAmmo[slot]! }
    : undefined;

  if (prod !== Kind.None) {
    const def = Units[prod]!;
    return {
      active: {
        t: 'production',
        kind: prod,
        label: prod === Kind.NuclearMissile ? 'Arming' : def.buildMethod === 'morph' ? 'Morphing' : 'Training',
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
