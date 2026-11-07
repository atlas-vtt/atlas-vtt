import { useCallback, useSyncExternalStore } from 'react';
import type { CampaignPlay } from './campaignPlay';

/** The id of the campaign this device plays (its online table is open), or null; follows every change. */
export function useCampaignPlay(play: CampaignPlay): string | null {
  const subscribe = useCallback((listener: () => void) => play.onChange(listener), [play]);
  return useSyncExternalStore(subscribe, () => play.playing());
}
