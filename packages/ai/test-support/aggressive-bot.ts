import {
  Kind,
  NONE,
  Role,
  Units,
  eid,
  isEnemy,
  productionCount,
  slotOf,
  validateCommand,
  type Command,
  type Controller,
  type State,
} from '@rts/sim';

const firstEnemyTarget = (s: State, player: number): number => {
  const e = s.e;
  let fallback = NONE;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !isEnemy(s, player, e.owner[i]!)) continue;
    if ((e.flags[i]! & Role.ResourceDepot) !== 0) return i;
    if (fallback === NONE) fallback = i;
  }
  return fallback;
};

const maybeTrain = (
  s: State,
  player: number,
  cmds: Command[],
  producer: number,
  kind: number,
  reservedSupply: { value: number },
): void => {
  const command: Command = { t: 'train', building: eid(s.e, producer), kind };
  if (!validateCommand(s, player, command, { reservedSupply: reservedSupply.value }).ok) return;
  cmds.push(command);
  reservedSupply.value += Units[kind]!.supply * productionCount(kind);
};

/**
 * Deliberately crude pressure opponent: keep SCVs and Marines queued, then send every
 * completed Marine at the enemy depot. It is a regression baseline for bot freezing,
 * not a strategic bot.
 */
export const createAggressiveMarineBot = (): Controller => {
  return (s: State, player: number): Command[] => {
    const e = s.e;
    const cmds: Command[] = [];
    const reservedSupply = { value: s.players.supplyUsed[player]! };
    const target = firstEnemyTarget(s, player);

    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1) continue;
      const kind = e.kind[i]!;
      if (kind === Kind.CommandCenter) maybeTrain(s, player, cmds, i, Kind.SCV, reservedSupply);
      if (kind === Kind.Barracks) maybeTrain(s, player, cmds, i, Kind.Marine, reservedSupply);
      if (kind === Kind.Marine && target !== NONE) {
        const command: Command = { t: 'attack', unit: eid(e, i), target: eid(e, target) };
        if (validateCommand(s, player, command).ok) cmds.push(command);
      }
    }
    return cmds;
  };
};
