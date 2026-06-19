import type { State } from '../entity/world.ts';
import { tickModeTransitions } from '../mechanics/mode-transition.ts';

export const modeTransitions = (s: State): void => {
  tickModeTransitions(s);
};
