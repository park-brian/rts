import { NONE, ONE, TILE, distanceSq, isEnemy, nearest, type State } from '@rts/sim';
import type { BotFacts, BotMemory } from './macro.ts';

export type PressureFocus = { x: number; y: number; target: number };

export const PRESSURE_COMMITMENT_TICKS = 45 * 24;

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
    memory.offenseWaitSince = -1;
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

const bestKnownEnemyRegion = (s: State, facts: BotFacts, depot: number): PressureFocus | null => {
  const e = s.e;
  let focusX = 0;
  let focusY = 0;
  let bestValue = -1;
  let bestDistance = Infinity;
  for (const region of facts.enemyProtectedRegions) {
    const distance = distanceSq(e.x[depot]!, e.y[depot]!, region.x, region.y);
    if (region.value < bestValue) continue;
    if (region.value === bestValue && distance >= bestDistance) continue;
    bestValue = region.value;
    bestDistance = distance;
    focusX = region.x;
    focusY = region.y;
  }
  if (bestValue < 0) return null;

  let target = NONE;
  let targetDistance = Infinity;
  for (const enemy of facts.visibleEnemies) {
    if (s.e.alive[enemy] !== 1) continue;
    const distance = distanceSq(focusX, focusY, s.e.x[enemy]!, s.e.y[enemy]!);
    if (distance >= targetDistance) continue;
    target = enemy;
    targetDistance = distance;
  }
  return { x: focusX, y: focusY, target };
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
  let bestDistance = -1;
  for (let i = 0; i < s.map.starts.length; i++) {
    if ((s.map.teams[i] ?? i) === ownTeam) continue;
    const start = s.map.starts[i]!;
    const x = (start.x * TILE + (TILE >> 1)) * ONE;
    const y = (start.y * TILE + (TILE >> 1)) * ONE;
    const distance = distanceSq(e.x[depot]!, e.y[depot]!, x, y);
    if (distance <= bestDistance) continue;
    bestX = x;
    bestY = y;
    bestDistance = distance;
  }
  return bestDistance < 0 ? null : { x: bestX, y: bestY, target: NONE };
};

export const pressureFocus = (
  s: State,
  player: number,
  facts: BotFacts,
  depot: number,
): PressureFocus | null =>
  bestKnownEnemyRegion(s, facts, depot) ??
  visibleEnemyFocus(s, player, facts, depot) ??
  publicEnemyStartFocus(s, player, depot);
