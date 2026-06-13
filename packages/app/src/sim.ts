// Re-export the engine + bots for the app, and assemble the default opponents.
export * from '@rts/sim';
import { createBot } from '@rts/ai';
import { Terran, type Controller } from '@rts/sim';

export const createBotControllers = (): Controller[] => [
  createBot(Terran, { attackThreshold: 10, barracksTarget: 2 }),
  createBot(Terran, { attackThreshold: 12, barracksTarget: 3 }),
];
