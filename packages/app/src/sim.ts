// Re-export the engine + bots for the app, and assemble the default opponents.
export * from '@rts/sim';
import { createBot } from '@rts/ai';
import { Terran, type Controller } from '@rts/sim';

export const createBotControllers = (n = 2): Controller[] =>
  Array.from({ length: n }, (_, i) =>
    createBot(Terran, i % 2 === 0 ? { attackThreshold: 10, barracksTarget: 2 } : { attackThreshold: 12, barracksTarget: 3 }),
  );
