import {
  Role, isAlive, isEnemy, slotOf, validateCommand,
  type Command, type State,
} from './sim.ts';

export type SmartCommandScheme = 'mobile' | 'desktop';
export type SmartCommandTarget = {
  hit: number;
  x: number;
  y: number;
};

const valid = (s: State, player: number, command: Command): Command[] =>
  validateCommand(s, player, command).ok ? [command] : [];

export const smartCommandCandidates = (
  s: State,
  player: number,
  actor: number,
  target: SmartCommandTarget,
  scheme: SmartCommandScheme,
): Command[] => {
  const e = s.e;
  if (!isAlive(e, actor)) return [];
  const actorSlot = slotOf(actor);
  const targetSlot = target.hit >= 0 && isAlive(e, target.hit) ? slotOf(target.hit) : -1;
  const actorIsStructure = (e.flags[actorSlot]! & Role.Structure) !== 0;

  if (scheme === 'mobile') {
    if (targetSlot >= 0) {
      if (isEnemy(s, player, e.owner[targetSlot]!)) {
        const attack = valid(s, player, { t: 'attack', unit: actor, target: target.hit });
        if (attack.length > 0) return attack;
      }
      if ((e.flags[targetSlot]! & Role.Resource) !== 0 && (e.flags[actorSlot]! & Role.Worker) !== 0) {
        const harvest = valid(s, player, { t: 'harvest', unit: actor, patch: target.hit });
        if (harvest.length > 0) return harvest;
      }
    }
    if (actorIsStructure) return valid(s, player, { t: 'rally', building: actor, x: target.x, y: target.y });
    return valid(s, player, { t: 'move', unit: actor, x: target.x, y: target.y });
  }

  if (targetSlot >= 0) {
    const ranked: Command[] = [];
    if (isEnemy(s, player, e.owner[targetSlot]!)) ranked.push({ t: 'attack', unit: actor, target: target.hit });
    if ((e.flags[targetSlot]! & Role.Resource) !== 0) ranked.push({ t: 'harvest', unit: actor, patch: target.hit });
    ranked.push(
      { t: 'repair', unit: actor, target: target.hit },
      { t: 'load', transport: target.hit, unit: actor },
      { t: 'load', transport: actor, unit: target.hit },
    );
    if (actorIsStructure) ranked.push({ t: 'rally', building: actor, x: target.x, y: target.y, target: target.hit });
    for (const command of ranked) {
      if (validateCommand(s, player, command).ok) return [command];
    }
  }

  if (actorIsStructure) return valid(s, player, { t: 'rally', building: actor, x: target.x, y: target.y });
  return valid(s, player, { t: 'move', unit: actor, x: target.x, y: target.y });
};
