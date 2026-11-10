import type { App } from 'obsidian';
import type { CampaignStorage } from './CampaignFiles';
import { CampaignPlay } from './campaignPlay';
import { CampaignService } from './CampaignService';

/**
 * How long a played campaign must stay gone before the play ends. A sync tool may deliver a file
 * half written (it reads as no campaign) or a folder as deleted and created again, which leaves
 * the campaign missing for a moment; only a campaign still gone once its files are quiet ends it.
 */
export const PLAY_SETTLE_MS = 5000;

/**
 * While this device plays a campaign, records in it every scene a map view finishes loading
 * (`atlas-vtt:scene-opened`). Once the campaigns are read, a played campaign that stays gone for
 * `PLAY_SETTLE_MS` (deleted here or on another device) ends the play. Returns the function that
 * stops all of it.
 */
export function recordCampaignPlay(app: App, storage: CampaignStorage, loaded: Promise<void>, play: CampaignPlay = CampaignPlay.forApp(app)): () => void {
  const service = new CampaignService(storage);
  let released = false;
  let unsubscribe = (): void => undefined;
  let settle: number | null = null;

  const isGone = (): boolean => {
    const id = play.playing();
    return id !== null && service.get(id) === undefined;
  };

  // Each change starts the wait anew, so the play ends only after the campaign was gone and nothing changed for the whole wait.
  const followChange = (): void => {
    if (settle !== null) window.clearTimeout(settle);
    settle = null;
    if (!isGone()) return;
    settle = window.setTimeout(() => {
      settle = null;
      if (!released && isGone()) play.stop();
    }, PLAY_SETTLE_MS);
  };

  // Campaigns read only in part would look gone; a failed read ends no play.
  void loaded.then(() => {
    if (released) return;
    followChange();
    unsubscribe = storage.onChange(followChange);
  }, () => undefined);

  const ref = app.workspace.on('atlas-vtt:scene-opened', (sceneId: string) => {
    const at = Date.now();
    // A scene restored at start opens before the campaigns are read.
    void loaded.then(() => {
      const id = play.playing();
      if (!released && id !== null) service.recordScene(id, sceneId, at);
    }, () => undefined);
  });

  return () => {
    released = true;
    if (settle !== null) window.clearTimeout(settle);
    unsubscribe();
    app.workspace.offref(ref);
  };
}
