import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { campaignWorldMap } from '../../../services/worldMap';

/** A campaign's world map artwork: its vault path, null for none, and whether it is still being read. */
export interface WorldMapArtwork {
  path: string | null;
  pending: boolean;
}

/** The campaign's world map artwork, the image players are shown (`campaignWorldMap`). */
export function useWorldMapArtwork(app: App, service: CampaignService, campaign: Pick<Campaign, 'id' | 'worldMap'>): WorldMapArtwork {
  const { id, worldMap } = campaign;
  const [read, setRead] = useState<{ key: string; path: string | null } | null>(null);
  const key = `${id}|${worldMap ?? ''}`;

  useEffect(() => {
    if (worldMap === undefined) return undefined;
    let current = true;
    campaignWorldMap(app, service, id)
      .then((path) => { if (current) setRead({ key, path }); })
      .catch((error: unknown) => {
        console.error('[Dashboard] Reading the world map failed:', error);
        if (current) setRead({ key, path: null });
      });
    return () => { current = false; };
  }, [app, service, id, worldMap, key]);

  if (worldMap === undefined) return { path: null, pending: false };
  return read?.key === key ? { path: read.path, pending: false } : { path: null, pending: true };
}
