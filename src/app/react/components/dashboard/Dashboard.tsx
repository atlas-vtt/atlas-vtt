import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import type { CampaignStorage } from '../../../campaigns/CampaignFiles';
import { CampaignPlay } from '../../../campaigns/campaignPlay';
import { useCampaignPlay } from '../../../campaigns/useCampaignPlay';
import { useCampaigns } from '../../../campaigns/useCampaigns';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../gameSystems/builtInPresets';
import { useSystemPresets } from '../../hooks/useSystemPresets';
import { CampaignPage } from './CampaignPage';
import { HomePage } from './HomePage';
import { useWorldMaps } from './libraryPictures';
import { useCampaignParties } from './useCampaignParties';
import { useRecentScenes } from './useRecentScenes';

export interface DashboardProps {
  app: App;
  /** The vault's campaigns; undefined until the plugin opened them. */
  campaignStorage: CampaignStorage | undefined;
  onOpenScene: (filePath: string) => void;
  onCreateMap: () => void;
  onOpenAssetManager: () => void;
}

/** Atlas' start page (`HomePage`), or one campaign's page. */
export function Dashboard({ app, campaignStorage, onOpenScene, onCreateMap, onOpenAssetManager }: DashboardProps): React.JSX.Element {
  const { scenes, isLoading } = useRecentScenes(app);
  const { service, campaigns, isLoading: campaignsLoading } = useCampaigns(campaignStorage);
  const worldMaps = useWorldMaps(app);
  const { presets: vaultPresets } = useSystemPresets(app);
  const presets = vaultPresets.length > 0 ? vaultPresets : BUILT_IN_SYSTEM_PRESETS;
  const play = CampaignPlay.forApp(app);
  const playingId = useCampaignPlay(play);
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const parties = useCampaignParties(app, campaigns, rootRef);
  const openCampaign = openId === null ? undefined : campaigns.find((campaign) => campaign.id === openId);

  // A campaign deleted elsewhere takes its page with it.
  useEffect(() => {
    if (openId !== null && openCampaign === undefined) setOpenId(null);
  }, [openId, openCampaign]);

  // A page opens at its top, wherever the one before was scrolled to.
  useLayoutEffect(() => {
    for (let node: HTMLElement | null = rootRef.current; node; node = node.parentElement) {
      if (node.scrollTop > 0) {
        node.scrollTop = 0;
        return;
      }
    }
  }, [openId]);

  return (
    <div ref={rootRef} className="atlas-dashboard">
      {service && openCampaign ? (
        <CampaignPage
          key={openCampaign.id}
          app={app}
          campaign={openCampaign}
          campaigns={campaigns}
          service={service}
          worldMaps={worldMaps}
          presets={presets}
          isPlaying={openCampaign.id === playingId}
          onStop={() => play.stop()}
          party={parties.get(openCampaign.id) ?? []}
          onBack={() => setOpenId(null)}
        />
      ) : (
        <HomePage
          app={app}
          service={service}
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          worldMaps={worldMaps.choices}
          presets={presets}
          playingId={playingId}
          parties={parties}
          scenes={scenes}
          scenesLoading={isLoading}
          onOpenScene={onOpenScene}
          onCreateMap={onCreateMap}
          onOpenAssetManager={onOpenAssetManager}
          onOpenCampaign={setOpenId}
        />
      )}
    </div>
  );
}
