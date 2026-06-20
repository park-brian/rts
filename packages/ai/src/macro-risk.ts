import {
  ONE,
  TILE,
  Units,
  isDetectorKind,
  withinRangeSq,
  type State,
  type Weapon,
} from '@rts/sim';

export type BotRiskMap = {
  w: number;
  h: number;
  values: Int16Array;
  antiGround: Int16Array;
  antiAir: Int16Array;
  detection: Int16Array;
  visible: Uint8Array;
  vision: 'visible' | 'omniscient' | 'omitted';
};

const tileCoord = (v: number, max: number): number =>
  Math.max(0, Math.min(max - 1, Math.trunc(v / (TILE * ONE))));

const tileCenter = (tile: number): number => (tile * TILE + (TILE >> 1)) * ONE;

const tileVisible = (s: State, player: number, tx: number, ty: number): boolean => {
  if (!s.trackVision) return true;
  const vision = s.vision[player];
  return !vision || vision[ty * s.map.w + tx] === 2;
};

const weaponRisk = (kind: number): { range: number; score: number } => {
  const def = Units[kind];
  if (!def) return { range: 0, score: 0 };
  let range = 0;
  let score = 0;
  for (const weapon of [def.weapon, def.airWeapon]) {
    if (!weapon) continue;
    range = Math.max(range, weapon.range);
    score = Math.max(score, weapon.damage * (weapon.shots ?? 1));
  }
  return { range, score };
};

const weaponScore = (weapon: Weapon): number =>
  weapon.damage * (weapon.shots ?? 1);

export const buildRiskMap = (s: State, player: number, enemies: readonly number[]): BotRiskMap => {
  const w = s.map.w;
  const h = s.map.h;
  const visible = new Uint8Array(w * h);
  if (!s.trackVision) {
    visible.fill(1);
  } else {
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        visible[ty * w + tx] = tileVisible(s, player, tx, ty) ? 1 : 0;
      }
    }
  }

  const values = new Int16Array(w * h);
  const antiGround = new Int16Array(w * h);
  const antiAir = new Int16Array(w * h);
  const detection = new Int16Array(w * h);
  const addLayer = (layer: Int16Array, cx: number, cy: number, range: number, score: number): void => {
    if (range <= 0 || score <= 0) return;
    const radiusTiles = Math.ceil(range / (TILE * ONE)) + 1;
    const tx0 = Math.max(0, tileCoord(cx, w) - radiusTiles);
    const tx1 = Math.min(w - 1, tileCoord(cx, w) + radiusTiles);
    const ty0 = Math.max(0, tileCoord(cy, h) - radiusTiles);
    const ty1 = Math.min(h - 1, tileCoord(cy, h) + radiusTiles);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const idx = ty * w + tx;
        if (visible[idx] !== 1) continue;
        if (!withinRangeSq(cx, cy, tileCenter(tx), tileCenter(ty), range)) continue;
        layer[idx] = Math.min(32_767, layer[idx]! + score);
      }
    }
  };

  const e = s.e;
  for (const enemy of enemies) {
    const def = Units[e.kind[enemy]!]!;
    const risk = weaponRisk(e.kind[enemy]!);
    const cx = e.x[enemy]!;
    const cy = e.y[enemy]!;

    addLayer(values, cx, cy, risk.range, risk.score);
    if (def.weapon) addLayer(antiGround, cx, cy, def.weapon.range, weaponScore(def.weapon));
    if (def.airWeapon) addLayer(antiAir, cx, cy, def.airWeapon.range, weaponScore(def.airWeapon));
    if (isDetectorKind(e.kind[enemy]!)) {
      addLayer(detection, cx, cy, def.sight * TILE * ONE, 1);
    }
  }

  return { w, h, values, antiGround, antiAir, detection, visible, vision: s.trackVision ? 'visible' : 'omniscient' };
};

export const riskAtLayer = (risk: BotRiskMap, layer: Int16Array, x: number, y: number): number => {
  if (layer.length === 0) return 0;
  return layer[tileCoord(y, risk.h) * risk.w + tileCoord(x, risk.w)]!;
};

export const riskAt = (risk: BotRiskMap, x: number, y: number): number =>
  riskAtLayer(risk, risk.values, x, y);
