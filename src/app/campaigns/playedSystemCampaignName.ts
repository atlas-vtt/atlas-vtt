import type { App } from 'obsidian';
import { CampaignFiles } from './CampaignFiles';
import { CampaignService } from './CampaignService';
import { PlayedRules } from './playedRules';

/** The name of the campaign whose game system every map plays by now (`PlayedRules`), if one is played; `usePlayedSystemCampaign` outside React. */
export function playedSystemCampaignName(app: App): string | undefined {
  const campaignId = PlayedRules.forApp(app)?.played()?.campaignId;
  const storage = CampaignFiles.forApp(app);
  return campaignId && storage ? new CampaignService(storage).get(campaignId)?.name : undefined;
}
