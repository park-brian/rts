import type {
  BotFailureReason,
  BotIntent,
  BotIntentExpectation,
  BotIntentKind,
  BotIntentProgressMetric,
  BotIntentRecord,
  BotVictoryAxis,
} from './macro-intents.ts';
import { scoreBotIntent, scoreBotIntentRecord, type BotExpertContext } from './macro-objective.ts';

export type BotIntentFields = Omit<BotIntent, 'kind' | 'urgency'> & {
  urgency?: number;
};

export type BotIntentCandidate<T = unknown> = T & {
  order: number;
  intent: BotIntent;
};

export type BotIntentOpportunityCost = {
  axis: BotVictoryAxis;
  detail: string;
};

export type BotIntentExpertEvaluation = {
  axis: BotVictoryAxis;
  metric: BotIntentProgressMetric;
  windowTicks: number;
  policy: string;
  opportunityCosts: readonly BotIntentOpportunityCost[];
  failureModes: readonly BotFailureReason[];
};

export const botIntentUrgency = (kind: BotIntentKind): number => {
  switch (kind) {
    case 'take-gas': return 46;
    case 'rebuild-tech': return 45;
    case 'add-static-defense': return 42;
    case 'expand': return 35;
    case 'train-worker': return 35;
    case 'spend-larva': return 35;
    case 'add-production': return 30;
    case 'train-counter': return 30;
    case 'research-upgrade': return 25;
    default: return 20;
  }
};

export const botIntentVictoryAxis = (kind: BotIntentKind): BotVictoryAxis => {
  switch (kind) {
    case 'train-worker':
    case 'expand':
      return 'economy-growth';
    case 'spend-larva':
    case 'train-counter':
      return 'combat-strength';
    case 'add-production':
      return 'production-throughput';
    case 'take-gas':
    case 'rebuild-tech':
    case 'research-upgrade':
      return 'tech-unlock';
    case 'defend-base':
    case 'get-detection':
    case 'clear-site':
    case 'evacuate-workers':
    case 'add-static-defense':
    case 'retreat':
      return 'safety';
    case 'attack-wave':
    case 'harass':
    case 'contain':
    case 'counterattack':
      return 'enemy-degradation';
    case 'scout':
      return 'map-control';
  }
};

export const botIntentExpectation = (kind: BotIntentKind): BotIntentExpectation => {
  switch (kind) {
    case 'train-worker':
      return {
        metric: 'worker-pipeline',
        windowTicks: 8 * 24,
        detail: 'worker production should enter the queue',
      };
    case 'spend-larva':
    case 'train-counter':
      return {
        metric: 'combat-pipeline',
        windowTicks: 8 * 24,
        detail: 'combat production should enter the queue',
      };
    case 'add-production':
      return {
        metric: 'production-capacity',
        windowTicks: 45 * 24,
        detail: 'combat production capacity should increase or become pending',
      };
    case 'expand':
      return {
        metric: 'base-count',
        windowTicks: 90 * 24,
        detail: 'a resource depot should start or complete at a base cluster',
      };
    case 'take-gas':
    case 'rebuild-tech':
    case 'research-upgrade':
      return {
        metric: 'tech-unlock',
        windowTicks: 60 * 24,
        detail: 'a tech, upgrade, gas, add-on, or prerequisite should progress',
      };
    case 'add-static-defense':
      return {
        metric: 'defense-command',
        windowTicks: 45 * 24,
        detail: 'static defense should start near the protected region',
      };
    case 'defend-base':
    case 'get-detection':
    case 'clear-site':
    case 'evacuate-workers':
    case 'retreat':
      return {
        metric: 'safety-command',
        windowTicks: 10 * 24,
        detail: 'a safety command should be issued or the incident should resolve',
      };
    case 'attack-wave':
    case 'harass':
    case 'contain':
    case 'counterattack':
      return {
        metric: 'combat-command',
        windowTicks: 12 * 24,
        detail: 'combat units should receive attack, travel, or ability commands',
      };
    case 'scout':
      return {
        metric: 'map-control',
        windowTicks: 30 * 24,
        detail: 'scouting should reveal or approach valuable map space',
      };
  }
};

