import { PlacementController, type PlacementGhost } from './placement-controller.ts';
import { clearArmedCommand, shouldToggleArmedCommand, ui, type CommandOption } from './store.ts';
import {
  Abilities, isAlive, slotOf, validateCommand,
  type Command, type State,
} from './sim.ts';

type CommandControllerDeps = {
  state: () => State;
  human: () => number;
  selection: () => ReadonlySet<number>;
  firstSelected: (pred: (slot: number) => boolean) => number;
  screenToWorld: (sx: number, sy: number) => [number, number];
};

export class CommandController {
  queued: Command[] = [];
  private readonly deps: CommandControllerDeps;
  private readonly placementController = new PlacementController();

  constructor(deps: CommandControllerDeps) {
    this.deps = deps;
  }

  get placementGhost(): PlacementGhost | null {
    return this.placementController.ghost;
  }

  set placementGhost(ghost: PlacementGhost | null) {
    this.placementController.ghost = ghost;
  }

  reset(): void {
    this.queued = [];
    this.placementController.clear();
  }

  drain(): Command[] {
    const q = this.queued;
    this.queued = [];
    return q;
  }

  clearTargetModes(): void {
    clearArmedCommand();
  }

  updatePlacementGhost(sx: number, sy: number): void {
    const armed = ui.armedCommand.value;
    const [wx, wy] = this.deps.screenToWorld(sx, sy);
    this.placementController.update({
      state: this.deps.state(),
      human: this.deps.human(),
      armed,
      worldX: wx,
      worldY: wy,
      firstSelected: this.deps.firstSelected,
    });
  }

  commitPlacementGhost(): boolean {
    const command = this.placementController.commit({
      state: this.deps.state(),
      armed: ui.armedCommand.value,
      firstSelected: this.deps.firstSelected,
    });
    if (!command) return false;
    this.queued.push(command);
    clearArmedCommand();
    return true;
  }

  cancelPlacementGhost(): void {
    this.placementController.clear();
  }

  executeOption(option: CommandOption): boolean {
    if (!option.ok) return false;
    if (option.arm) {
      const toggled = shouldToggleArmedCommand(option.arm, ui.armedCommand.value);
      this.clearTargetModes();
      if (!toggled) ui.armedCommand.value = option.arm;
      return true;
    }
    if (!option.commands?.length) return false;
    const s = this.deps.state();
    const human = this.deps.human();
    let queued = false;
    for (const command of option.commands) {
      if (validateCommand(s, human, command).ok) {
        this.queued.push(command);
        queued = true;
      }
    }
    if (queued) this.clearTargetModes();
    return queued;
  }

  castSelectedAbility(abilityId: number, target?: number, x?: number, y?: number): boolean {
    const s = this.deps.state();
    const e = s.e;
    const human = this.deps.human();
    const ability = Abilities[abilityId];
    if (!ability) return false;
    if (ability.target === 'self') {
      let cast = false;
      for (const id of this.deps.selection()) {
        const c: Command = { t: 'ability', unit: id, ability: abilityId };
        if (isAlive(e, id) && validateCommand(s, human, c).ok) {
          this.queued.push(c);
          cast = true;
        }
      }
      return cast;
    }

    let best: Command | null = null;
    let bestD = Infinity;
    for (const id of this.deps.selection()) {
      if (!isAlive(e, id)) continue;
      const c: Command = ability.target === 'point'
        ? { t: 'ability', unit: id, ability: abilityId, x, y }
        : { t: 'ability', unit: id, ability: abilityId, target };
      if (!validateCommand(s, human, c).ok) continue;
      const sl = slotOf(id);
      const dx = e.x[sl]! - (x ?? (target !== undefined && isAlive(e, target) ? e.x[slotOf(target)]! : e.x[sl]!));
      const dy = e.y[sl]! - (y ?? (target !== undefined && isAlive(e, target) ? e.y[slotOf(target)]! : e.y[sl]!));
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return false;
    this.queued.push(best);
    return true;
  }

}
