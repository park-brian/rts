import type { Entities } from '../entity/world.ts';
import type { State } from '../entity/world.ts';
import { Units, sec } from '../data/index.ts';
import { clearVelocity } from '../spatial/motion.ts';
import { isDisabled } from '../mechanics/status.ts';

const tick = (a: Int32Array, i: number): void => {
  if (a[i]! > 0) a[i] = a[i]! - 1;
};

export const tickRegeneration = (s: State): void => {
  const e = s.e;
  const healZerg = (s.tick + 1) % sec(2) === 0;
  const rechargeProtoss = (s.tick + 1) % sec(3) === 0;
  if (!healZerg && !rechargeProtoss) return;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.stasisTimer[i]! > 0) continue;
    const def = Units[e.kind[i]!];
    if (!def) continue;
    if (healZerg && def.race === 'zerg' && e.hp[i]! > 0 && e.hp[i]! < def.hp) e.hp[i] = e.hp[i]! + 1;
    if (rechargeProtoss && def.race === 'protoss' && e.shield[i]! < def.shields) e.shield[i] = e.shield[i]! + 1;
  }
};

export const tickStatusTimers = (e: Entities): void => {
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    if (isDisabled(e, i)) clearVelocity(e, i);
    tick(e.stimTimer, i);
    tick(e.matrixTimer, i);
    if (e.matrixTimer[i]! <= 0) e.matrixHp[i] = 0;
    tick(e.irradiateTimer, i);
    tick(e.plagueTimer, i);
    tick(e.ensnareTimer, i);
    tick(e.lockdownTimer, i);
    tick(e.stasisTimer, i);
    tick(e.maelstromTimer, i);
    tick(e.acidSporeTimer, i);
    if (e.acidSporeTimer[i]! <= 0) e.acidSporeCount[i] = 0;
  }
};