type BotIntentExpertRule = {
  policy: string;
  opportunityCosts?: readonly BotIntentOpportunityCost[];
  failureModes?: readonly BotFailureReason[];
};

const cost = (axis: BotVictoryAxis, detail: string): BotIntentOpportunityCost => ({ axis, detail });

const BOT_INTENT_EXPERT_RULES: Record<BotIntentKind, BotIntentExpertRule> = {
  'defend-base': {
    policy: 'pull enough force to stop damage at bases before the economy snowballs backward',
    opportunityCosts: [cost('enemy-degradation', 'defenders are not attacking or containing while they respond')],
    failureModes: ['insufficient-force', 'path-blocked'],
  },
  'get-detection': {
    policy: 'restore vision against cloak or burrow before committing units into unseen damage',
    opportunityCosts: [cost('combat-strength', 'detection tech can delay immediate army growth')],
    failureModes: ['missing-prerequisite', 'no-producer', 'resource-starved'],
  },
  'clear-site': {
    policy: 'remove blockers from a strategic build or expansion site so macro can continue',
    opportunityCosts: [cost('combat-strength', 'the clearing squad is temporarily unavailable for the main army')],
    failureModes: ['insufficient-force', 'path-blocked'],
  },
  'evacuate-workers': {
    policy: 'preserve worker value when a mineral line cannot be held with current local force',
    opportunityCosts: [cost('economy-growth', 'evacuated workers stop mining until they are retasked')],
    failureModes: ['path-blocked', 'insufficient-force'],
  },
  'take-gas': {
    policy: 'unlock gas-gated combat tech only when the opening can afford the mining delay',
    opportunityCosts: [cost('combat-strength', 'early gas can delay the first fighting unit')],
    failureModes: ['no-builder', 'resource-starved', 'placement-unavailable'],
  },
  'rebuild-tech': {
    policy: 'restore or unlock the next capability needed by the current strategy',
    opportunityCosts: [cost('combat-strength', 'tech spending can defer units if the combat path is not online')],
    failureModes: ['missing-prerequisite', 'no-builder', 'resource-starved', 'placement-unavailable'],
  },
  'add-static-defense': {
    policy: 'buy local safety where mobile units cannot cover workers or ramps in time',
    opportunityCosts: [cost('combat-strength', 'static defense does not move with the attacking army')],
    failureModes: ['no-builder', 'resource-starved', 'placement-unavailable', 'unsafe-location'],
  },
  'add-production': {
    policy: 'increase the rate resources become combat units before the army-strength slope stalls',
    opportunityCosts: [cost('tech-unlock', 'production spending can postpone tech if the current army is safe')],
    failureModes: ['no-builder', 'resource-starved', 'placement-unavailable', 'missing-prerequisite'],
  },
  expand: {
    policy: 'claim another resource cluster when worker count or mineral float needs more income space',
    opportunityCosts: [cost('safety', 'a new base creates a larger area that must be defended')],
    failureModes: ['no-builder', 'resource-starved', 'placement-unavailable', 'path-blocked'],
  },
  'train-worker': {
    policy: 'grow the income slope until the current base plan has enough workers',
    opportunityCosts: [cost('combat-strength', 'worker production spends larvae or depot time that could make army')],
    failureModes: ['no-producer', 'resource-starved', 'supply-blocked'],
  },
  'spend-larva': {
    policy: 'convert scarce larvae into the unit type that best advances the current army plan',
    opportunityCosts: [cost('economy-growth', 'combat larvae cannot also become workers')],
    failureModes: ['no-producer', 'resource-starved', 'supply-blocked', 'missing-prerequisite'],
  },
  'train-counter': {
    policy: 'turn ready production capacity into fighting value and matchup answers',
    opportunityCosts: [cost('economy-growth', 'army production spends resources that could grow workers or bases')],
    failureModes: ['no-producer', 'resource-starved', 'supply-blocked', 'missing-prerequisite'],
  },
  'research-upgrade': {
    policy: 'raise effective army value when enough units or queued units can benefit',
    opportunityCosts: [cost('combat-strength', 'research can delay additional bodies during a fragile opening')],
    failureModes: ['no-producer', 'resource-starved', 'missing-prerequisite'],
  },
  scout: {
    policy: 'buy information that improves expansion, defense, and attack commitments',
    opportunityCosts: [cost('economy-growth', 'a scout may stop mining or fighting while gathering information')],
    failureModes: ['path-blocked'],
  },
  'attack-wave': {
    policy: 'force the enemy to react once the army can project damage without waiting forever',
    opportunityCosts: [cost('safety', 'attacking units are not home to defend the next threat')],
    failureModes: ['insufficient-force', 'path-blocked'],
  },
  harass: {
    policy: 'damage workers, mining, or exposed tech with a small force when a direct fight is poor',
    opportunityCosts: [cost('combat-strength', 'split harassment weakens the main army temporarily')],
    failureModes: ['insufficient-force', 'path-blocked', 'missing-detection'],
  },
  contain: {
    policy: 'hold enemy movement or expansions when map position is worth more than immediate damage',
    opportunityCosts: [cost('economy-growth', 'contained forces are not defending new own expansions')],
    failureModes: ['insufficient-force', 'path-blocked'],
  },
  counterattack: {
    policy: 'trade for enemy economy or tech when defending directly is lower value',
    opportunityCosts: [cost('safety', 'counterattack accepts local damage to create higher enemy damage')],
    failureModes: ['insufficient-force', 'path-blocked'],
  },
  retreat: {
    policy: 'preserve army value when the current fight would lower future victory chances',
    opportunityCosts: [cost('enemy-degradation', 'retreat gives up immediate pressure and map damage')],
    failureModes: ['path-blocked'],
  },
};

