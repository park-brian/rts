import { clearSelectionView, resetControlGroupCounts } from './hud-publisher.ts';
import { ui } from './store.ts';
import type { PlaySession, ReplaySession } from './game-session.ts';

export class AppSessionUiController {
  publishPlaySession(session: PlaySession, controlGroupCount: number): void {
    resetControlGroupCounts(controlGroupCount);
    ui.mode.value = session.mode;
    ui.perTeam.value = session.perTeam;
    ui.humanPlayer.value = session.humanPlayer;
    ui.playerRaces.value = [...session.setupRaceNames];
    ui.playerTeams.value = [...session.setupTeamIds];
    ui.playerEnabled.value = [...session.playerEnabled];
    ui.fullVision.value = session.fullVision;
    ui.hasReplay.value = false;
    clearSelectionView();
  }

  publishReplaySession(
    session: ReplaySession,
    playerEnabled: readonly boolean[],
    fullVision: boolean,
  ): void {
    ui.mode.value = 'replay';
    ui.playerRaces.value = [...session.playerRaceNames];
    ui.playerTeams.value = [...session.playerTeamIds];
    ui.playerEnabled.value = [...playerEnabled];
    ui.fullVision.value = fullVision;
    ui.over.value = false;
  }

  clearSelectionView(): void {
    clearSelectionView();
  }
}