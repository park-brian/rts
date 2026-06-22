import { publishHud, type PublishHudArgs } from './hud-publisher.ts';

export class AppHudController {
  publish(args: PublishHudArgs): void {
    publishHud(args);
  }
}