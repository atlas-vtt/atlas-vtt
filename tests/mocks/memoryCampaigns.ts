import type { CampaignStorage } from '../../src/app/campaigns/CampaignFiles';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';

/** Campaigns kept in memory, as their files keep them: a new list after every change. */
export function memoryCampaigns(initial: readonly StoredCampaign[] = []): CampaignStorage & { current: () => readonly StoredCampaign[] } {
  let entries: readonly StoredCampaign[] = [...initial];
  const listeners = new Set<() => void>();
  const set = (next: readonly StoredCampaign[]): void => {
    entries = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => entries,
    entries: () => entries,
    isLoaded: () => true,
    create: (entry) => set([...entries, entry]),
    update: (id, change) => set(entries.map((entry) => (entry.id === id ? change(entry) : entry))),
    remove: (id) => set(entries.filter((entry) => entry.id !== id)),
    pathOf: (id) => {
      const entry = entries.find((stored) => stored.id === id);
      return entry === undefined ? null : `atlas-vtt/campaigns/${String(entry.name)}/campaign.json`;
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