export const botIntentExpertEvaluation = (kind: BotIntentKind): BotIntentExpertEvaluation => {
  const expectation = botIntentExpectation(kind);
  const rule = BOT_INTENT_EXPERT_RULES[kind];
  return {
    axis: botIntentVictoryAxis(kind),
    metric: expectation.metric,
    windowTicks: expectation.windowTicks,
    policy: rule.policy,
    opportunityCosts: rule.opportunityCosts ?? [],
    failureModes: rule.failureModes ?? [],
  };
};

export const botIntent = (kind: BotIntentKind, fields: BotIntentFields = {}): BotIntent => {
  const { urgency, ...rest } = fields;
  return { kind, urgency: urgency ?? botIntentUrgency(kind), ...rest };
};

export const scoreBotIntentRecords = (
  records: readonly BotIntentRecord[],
  expert: BotExpertContext,
): BotIntentRecord[] => records.map((record) => scoreBotIntentRecord(record, expert));

export const rankBotIntentRecords = (records: readonly BotIntentRecord[]): BotIntentRecord[] =>
  [...records].sort((a, b) =>
    b.intent.urgency - a.intent.urgency ||
    (b.intent.score?.value ?? 0) - (a.intent.score?.value ?? 0));

export const rankBotIntentCandidates = <T extends BotIntentCandidate>(
  candidates: readonly T[],
  expert: BotExpertContext,
): T[] =>
  candidates
    .map((candidate) => ({ ...candidate, intent: scoreBotIntent(candidate.intent, expert) }))
    .sort((a, b) =>
      (b.intent.score?.value ?? 0) - (a.intent.score?.value ?? 0) ||
      b.intent.urgency - a.intent.urgency ||
      a.order - b.order);
