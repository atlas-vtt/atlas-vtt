import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { CampaignStorage } from './CampaignFiles';
import { CampaignService } from './CampaignService';
import type { Campaign, StoredCampaign } from './campaignTypes';

const NO_ENTRIES: readonly StoredCampaign[] = [];
const ignoreChanges = (): (() => void) => () => undefined;

export interface CampaignsState {
  /** Null while the plugin has not opened the vault's campaigns. */
  service: CampaignService | null;
  /** Every campaign, the most recently played first; follows changes from anywhere. */
  campaigns: Campaign[];
  /** The campaigns' files are being read for the first time. */
  isLoading: boolean;
}

/** The campaigns kept in `storage`, read again whenever one changes here or on another device. */
export function useCampaigns(storage: CampaignStorage | undefined): CampaignsState {
  const service = useMemo(() => (storage ? new CampaignService(storage) : null), [storage]);
  // The storage hands out the same array while nothing changed, so it is the snapshot.
  const subscribe = useCallback((listener: () => void) => (storage ? storage.onChange(listener) : ignoreChanges()), [storage]);
  const entries = useSyncExternalStore(subscribe, () => storage?.entries() ?? NO_ENTRIES);
  const loaded = useSyncExternalStore(subscribe, () => storage?.isLoaded() ?? false);
  const campaigns = useMemo(() => (service && entries.length > 0 ? service.list() : []), [service, entries]);
  return { service, campaigns, isLoading: storage !== undefined && !loaded };
}
