import { CAMPAIGN_FORMAT } from './campaignPaths';
import { readCampaignSystem } from './campaignSystem';
import type { Campaign, StoredCampaign } from './campaignTypes';
import { readUsage } from './campaignUsage';
import { isAssetId, isTime } from './campaignValues';

/** The longest name and description a campaign takes, in characters. */
export const MAX_CAMPAIGN_NAME = 120;
export const MAX_CAMPAIGN_DESCRIPTION = 4000;

const textWithin = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.length <= max ? value : undefined);

/** A campaign's name as it is kept: trimmed, at most `MAX_CAMPAIGN_NAME` characters; null for none. */
export function campaignName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name !== '' && [...name].length <= MAX_CAMPAIGN_NAME ? name : null;
}

/**
 * A campaign as Atlas reads its file, or null for a file without a name. A field that cannot be
 * read is left unset, never guessed; a file of a later format is read and marked `readOnly`.
 */
export function parseCampaign(stored: StoredCampaign): Campaign | null {
  const name = campaignName(stored.name);
  if (name === null) return null;
  const description = textWithin(stored.description, MAX_CAMPAIGN_DESCRIPTION);
  const used = readUsage(stored.used);
  const system = readCampaignSystem(stored.system);
  return {
    id: stored.id,
    name,
    createdAt: isTime(stored.createdAt) ? stored.createdAt : 0,
    ...(description !== undefined && description !== '' && { description }),
    ...(isTime(stored.lastPlayed) && { lastPlayed: stored.lastPlayed }),
    ...(isTime(stored.playtime) && { playtime: stored.playtime }),
    ...(isAssetId(stored.worldMap) && { worldMap: stored.worldMap }),
    ...(isAssetId(stored.lastScene) && { lastScene: stored.lastScene }),
    ...(used !== undefined && { used }),
    ...(system !== undefined && { system }),
    ...(typeof stored.format === 'number' && stored.format > CAMPAIGN_FORMAT && { readOnly: true as const }),
  };
}
