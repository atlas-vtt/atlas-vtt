import type { App } from 'obsidian';
import { CampaignFiles } from '../../../campaigns/CampaignFiles';
import { CampaignPlay } from '../../../campaigns/campaignPlay';
import { CampaignService } from '../../../campaigns/CampaignService';
import { onPlayedCampaignChange } from '../../../campaigns/playedCampaign';
import { campaignWorldMap } from '../../../services/worldMap';
import type { GmScreenSession } from '../GmScreenSession.ts';
import { BackdropScreen } from './BackdropScreen.ts';
import { cutBackdrop } from './cutBackdrop.ts';

/**
 * Plugs the picture behind Sidekick's screens into the GM screen's session: the world map of the campaign played now
 * (`CampaignPlay`), checked as every world map shown to others is (`campaignWorldMap`), and sent again whenever the
 * played campaign or a campaign changes. Returns what unplugs it.
 */
export function plugBackdropScreen(app: App, session: GmScreenSession): () => void {
  const screen = new BackdropScreen({
    art: () => {
      const storage = CampaignFiles.forApp(app);
      return storage ? campaignWorldMap(app, new CampaignService(storage), CampaignPlay.forApp(app).playing()) : Promise.resolve(null);
    },
    cut: (path, width, height) => cutBackdrop(app, path, width, height),
    outlet: session,
  });
  const unplug = session.plug(screen);
  const stop = onPlayedCampaignChange(app, () => screen.changed());
  return () => {
    stop();
    unplug();
    screen.dispose();
  };
}
