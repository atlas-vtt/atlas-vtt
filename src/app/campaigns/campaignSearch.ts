import type { Campaign } from './campaignTypes';

/**
 * The campaigns a search finds: those whose name or description holds every word of it, in any
 * letter case. An empty search finds all of them.
 */
export function campaignsMatching(campaigns: readonly Campaign[], search: string): Campaign[] {
  const words = search.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...campaigns];
  return campaigns.filter((campaign) => {
    const text = `${campaign.name}\n${campaign.description ?? ''}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
