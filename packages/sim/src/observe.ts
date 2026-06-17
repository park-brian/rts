// Fog-limited observation for one player — the fair-play view a networked human or
// a neural-net policy sees (vs. fullState()'s god view used by scripted bots). The
// sim is deterministic and seeded, so observations are reproducible. This is the
// seam the RL env interface (docs/specs/ai-training.md) builds on.

import type { State } from './world.ts';
import { eid, isAlive, NEUTRAL, NONE, slotOf } from './world.ts';
import { EffectKind, Kind, TECH_CAP, Units, TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { canDetect } from './detection.ts';
import { isContained, sameTeam } from './cargo.ts';

export type EntityView = {
  id: number; kind: number; owner: number;
  x: number; y: number; hp: number; built: number; order: number;
};

export type QueueView = {
  id: number;
  prodKind: number;
  prodTimer: number;
  prodQueued: number;
  researchKind: number;
  researchTimer: number;
};

export type CargoView = {
  container: number;
  units: number[];
};

export type StatusView = {
  id: number;
  energy: number;
  energyMax: number;
  stimTimer: number;
  matrixHp: number;
  matrixTimer: number;
  irradiateTimer: number;
  plagueTimer: number;
  ensnareTimer: number;
  lockdownTimer: number;
  stasisTimer: number;
  maelstromTimer: number;
  acidSporeCount: number;
  acidSporeTimer: number;
  opticalFlare: number;
  parasiteOwner: number;
  illusion: number;
  lifeTimer: number;
  cloakActive: number;
  cloakTimer: number;
  cloakAura: number;
  burrowed: number;
};

export type EffectView = {
  id: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  radius: number;
  timer: number;
  period: number;
  nextTick: number;
  damage: number;
};

export type Observation = {
  tick: number;
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  tech: Uint8Array; // completed tech/upgrade levels for this player only
  queues: QueueView[]; // own active production/research queues
  cargo: CargoView[]; // own contained units grouped by usable transport/garrison
  statuses: StatusView[]; // sparse own energy/status records
  effects: EffectView[]; // fair-play active spatial effects
  vision: Uint8Array; // 0 unseen, 1 explored, 2 visible (per tile)
  entities: EntityView[]; // own units always; others only on currently-visible tiles
};

const hasStatus = (e: State['e'], i: number): boolean =>
  e.energyMax[i]! > 0 ||
  e.stimTimer[i]! > 0 ||
  e.matrixTimer[i]! > 0 ||
  e.irradiateTimer[i]! > 0 ||
  e.plagueTimer[i]! > 0 ||
  e.ensnareTimer[i]! > 0 ||
  e.lockdownTimer[i]! > 0 ||
  e.stasisTimer[i]! > 0 ||
  e.maelstromTimer[i]! > 0 ||
  e.acidSporeCount[i]! > 0 ||
  e.acidSporeTimer[i]! > 0 ||
  e.opticalFlare[i]! > 0 ||
  e.parasiteOwner[i]! !== NEUTRAL ||
  e.illusion[i]! > 0 ||
  e.lifeTimer[i]! > 0 ||
  e.cloakActive[i]! > 0 ||
  e.cloakTimer[i]! > 0 ||
  e.cloakAura[i]! > 0 ||
  e.burrowed[i]! > 0;

const statusView = (e: State['e'], i: number): StatusView => ({
  id: eid(e, i),
  energy: e.energy[i]!,
  energyMax: e.energyMax[i]!,
  stimTimer: e.stimTimer[i]!,
  matrixHp: e.matrixHp[i]!,
  matrixTimer: e.matrixTimer[i]!,
  irradiateTimer: e.irradiateTimer[i]!,
  plagueTimer: e.plagueTimer[i]!,
  ensnareTimer: e.ensnareTimer[i]!,
  lockdownTimer: e.lockdownTimer[i]!,
  stasisTimer: e.stasisTimer[i]!,
  maelstromTimer: e.maelstromTimer[i]!,
  acidSporeCount: e.acidSporeCount[i]!,
  acidSporeTimer: e.acidSporeTimer[i]!,
  opticalFlare: e.opticalFlare[i]!,
  parasiteOwner: e.parasiteOwner[i]!,
  illusion: e.illusion[i]!,
  lifeTimer: e.lifeTimer[i]!,
  cloakActive: e.cloakActive[i]!,
  cloakTimer: e.cloakTimer[i]!,
  cloakAura: e.cloakAura[i]!,
  burrowed: e.burrowed[i]!,
});

const effectVisibility = (s: State, player: number, i: number): number => {
  const fx = s.effects;
  if (fx.owner[i] === player) return 2;
  const tx = Math.floor(fx.x[i]! / ONE / TILE);
  const ty = Math.floor(fx.y[i]! / ONE / TILE);
  const visible = tx >= 0 && ty >= 0 && tx < s.map.w && ty < s.map.h
    ? s.vision[player]![ty * s.map.w + tx]!
    : 0;
  if (fx.kind[i] === EffectKind.NuclearStrike) return visible;
  return visible === 2 ? 2 : 0;
};

const effectView = (s: State, i: number): EffectView => {
  const fx = s.effects;
  return {
    id: i,
    kind: fx.kind[i]!,
    owner: fx.owner[i]!,
    x: fx.x[i]!,
    y: fx.y[i]!,
    radius: fx.radius[i]!,
    timer: fx.timer[i]!,
    period: fx.period[i]!,
    nextTick: fx.nextTick[i]!,
    damage: fx.damage[i]!,
  };
};

export const observe = (s: State, player: number): Observation => {
  if (!s.trackVision) throw new Error('observe: vision tracking is disabled for this State');
  const e = s.e; const m = s.map; const W = m.w;
  const v = s.vision[player]!;
  const entities: EntityView[] = [];
  const queues: QueueView[] = [];
  const statuses: StatusView[] = [];
  const effects: EffectView[] = [];
  const cargoByContainer = new Map<number, number[]>();
  for (let i = 0; i < s.effects.hi; i++) {
    if (s.effects.alive[i] === 1 && effectVisibility(s, player, i) > 0) effects.push(effectView(s, i));
  }
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const own = e.owner[i] === player;
    const containerId = e.container[i]!;
    if (own && containerId !== NONE && isAlive(e, containerId)) {
      const containerSlot = slotOf(containerId);
      const containerOwner = e.owner[containerSlot]!;
      const usableContainer = containerOwner === player ||
        (e.kind[containerSlot] === Kind.NydusCanal && sameTeam(s, player, containerOwner));
      if (usableContainer) {
        const unitId = eid(e, i);
        const units = cargoByContainer.get(containerId);
        if (units) units.push(unitId);
        else cargoByContainer.set(containerId, [unitId]);
      }
    }
    if (own && hasStatus(e, i)) statuses.push(statusView(e, i));
    if (own && (e.prodKind[i] !== 0 || e.researchKind[i] !== 0)) {
      queues.push({
        id: eid(e, i),
        prodKind: e.prodKind[i]!,
        prodTimer: e.prodTimer[i]!,
        prodQueued: e.prodQueued[i]!,
        researchKind: e.researchKind[i]!,
        researchTimer: e.researchTimer[i]!,
      });
    }
    if (!own) {
      if (isContained(s, i)) continue;
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const visible = tx >= 0 && ty >= 0 && tx < W && ty < m.h && v[ty * W + tx] === 2;
      if (!visible) continue; // hidden by fog
      if (!canDetect(s, player, i)) continue; // visible cloak shimmer is not a targetable observation
    }
    entities.push({
      id: eid(e, i), kind: e.kind[i]!, owner: e.owner[i]!,
      x: e.x[i]!, y: e.y[i]!, hp: e.hp[i]!, built: e.built[i]!, order: e.order[i]!,
    });
  }
  return {
    tick: s.tick,
    player,
    minerals: s.players.minerals[player]!,
    gas: s.players.gas[player]!,
    supplyUsed: s.players.supplyUsed[player]!,
    supplyMax: s.players.supplyMax[player]!,
    tech: s.players.tech.slice(player * TECH_CAP, (player + 1) * TECH_CAP),
    queues,
    cargo: [...cargoByContainer].map(([container, units]) => ({ container, units })),
    statuses,
    effects,
    vision: v.slice(),
    entities,
  };
};
