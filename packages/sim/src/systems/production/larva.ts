import { Kind, isLarvaSourceKind, sec } from '../../data/index.ts';
import type { State } from '../../entity/world.ts';
import { canSpawnEntity } from '../../entity/world.ts';
import { trySpawnUnit } from '../../entity/factory.ts';
import { fx } from '../../fixed.ts';
import { LARVA_MAX, countLarvae } from '../../mechanics/larva.ts';

const LARVA_INTERVAL = sec(15);
const LARVA_OFFSETS: readonly [number, number][] = [
  [-32, 28], [0, 36], [32, 28],
];

const spawnLarva = (s: State, hatch: number, index: number): void => {
  const e = s.e;
  const [dx, dy] = LARVA_OFFSETS[index % LARVA_OFFSETS.length]!;
  trySpawnUnit(s, Kind.Larva, e.owner[hatch]!, e.x[hatch]! + fx(dx), e.y[hatch]! + fx(dy));
};

export const tickLarvae = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || !isLarvaSourceKind(e.kind[i]!)) continue;
    const n = countLarvae(s, i);
    if (n >= LARVA_MAX) { e.timer[i] = LARVA_INTERVAL; continue; }
    if (e.timer[i]! > 0) {
      e.timer[i] = e.timer[i]! - 1;
      if (e.timer[i]! > 0) continue;
    }
    if (!canSpawnEntity(s)) continue;
    spawnLarva(s, i, n);
    if (canSpawnEntity(s) || countLarvae(s, i) > n) e.timer[i] = LARVA_INTERVAL;
  }
};
