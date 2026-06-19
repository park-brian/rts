import { NONE, ONE, TILE, distanceSq, isEnemy, nearest, type State } from '@rts/sim';
import { riskAt, type BotFacts, type BotMemory, type ProtectedRegion } from './macro.ts';

export type PressureFocus = { x: number; y: number; target: number };
export type PressureFocusOptions = {
  strategicOnly?: boolean;
};

export const PRESSURE_COMMITMENT_TICKS = 45 * 24;
const LETHAL_PRESSURE_RISK = 40;

export const pressureCommitmentTicks = (force: number, threshold: number): number => {
  if (force <= 0) return Infinity;
  if (threshold <= 0 || force >= threshold) return 0;
  return Math.trunc((PRESSURE_COMMITMENT_TICKS * (threshold - force)) / threshold);
};

export const shouldCommitPressure = (
  memory: BotMemory,
  tick: number,
  force: number,
  threshold: number,
): boolean => {
  if (force <= 0) {
    return false;
  }
  const waitTicks = pressureCommitmentTicks(force, threshold);
  if (waitTicks === 0) return true;
  if (memory.offenseWaitSince < 0 || tick < memory.offenseWaitSince) memory.offenseWaitSince = tick;
  return tick - memory.offenseWaitSince >= waitTicks;
};

export const markPressureCommitted = (memory: BotMemory, tick: number): void => {
  memory.offenseWaitSince = tick;
};

const pressureRegionRisk = (facts: BotFacts, region: ProtectedRegion): number =>
  facts.risk.vision === 'omitted' ? 0 : riskAt(facts.risk, region.x, region.y);

const betterPressureRegion = (
  s: State,
  facts: BotFacts,
  depot: number,
  candidate: ProtectedRegion,
  current: ProtectedRegion | null,
): boolean => {
  if (!current) return true;
  const candidateRisk = pressureRegionRisk(facts, candidate);
  const currentRisk = pressureRegionRisk(facts, current);
  const candidateLethal = candidateRisk >= LETHAL_PRESSURE_RISK;
  const currentLethal = currentRisk >= LETHAL_PRESSURE_RISK;
  if (candidateLethal !== currentLethal) return !candidateLethal;
  if (candidateLethal && candidateRisk !== currentRisk) return candidateRisk < currentRisk;
  if (candidate.value !== current.value) return candidate.value > current.value;
  if (!candidateLethal && candidateRisk !== currentRisk) return candidateRisk < currentRisk;

  const e = s.e;
  const candidateDistance = distanceSq(e.x[depot]!, e.y[depot]!, candidate.x, candidate.y);
  const currentDistance = distanceSq(e.x[depot]!, e.y[depot]!, current.x, current.y);
  return candidateDistance < currentDistance;
};

const bestKnownEnemyRegion = (s: State, facts: BotFacts, depot: number): PressureFocus | null => {
  const e = s.e;
  let best: ProtectedRegion | null = null;
  for (const region of facts.enemyProtectedRegions) {
    if (betterPressureRegion(s, facts, depot, region, best)) best = region;
  }
  if (!best) return null;

  let target = NONE;
  let targetDistance = Infinity;
  for (const enemy of facts.visibleEnemies) {
    if (s.e.alive[enemy] !== 1) continue;
    const distance = distanceSq(best.x, best.y, s.e.x[enemy]!, s.e.y[enemy]!);
    if (distance >= targetDistance) continue;
    target = enemy;
    targetDistance = distance;
  }
  return { x: best.x, y: best.y, target };
};

const visibleEnemyFocus = (s: State, player: number, facts: BotFacts, depot: number): PressureFocus | null => {
  const e = s.e;
  let target = NONE;
  if (!s.trackVision) {
    target = nearest(s, e.x[depot]!, e.y[depot]!, (sl) =>
      isEnemy(s, player, e.owner[sl]!) && e.built[sl] === 1);
  } else {
    let bestDistance = Infinity;
    for (const enemy of facts.visibleEnemies) {
      if (e.alive[enemy] !== 1) continue;
      const distance = distanceSq(e.x[depot]!, e.y[depot]!, e.x[enemy]!, e.y[enemy]!);
      if (distance >= bestDistance) continue;
      target = enemy;
      bestDistance = distance;
    }
  }
  return target === NONE ? null : { x: e.x[target]!, y: e.y[target]!, target };
};

const publicEnemyStartFocus = (s: State, player: number, depot: number): PressureFocus | null => {
  const ownTeam = s.teams[player] ?? player;
  const e = s.e;
  let bestX = 0;
  let bestY = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < s.map.starts.length; i++) {
    if ((s.map.teams[i] ?? i) === ownTeam) continue;
    const start = s.map.starts[i]!;
    const x = (start.x * TILE + (TILE >> 1)) * ONE;
    const y = (start.y * TILE + (TILE >> 1)) * ONE;
    const distance = distanceSq(e.x[depot]!, e.y[depot]!, x, y);
    if (distance >= bestDistance) continue;
    bestX = x;
    bestY = y;
    bestDistance = distance;
  }
  return bestDistance === Infinity ? null : { x: bestX, y: bestY, target: NONE };
};

export const pressureFocus = (
  s: State,
  player: number,
  facts: BotFacts,
  depot: number,
  options: PressureFocusOptions = {},
): PressureFocus | null =>
  bestKnownEnemyRegion(s, facts, depot) ??
  (options.strategicOnly ? null : visibleEnemyFocus(s, player, facts, depot)) ??
  publicEnemyStartFocus(s, player, depot);
