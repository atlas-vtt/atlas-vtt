import type { App } from 'obsidian';
import { CampaignFiles, type CampaignStorage } from './CampaignFiles';
import { CampaignPlay } from './campaignPlay';

/**
 * Calls `listener` whenever what the played campaign holds may be another: another campaign (or
 * none) is played, or a campaign changed, here or on another device. Returns the function that
 * stops it. `play` and `storage` are read once, when it starts.
 */
export function onPlayedCampaignChange(
  app: App,
  listener: () => void,
  play: () => CampaignPlay = () => CampaignPlay.forApp(app),
  storage: () => CampaignStorage | undefined = () => CampaignFiles.forApp(app),
): () => void {
  const stops = [play().onChange(listener), storage()?.onChange(listener) ?? ((): void => undefined)];
  return () => {
    for (const stop of stops) stop();
  };
}
